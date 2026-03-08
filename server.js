const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const app = express();

// 1. 번역 데이터 (화면 글자 설정)
const translations = {
    ko: { title: "랭킹 AI", login: "로그인", signup: "회원가입", community: "커뮤니티" },
    en: { title: "Ranking AI", login: "Login", signup: "Sign Up", community: "Community" },
    jp: { title: "ランキングAI", login: "ログイン", signup: "登録", community: "라운지" }
};

// 2. 몽고DB 연결 (사용자님 계정 정보 적용)
const DB_URI = "mongodb+srv://kamm7476:ranking2026@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";

mongoose.connect(DB_URI)
    .then(() => console.log('✅ Global DB Connected Successfully!'))
    .catch(err => console.log('❌ DB 연결 에러:', err.message));

// 3. 서버 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'ranking-secret-key',
    resave: false,
    saveUninitialized: true
}));

// 4. 무한 리다이렉트(뺑뺑이) 방지 코드
app.use((req, res, next) => {
    if (!req.session.lang) {
        req.session.lang = 'ko';
    }
    res.locals.t = translations[req.session.lang] || translations['ko'];
    res.locals.currentLang = req.session.lang;
    res.locals.user = req.session.user || null;
    next(); 
});

// 5. 페이지 주소 설정
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/change-lang/:lang', (req, res) => {
    const lang = req.params.lang;
    if (translations[lang]) {
        req.session.lang = lang;
    }
    res.redirect('/');
});

// 6. 서버 시동
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ 서버 오픈! 포트번호: ${PORT}`);
});
