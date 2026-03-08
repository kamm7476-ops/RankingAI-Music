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
    // 테스트용 임시 관리자 로그인 상태 (나중에 실제 로그인 로직으로 교체)
    if (!req.session.user) {
        req.session.user = { id: 'kamm7476', name: '관리자본명', role: 'admin' }; 
    }
    res.locals.user = req.session.user;
    next();
});

// 메인 화면
app.get('/', (req, res) => {
    // 🌟 aiTool 항목이 추가된 임시 데이터
    const artists = [
        { 
            name: "밤양갱 (AI Cover)", 
            artist: "비비(BIBI)", 
            genre: "K-POP", 
            aiTool: "Suno AI", // <-- 사용한 프로그램 데이터
            lyrics: "[00:00] 달디달고 달디달고 달디단\n[00:05] 밤양갱 밤양갱", 
            uploader: "kamm7476", 
            uploaderRealName: "관리자본명",
            imageUrl: "https://via.placeholder.com/150/111111/00e5ff?text=Album"
        }
    ];
    res.render('index', { artists: artists }); 
});

// 🌟 로그인 화면으로 가는 길
app.get('/login', (req, res) => {
    res.render('login');
});

// 🌟 회원가입 화면으로 가는 길
app.get('/signup', (req, res) => {
    res.render('signup');
});

// 곡 등록 처리 (aiTool 포함)
app.post('/add-music', upload.single('image'), (req, res) => {
    const { name, artist, genre, aiTool, lyrics, realName } = req.body;
    console.log(`새로운 곡 등록됨: ${name} (프로그램: ${aiTool}) / 실명: ${realName}`);
    res.redirect('/'); 
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 포트 ${PORT}에서 실행 중!`));
