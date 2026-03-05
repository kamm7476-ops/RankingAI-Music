const express = require('express');
const mongoose = require('mongoose');
const app = express();
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');

// 🌟 1. 진짜 데이터베이스(MongoDB) 연결! (아이디/비번 교체 완료)
// 주의: 아래 주소에서 01483890Nki**** 부분의 ****를 진짜 비밀번호로 꼭 바꿔주세요!!
const DB_URI = "mongodb+srv://kamm7476:01483890Nki@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";

mongoose.connect(DB_URI)
    .then(() => console.log("✅ [경축] 드디어 진짜 MongoDB 데이터베이스 연결 성공!!"))
    .catch(err => {
        console.log("❌ MongoDB 연결 실패 (하지만 배포하면 해결될 수 있습니다!)");
        console.log("상세 에러:", err.message);
    });

// 🌟 2. 데이터 보관함(설계도) 만들기
const Artist = mongoose.model('Artist', new mongoose.Schema({
    name: String, type: String, genre: String, pulse: { type: Number, default: 0 },
    image: String, url: String
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
app.use(session({ secret: 'ranking-secure', resave: false, saveUninitialized: false }));

const upload = multer({ dest: 'public/uploads/' });

// 메인 페이지 (DB에서 데이터 불러오기)
app.get('/', async (req, res) => {
    try {
        const artists = await Artist.find().sort({ pulse: -1 }); // 펄스 높은 순 정렬
        res.render('index', { artists, user: req.session.user || null });
    } catch (e) {
        res.status(500).send("데이터베이스 대기 중...");
    }
});

// 회원가입 (DB에 저장)
app.post('/signup', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    try {
        await User.create({ username: req.body.username, password: hashedPassword });
        res.send('<script>alert("가입 성공! 진짜 DB에 저장되었습니다."); window.location.href="/";</script>');
    } catch (e) { 
        res.send('<script>alert("이미 있는 아이디입니다!"); window.location.href="/";</script>'); 
    }
});

// 로그인 (DB에서 찾기)
app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.user = { username: user.username };
        res.redirect('/');
    } else { 
        res.send('<script>alert("로그인 정보가 틀립니다."); window.location.href="/";</script>'); 
    }
});

// 로그아웃
app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/'); 
});

// 업로드 (DB에 곡 정보 저장)
app.post('/upload', upload.fields([{ name: 'imageFile', maxCount: 1 }, { name: 'mediaFile', maxCount: 1 }]), async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    
    let imagePath = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500";
    if (req.files && req.files['imageFile']) imagePath = `/uploads/${req.files['imageFile'][0].filename}`;

    let mediaPath = "#";
    if (req.files && req.files['mediaFile']) mediaPath = `/uploads/${req.files['mediaFile'][0].filename}`;
    
    // 임시 배열(push) 대신 진짜 DB(create)에 저장!
    await Artist.create({
        name: req.body.title, 
        type: req.body.type, 
        genre: req.body.genre,
        pulse: parseInt(req.body.pulse) || 0,
        image: imagePath,
        url: mediaPath
    });
    res.redirect('/');
});

// 👉 Render 포트 에러 해결 완료!
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`🚀 서버 가동 중: 포트 ${port}번 (진짜 DB 모드)`));