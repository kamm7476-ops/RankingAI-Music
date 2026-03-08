const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const app = express();

// 1. 다국어 사전 (KO, EN, JP, ES, ZH)
const translations = {
    ko: { logo: "RANKING AI", debut: "+ 아티스트 데뷔", chartTitle: "TOP 칩셋", community: "커뮤니티", login: "로그인", signup: "가입" },
    en: { logo: "RANKING AI", debut: "+ DEBUT ARTIST", chartTitle: "TOP CHIPSETS", community: "Community", login: "Login", signup: "Join" },
    jp: { logo: "ランキングAI", debut: "+ デビュー", chartTitle: "トップチップセット", community: "ラウンジ", login: "ログイン", signup: "登録" },
    es: { logo: "RANKING AI", debut: "+ DEBUT", chartTitle: "TOP CHIPSETS", community: "Salón", login: "Acceso", signup: "Registro" },
    zh: { logo: "RANKING AI", debut: "+ 艺术家出道", chartTitle: "顶级芯片组", community: "休息室", login: "登录", signup: "加入" }
};

// 17번 줄부터 22번 줄까지를 아래 내용으로 덮어씌우세요.
// 19번 줄을 아래 코드로 '정확히' 교체하세요. (비밀번호 ranking1234)
const DB_URI = "mongodb+srv://kamm7476:ranking1234@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";
// 21번 줄 mongoose.connect 부분을 이걸로 교체!
mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("✅ Global DB Connected Successfully!"))
  .catch(err => console.log("❌ 연결 에러 내용:", err.message));

// 3. 데이터 모델 설정
const Artist = mongoose.model('Artist', new mongoose.Schema({
    name: String, artist: String, url: String, image: String, lyrics: String,
    pulse: { type: Number, default: 0 }, likedBy: [String], owner: String
}));

// 31~34번 줄 부근을 아래 내용으로 똑같이 수정하세요!
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // path.join을 써야 Render 서버가 경로를 잘 찾습니다.
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(session({ secret: 'cyber-secret', resave: false, saveUninitialized: true }));

// 언어 설정 미들웨어
app.use((req, res, next) => {
    req.session.lang = req.session.lang || 'en';
    res.locals.t = translations[req.session.lang];
    res.locals.currentLang = req.session.lang;
    res.locals.user = req.session.user || null;
    next();
});

// 5. 기본 라우트
app.get('/', async (req, res) => {
    const artists = await Artist.find().sort({ pulse: -1 });
    res.render('index', { artists });
});

app.get('/change-lang/:lang', (req, res) => {
    req.session.lang = req.params.lang;
    res.redirect('back');
});

// 기존 58~63번 줄을 지우고 아래 내용만 남기세요!
const PORT = 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 서버가 http://localhost:${PORT} 에서 드디어 실행 중입니다!`);
});




