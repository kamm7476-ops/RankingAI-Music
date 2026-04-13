require('dotenv').config(); // 🌟 .env 파일 읽어오는 핵심 마법!
const geoip = require('geoip-lite');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const cookieParser = require('cookie-parser'); // 🌟 1. 이거 한 줄 추가!
const nodemailer = require('nodemailer'); // 🌟 이메일 우체부 소환!

const passport = require('passport');
const NaverStrategy = require('passport-naver').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// =========================================
// 🌟 [추가됨!] 실시간 웹소켓(전화선) 부품
// =========================================
const http = require('http'); 
const { Server } = require("socket.io"); 

// 🌟 클라우디너리 영구 금고 세팅 (🚨 const 누락 에러 해결 완료!)
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
app.set('trust proxy', true);

// =========================================
// 🌟 [핵심 개조!] 일반 서버를 웹소켓 통신 서버로 감싸기
// =========================================
const server = http.createServer(app); 
const io = new Server(server);         

let currentPopup = { isActive: false, title: '', content: '' };

app.use(cookieParser());// 🌟 2. 이거 한 줄 추가! (express() 아래쪽에 넣어주세요)

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
    likes: { type: Number, default: 0 },
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
// 🌟 7. 실시간 1:1 채팅방 & 메시지 DB 주머니
// =========================================

// (1) 대화방 자체를 저장
const chatRoomSchema = new mongoose.Schema({
    participants: [String], // 참여자 두 명의 아이디
    lastMessage: String,    // 마지막 대화 내용
    updatedAt: { type: Date, default: Date.now }
});
const ChatRoom = mongoose.models.ChatRoom || mongoose.model('ChatRoom', chatRoomSchema);

// (2) 그 안에서 오가는 대화 내용을 저장
const chatMessageSchema = new mongoose.Schema({
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom' }, // 어느 방의 대화인가?
    senderId: String,       // 보낸 사람 아이디
    senderName: String,     // 보낸 사람 닉네임
    text: String,           // 대화 내용
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);

// =========================================
// 🚨 [복구!!] 8. 관리자 쪽지 알림 DB 주머니 
// =========================================
const messageSchema = new mongoose.Schema({
    userId: String,
    text: String,
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// =========================================
// 🌍 1단계: 국가 통계 DB 주머니 
// =========================================
const VisitLogSchema = new mongoose.Schema({
    date: { type: String, required: true },
    country: { type: String, default: 'Unknown' },
    userId: { type: String, default: 'Guest' },
    playTime: { type: Number, default: 0 },
    totalPlayTime: { type: Number, default: 0 }, // 👈 추가된 새 감상시간
    dwellTime: { type: Number, default: 0 },     // 👈 추가된 체류시간
    createdAt: { type: Date, default: Date.now }
});
const VisitLog = mongoose.models.VisitLog || mongoose.model('VisitLog', VisitLogSchema);

// =========================================
// 🌟 서버 기본 설정
// =========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // 모든 외부 사이트의 택배 허용!
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.use(session({
  secret: 'ranking_secret_key_1234', 
  resave: false,
  saveUninitialized: false
}));

// 🌟 로그인 유저 정보 & 안 읽은 쪽지 확인 마법
app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    if (req.session.user) {
        try {
            res.locals.unreadMessages = await Message.find({ userId: req.session.user.id, isRead: false });
        } catch(e) { res.locals.unreadMessages = []; }
    } else {
        res.locals.unreadMessages = [];
    }
    next();
});

// =========================================
// 📈 방문자 수 카운터 마법 (무조건 라우터들보다 위에 있어야 함!)
// =========================================
const getTodayDate = () => {
    const today = new Date();
    // 🌟 한국 시간대 기준으로 날짜 뽑기 (서버 시간 오류 방지)
    return today.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\. /g, '-').replace('.', '');
};

