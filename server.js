const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const app = express();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => console.log('✅ DB 연결 성공! (비밀번호 숨김 모드)'))
    .catch(err => console.log('❌ DB 에러:', err.message));

// =========================================
// 🌟 1. 음악 DB 주머니
// =========================================
const musicSchema = new mongoose.Schema({
    name: String, artist: String, genre: String, aiTool: String, lyrics: String,
    uploader: String, uploaderRealName: String, imageUrl: String, audioUrl: String,
    views: { type: Number, default: 0 },
    comments: [{ author: String, text: String, date: { type: Date, default: Date.now } }],
    createdAt: { type: Date, default: Date.now }
});
const Music = mongoose.models.Music || mongoose.model('Music', musicSchema);

// =========================================
// 🌟 2. 유튜브/쇼츠 DB 주머니 (썸네일 포함)
// =========================================
const videoSchema = new mongoose.Schema({
    title: String, url: String, type: String, uploader: String,
    thumbnail: String, 
    createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.models.Video || mongoose.model('Video', videoSchema);

// =========================================
// 🌟 3. 커뮤니티 게시판 DB 주머니
// =========================================
const postSchema = new mongoose.Schema({
    title: String,
    content: String,
    author: String,
    createdAt: { type: Date, default: Date.now },
    comments: [{ 
        author: String, 
        text: String, 
        createdAt: { type: Date, default: Date.now } 
    }]
});
const Post = mongoose.models.Post || mongoose.model('Post', postSchema);


// =========================================
// 🌟 4. 내 음악(담기) DB 주머니 (폴더 기능 추가!)
// =========================================
const myMusicSchema = new mongoose.Schema({
    userId: String, 
    musicId: String, 
    folderName: { type: String, default: '기본 보관함' }, // 🌟 새로 추가된 칸막이!
    createdAt: { type: Date, default: Date.now }
});
const MyMusic = mongoose.models.MyMusic || mongoose.model('MyMusic', myMusicSchema);;

// =========================================
// 🌟 서버 기본 설정
// =========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// =========================================
// 🌟 메인 화면 (차트 & 최신음악)
// =========================================
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search || ''; 
        const genreQuery = req.query.genre || ''; 
        const sortQuery = req.query.sort || 'views'; 
        
        let filter = {};
        if (searchQuery) filter.artist = { $regex: searchQuery, $options: 'i' };
        if (genreQuery) filter.genre = genreQuery;

        let sortOption = { views: -1 }; 
        if (sortQuery === 'latest') sortOption = { createdAt: -1 }; 

        let artists = await Music.find(filter).sort(sortOption);
        let popularArtists = await Music.aggregate([
            { $group: { _id: "$artist", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        if (artists.length === 0 && !searchQuery && !genreQuery) {
            artists = [{
                _id: "dummy", name: "첫 곡의 주인공이 되어보세요!", artist: "RANKING AI", genre: "안내", aiTool: "시스템",
                lyrics: "아직 등록된 곡이 없습니다.", uploader: "admin", uploaderRealName: "관리자", audioUrl: "", views: 0,
                imageUrl: "https://via.placeholder.com/150/222222/ff5722?text=No+Music"
            }];
            popularArtists = [{ _id: "비비(BIBI)", count: 1 }];
        }
        res.render('index', { artists: artists, searchQuery: searchQuery, genreQuery: genreQuery, sortQuery: sortQuery, popularArtists: popularArtists });
    } catch (err) {
        console.log("DB 에러:", err);
        res.send("<h1>데이터를 불러오는 중 에러가 발생했습니다.</h1>");
    }
});

app.post('/play-count/:id', async (req, res) => {
    try { await Music.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }); res.sendStatus(200); } 
    catch(err) { res.sendStatus(500); }
});

// =========================================
// 🌟 내 음악 보관함 (폴더 기능 완벽 지원)
// =========================================

// 1. 음악 담기 (기본 보관함으로 들어감)
app.post('/add-to-mymusic', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "로그인이 필요합니다." });
        const musicIds = req.body.musicIds;
        const userId = req.session.user.id;
        for (let id of musicIds) {
            const exists = await MyMusic.findOne({ userId: userId, musicId: id });
            if (!exists && id !== "dummy") {
                await new MyMusic({ userId: userId, musicId: id, folderName: '기본 보관함' }).save();
            }
        }
        res.json({ message: "기본 보관함에 성공적으로 담겼습니다!" });
    } catch (err) { res.status(500).json({ message: "담기에 실패했습니다." }); }
});

