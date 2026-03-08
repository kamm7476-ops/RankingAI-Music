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

// 몽고DB 연결 시도 (실패해도 서버가 죽지 않게 설정)
const DB_URI = "mongodb+srv://kamm7476:ranking2026@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";
mongoose.connect(DB_URI)
    .then(() => console.log('✅ DB 연결 성공!'))
    .catch(err => console.log('❌ DB 에러 (비밀번호나 IP 문제):', err.message));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 🌟 안전 모드 메인 화면: DB 검색을 건너뛰고 무조건 화면을 띄웁니다!
app.get('/', (req, res) => {
    const safeData = [{
        name: "DB 연결 테스트 중입니다", artist: "시스템", genre: "안내", aiTool: "테스트",
        lyrics: "이 화면이 정상적으로 보인다면 '무한 뺑뺑이(리디렉션)' 에러는 브라우저 캐시 때문이었습니다! 이제 몽고DB 비밀번호만 고치면 됩니다.", 
        uploader: "admin", uploaderRealName: "관리자",
        imageUrl: "https://via.placeholder.com/150/222222/00e5ff?text=Test"
    }];
    // 에러 없이 무조건 렌더링
    res.render('index', { artists: safeData }); 
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    if (req.body.id === 'kamm7476' && req.body.pw === 'ranking2026') {
        req.session.user = { id: req.body.id, name: '최고관리자', role: 'admin' };
    } else {
        req.session.user = { id: req.body.id, name: '일반유저', role: 'user' };
    }
    res.redirect('/');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.get('/signup', (req, res) => res.render('signup'));
app.get('/board', (req, res) => res.render('board', { posts: [] }));
app.get('/admin', (req, res) => res.render('admin', { stats: { users: 0, musics: 0, reports: 0 } }));

app.post('/add-music', upload.single('image'), (req, res) => {
    res.send("<script>alert('현재 안전 모드 테스트 중이라 저장이 잠겨있습니다.'); location.href='/';</script>");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 안전 모드 서버 실행 중: ${PORT}`));
