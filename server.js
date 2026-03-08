const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const multer = require('multer'); // 이미지 업로드 도구
const app = express();

// 1. 이미지 저장 경로 설정 (public/uploads 폴더 사용)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// 2. 몽고DB 연결 (비밀번호 ranking2026 적용)
const DB_URI = "mongodb+srv://kamm7476:ranking2026@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";
mongoose.connect(DB_URI)
    .then(() => console.log('✅ DB 연결 성공!'))
    .catch(err => console.log('❌ DB 에러:', err.message));

// 3. 앱 설정
app.set('view engine', 'ejs');
app.use(express.static('public')); // CSS, 이미지 파일 경로
app.use(express.urlencoded({ extended: true })); // 폼 입력값 읽기
app.use(session({ secret: 'ranking-key', resave: false, saveUninitialized: true }));

// 4. 언어 설정 미들웨어 (무한 뺑뺑이 방지)
app.use((req, res, next) => {
    if (!req.session.lang) req.session.lang = 'ko';
    const translations = {
        ko: { title: "랭킹 AI", login: "로그인", upload: "아티스트 등록" },
        en: { title: "Ranking AI", login: "Login", upload: "Add Artist" }
    };
    res.locals.t = translations[req.session.lang];
    res.locals.currentLang = req.session.lang;
    next();
});

// 5. 메인 페이지 (에러 방지용 artists 데이터 포함)
app.get('/', (req, res) => {
    // 실제 운영 시에는 DB에서 데이터를 찾아와야 하지만, 
    // 지금은 에러 방지를 위해 빈 목록([])을 먼저 보냅니다.
    res.render('index', { artists: [] }); 
});

// 6. 이미지 업로드 처리 경로
app.post('/add-artist', upload.single('image'), (req, res) => {
    console.log("새 아티스트 등록 시도 중...");
    res.redirect('/');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 서버 실행 중: ${PORT}`));
