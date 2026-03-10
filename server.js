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
// 🌟 커뮤니티 게시판 DB 설계도
const postSchema = new mongoose.Schema({
    title: String, content: String, author: String, createdAt: { type: Date, default: Date.now }
});
const Post = mongoose.model('Post', postSchema);
// 🌟 내 음악(담기) DB 설계도 추가!
const myMusicSchema = new mongoose.Schema({
    userId: String,
    musicId: String,
    createdAt: { type: Date, default: Date.now }
});
const MyMusic = mongoose.model('MyMusic', myMusicSchema);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // JSON 데이터 처리를 위해 추가
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 메인 화면
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search || ''; 
        const genreQuery = req.query.genre || ''; // 🌟 장르 검색 추가
        
        let filter = {};
        if (searchQuery) filter.artist = { $regex: searchQuery, $options: 'i' };
        if (genreQuery) filter.genre = genreQuery; // 🌟 장르 필터링 적용

        let artists = await Music.find(filter).sort({ createdAt: -1 });
        let popularArtists = await Music.aggregate([
            { $group: { _id: "$artist", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        if (artists.length === 0 && !searchQuery && !genreQuery) {
            artists = [{
                _id: "dummy", name: "첫 곡의 주인공이 되어보세요!", artist: "RANKING AI", genre: "안내", aiTool: "시스템",
                lyrics: "아직 등록된 곡이 없습니다.", uploader: "admin", uploaderRealName: "관리자", audioUrl: "",
                imageUrl: "https://via.placeholder.com/150/222222/ff5722?text=No+Music"
            }];
            popularArtists = [{ _id: "비비(BIBI)", count: 1 }];
        }
        res.render('index', { artists: artists, searchQuery: searchQuery, genreQuery: genreQuery, popularArtists: popularArtists });
    } catch (err) {
        console.log("DB 에러:", err);
        res.send("<h1>데이터를 불러오는 중 에러가 발생했습니다.</h1>");
    } // 👈 이 부분(에러 처리 및 괄호 닫기)이 통째로 빠져있어서 에러가 났던 겁니다!
});

// 🌟 담기 기능 (선택된 곡들을 내 보관함에 저장)
// 🌟 담기 기능 (선택된 곡들을 내 보관함에 저장)
app.post('/add-to-mymusic', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "로그인이 필요합니다." });
        
        const musicIds = req.body.musicIds; // 배열로 받은 곡 ID들
        const userId = req.session.user.id;

        // 이미 담긴 곡인지 확인하고 안 담긴 곡만 저장
        for (let id of musicIds) {
            const exists = await MyMusic.findOne({ userId: userId, musicId: id });
            if (!exists && id !== "dummy") {
                await new MyMusic({ userId: userId, musicId: id }).save();
            }
        }
        res.json({ message: "내 음악에 성공적으로 담겼습니다!" });
    } catch (err) {
        res.status(500).json({ message: "담기에 실패했습니다." });
    }
});

// 🌟 내 음악 페이지 보기
app.get('/mymusic', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    
    // 내 보관함에 있는 곡 ID들을 찾아서 실제 음악 데이터로 바꿔옵니다.
    const mySaved = await MyMusic.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
    const musicIds = mySaved.map(item => item.musicId);
    const myArtists = await Music.find({ _id: { $in: musicIds } });

    res.render('mymusic', { artists: myArtists });
});

// 영상 및 기존 라우터 유지
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
        // 내 음악 보관함에서도 지워주기
        await MyMusic.deleteMany({ musicId: req.params.id });
        res.redirect('/'); 
    } catch (err) { res.redirect('/'); }
});
// 🌟 곡 정보 수정 페이지 열기
app.get('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/';</script>");
    try {
        const music = await Music.findById(req.params.id);
        if (!music) return res.send("<script>alert('존재하지 않는 곡입니다.'); location.href='/';</script>");
        
        // 권한 체크: 최고관리자이거나, 자기가 올린 곡일 때만 수정 페이지 접속 허용
        if (req.session.user.role === 'admin' || req.session.user.id === music.uploader) {
            res.render('edit', { music: music });
        } else {
            res.send("<script>alert('수정 권한이 없습니다!'); location.href='/';</script>");
        }
    } catch (err) {
        res.redirect('/');
    }
});

// 🌟 곡 정보 수정 내용 저장하기
app.post('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/';</script>");
    try {
        const { name, artist, genre, aiTool, lyrics } = req.body;
        const music = await Music.findById(req.params.id);
        
        if (req.session.user.role === 'admin' || req.session.user.id === music.uploader) {
            // 전달받은 새 정보로 업데이트
            await Music.findByIdAndUpdate(req.params.id, { name, artist, genre, aiTool, lyrics });
            res.redirect('/');
        } else {
            res.send("<script>alert('수정 권한이 없습니다!'); location.href='/';</script>");
        }
    } catch (err) {
        res.send("<script>alert('수정 중 오류가 발생했습니다.'); location.href='/';</script>");
    }
});
// 🌟 커뮤니티 게시판 열기 및 글쓰기/삭제
app.get('/board', async (req, res) => {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.render('board', { posts: posts });
});
app.post('/add-post', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    await new Post({ title: req.body.title, content: req.body.content, author: req.session.user.id }).save();
    res.redirect('/board');
});
app.post('/delete-post/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/board');
    const post = await Post.findById(req.params.id);
    if (req.session.user.role === 'admin' || req.session.user.id === post.author) await Post.findByIdAndDelete(req.params.id);
    res.redirect('/board');
});

// 🌟 내 음악 보관함에서 삭제하기
app.post('/delete-mymusic/:id', async (req, res) => {
    if (req.session.user) await MyMusic.findOneAndDelete({ userId: req.session.user.id, musicId: req.params.id });
    res.redirect('/mymusic');
});

// 🌟 유튜브/쇼츠 영상 삭제하기
app.post('/delete-video/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('back');
    const video = await Video.findById(req.params.id);
    if (req.session.user.role === 'admin' || req.session.user.id === video.uploader) await Video.findByIdAndDelete(req.params.id);
    res.redirect('back');
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 실행 중: ${PORT}`));





