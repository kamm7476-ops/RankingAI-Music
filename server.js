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
const User = require('./user'); 
const Stats = require('./models/Stats'); // 🌟 통계 DB
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
        fileSize: 10 * 1024 * 1024 // 🌟 파일 최대 10MB로 제한!
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
// 📈 방문자 수 카운터 마법 (무조건 라우터들보다 위에 있어야 함!)
// =========================================
const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // 'YYYY-MM-DD' 형식
};

app.use(async (req, res, next) => {
    if (req.path === '/') { // 메인 페이지('/') 접속 시에만 카운트!
        try {
            const today = getTodayDate();
            let stats = await Stats.findOne({ date: today });
            
            if (!stats) {
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
// 🌟 닉네임(아티스트명) 강제 설정 파이프 🌟
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
// ✉️ 🌟 이메일 인증 발송 및 확인 파이프 🌟
// ==========================================
const verificationCodes = new Map(); 

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
    }
});

app.post('/send-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: "이메일이 없습니다." });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
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

app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    const storedData = verificationCodes.get(email);

    if (!storedData) return res.json({ success: false, message: "인증 요청 내역이 없습니다." });
    if (Date.now() > storedData.expires) {
        verificationCodes.delete(email);
        return res.json({ success: false, message: "인증 시간이 만료되었습니다. 다시 요청해주세요." });
    }
    if (storedData.code !== code.trim()) {
        return res.json({ success: false, message: "인증번호가 틀립니다." });
    }

    verificationCodes.delete(email);
    res.json({ success: true });
});

// ==========================================
// 🚪 회원가입 / 로그인 / 로그아웃 기능
// ==========================================
app.get('/signup', (req, res) => res.render('signup'));
app.get('/login', (req, res) => res.render('login'));

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
// 🌟 내 음악 보관함 (MyMusic)
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

// =========================================
// 🌟 음악 추가, 수정, 삭제, 좋아요, 재생수 (Music CRUD)
// =========================================
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

// 🌟 재생 버튼 누를 때마다 메인 재생수 + 통계 DB 재생수 둘 다 올리기!
app.post('/play-count/:id', async (req, res) => {
    try {
        const musicId = req.params.id;
        await Music.findByIdAndUpdate(musicId, { $inc: { views: 1 } });
        
        // Stats 재생수도 같이 올려줍니다!
        const today = getTodayDate();
        await Stats.findOneAndUpdate({ date: today }, { $inc: { dailyPlays: 1, totalPlays: 1 } });
        
        res.json({ success: true });
    } catch (err) {
        console.error("재생수 업데이트 에러:", err);
        res.status(500).json({ success: false });
    }
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

// =========================================
// 🌟 1:1 관리자 문의 (DM / Contact)
// =========================================
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

// =========================================
// 👑 관리자 전용 통제실 (Admin) 👑
// =========================================
app.get('/admin', async (req, res) => {
    // 🚨 1. 관리자가 아니면 무조건 쫓아냅니다 (보안 통과문)
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('경고: 대표님만 들어갈 수 있는 통제실입니다!'); location.href='/';</script>");
    }
    
    try {
        // 2. 가입한 유저 전부 불러오기 (최신 가입순)
        const users = await User.find().sort({ createdAt: -1 }).lean();
        
        // 3. 오늘 기록된 방문자/재생수 통계표 가져오기
        const today = getTodayDate();
        const stats = await Stats.findOne({ date: today }) || { dailyVisitors: 0, totalVisitors: 0, dailyPlays: 0, totalPlays: 0 };
        
        // 4. 관리자 화면(admin.ejs)으로 데이터 쏴주기
        res.render('admin', { users: users, stats: stats, user: req.session.user });
    } catch (err) {
        console.error("관리자 페이지 로딩 에러:", err);
        res.status(500).send("관리자 페이지를 불러오는 중 에러가 났습니다.");
    }
});

app.post('/admin/delete-user', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    try {
        const userId = req.body.userId;
        await User.findByIdAndDelete(userId); // 악성 유저 DB 삭제
        await Music.deleteMany({ uploader: userId }); // 유저가 올린 곡들도 같이 삭제!
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send("회원 삭제에 실패했습니다.");
    }
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
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    try {
        await Popup.deleteMany({}); 
        await new Popup({ title: req.body.title, content: req.body.content, isActive: req.body.isActive === 'on' }).save();
        res.send("<script>alert('팝업 설정 완료!'); window.location.href='/';</script>");
    } catch (err) { res.redirect('/'); }
});
// 🚨 악성 유저 강제 탈퇴 완벽 처리!
app.post('/admin/delete-user', async (req, res) => {
    // 관리자가 아니면 돌려보내기
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    
    try {
        const userId = req.body.userId; // 통제실 버튼에서 넘어온 유저 고유 ID
        const userToDelete = await User.findById(userId);
        
        if (userToDelete) {
            // 1. 이 악성 유저가 올린 음악들을 차트에서 싹 다 날려버립니다!
            await Music.deleteMany({ uploader: userToDelete.username });
            
            // 2. 유저 계정 자체를 DB에서 영구 삭제!
            await User.findByIdAndDelete(userId);
        }
        
        // 삭제 성공하면 다시 통제실 화면으로 부드럽게 돌아가기
        res.redirect('/admin');
    } catch (err) {
        console.error("강제 탈퇴 에러:", err);
        res.status(500).send("회원 삭제 중 오류가 발생했습니다.");
    }
});

// 🌟 (보너스) 에러창 방지용 안전장치!
// 혹시라도 뒤로가기나 새로고침을 눌러서 'Cannot GET' 화면이 뜨려고 하면, 
// 에러 안 띄우고 다시 통제실로 튕겨 보내주는 마법입니다!
app.get('/admin/delete-user', (req, res) => {
    res.redirect('/admin');
});
// 🚀 최종 서버 실행 코드
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 실행 중: ${PORT}`));