// 2. 내 음악 화면 열기 (폴더별로 묶어서 보내주기)
app.get('/mymusic', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    
    // 내가 담은 모든 곡 가져오기
    const mySaved = await MyMusic.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
    const musicIds = mySaved.map(item => item.musicId);
    const myArtists = await Music.find({ _id: { $in: musicIds } });

    // 🌟 폴더별로 곡 분류하기 (마법의 분류기)
    let folders = {};
    mySaved.forEach(savedItem => {
        const folder = savedItem.folderName || '기본 보관함';
        if (!folders[folder]) folders[folder] = []; // 폴더가 없으면 새로 만듦
        
        const musicData = myArtists.find(m => m._id.toString() === savedItem.musicId.toString());
        if (musicData) folders[folder].push({ savedId: savedItem._id, music: musicData });
    });

    res.render('mymusic', { folders: folders }); // 분류된 폴더 데이터를 화면으로 전송!
});

// 3. 곡 삭제하기
app.post('/delete-mymusic/:id', async (req, res) => {
    if (req.session.user) await MyMusic.findByIdAndDelete(req.params.id);
    res.redirect('/mymusic');
});

// 4. 🌟 곡을 다른 폴더로 이동하기
app.post('/move-mymusic/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/mymusic');
    const targetFolder = req.body.targetFolder || '기본 보관함';
    await MyMusic.findOneAndUpdate(
        { _id: req.params.id, userId: req.session.user.id },
        { folderName: targetFolder }
    );
    res.redirect('/mymusic');
});

// 5. 🌟 폴더 이름 바꾸기
app.post('/rename-folder', async (req, res) => {
    if (!req.session.user) return res.redirect('/mymusic');
    const { oldName, newName } = req.body;
    if (newName && newName.trim() !== '') {
        // 기존 폴더 이름을 가진 모든 곡의 이름표를 새 이름으로 싹 다 교체!
        await MyMusic.updateMany(
            { userId: req.session.user.id, folderName: oldName },
            { $set: { folderName: newName.trim() } }
        );
    }
    res.redirect('/mymusic');
});

// 6. 🌟 폴더 통째로 삭제하기
app.post('/delete-folder', async (req, res) => {
    if (!req.session.user) return res.redirect('/mymusic');
    const { folderName } = req.body;
    await MyMusic.deleteMany({ userId: req.session.user.id, folderName: folderName });
    res.redirect('/mymusic');
});
// =========================================
// 🌟 유튜브 / 쇼츠 기능 (삭제 기능 추가!)
// =========================================
app.get('/youtube', async (req, res) => {
    const videos = await Video.find({ type: 'youtube' }).sort({ createdAt: -1 });
    res.render('youtube', { videos: videos });
});
app.get('/shorts', async (req, res) => {
    const shorts = await Video.find({ type: 'shorts' }).sort({ createdAt: -1 });
    res.render('shorts', { shorts: shorts });
});
app.post('/add-youtube', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    const videoIdMatch = req.body.youtubeLink.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^"&?\/\s]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : 'https://via.placeholder.com/320x180/222/ff5722?text=No+Thumb';
    await new Video({ title: req.body.title, url: req.body.youtubeLink, thumbnail: thumbnail, type: 'youtube', uploader: req.session.user.id }).save();
    res.redirect('/youtube');
});
app.post('/add-shorts', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    const videoIdMatch = req.body.youtubeLink.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([^"&?\/\s]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : 'https://via.placeholder.com/320x568/222/ff5722?text=No+Thumb';
    await new Video({ title: req.body.title, url: req.body.youtubeLink, thumbnail: thumbnail, type: 'shorts', uploader: req.session.user.id }).save();
    res.redirect('/shorts');
});

// 🌟 추가된 유튜브/쇼츠 삭제 라우터
app.post('/delete-video/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('back');
    try {
        const video = await Video.findById(req.params.id);
        if (video && (req.session.user.role === 'admin' || req.session.user.id === video.uploader)) {
            await Video.findByIdAndDelete(req.params.id);
        }
        res.redirect('back');
    } catch (err) {
        res.redirect('back');
    }
});

// =========================================
// 🌟 커뮤니티 게시판 (게시글 & 댓글 완벽 지원)
// =========================================
app.get('/board', async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        const currentUser = req.session ? req.session.user : null;
        res.render('board', { user: currentUser, posts: posts });
    } catch (err) {
        console.log("게시판 로딩 에러:", err);
        res.status(500).send("게시판 에러");
    }
});