app.use(async (req, res, next) => {
    if (req.path === '/') { // 메인 페이지('/') 접속 시에만 카운트!
        try {
            const today = getTodayDate();
            const cookieName = 'visited_' + today;

            // 🌟 오늘 처음 온 사람이라면 (쿠키가 없다면 카운트!)
            if (!req.cookies[cookieName]) {
                res.cookie(cookieName, 'true', { maxAge: 24 * 60 * 60 * 1000 });

                let stats = await Stats.findOne({ date: today });
                
                if (!stats) {
                    const lastStat = await Stats.findOne().sort({ _id: -1 });
                    stats = new Stats({
                        date: today,
                        totalVisitors: lastStat ? lastStat.totalVisitors : 0,
                        totalPlays: lastStat ? lastStat.totalPlays : 0
                    });
                }
                
                // 🌟 기본 방문수 올리기
                stats.dailyVisitors += 1;
                stats.totalVisitors += 1;
                
                // 🌟 [핵심] 회원/비회원 구분해서 카운트 올리기
                if (req.session && req.session.user) {
                    stats.memberVisitors = (stats.memberVisitors || 0) + 1;
                } else {
                    stats.guestVisitors = (stats.guestVisitors || 0) + 1;
                }
                
                await stats.save();
            }
        } catch (err) {
            console.error("방문자 통계 에러:", err);
        }
    }
    next();
});

