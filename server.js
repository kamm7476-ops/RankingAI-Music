require('dotenv').config(); // 🌟 .env 파일 읽어오는 핵심 마법!
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const nodemailer = require('nodemailer'); // 🌟 이메일 우체부 소환!

const passport = require('passport');
const NaverStrategy = require('passport-naver').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// 🌟 클라우디너리 영구 금고 세팅
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const User = require('./models/user'); // (또는 './user') 기존 코드
const Stats = require('./models/Stats'); // 🌟 이거 한 줄 추가!
const bcrypt = require('bcrypt'); // 암호화 믹서기

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'ranking-ai',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp3', 'wav']
    }
});
const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 10 * 1024 * 1024 // 🌟 이미지 최대 10MB로 제한! (1 곱하기 1MB)
    } 
});

const app = express();
let currentPopup = { isActive: false, title: '', content: '' };

// 🌟 DB 연결
mongoose.connect(process.env.DB_URI)
  .then(() => console.log("☁️ 진짜 인터넷 창고(Cloud DB) 연결 완료!! ☁️"))
  .catch((err) => console.log("🔥 DB 연결 에러:", err));

// =========================================
// 🌟 1. 음악 DB 주머니
// =========================================
const musicSchema = new mongoose.Schema({
    name: String, artist: String, genre: String, aiTool: String, lyrics: String,
    uploader: String, uploaderRealName: String, imageUrl: String, audioUrl: String,
    views: { type: Number, default: 0 },
    likedBy: [String], 
    comments: [{ author: String, text: String, date: { type: Date, default: Date.now } }],
    createdAt: { type: Date, default: Date.now }
});
const Music = mongoose.models.Music || mongoose.model('Music', musicSchema);

// =========================================
// 🌟 2. 유튜브/쇼츠 DB 주머니 (썸네일 포함)
// =========================================
const videoSchema = new mongoose.Schema({
    title: String, url: String, type: String, uploader: String,
    thumbnail: String, 
    createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.models.Video || mongoose.model('Video', videoSchema);

// =========================================
// 🌟 3. 커뮤니티 게시판 DB 주머니
// =========================================
const postSchema = new mongoose.Schema({
    title: String,
    content: String,
    author: String,
    likes: { type: Number, default: 0 },
    likedBy: [String], 
    createdAt: { type: Date, default: Date.now },
    comments: [{ 
        author: String, 
        text: String, 
        likes: { type: Number, default: 0 },
        likedBy: [String], 
        createdAt: { type: Date, default: Date.now } 
    }]
});
const Post = mongoose.models.Post || mongoose.model('Post', postSchema);

// =========================================
// 🌟 4. 내 음악(담기) DB 주머니
// =========================================
const myMusicSchema = new mongoose.Schema({
    userId: String, musicId: String, createdAt: { type: Date, default: Date.now }
});
const MyMusic = mongoose.models.MyMusic || mongoose.model('MyMusic', myMusicSchema);

// =========================================
// 🌟 5. 팝업 공지 DB 주머니
// =========================================
const popupSchema = new mongoose.Schema({
    title: String,
    content: String,
    isActive: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});
const Popup = mongoose.models.Popup || mongoose.model('Popup', popupSchema);

// =========================================
// 🌟 6. 1:1 관리자 DM (제휴/문의) 기능 DB
// =========================================
const dmSchema = new mongoose.Schema({
    userId: String,
    message: String,
    reply: { type: String, default: '' }, 
    createdAt: { type: Date, default: Date.now }
});
const DM = mongoose.models.DM || mongoose.model('DM', dmSchema);

// =========================================
// 🌟 서버 기본 설정
// =========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'ranking_secret_key_1234', 
  resave: false,
  saveUninitialized: false
}));
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// =========================================
// 🌟 네이버 소셜 로그인 (Passport) 🌟
// =========================================
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => { done(null, user); });
passport.deserializeUser((obj, done) => { done(null, obj); });

passport.use(new NaverStrategy({
    clientID: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    callbackURL: "https://rankingaimusic.com/auth/naver/callback" 
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const naverId = 'naver_' + profile.id; 
        let user = await User.findOne({ username: naverId });
        
        if (!user) {
            const randomPassword = Math.random().toString(36).slice(-10); 
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            user = new User({ username: naverId, password: hashedPassword, nickname: "" }); 
            await user.save();
        }
        return done(null, { id: user.username, name: user.nickname || "", role: user.role });
    } catch (err) {
        return done(err);
    }
}));