app.post('/add-post', async (req, res) => {
    if (!req.session || !req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    try {
        await new Post({ title: req.body.title, content: req.body.content, author: req.session.user.id }).save();
        res.redirect('/board');
    } catch (err) { console.log(err); }
});

app.post('/delete-post/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/board');
    try {
        const post = await Post.findById(req.params.id);
        if (req.session.user.role === 'admin' || req.session.user.id === post.author) await Post.findByIdAndDelete(req.params.id);
        res.redirect('/board');
    } catch (err) { console.log(err); }
});

app.post('/add-board-comment/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    try {
        const post = await Post.findById(req.params.id);
        if (post) {
            post.comments.push({ author: req.session.user.id, text: req.body.commentText });
            await post.save();
        }
        res.redirect('/board');
    } catch (err) {
        console.log("댓글 등록 에러:", err);
        res.status(500).send("댓글 등록 에러");
    }
});

// =========================================
// 🌟 기타 기능 (로그인 보안패치 적용 완료!)
// =========================================
app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === process.env.ADMIN_ID && pw === process.env.ADMIN_PW) {
        req.session.user = { id, name: '최고관리자', role: 'admin' };
    } else {
        req.session.user = { id, name: '일반유저', role: 'user' };
    }
    res.redirect('/');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.get('/signup', (req, res) => res.render('signup'));
app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    res.render('admin', { stats: { users: 0, musics: 0, reports: 0 } });
});

app.post('/add-music', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
    try {
        const { name, artist, genre, aiTool, lyrics, realName } = req.body;
        const uploader = req.session.user ? req.session.user.id : 'guest';
        const imageUrl = req.files && req.files['image'] ? `/uploads/${req.files['image'][0].filename}` : 'https://via.placeholder.com/150/111111/ff5722?text=Album';
        const audioUrl = req.files && req.files['audio'] ? `/uploads/${req.files['audio'][0].filename}` : '';
        await new Music({ name, artist, genre, aiTool, lyrics, uploaderRealName: realName, uploader, imageUrl, audioUrl }).save(); 
        res.redirect('/'); 
    } catch (err) { res.redirect('/'); }
});

app.post('/add-comment/:id', async (req, res) => {
    try {
        const music = await Music.findById(req.params.id);
        if(music) { music.comments.push({ author: req.session.user ? req.session.user.id : '익명', text: req.body.commentText }); await music.save(); }
        res.redirect('/'); 
    } catch (err) { res.redirect('/'); }
});

// --- 음원 삭제 실행 (관리자 프리패스 적용) ---
app.post('/delete-music/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/');

    try {
        const music = await Music.findById(req.params.id);
        if (!music) return res.redirect('/');

        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.id === music.uploader;

        if (isAdmin || isOwner) {
            await Music.findByIdAndDelete(req.params.id);
            await MyMusic.deleteMany({ musicId: req.params.id }); // 보관함에서도 자동 삭제
            res.redirect('/');
        } else {
            res.send("<script>alert('삭제 권한이 없습니다.'); location.href='/';</script>");
        }
    } catch (err) { res.redirect('/'); }
});

// --- 음원 수정 페이지 보기 (권한 체크 강화) ---
app.get('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");

    try {
        const music = await Music.findById(req.params.id);
        if (!music) return res.send("<script>alert('존재하지 않는 곡입니다.'); location.href='/';</script>");

        // 🌟 핵심: 관리자거나 본인인 경우만 통과!
        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.id === music.uploader;

        if (isAdmin || isOwner) {
            res.render('edit', { music: music });
        } else {
            res.send("<script>alert('수정 권한이 없습니다.'); location.href='/';</script>");
        }
    } catch (err) { res.redirect('/'); }
});
// --- 음원 수정 실행 (서버에서 한 번 더 체크) ---
app.post('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).send("로그인 필요");

    try {
        const music = await Music.findById(req.params.id);
        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.id === music.uploader;

        if (isAdmin || isOwner) {
            const { name, artist, genre, aiTool, lyrics } = req.body;
            await Music.findByIdAndUpdate(req.params.id, { name, artist, genre, aiTool, lyrics });
            res.redirect('/');
        } else {
            res.send("<script>alert('권한이 없습니다.'); location.href='/';</script>");
        }
    } catch (err) { res.redirect('/'); }
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 실행 중: ${PORT}`));