// ======================================================
// 🌟 유저 로그인 횟수 카운터 마법 함수 🌟
// ======================================================
async function trackUserLogin(username) {
    try {
        const user = await User.findOne({ username: username });
        if (!user) return;
        
        const todayStr = getTodayDate();
        
        if (user.lastLoginDate !== todayStr) {
            user.todayLogins = 1;
            user.lastLoginDate = todayStr;
        } else {
            user.todayLogins = (user.todayLogins || 0) + 1;
        }
        
        user.totalLogins = (user.totalLogins || 0) + 1;
        await user.save();
    } catch(err) { console.error("로그인 카운트 에러:", err); }
}

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
    async (req, res) => {
        if (!req.user.name || req.user.name.trim() === "") {
            req.session.tempUser = req.user; 
            res.send("<script>alert('환영합니다! 사이트에서 활동할 닉네임을 설정해주세요.'); window.location.href='/set-nickname';</script>");
        } else {
            req.session.user = req.user; 
            await trackUserLogin(req.user.id);
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
    async (req, res) => {
        if (!req.user.name || req.user.name.trim() === "") {
            req.session.tempUser = req.user; 
            res.send("<script>alert('환영합니다! 사이트에서 활동할 닉네임을 설정해주세요.'); window.location.href='/set-nickname';</script>");
        } else {
            req.session.user = req.user; 
            await trackUserLogin(req.user.id);
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
        
        await trackUserLogin(req.session.tempUser.id);
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
app.get('/terms', (req, res) => res.render('terms'));

app.post('/signup', async (req, res) => {
  try {
    const username = req.body.username.trim();
    const password = req.body.password;
    const nickname = req.body.nickname ? req.body.nickname.trim() : "";
    
    const existingUser = await User.findOne({ 
        username: { $regex: new RegExp('^' + username + '$', 'i') } 
    });
    
    if (existingUser) {
      return res.send("<script>alert('이미 사용 중인 아이디입니다! (대/소문자 구분 안 함)'); window.history.back();</script>");
    }
    
    if (nickname) {
        const existingNickname = await User.findOne({ 
            nickname: { $regex: new RegExp('^' + nickname + '$', 'i') } 
        });
        if (existingNickname) {
            return res.send("<script>alert('이미 사용 중인 닉네임입니다!'); window.history.back();</script>");
        }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({ 
        username: username.toLowerCase(), 
        password: hashedPassword, 
        nickname: nickname 
    });
    await newUser.save();
    
    res.send("<script>alert('회원가입 성공! 로그인해주세요.'); window.location.href='/login';</script>");
  } catch (error) {
    console.error("가입 에러:", error);
    res.send("<script>alert('가입 실패! 내용을 확인해주세요.'); window.history.back();</script>");
  }
});

app.post('/login', async (req, res) => {
  try {
    const username = req.body.username.trim(); 
    const password = req.body.password; 
    
    const user = await User.findOne({ 
        username: { $regex: new RegExp('^' + username + '$', 'i') } 
    });
    
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
    
    await trackUserLogin(user.username);
    
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
// 🌟 메인 화면 (차트 & 최신음악 & 팝업 데이터 통합)
// =========================================
app.get('/', async (req, res) => {
   let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress; 
   if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
   const geo = geoip.lookup(ip);
   const country = geo ? geo.country : 'Unknown';
   const today = getTodayDate();

   new VisitLog({
       date: today,
       country: country,
       userId: req.session.user ? req.session.user.id : 'Guest'
   }).save().catch(err => console.error("로그 저장 실패:", err));

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
       res.send("<h1>진짜 에러 원인: " + err.message + "</h1>");
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
// 🌟 라디오 전용 라우터
// =========================================
app.get('/radio', (req, res) => {
    res.render('radio');
});
app.get('/api/radio-tracks', async (req, res) => {
    try {
        const mood = req.query.mood || 'all';
        let filter = {};

        if (mood === 'cafe') filter = { genre: { $in: ['클래식/재즈', '인디음악', 'R&B/Soul', 'POP'] } };
        else if (mood === 'study') filter = { genre: { $in: ['뉴에이지', '클래식/재즈', '인디음악'] } };
        else if (mood === 'healing') filter = { genre: { $in: ['발라드', '뉴에이지', 'R&B/Soul'] } };
        else if (mood === 'fitness') filter = { genre: { $in: ['댄스', '랩/힙합', '일렉트로니카', '록/메탈'] } };

        let tracks = await Music.aggregate([
            { $match: filter },
            { $sample: { size: 20 } }
        ]);

        if (tracks.length === 0) {
            tracks = await Music.aggregate([{ $sample: { size: 20 } }]);
        }

        res.json(tracks);
    } catch (err) {
        console.error("라디오 트랙 에러:", err);
        res.json([]);
    }
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
            music.likes = (music.likes || 0) + 1; 
            await music.save();
            return res.json({ success: true, message: "👑 관리자 무제한 좋아요 완료!" });
        } else {
            if (!music.likedBy) music.likedBy = [];
            if (music.likedBy.includes(username)) {
                return res.json({ success: false, message: "이미 좋아요를 누르셨습니다! (1인 1회 제한)" });
            } else {
                music.likes = (music.likes || 0) + 1; 
                music.likedBy.push(username);
                await music.save();
                return res.json({ success: true });
            }
        }
    } catch (err) { res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." }); }
});

app.post('/play-count/:id', async (req, res) => {
    try {
        const musicId = req.params.id;
        await Music.findByIdAndUpdate(musicId, { $inc: { views: 1 } });
        
        const today = getTodayDate();
        const isMember = (req.session && req.session.user) ? true : false;
        
        const incData = { dailyPlays: 1, totalPlays: 1 };
        
        if (isMember) {
            incData.memberPlays = 1;
        } else {
            incData.guestPlays = 1;
        }
        
        await Stats.findOneAndUpdate(
            { date: today }, 
            { $inc: incData },
            { upsert: true }
        );
        
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

// ==========================================================
// 🚀 [관리자 전용] 실시간 접속자 & 플레이 레이더망 (체류시간/감상시간 저장)
// ==========================================================
global.liveUsers = new Map(); 

app.post('/api/heartbeat', async (req, res) => {
    let userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    if (userIp && userIp.includes(',')) userIp = userIp.split(',')[0].trim();
    
    const isPlaying = req.body.isPlaying; 
    global.liveUsers.set(userIp, { time: Date.now(), isPlaying: isPlaying });

    const today = getTodayDate();
    const userId = req.session && req.session.user ? req.session.user.id : 'Guest';

    try {
        // 무조건 체류시간 10초 증가
        let incData = { dwellTime: 10 }; 

        // 만약 음악이 재생 중이라면 감상 시간도 10초 증가
        if (isPlaying) {
            incData.totalPlayTime = 10; 
        }

        await VisitLog.findOneAndUpdate(
            { date: today, userId: userId },
            { $inc: incData },
            { upsert: true }
        );
    } catch(e) { console.log("시간 누적 에러:", e); }
    
    res.json({ success: true });
});

setInterval(() => {
    const now = Date.now();
    for (let [ip, data] of global.liveUsers.entries()) {
        if (now - data.time > 15000) {
            global.liveUsers.delete(ip);
        }
    }
}, 5000);

app.get('/api/admin/live-stats', (req, res) => {
    let playingCount = 0;
    for (let [ip, data] of global.liveUsers.entries()) {
        if (data.isPlaying) playingCount++;
    }
    res.json({
        liveUsers: global.liveUsers.size,
        playingUsers: playingCount
    });
});

// =========================================
// 👑 관리자 전용 통제실 (Admin) 👑
// =========================================
app.get('/admin', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('경고: 대표님만 들어갈 수 있는 통제실입니다!'); location.href='/';</script>");
    }
    
    try {
        const users = await User.find().sort({ createdAt: -1 }).lean();
        const allMusic = await Music.find().sort({ createdAt: -1 }).lean();
        
        const usersWithMusic = users.map(user => {
            const userMusic = allMusic.filter(m => m.uploader === user.username);
            return { 
                ...user, 
                musicCount: userMusic.length, 
                uploadedMusic: userMusic 
            };
        });
        
        const today = getTodayDate();
        let stats = await Stats.findOne({ date: today });
        
        if (!stats) {
            const lastStats = await Stats.findOne().sort({ _id: -1 }); 
            stats = { 
                dailyVisitors: 0, 
                dailyPlays: 0, 
                totalVisitors: lastStats ? (lastStats.totalVisitors || 0) : 0, 
                totalPlays: lastStats ? (lastStats.totalPlays || 0) : 0 
            };
        }
        
        const countryStats = await VisitLog.aggregate([
            { $match: { date: today } },
            { $group: { _id: "$country", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // ⏳ [최종 해결] 체류시간(dwellTime)까지 싹 다 합쳐서 계산합니다!
        const playTimeStats = await VisitLog.aggregate([
            { $match: { date: today } },
            { 
                $group: { 
                    _id: null, 
                    totalSeconds: { 
                        $sum: { 
                            $add: [
                                { $ifNull: ["$dwellTime", 0] },     
                                { $ifNull: ["$totalPlayTime", 0] }, 
                                { $ifNull: ["$playTime", 0] }       
                            ] 
                        } 
                    } 
                } 
            }
        ]);

        const totalSeconds = playTimeStats.length > 0 ? playTimeStats[0].totalSeconds : 0;
        
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        let todayPlayTime = ""; 
        if (hours > 0) todayPlayTime += `${hours}시간 `;
        if (minutes > 0 || hours > 0) todayPlayTime += `${minutes}분 `;
        todayPlayTime += `${seconds}초`; 

        const past7Stats = await Stats.find().sort({ _id: -1 }).limit(7);
        past7Stats.reverse(); 

        const chartDates = past7Stats.map(s => s.date.substring(5)); 
        const chartVisitors = past7Stats.map(s => s.dailyVisitors || 0);
        const chartPlays = past7Stats.map(s => s.dailyPlays || 0);
        
        res.render('admin', { 
            users: usersWithMusic, 
            stats: stats, 
            countryStats: countryStats, 
            todayPlayTime: todayPlayTime,
            chartDates: chartDates,       
            chartVisitors: chartVisitors, 
            chartPlays: chartPlays,       
            user: req.session.user 
        });
    } catch (err) {
        console.error("관리자 페이지 로딩 에러:", err);
        res.status(500).send("관리자 페이지를 불러오는 중 에러가 났습니다.");
    }
});

// =========================================
// 🚨 관리자 기능 라우터들
// =========================================
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

app.post('/admin/delete-user', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    
    try {
        const userId = req.body.userId; 
        const userToDelete = await User.findById(userId);
        
        if (userToDelete) {
            await Music.deleteMany({ uploader: userToDelete.username }); 
            await User.findByIdAndDelete(userId); 
        }
        res.redirect('/admin');
    } catch (err) {
        console.error("강제 탈퇴 에러:", err);
        res.status(500).send("회원 삭제 중 오류가 발생했습니다.");
    }
});

app.get('/admin/delete-user', (req, res) => {
    res.redirect('/admin');
});

app.get('/admin/recover-stats', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('관리자만 접근 가능합니다!'); location.href='/';</script>");
    }
    
    try {
        const allMusic = await Music.find();
        const realTotalPlays = allMusic.reduce((sum, music) => sum + (music.views || 0), 0);

        const allStats = await Stats.find();
        const realTotalVisitors = allStats.reduce((sum, stat) => sum + (stat.dailyVisitors || 0), 0);

        const today = getTodayDate();
        await Stats.findOneAndUpdate(
            { date: today },
            { $set: { totalPlays: realTotalPlays, totalVisitors: realTotalVisitors } },
            { upsert: true }
        );

        res.send("<script>alert('🎉 완벽하게 복구되었습니다! 관리자 화면으로 이동합니다.'); location.href='/admin';</script>");
    } catch (err) {
        console.error("복구 중 에러:", err);
        res.status(500).send("복구 중 에러가 발생했습니다.");
    }
});

app.post('/admin/delete-music-only/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    try {
        await Music.findByIdAndDelete(req.params.id);
        await MyMusic.deleteMany({ musicId: req.params.id }); 
        res.redirect('/admin'); 
    } catch (err) { res.status(500).send("음원 삭제 에러가 발생했습니다."); }
});

app.post('/admin/send-message', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    try {
        await new Message({ userId: req.body.userId, text: req.body.text }).save();
        res.send("<script>alert('해당 유저에게 쪽지를 성공적으로 발송했습니다!'); history.back();</script>");
    } catch (err) { res.status(500).send("에러가 발생했습니다."); }
});

app.post('/read-message/:id', async (req, res) => {
    try {
        await Message.findByIdAndUpdate(req.params.id, { isRead: true });
        res.redirect('back');
    } catch (err) { res.redirect('back'); }
});

// =========================================
// 💌 1:1 채팅방 기능 
// =========================================
app.post('/send-user-message', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    
    const partnerId = req.body.receiverId; 
    const myId = req.session.user.id;      

    if (myId === partnerId) return res.send("<script>alert('나 자신과는 대화할 수 없습니다!'); history.back();</script>");

    try {
        let room = await ChatRoom.findOne({
            participants: { $all: [myId, partnerId] }
        });

        if (!room) {
            room = await new ChatRoom({
                participants: [myId, partnerId],
                lastMessage: req.body.text 
            }).save();
        }

        res.redirect(`/chat/${room._id}`);
    } catch (err) {
        console.error("채팅방 생성 에러:", err);
        res.status(500).send("<script>alert('에러가 발생했습니다.'); history.back();</script>");
    }
});

app.get('/chatlist', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const rooms = await ChatRoom.find({ participants: req.session.user.id })
                                    .sort({ updatedAt: -1 });

        const chatList = rooms.map(room => {
            const partnerId = room.participants.find(id => id !== req.session.user.id);
            return {
                _id: room._id,
                partnerId: partnerId || "알 수 없음",
                lastMessage: room.lastMessage || "대화 내용 없음",
                updatedAt: room.updatedAt
            };
        });

        res.render('chatlist', { user: req.session.user, chatList: chatList });
    } catch (err) {
        console.error("채팅 목록 에러:", err);
        res.status(500).send("<script>alert('채팅 목록을 불러올 수 없습니다.'); history.back();</script>");
    }
});

app.get('/chat/:roomId', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const room = await ChatRoom.findById(req.params.roomId);
        if (!room) return res.status(404).send("<script>alert('방을 찾을 수 없습니다.'); history.back();</script>");
        
        const messages = await ChatMessage.find({ roomId: req.params.roomId }).sort({ createdAt: 1 });

        res.render('chat', { user: req.session.user, room: room, messages: messages });
    } catch (err) {
        res.status(500).send("<script>alert('에러가 발생했습니다.'); history.back();</script>");
    }
});

// =========================================
// 🌟 8. 실시간 웹소켓(Socket.io) 우체국 로직
// =========================================
io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, userId }) => {
        socket.join(roomId); 
    });

    socket.on('chatMessage', async (data) => {
        try {
            const newMsg = await new ChatMessage({
                roomId: data.roomId,
                senderId: data.senderId,
                senderName: data.senderName,
                text: data.text
            }).save();

            io.to(data.roomId).emit('message', newMsg);
            
            await ChatRoom.findByIdAndUpdate(data.roomId, { 
                lastMessage: data.text, 
                updatedAt: Date.now() 
            });
        } catch(err) { 
            console.log("웹소켓 메시지 에러:", err); 
        }
    });
});

// =========================================
// 🌟 9. 서버 실행
// =========================================
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`📡 실시간 웹소켓 통합 서버 가동 완료! 포트: ${PORT}`);
    console.log(`💓 이제 전용 대화 채널(WebSockets)이 활성화되었습니다.`);
});