app.get('/auth/naver', passport.authenticate('naver'));

app.get('/auth/naver/callback', 
    passport.authenticate('naver', { failureRedirect: '/login' }), 
    (req, res) => {
        if (!req.user.name || req.user.name.trim() === "") {
            req.session.tempUser = req.user; 
            res.send("<script>alert('환영합니다! 사이트에서 활동할 닉네임을 설정해주세요.'); window.location.href='/set-nickname';</script>");
        } else {
            req.session.user = req.user; 
            res.send("<script>alert('네이버 로그인 성공!'); window.location.href='/';</script>");
        }
    }
);

// =========================================
// 🌟 구글 소셜 로그인 파이프 🌟
// =========================================
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://rankingaimusic.com/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const googleId = 'google_' + profile.id; 
        let user = await User.findOne({ username: googleId });
        
        if (!user) {
            const randomPassword = Math.random().toString(36).slice(-10); 
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            user = new User({ username: googleId, password: hashedPassword, nickname: "" }); 
            await user.save();
        }
        return done(null, { id: user.username, name: user.nickname || "", role: user.role });
    } catch (err) {
        return done(err);
    }
}));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        if (!req.user.name || req.user.name.trim() === "") {
            req.session.tempUser = req.user; 
            res.send("<script>alert('환영합니다! 사이트에서 활동할 닉네임을 설정해주세요.'); window.location.href='/set-nickname';</script>");
        } else {
            req.session.user = req.user; 
            res.send("<script>alert('초간단 구글 로그인 성공!'); window.location.href='/';</script>");
        }
    }
);

// ==========================================
// 🌟 닉네임(아티스트명) 강제 설정 파이프 (중간 검문소) 🌟
// ==========================================
app.get('/set-nickname', (req, res) => {
    if (!req.session.tempUser) return res.redirect('/login');
    res.render('set-nickname'); 
});

app.post('/set-nickname', async (req, res) => {
    if (!req.session.tempUser) return res.redirect('/login');
    try {
        const newNickname = req.body.nickname.trim();
        
        const existing = await User.findOne({ nickname: newNickname });
        if (existing) {
            return res.send("<script>alert('이미 다른 분이 사용 중인 이름입니다! 다른 멋진 이름을 지어주세요.'); window.history.back();</script>");
        }

        await User.findOneAndUpdate(
            { username: req.session.tempUser.id }, 
            { nickname: newNickname }
        );

        req.session.user = { 
            id: req.session.tempUser.id, 
            name: newNickname, 
            role: req.session.tempUser.role 
        };
        req.session.tempUser = null; 

        res.send(`<script>alert('${newNickname}님, 환영합니다! 멋진 활동 기대할게요.'); window.location.href='/';</script>`);
    } catch (err) {
        console.error("닉네임 설정 에러:", err);
        res.send("<script>alert('에러가 발생했습니다.'); window.history.back();</script>");
    }
});


// ==========================================
// ✉️ 🌟 이메일 인증 발송 및 확인 파이프 (Nodemailer) 🌟
// ==========================================
const verificationCodes = new Map(); // 임시 번호 보관소 (서버 메모리)

// 우체부(트랜스포터) 세팅
const transporter = nodemailer.createTransport({
    service: 'gmail', // 구글 메일 사용
    auth: {
        user: process.env.EMAIL_USER, // .env 파일에 적을 내 이메일
        pass: process.env.EMAIL_PASS  // .env 파일에 적을 구글 앱 비밀번호
    }
});

