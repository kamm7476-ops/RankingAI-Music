const express = require('express');
const mongoose = require('mongoose');
const app = express();
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');

// 🌟 1. 진짜 데이터베이스(MongoDB) 연결 (kamm7476 계정 적용)
const DB_URI = "mongodb+srv://kamm7476:01483890Nki@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";

mongoose.connect(DB_URI)
    .then(() => console.log("✅ 몽고DB 연결 성공! (슈퍼 관리자 모드)"))
    .catch(err => console.log("❌ DB 연결 실패:", err.message));

// 🌟 2. 데이터 보관함(설계도) - owner(주인) 필드 추가
const Artist = mongoose.model('Artist', new mongoose.Schema({
    name: String, artist: String, type: String, genre: String, 
    pulse: { type: Number, default: 0 },
    image: { type: String, default: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500" }, 
    url: String,
    owner: String // 누가 올렸는지 기록
}));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'ranking-admin-secure-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

const upload = multer({ dest: 'public/uploads/' });

// 🛠️ 관리자인지 확인하는 마법의 함수
const isAdmin = (user) => user && user.username === 'kamm7476';

// 메인 페이지
app.get('/', async (req, res) => {
    try {
        const artists = await Artist.find().sort({ _id: -1 });
        res.render('index', { 
            artists, 
            user: req.session.user || null,
            isAdmin: isAdmin(req.session.user) // 관리자 여부 전달
        });
    } catch (e) { res.status(500).send("DB 연결 대기 중..."); }
});

// 회원가입
app.post('/signup', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    try {
        await User.create({ username: req.body.username, password: hashedPassword });
        res.send('<script>alert("가입 성공!"); window.location.href="/";</script>');
    } catch (e) { res.send('<script>alert("이미 있는 아이디입니다!"); window.location.href="/";</script>'); }
});

// 로그인
app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.user = { username: user.username };
        res.redirect('/');
    } else { res.send('<script>alert("로그인 정보가 틀립니다."); window.location.href="/";</script>'); }
});

// 로그아웃
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// 업로드
app.post('/upload', upload.single('mediaFile'), async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    await Artist.create({
        name: req.body.title,
        artist: req.body.artist,
        type: req.body.type,
        genre: req.body.genre,
        url: req.file ? `/uploads/${req.file.filename}` : "#",
        owner: req.session.user.username // 현재 로그인한 사람을 주인으로 저장
    });
    res.redirect('/');
});

// 🌟 수정 기능 (본인이거나 관리자일 때만!)
app.post('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const song = await Artist.findById(req.params.id);
    if (song && (song.owner === req.session.user.username || isAdmin(req.session.user))) {
        await Artist.findByIdAndUpdate(req.params.id, {
            name: req.body.title,
            artist: req.body.artist,
            genre: req.body.genre
        });
    }
    res.redirect('/');
});

// 🌟 삭제 기능 (본인이거나 관리자일 때만!)
app.post('/delete/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const song = await Artist.findById(req.params.id);
    if (song && (song.owner === req.session.user.username || isAdmin(req.session.user))) {
        await Artist.findByIdAndDelete(req.params.id);
    }
    res.redirect('/');
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`🚀 서버 가동 중 (관리자: kamm7476)`));