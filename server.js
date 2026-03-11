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

// 음악 DB
const musicSchema = new mongoose.Schema({
    name: String, artist: String, genre: String, aiTool: String, lyrics: String,
    uploader: String, uploaderRealName: String, imageUrl: String, audioUrl: String,
    views: { type: Number, default: 0 }, // 🌟 조회수 추가
    comments: [{ author: String, text: String, date: { type: Date, default: Date.now } }],
    createdAt: { type: Date, default: Date.now }
});
const Music = mongoose.model('Music', musicSchema);

// 유튜브/쇼츠 DB
const videoSchema = new mongoose.Schema({
    title: String, url: String, type: String, uploader: String,
    createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.model('Video', videoSchema);

const postSchema = new mongoose.Schema({
    title: String,
    content: String,
    author: String,
    createdAt: { type: Date, default: Date.now },
    // 🌟 댓글을 담을 주머니 추가!
    comments: [{ 
        author: String, 
        text: String, 
        createdAt: { type: Date, default: Date.now } 
    }]
});

// 내 음악(담기) DB
const myMusicSchema = new mongoose.Schema({
    userId: String, musicId: String, createdAt: { type: Date, default: Date.now }
});
const MyMusic = mongoose.model('MyMusic', myMusicSchema);

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

// 🌟 메인 화면 (차트 & 최신음악 분리 + 장르 검색 완벽 적용)
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search || ''; 
        const genreQuery = req.query.genre || ''; 
        const sortQuery = req.query.sort || 'views'; 
        
        let filter = {};
        if (searchQuery) filter.artist = { $regex: searchQuery, $options: 'i' };
        if (genreQuery) filter.genre = genreQuery;

        let sortOption = { views: -1 }; // 기본: 조회수순
        if (sortQuery === 'latest') sortOption = { createdAt: -1 }; // 최신음악: 시간순

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

// 🌟 조회수 증가 라우터
app.post('/play-count/:id', async (req, res) => {
    try {
        await Music.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
        res.sendStatus(200);
    } catch(err) { res.sendStatus(500); }
});

// 담기 기능
app.post('/add-to-mymusic', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "로그인이 필요합니다." });
        const musicIds = req.body.musicIds;
        const userId = req.session.user.id;
        for (let id of musicIds) {
            const exists = await MyMusic.findOne({ userId: userId, musicId: id });
            if (!exists && id !== "dummy") await new MyMusic({ userId: userId, musicId: id }).save();
        }
        res.json({ message: "내 음악에 성공적으로 담겼습니다!" });
    } catch (err) { res.status(500).json({ message: "담기에 실패했습니다." }); }
});

// 내 음악 페이지 보기 & 삭제
app.get('/mymusic', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    const mySaved = await MyMusic.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
    const musicIds = mySaved.map(item => item.musicId);
    const myArtists = await Music.find({ _id: { $in: musicIds } });
    res.render('mymusic', { artists: myArtists });
});
app.post('/delete-mymusic/:id', async (req, res) => {
    if (req.session.user) await MyMusic.findOneAndDelete({ userId: req.session.user.id, musicId: req.params.id });
    res.redirect('/mymusic');
});

// 유튜브/쇼츠 기능
app.get('/youtube', async (req, res) => {
    const videos = await Video.find({ type: 'youtube' }).sort({ createdAt: -1 });
    res.render('video', { videos: videos, pageType: 'youtube', pageTitle: '📺 유튜브 홍보관' });
});
app.get('/shorts', async (req, res) => {
    const videos = await Video.find({ type: 'shorts' }).sort({ createdAt: -1 });
    res.render('video', { videos: videos, pageType: 'shorts', pageTitle: '📱 쇼츠 홍보관' });
});
app.post('/add-video', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    await new Video({ title: req.body.title, url: req.body.url, type: req.body.type, uploader: req.session.user.id }).save();
    res.redirect('/' + req.body.type);
});
app.post('/delete-video/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('back');
    const video = await Video.findById(req.params.id);
    if (req.session.user.role === 'admin' || req.session.user.id === video.uploader) await Video.findByIdAndDelete(req.params.id);
    res.redirect('back');
});

// 커뮤니티 게시판 기능 (완벽 수정본)
app.get('/board', async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        // 🌟 여기가 핵심! 화면에 로그인한 유저(user) 정보도 같이 넘겨줍니다!
        const currentUser = req.session ? req.session.user : null;
        res.render('board', { user: currentUser, posts: posts });
    } catch (err) {
        console.log("게시판 로딩 에러:", err);
        res.status(500).send("게시판 에러");
    }
});

app.post('/add-post', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    }
    
    try {
        await new Post({
            title: req.body.title,
            content: req.body.content,
            author: req.session.user.id
        }).save();
        res.redirect('/board');
    } catch (err) {
        console.log("글 등록 에러:", err);
    }
});

app.post('/delete-post/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/board');
    
    try {
        const post = await Post.findById(req.params.id);
        if (req.session.user.role === 'admin' || req.session.user.id === post.author) {
            await Post.findByIdAndDelete(req.params.id);
        }
        res.redirect('/board');
    } catch (err) {
        console.log("글 삭제 에러:", err);
    }
});
// 4. 커뮤니티 게시글에 댓글 달기 (새로 뚫은 통로!)
app.post('/add-board-comment/:id', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    }
    try {
        const post = await Post.findById(req.params.id);
        if (post) {
            post.comments.push({ // 주머니에 댓글 쏙 넣기!
                author: req.session.user.id,
                text: req.body.commentText
            });
            await post.save();
        }
        res.redirect('/board'); // 댓글 달고 다시 게시판 새로고침
    } catch (err) {
        console.log("댓글 등록 에러:", err);
        res.status(500).send("댓글 등록 에러");
    }
});
// 사용자 및 관리자, 음원 업로드/삭제
app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'kamm7476' && pw === 'ranking2026') req.session.user = { id, name: '최고관리자', role: 'admin' };
    else req.session.user = { id, name: '일반유저', role: 'user' };
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
app.post('/delete-music/:id', async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/');
        const music = await Music.findById(req.params.id);
        if (req.session.user.role === 'admin' || req.session.user.id === music.uploader) await Music.findByIdAndDelete(req.params.id);
        await MyMusic.deleteMany({ musicId: req.params.id });
        res.redirect('/'); 
    } catch (err) { res.redirect('/'); }
});

// 곡 정보 수정 기능
app.get('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/';</script>");
    try {
        const music = await Music.findById(req.params.id);
        if (!music) return res.send("<script>alert('존재하지 않는 곡입니다.'); location.href='/';</script>");
        if (req.session.user.role === 'admin' || req.session.user.id === music.uploader) res.render('edit', { music: music });
        else res.send("<script>alert('수정 권한이 없습니다!'); location.href='/';</script>");
    } catch (err) { res.redirect('/'); }
});
app.post('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/';</script>");
    try {
        const { name, artist, genre, aiTool, lyrics } = req.body;
        const music = await Music.findById(req.params.id);
        if (req.session.user.role === 'admin' || req.session.user.id === music.uploader) {
            await Music.findByIdAndUpdate(req.params.id, { name, artist, genre, aiTool, lyrics });
            res.redirect('/');
        } else res.send("<script>alert('수정 권한이 없습니다!'); location.href='/';</script>");
    } catch (err) { res.send("<script>alert('수정 중 오류가 발생했습니다.'); location.href='/';</script>"); }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 실행 중: ${PORT}`));