// 1. 인증번호 메일 쏘기
app.post('/send-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: "이메일이 없습니다." });

    // 6자리 랜덤 숫자 생성
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 번호 기억해두기 (5분 뒤 만료)
    verificationCodes.set(email, {
        code: code,
        expires: Date.now() + 5 * 60 * 1000 
    });

    try {
        await transporter.sendMail({
            from: `"RANKING AI" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "[RANKING AI] 회원가입 이메일 인증번호",
            html: `<div style="font-family: sans-serif; padding: 30px; background-color: #f5f5f5; border-radius: 10px; text-align: center; max-width: 500px; margin: 0 auto;">
                    <h2 style="color: #333; margin-bottom: 20px;">RANKING AI 회원가입 인증</h2>
                    <p style="color: #555; font-size: 15px;">아래 6자리 인증번호를 회원가입 화면에 입력해주세요.</p>
                    <div style="margin: 30px 0; padding: 20px; background: #fff; border: 2px solid #ff5722; border-radius: 8px; display: inline-block;">
                        <h1 style="color: #ff5722; letter-spacing: 8px; margin: 0; font-size: 32px;">${code}</h1>
                    </div>
                    <p style="color: #888; font-size: 12px; margin-top: 20px;">※ 이 번호는 5분 동안만 유효합니다.</p>
                   </div>`
        });
        res.json({ success: true });
    } catch (error) {
        console.error("이메일 발송 에러:", error);
        res.json({ success: false, message: "이메일 발송 실패! 서버 설정을 확인해주세요." });
    }
});

// 2. 입력한 번호 맞는지 채점하기
app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    const storedData = verificationCodes.get(email);

    if (!storedData) return res.json({ success: false, message: "인증 요청 내역이 없습니다." });
    if (Date.now() > storedData.expires) {
        verificationCodes.delete(email); // 시간 지났으면 파기
        return res.json({ success: false, message: "인증 시간이 만료되었습니다. 다시 요청해주세요." });
    }
    if (storedData.code !== code.trim()) {
        return res.json({ success: false, message: "인증번호가 틀립니다." });
    }

    verificationCodes.delete(email); // 인증 성공하면 쓴 번호는 파기
    res.json({ success: true });
});


// ==========================================
// 🚪 화면 보여주는 파이프 (GET)
// ==========================================
app.get('/signup', (req, res) => res.render('signup'));
app.get('/login', (req, res) => res.render('login'));

// ==========================================
// 📝 데이터 처리하는 파이프 (POST)
// ==========================================
app.post('/signup', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.send("<script>alert('이미 있는 아이디입니다!'); window.history.back();</script>");
    }
    
    if (nickname) {
        const existingNickname = await User.findOne({ nickname });
        if (existingNickname) {
            return res.send("<script>alert('이미 사용 중인 닉네임입니다!'); window.history.back();</script>");
        }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username: username, password: hashedPassword, nickname: nickname || "" });
    await newUser.save();
    
    res.send("<script>alert('회원가입 성공! 로그인해주세요.'); window.location.href='/login';</script>");
  } catch (error) {
    console.error("가입 에러:", error);
    res.send("<script>alert('가입 실패! 내용을 확인해주세요.'); window.history.back();</script>");
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body; 
    const user = await User.findOne({ username: username });
    
    if (!user) {
      return res.send("<script>alert('없는 아이디입니다!'); window.history.back();</script>");
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.send("<script>alert('비밀번호가 틀렸습니다!'); window.history.back();</script>");
    }
    
    let userRole = 'user'; 
    let displayName = user.nickname || ""; 

    if (user.username === 'kamm7476') { 
        userRole = 'admin'; 
        displayName = '관리자'; 
    }
    
    if (userRole !== 'admin' && (!displayName || displayName.trim() === "")) {
        req.session.tempUser = { id: user.username, role: userRole };
        return res.send("<script>alert('환영합니다! 활동하실 닉네임을 설정해주세요.'); window.location.href='/set-nickname';</script>");
    }

    req.session.user = { id: user.username, name: displayName, role: userRole };
    
    if (userRole === 'admin') {
         res.send("<script>alert('👑 관리자님 환영합니다!'); window.location.href='/';</script>");
    } else {
         res.send("<script>alert('반갑습니다, " + displayName + "님!'); window.location.href='/';</script>");
    }
  } catch (error) {
    console.error("로그인 에러:", error);
    res.send("<script>alert('로그인 처리 중 에러가 났어요.'); window.history.back();</script>");
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => { res.redirect('/'); });
});

// =========================================
// 🌟 메인 화면 (차트 & 최신음악 & 팝업)
// =========================================
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search || ''; 
        const genreQuery = req.query.genre || ''; 
        const sortQuery = req.query.sort || 'views'; 
        const periodQuery = req.query.period || ''; 
        
        let filter = {};
        if (searchQuery) filter.artist = { $regex: searchQuery, $options: 'i' };
        if (genreQuery) filter.genre = genreQuery;

        if (periodQuery) {
            const now = new Date();
            let pastDate = new Date();
            if (periodQuery === 'daily') pastDate.setDate(now.getDate() - 1); 
            else if (periodQuery === 'weekly') pastDate.setDate(now.getDate() - 7); 
            else if (periodQuery === 'monthly') pastDate.setMonth(now.getMonth() - 1); 
            
            filter.createdAt = { $gte: pastDate }; 
        }

        let sortOption = { views: -1 }; 
        if (sortQuery === 'latest') sortOption = { createdAt: -1 }; 

        let artists = await Music.find(filter).sort(sortOption);
        let popularArtists = await Music.aggregate([
            { $group: { _id: "$artist", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const activePopup = await Popup.findOne({ isActive: true }).sort({ updatedAt: -1 });

        if (artists.length === 0 && !searchQuery && !genreQuery && !periodQuery) {
            artists = [{
                _id: "dummy", name: "첫 곡의 주인공이 되어보세요!", artist: "RANKING AI", genre: "안내", aiTool: "시스템",
                lyrics: "아직 등록된 곡이 없습니다.", uploader: "admin", uploaderRealName: "관리자", audioUrl: "", views: 0,
                imageUrl: "https://via.placeholder.com/150/222222/ff5722?text=No+Music"
            }];
            popularArtists = [{ _id: "비비(BIBI)", count: 1 }];
        }
        
        res.render('index', { 
            artists: artists, 
            searchQuery: searchQuery, 
            genreQuery: genreQuery, 
            sortQuery: sortQuery, 
            periodQuery: periodQuery, 
            popularArtists: popularArtists,
            popup: activePopup
        });
    } catch (err) {
        console.log("DB 에러:", err);
        res.send("<h1>진짜 에러 원인: " + err.message + "</h1>")
    }
});

// =========================================
// 🌟 내 음악 보관함 라우터
// =========================================
app.post('/add-to-mymusic', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "로그인이 필요합니다." });
        const musicIds = req.body.musicIds;
        const userId = req.session.user.id;
        for (let id of musicIds) {
            const exists = await MyMusic.findOne({ userId: userId, musicId: id });
            if (!exists && id !== "dummy") await new MyMusic({ userId: userId, musicId: id }).save();
        }
        res.json({ message: "내 음악에 성공적으로 담겼습니다!" });
    } catch (err) { res.status(500).json({ message: "담기에 실패했습니다." }); }
});

app.get('/mymusic', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    const mySaved = await MyMusic.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
    const musicIds = mySaved.map(item => item.musicId);
    const myArtists = await Music.find({ _id: { $in: musicIds } });
    res.render('mymusic', { artists: myArtists });
});

// =========================================
// 🌟 유튜브 / 쇼츠 기능
// =========================================
app.get('/youtube', async (req, res) => {
    const videos = await Video.find({ type: 'youtube' }).sort({ createdAt: -1 });
    res.render('youtube', { videos: videos });
});
app.get('/shorts', async (req, res) => {
    const shorts = await Video.find({ type: 'shorts' }).sort({ createdAt: -1 });
    res.render('shorts', { shorts: shorts });
});
app.post('/add-youtube', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    const videoIdMatch = req.body.youtubeLink.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^"&?\/\s]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : 'https://via.placeholder.com/320x180/222/ff5722?text=No+Thumb';
    await new Video({ title: req.body.title, url: req.body.youtubeLink, thumbnail: thumbnail, type: 'youtube', uploader: req.session.user.id }).save();
    res.redirect('/youtube');
});
app.post('/add-shorts', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    const videoIdMatch = req.body.youtubeLink.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([^"&?\/\s]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : 'https://via.placeholder.com/320x568/222/ff5722?text=No+Thumb';
    await new Video({ title: req.body.title, url: req.body.youtubeLink, thumbnail: thumbnail, type: 'shorts', uploader: req.session.user.id }).save();
    res.redirect('/shorts');
});

app.post('/delete-video/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/youtube');
    try {
        const video = await Video.findById(req.params.id);
        if (video && (req.session.user.role === 'admin' || req.session.user.id === video.uploader)) {
            await Video.findByIdAndDelete(req.params.id);
        }
        res.redirect('/youtube');
    } catch (err) { res.redirect('/youtube'); }
});

// =========================================
// 🌟 커뮤니티 게시판 
// =========================================
app.get('/board', async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        const currentUser = req.session ? req.session.user : null;
        res.render('board', { user: currentUser, posts: posts });
    } catch (err) {
        console.log("게시판 로딩 에러:", err);
        res.status(500).send("게시판 에러");
    }
});

app.post('/add-post', async (req, res) => {
    if (!req.session || !req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    try {
        await new Post({ title: req.body.title, content: req.body.content, author: req.session.user.name }).save();
        res.redirect('/board');
    } catch (err) { console.log(err); }
});

app.post('/delete-post/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/board');
    try {
        const post = await Post.findById(req.params.id);
        if (req.session.user.role === 'admin' || req.session.user.name === post.author) await Post.findByIdAndDelete(req.params.id);
        res.redirect('/board');
    } catch (err) { console.log(err); }
});

app.get('/edit-post/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.send("<script>alert('존재하지 않는 게시글입니다.'); location.href='/board';</script>");
        
        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.name === post.author;
        
        if (isAdmin || isOwner) {
            res.render('edit-post', { user: req.session.user, post: post });
        } else {
            res.send("<script>alert('수정 권한이 없습니다.'); location.href='/board';</script>");
        }
    } catch (err) { 
        console.log("게시글 수정 화면 에러:", err);
        res.redirect('/board'); 
    }
});

app.post('/edit-post/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    try {
        const post = await Post.findById(req.params.id);
        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.name === post.author;
        
        if (isAdmin || isOwner) {
            await Post.findByIdAndUpdate(req.params.id, { 
                title: req.body.title, 
                content: req.body.content 
            });
            res.redirect('/board');
        } else {
            res.send("<script>alert('권한이 없습니다.'); location.href='/board';</script>");
        }
    } catch (err) { 
        console.log("게시글 수정 DB 저장 에러:", err);
        res.redirect('/board'); 
    }
});

app.post('/add-board-comment/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    try {
        const post = await Post.findById(req.params.id);
        if (post) {
            post.comments.push({ author: req.session.user.name, text: req.body.commentText });
            await post.save();
        }
        res.redirect('/board'); 
    } catch (err) {
        console.log("댓글 등록 에러:", err);
        res.redirect('/board'); 
    }
});

// =========================================
// 🌟 기타 기능 (관리자 페이지 등)
// =========================================
app.get('/admin', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.redirect('/');
        }

        const allUsers = await User.find().lean();
        const allMusic = await Music.find().lean();

        const usersWithStats = allUsers.map(u => {
            const myMusicCount = allMusic.filter(m => m.uploader === u.id).length;
            return { ...u, musicCount: myMusicCount };
        });

        const stats = {
            totalUsers: allUsers.length,
            totalMusic: allMusic.length,
            totalViews: allMusic.reduce((sum, m) => sum + (m.views || 0), 0),
            todayVisitor: Math.floor(Math.random() * 50) + 10 
        };

        res.render('admin', { user: req.session.user, stats: stats, users: usersWithStats });
    } catch (err) {
        console.error("관리자 데이터 수집 에러:", err);
        res.status(500).send("<h1>관리자 페이지 데이터를 불러오는데 실패했습니다. ㅠㅠ</h1>");
    }
});

app.post('/add-music', (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.send("<script>alert('회원만 음원을 업로드할 수 있습니다! 로그인해주세요.'); location.href='/login';</script>");
    }

    const uploadMiddleware = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]);
    uploadMiddleware(req, res, (err) => {
        if (err) return res.send(`<h1>파일 업로드 실패 이유: ${err.message || 'Cloudinary 문제'}</h1>`);
        next();
    });
}, async (req, res) => {
    try {
        const { name, artist, genre, aiTool, lyrics, realName } = req.body;
        const uploader = req.session.user.id; 
        const imageUrl = req.files && req.files['image'] ? req.files['image'][0].path : 'https://via.placeholder.com/150';
        const audioUrl = req.files && req.files['audio'] ? req.files['audio'][0].path : '';
        
        const newMusic = new Music({ name, artist, genre, aiTool, lyrics, uploaderRealName: realName, uploader, imageUrl, audioUrl });
        await newMusic.save();
        res.redirect('/');
    } catch (err) { res.status(500).send("<h1>DB 저장 실패 이유: " + err.message + "</h1>"); }
});

app.post('/delete-music/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    try {
        const music = await Music.findById(req.params.id);
        if (music.uploader === req.session.user.id || req.session.user.role === 'admin') {
            await Music.findByIdAndDelete(req.params.id);
            await MyMusic.deleteMany({ musicId: req.params.id }); 
            res.redirect('/');
        } else {
            res.send("<script>alert('삭제 권한이 없습니다.'); location.href='/';</script>");
        }
    } catch (err) {
        res.status(500).send("음원 삭제 중 에러가 발생했습니다.");
    }
});

app.get('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    try {
        const music = await Music.findById(req.params.id);
        if (!music) return res.send("<script>alert('존재하지 않는 곡입니다.'); location.href='/';</script>");
        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.id === music.uploader;
        if (isAdmin || isOwner) {
            res.render('edit', { music: music });
        } else {
            res.send("<script>alert('수정 권한이 없습니다.'); location.href='/';</script>");
        }
    } catch (err) { res.redirect('/'); }
});

app.post('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).send("로그인 필요");
    try {
        const music = await Music.findById(req.params.id);
        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.id === music.uploader;
        if (isAdmin || isOwner) {
            const { name, artist, genre, aiTool, lyrics } = req.body;
            await Music.findByIdAndUpdate(req.params.id, { name, artist, genre, aiTool, lyrics });
            res.redirect('/');
        } else {
            res.send("<script>alert('권한이 없습니다.'); location.href='/';</script>");
        }
    } catch (err) { res.redirect('/'); }
});

app.post('/like/:id', async (req, res) => {
    if (!req.session.user) return res.json({ success: false, message: "로그인이 필요합니다." });
    try {
        const musicId = req.params.id;
        const username = req.session.user.id;
        const isAdmin = req.session.user.role === 'admin';
        const music = await Music.findById(musicId);
        if (!music) return res.json({ success: false, message: "노래를 찾을 수 없습니다." });

        if (isAdmin) {
            music.views += 1; 
            await music.save();
            return res.json({ success: true, message: "👑 관리자 무제한 좋아요 완료!" });
        } else {
            if (!music.likedBy) music.likedBy = [];
            if (music.likedBy.includes(username)) {
                return res.json({ success: false, message: "이미 좋아요를 누르셨습니다! (1인 1회 제한)" });
            } else {
                music.views += 1; 
                music.likedBy.push(username);
                await music.save();
                return res.json({ success: true });
            }
        }
    } catch (err) { res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." }); }
});

app.get('/admin/users', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.send("<script>alert('관리자만 접근 가능합니다!'); location.href='/';</script>");
        }
        const users = await User.find().sort({ createdAt: -1 }); 
        res.render('admin_users', { users: users });
    } catch (err) { res.status(500).send("유저 목록 에러"); }
});

app.post('/admin/popup', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('관리자만 설정할 수 있습니다!'); window.history.back();</script>");
    }
    try {
        const { title, content, isActive } = req.body;
        await Popup.deleteMany({}); 
        const newPopup = new Popup({ title, content, isActive: isActive === 'on' });
        await newPopup.save();
        res.send("<script>alert('팝업 설정이 완료되었습니다!'); window.location.href='/';</script>");
    } catch (err) { res.send("<script>alert('팝업 설정 에러!'); window.history.back();</script>"); }
});

app.post('/delete-music-comment/:musicId/:commentId', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    try {
        const music = await Music.findById(req.params.musicId);
        if (!music) return res.redirect('/'); 

        const comment = music.comments.id(req.params.commentId);
        if (comment && (req.session.user.role === 'admin' || req.session.user.name === comment.author)) {
            music.comments.pull(req.params.commentId); 
            await music.save();
        }
        res.redirect('/'); 
    } catch (err) { res.redirect('/'); }
});

app.post('/like-board-comment/:postId/:commentId', async (req, res) => {
    if (!req.session.user) return res.json({ success: false, message: "로그인 필요" });
    try {
        const post = await Post.findById(req.params.postId);
        const comment = post.comments.id(req.params.commentId);
        const username = req.session.user.id;
        const isAdmin = req.session.user.role === 'admin';

        if (isAdmin) {
            comment.likes = (comment.likes || 0) + 1; 
            await post.save();
            return res.json({ success: true, message: "👑 관리자 권한!" });
        } else {
            if (!comment.likedBy) comment.likedBy = [];
            if (comment.likedBy.includes(username)) {
                return res.json({ success: false, message: "이미 좋아요를 누르셨습니다!" });
            } else {
                comment.likes = (comment.likes || 0) + 1;
                comment.likedBy.push(username);
                await post.save();
                return res.json({ success: true });
            }
        }
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/add-comment/:id', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    }
    try {
        const music = await Music.findById(req.params.id);
        if (music) {
            music.comments.push({ 
                author: req.session.user.name, 
                text: req.body.commentText 
            });
            await music.save(); 
        }
        res.redirect('/'); 
    } catch (err) {
        console.error("음원 댓글 등록 에러:", err);
        res.redirect('/');
    }
});

app.post('/play-count/:id', async (req, res) => {
    try {
        const musicId = req.params.id;
        await Music.findByIdAndUpdate(musicId, { $inc: { views: 1 } });
        res.json({ success: true });
    } catch (err) {
        console.error("재생수 업데이트 에러:", err);
        res.status(500).json({ success: false });
    }
});

app.post('/admin/delete-user/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    try {
        const userId = req.params.id;
        await User.findOneAndDelete({ id: userId }); 
        await Music.deleteMany({ uploader: userId }); 
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send("강제 탈퇴 중 에러가 발생했습니다.");
    }
});

app.get('/contact', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    }
    let dms = [];
    if (req.session.user.role === 'admin') {
        dms = await DM.find().sort({ createdAt: -1 });
    } else {
        dms = await DM.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
    }
    res.render('contact', { user: req.session.user, dms: dms });
});

app.post('/contact/send', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/login');
    await new DM({ userId: req.session.user.id, message: req.body.message }).save();
    res.redirect('/contact');
});

app.post('/contact/reply/:id', async (req, res) => {
    if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/');
    }
    await DM.findByIdAndUpdate(req.params.id, { reply: req.body.reply });
    res.redirect('/contact');
});

app.post('/contact/delete/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/login');
    try {
        const dm = await DM.findById(req.params.id);
        if (dm && (req.session.user.role === 'admin' || req.session.user.id === dm.userId)) {
            await DM.findByIdAndDelete(req.params.id);
        }
        res.redirect('/contact');
    } catch (err) {
        console.log("DM 삭제 에러:", err);
        res.redirect('/contact');
    }
});
// 🌟 오늘 날짜 구하는 마법의 함수
const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // 'YYYY-MM-DD' 형식
};

// 🌟 메인 화면 방문할 때마다 방문자 수 1씩 올리기 (미들웨어)
app.use(async (req, res, next) => {
    if (req.path === '/') { // 메인 페이지('/') 접속 시에만 카운트!
        try {
            const today = getTodayDate();
            let stats = await Stats.findOne({ date: today });
            
            if (!stats) {
                // 오늘 첫 방문자라면, 어제까지의 총 데이터를 가져와서 새로 만듦
                const lastStat = await Stats.findOne().sort({ _id: -1 });
                stats = new Stats({
                    date: today,
                    totalVisitors: lastStat ? lastStat.totalVisitors : 0,
                    totalPlays: lastStat ? lastStat.totalPlays : 0
                });
            }
            stats.dailyVisitors += 1;
            stats.totalVisitors += 1;
            await stats.save();
        } catch (err) {
            console.error("방문자 통계 에러:", err);
        }
    }
    next();
});

// 🌟 대망의 관리자(Admin) 페이지 띄우기!
app.get('/admin', async (req, res) => {
    try {
        // 1. 전체 유저 목록 최신 가입순으로 가져오기
        const users = await User.find().sort({ createdAt: -1 });
        
        // 2. 오늘 통계 가져오기
        const today = getTodayDate();
        const stats = await Stats.findOne({ date: today }) || { dailyVisitors: 0, totalVisitors: 0, dailyPlays: 0, totalPlays: 0 };
        
        // 3. admin.ejs 화면에 데이터 던져주기!
        res.render('admin', { users: users, stats: stats });
    } catch (err) {
        console.error(err);
        res.status(500).send("관리자 페이지 로드 중 에러가 발생했습니다.");
    }
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 실행 중: ${PORT}`));
