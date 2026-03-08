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

const DB_URI = "mongodb+srv://kamm7476:ranking2026@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";
mongoose.connect(DB_URI)
    .then(() => console.log('✅ RANKING AI DB 완벽 연결!'))
    .catch(err => console.log('❌ DB 에러:', err.message));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    // 🌟 현재 테스트를 위해 접속하는 순간 '관리자' 권한을 부여해두었습니다.
    // (나중에 진짜 로그인 기능이 붙으면 이 부분을 수정하게 됩니다.)
    if (!req.session.user) {
        req.session.user = { id: 'kamm7476', name: '관리자본명', role: 'admin' }; 
    }
    res.locals.user = req.session.user;
    next();
});

// 1. 메인 화면
app.get('/', (req, res) => {
    const artists = [
        { 
            name: "밤양갱 (AI Cover)", artist: "비비(BIBI)", genre: "K-POP", aiTool: "Suno AI",
            lyrics: "[00:00] 달디달고 달디달고 달디단\n[00:05] 밤양갱 밤양갱", 
            uploader: "kamm7476", uploaderRealName: "관리자본명",
            imageUrl: "https://via.placeholder.com/150/111111/00e5ff?text=Album",
            audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
        }
    ];
    res.render('index', { artists: artists }); 
});

app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));

// 2. 게시판 화면
app.get('/board', (req, res) => {
    const posts = [
        { title: "Suno AI로 만든 곡 평가해주세요!", author: "음악초보", date: "2026-03-08" },
        { title: "요즘 이 차트 1위 곡 미쳤네요;;", author: "리스너", date: "2026-03-08" }
    ];
    res.render('board', { posts: posts });
});

// 🌟 3. 관리자 전용 숨겨진 공간 (백오피스)
app.get('/admin', (req, res) => {
    // 관리자(admin)가 아니면 경고창을 띄우고 메인으로 쫓아냅니다!
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('접근 권한이 없습니다! (관리자 전용)'); location.href='/';</script>");
    }

    // 관리자 화면에 보여줄 가짜 통계 데이터
    const stats = { users: 154, musics: 32, reports: 0 };
    res.render('admin', { stats: stats });
});

app.post('/add-post', (req, res) => res.redirect('/board'));
app.post('/add-music', upload.single('image'), (req, res) => res.redirect('/'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 포트 ${PORT}에서 실행 중!`));
