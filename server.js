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

// 🌟 1. 몽고DB 완벽 연결
const DB_URI = "mongodb+srv://kamm7476:ranking2026@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";
mongoose.connect(DB_URI)
    .then(() => console.log('✅ RANKING AI DB 완벽 연결 성공!'))
    .catch(err => console.log('❌ DB 에러:', err.message));

// 🌟 2. 음악 데이터 설계도 (이제 진짜로 저장됩니다!)
const musicSchema = new mongoose.Schema({
    name: String, artist: String, genre: String, aiTool: String, lyrics: String,
    uploader: String, uploaderRealName: String, imageUrl: String, audioUrl: String,
    createdAt: { type: Date, default: Date.now }
});
const Music = mongoose.model('Music', musicSchema);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 🌟 3. 메인 화면 (DB에서 진짜 음악들을 불러옵니다)
app.get('/', async (req, res) => {
    try {
        let artists = await Music.find().sort({ createdAt: -1 }); // 최신순 정렬
        
        if (artists.length === 0) {
            artists = [{
                name: "첫 곡의 주인공이 되어보세요!", artist: "RANKING AI", genre: "안내", aiTool: "시스템",
                lyrics: "아직 등록된 곡이 없습니다. 위에서 음원을 업로드 해주세요.", 
                uploader: "admin", uploaderRealName: "관리자",
                imageUrl: "https://via.placeholder.com/150/222222/00e5ff?text=No+Music"
            }];
        }
        res.render('index', { artists: artists }); 
    } catch (err) {
        console.log("DB 불러오기 에러:", err);
        // 에러가 나도 무한 뺑뺑이 돌지 않게 안전하게 처리
        res.send("<h1>데이터를 불러오는 중 일시적인 에러가 발생했습니다. 잠시 후 새로고침 해주세요.</h1>");
    }
});

// 로그인, 회원가입, 커뮤니티, 관리자 라우터
app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'kamm7476' && pw === 'ranking2026') {
        req.session.user = { id: id, name: '최고관리자', role: 'admin' };
    } else {
        req.session.user = { id: id, name: '일반유저', role: 'user' };
    }
    res.redirect('/');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.get('/signup', (req, res) => res.render('signup'));
app.get('/board', (req, res) => res.render('board', { posts: [] }));
app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('접근 권한이 없습니다!'); location.href='/';</script>");
    }
    res.render('admin', { stats: { users: 0, musics: 0, reports: 0 } });
});

// 🌟 4. 음악 등록 시 DB에 완벽하게 저장하는 기능 활성화!
app.post('/add-music', upload.single('image'), async (req, res) => {
    try {
        const { name, artist, genre, aiTool, lyrics, realName } = req.body;
        const uploader = req.session.user ? req.session.user.id : 'guest';
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/150/111111/00e5ff?text=Album';

        const newMusic = new Music({
            name, artist, genre, aiTool, lyrics, uploaderRealName: realName, uploader, imageUrl
        });

        await newMusic.save(); // DB에 영구 저장!
        res.redirect('/'); 
    } catch (err) {
        console.log("저장 실패:", err);
        res.send("<script>alert('음원 등록 실패!'); location.href='/';</script>");
    }
});

app.post('/add-post', (req, res) => res.redirect('/board'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 실서버 실행 중: ${PORT}`));
