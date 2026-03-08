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

// 음악 DB 설계도
const musicSchema = new mongoose.Schema({
    name: String, artist: String, genre: String, aiTool: String, lyrics: String,
    uploader: String, uploaderRealName: String, imageUrl: String, audioUrl: String,
    comments: [{ author: String, text: String, date: { type: Date, default: Date.now } }],
    createdAt: { type: Date, default: Date.now }
});
const Music = mongoose.model('Music', musicSchema);

// 🌟 새로 추가된 유튜브/쇼츠 영상 DB 설계도
const videoSchema = new mongoose.Schema({
    title: String,
    url: String,     // 유튜브 원본 링크
    type: String,    // 'youtube' 또는 'shorts'
    uploader: String,
    createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.model('Video', videoSchema);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 메인 화면 (차트)
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search || ''; 
        let filter = {};
        if (searchQuery) filter.artist = { $regex: searchQuery, $options: 'i' };

        let artists = await Music.find(filter).sort({ createdAt: -1 });
        let popularArtists = await Music.aggregate([
            { $group: { _id: "$artist", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        if (artists.length === 0 && !searchQuery) {
            artists = [{
                _id: "dummy", name: "첫 곡의 주인공이 되어보세요!", artist: "RANKING AI", genre: "안내", aiTool: "시스템",
                lyrics: "아직 등록된 곡이 없습니다.", uploader: "admin", uploaderRealName: "관리자", audioUrl: "",
                imageUrl: "https://via.placeholder.com/150/222222/ff5722?text=No+Music"
            }];
            popularArtists = [{ _id: "비비(BIBI)", count: 1 }];
        }
        res.render('index', { artists: artists, searchQuery: searchQuery, popularArtists: popularArtists }); 
    } catch (err) {
        res.send("<h1>데이터를 불러오는 중 에러가 발생했습니다.</h1>");
    }
});

// 🌟 유튜브 게시판 열기
app.get('/youtube', async (req, res) => {
    const videos = await Video.find({ type: 'youtube' }).sort({ createdAt: -1 });
    res.render('video', { videos: videos, pageType: 'youtube', pageTitle: '📺 유튜브 홍보관' });
});

// 🌟 쇼츠 게시판 열기
app.get('/shorts', async (req, res) => {
    const videos = await Video.find({ type: 'shorts' }).sort({ createdAt: -1 });
    res.render('video', { videos: videos, pageType: 'shorts', pageTitle: '📱 쇼츠 홍보관' });
});

// 🌟 영상 등록 처리
app.post('/add-video', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    const { title, url, type } = req.body;
    const newVideo = new Video({ title, url, type, uploader: req.session.user.id });
    await newVideo.save();
    res.redirect('/' + type); // 올린 게시판으로 돌아감
});

// 로그인, 회원가입, 커뮤니티 등 기존 라우터
app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'kamm7476' && pw === 'ranking2026') req.session.user = { id, name: '최고관리자', role: 'admin' };
    else req.session.user = { id, name: '일반유저', role: 'user' };
    res.redirect('/');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.get('/signup', (req, res) => res.render('signup'));
app.get('/board', (req, res) => res.render('board', { posts: [] }));
app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.send("<script>alert('접근 권한이 없습니다!'); location.href='/';</script>");
    res.render('admin', { stats: { users: 0, musics: 0, reports: 0 } });
});

// 음악 등록/삭제/댓글 등
app.post('/add-music', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
    try {
        const { name, artist, genre, aiTool, lyrics, realName } = req.body;
        const uploader = req.session.user ? req.session.user.id : 'guest';
        const imageUrl = req.files && req.files['image'] ? `/uploads/${req.files['image'][0].filename}` : 'https://via.placeholder.com/150/111111/ff5722?text=Album';
        const audioUrl = req.files && req.files['audio'] ? `/uploads/${req.files['audio'][0].filename}` : '';
        const newMusic = new Music({ name, artist, genre, aiTool, lyrics, uploaderRealName: realName, uploader, imageUrl, audioUrl });
        await newMusic.save(); res.redirect('/'); 
    } catch (err) { res.send("<script>alert('음원 등록 실패!'); location.href='/';</script>"); }
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
        if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/';</script>");
        const music = await Music.findById(req.params.id);
        if (req.session.user.role === 'admin' || req.session.user.id === music.uploader) await Music.findByIdAndDelete(req.params.id);
        res.redirect('/'); 
    } catch (err) { res.send("<script>alert('오류 발생'); location.href='/';</script>"); }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 실행 중: ${PORT}`));
