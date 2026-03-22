require('dotenv').config(); // 🌟 .env 파일 읽어오는 핵심 마법!
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
// 🌟 클라우디너리 영구 금고 세팅
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const User = require('./user'); // (models 폴더에 있다면 './models/User' 로 수정!)
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
const upload = multer({ storage: storage });

const app = express();
let currentPopup = { isActive: false, title: '', content: '' };

// 🌟 DB 연결 (영어를 숫자로 바꾼 완벽 버전!)
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
    likedBy: [String], // 🌟🌟🌟 명단 적는 칸
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
// 🌟 3. 커뮤니티 게시판 DB 주머니 (명단 추가 완료!)
// =========================================
const postSchema = new mongoose.Schema({
    title: String,
    content: String,
    author: String,
    likes: { type: Number, default: 0 },
    likedBy: [String], // 🌟 게시글 좋아요 명단
    createdAt: { type: Date, default: Date.now },
    comments: [{ 
        author: String, 
        text: String, 
        likes: { type: Number, default: 0 },
        likedBy: [String], // 🌟 댓글 좋아요 명단
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
// 🌟 메인 화면 (차트 & 최신음악 & 팝업)
// =========================================
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search || ''; 
        const genreQuery = req.query.genre || ''; 
        const sortQuery = req.query.sort || 'views'; 
        const periodQuery = req.query.period || ''; // 🌟 기간 탭 필터 추가!
        
        let filter = {};
        if (searchQuery) filter.artist = { $regex: searchQuery, $options: 'i' };
        if (genreQuery) filter.genre = genreQuery;

        // 🌟 기간별 필터링 마법 (일간/주간/월간)
        if (periodQuery) {
            const now = new Date();
            let pastDate = new Date();
            if (periodQuery === 'daily') pastDate.setDate(now.getDate() - 1); // 1일 전
            else if (periodQuery === 'weekly') pastDate.setDate(now.getDate() - 7); // 7일 전
            else if (periodQuery === 'monthly') pastDate.setMonth(now.getMonth() - 1); // 한 달 전
            
            filter.createdAt = { $gte: pastDate }; // 이 날짜 이후에 등록된 곡만 가져와라!
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
            periodQuery: periodQuery, // 🌟 화면에 어떤 탭인지 알려주기
            popularArtists: popularArtists,
            popup: currentPopup, // 
            popup: activePopup
        });
    } catch (err) {
        console.log("DB 에러:", err);
        res.send("<h1>진짜 에러 원인: " + err.message + "</h1>")
    }
});

// ==========================================
// 🚪 1. 화면 보여주는 파이프 (GET)
// ==========================================
app.get('/signup', (req, res) => res.render('signup'));
app.get('/login', (req, res) => res.render('login'));

// ==========================================
// 📝 2. 데이터 처리하는 파이프 (POST)
// ==========================================
app.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.send("<script>alert('이미 있는 아이디입니다!'); window.history.back();</script>");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username: username, password: hashedPassword });
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
    if (user.username === 'kamm7476') { 
        userRole = 'admin'; 
    }
    req.session.user = { id: user.username, name: user.username, role: userRole }; 
    
    if (userRole === 'admin') {
         res.send("<script>alert('👑 관리자님 환영합니다!'); window.location.href='/';</script>");
    } else {
         res.send("<script>alert('반갑습니다, " + user.username + "님!'); window.location.href='/';</script>");
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

// 🌟 back 에러 수정 완료!
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
        await new Post({ title: req.body.title, content: req.body.content, author: req.session.user.id }).save();
        res.redirect('/board');
    } catch (err) { console.log(err); }
});

app.post('/delete-post/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/board');
    try {
        const post = await Post.findById(req.params.id);
        if (req.session.user.role === 'admin' || req.session.user.id === post.author) await Post.findByIdAndDelete(req.params.id);
        res.redirect('/board');
    } catch (err) { console.log(err); }
});

// 🌟🌟🌟 [여기에 추가됨!] 커뮤니티 게시글 수정 파이프 🌟🌟🌟
app.get('/edit-post/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.send("<script>alert('존재하지 않는 게시글입니다.'); location.href='/board';</script>");
        
        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.id === post.author;
        
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
        const isOwner = req.session.user.id === post.author;
        
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
// 🌟🌟🌟 여기까지 🌟🌟🌟


// 🌟 back 에러 수정 완료!
app.post('/add-board-comment/:id', async (req, res) => {
    if (!req.session || !req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    try {
        const post = await Post.findById(req.params.id);
        if (post) {
            post.comments.push({ author: req.session.user.id, text: req.body.commentText });
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
// 👑 관리자 전용 대시보드 데이터 수집
app.get('/admin', async (req, res) => {
    try {
        // 관리자 권한 체크 (세션에 admin 정보가 없으면 튕겨내기)
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.redirect('/');
        }

        // 1. 전체 가입자 및 음원 데이터 가져오기
        const allUsers = await User.find().lean();
        const allMusic = await Music.find().lean();

        // 2. 가입자별 등록 음원수 합산해서 새로운 목록 만들기
        const usersWithStats = allUsers.map(u => {
            const myMusicCount = allMusic.filter(m => m.uploader === u.id).length;
            return {
                ...u,
                musicCount: myMusicCount
            };
        });

        // 3. 전체 통계 계산
        const stats = {
            totalUsers: allUsers.length,
            totalMusic: allMusic.length,
            totalViews: allMusic.reduce((sum, m) => sum + (m.views || 0), 0),
            // 금일 방문자 등은 로그 시스템이 없으므로 일단 0이나 랜덤값으로 구조만 잡습니다.
            todayVisitor: Math.floor(Math.random() * 50) + 10 
        };

        // 4. 관리자 페이지(admin.ejs)로 모든 데이터 쏴주기!
        res.render('admin', { 
            user: req.session.user,
            stats: stats,
            users: usersWithStats
        });

    } catch (err) {
        console.error("관리자 데이터 수집 에러:", err);
        res.status(500).send("<h1>관리자 페이지 데이터를 불러오는데 실패했습니다. ㅠㅠ</h1>");
    }
});

app.post('/add-music', (req, res, next) => {
    // 🌟 1. 문지기 출동! 로그인 안 한 사람은 여기서 바로 튕겨냅니다!
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
        // 🌟 2. 이제 무조건 로그인한 사람(user.id) 이름으로만 저장됨!
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
        if (!music) return res.redirect('/');
        const isAdmin = req.session.user.role === 'admin';
        const isOwner = req.session.user.id === music.uploader;
        if (isAdmin || isOwner) {
            await Music.findByIdAndDelete(req.params.id);
            await MyMusic.deleteMany({ musicId: req.params.id }); 
            res.redirect('/');
        } else {
            res.send("<script>alert('삭제 권한이 없습니다.'); location.href='/';</script>");
        }
    } catch (err) { res.redirect('/'); }
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

// =========================================
// 🌟 음원 좋아요 기능
// =========================================
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

// =========================================
// 🌟 1. 음원 댓글 ❌ 삭제 기능 (본인/관리자 전용)
// =========================================
app.post('/delete-music-comment/:musicId/:commentId', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    try {
        const music = await Music.findById(req.params.musicId);
        if (!music) return res.redirect('/'); 

        const comment = music.comments.id(req.params.commentId);
        if (comment && (req.session.user.role === 'admin' || req.session.user.id === comment.author)) {
            music.comments.pull(req.params.commentId); // 댓글 쏙 빼서 버리기!
            await music.save();
        }
        res.redirect('/'); // 🌟 back 대신 '/' (메인화면)으로 확정!
    } catch (err) { res.redirect('/'); }
});

// =========================================
// 🌟 2. 커뮤니티 게시글 & 댓글 좋아요 (1인 1회 방어막!)
// =========================================
app.post('/like-board-comment/:postId/:commentId', async (req, res) => {
    if (!req.session.user) return res.json({ success: false, message: "로그인 필요" });
    try {
        const post = await Post.findById(req.params.postId);
        const comment = post.comments.id(req.params.commentId);
        const username = req.session.user.id;
        const isAdmin = req.session.user.role === 'admin';

        if (isAdmin) {
            comment.likes = (comment.likes || 0) + 1; // 관리자는 무한 광클!
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
// 🌟 3. 메인 화면 음원 댓글 달기 파이프
// =========================================
app.post('/add-comment/:id', async (req, res) => {
    // 1. 로그인 안 한 사람 튕겨내기
    if (!req.session || !req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.'); history.back();</script>");
    }

    try {
        // 2. 어떤 노래에 댓글을 달았는지 찾기
        const music = await Music.findById(req.params.id);
        
        if (music) {
            // 3. 노래 장부의 comments 칸에 내 이름과 댓글 내용 쏙 넣기
            music.comments.push({ 
                author: req.session.user.id, 
                text: req.body.commentText 
            });
            await music.save(); // 장부 저장!
        }
        // 🌟 에러의 원인 완벽 제거: 저장 완료 후 메인 화면('/')으로 돌아가기!
        res.redirect('/'); 
        
    } catch (err) {
        console.error("음원 댓글 등록 에러:", err);
        res.redirect('/');
    }
});
// 🌟 재생수 업데이트 API (서버용)
app.post('/play-count/:id', async (req, res) => {
    try {
        const musicId = req.params.id;
        // DB에서 음악을 찾아 조회수(views)를 1 올림
        await Music.findByIdAndUpdate(musicId, { $inc: { views: 1 } });
        res.json({ success: true });
    } catch (err) {
        console.error("재생수 업데이트 에러:", err);
        res.status(500).json({ success: false });
    }
});

// 📢 [권력 1] 공지사항 팝업 등록/수정
app.post('/admin/popup', (req, res) => {
    // 관리자가 아니면 쫓아냄
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    
    currentPopup = {
        isActive: req.body.isActive === 'on', // 체크박스 ON/OFF
        title: req.body.title,
        content: req.body.content
    };
    res.redirect('/'); // 등록 후 메인 화면으로 가서 확인!
});

// ⚡ [권력 2] 유저 강제 탈퇴 (DB에서 영구 삭제)
app.post('/admin/delete-user/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    try {
        const userId = req.params.id;
        await User.findOneAndDelete({ id: userId }); // 유저 삭제
        await Music.deleteMany({ uploader: userId }); // 덤으로 그 유저가 올린 음악도 싹 삭제!
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send("강제 탈퇴 중 에러가 발생했습니다.");
    }
});

// 🗑️ [권력 3] 관리자 전용 음원 강제 삭제 (메인 페이지 차트용)
app.post('/delete-music/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    try {
        const music = await Music.findById(req.params.id);
        // 올린 본인이거나, '관리자(admin)'일 때만 삭제 허용!
        if (music.uploader === req.session.user.id || req.session.user.role === 'admin') {
            await Music.findByIdAndDelete(req.params.id);
        }
        res.redirect('/');
    } catch (err) {
        res.status(500).send("음원 삭제 중 에러가 발생했습니다.");
    }
});

// =========================================
// 🌟 1:1 관리자 DM (제휴/문의) 기능 DB 및 파이프
// =========================================
const dmSchema = new mongoose.Schema({
    userId: String,
    message: String,
    reply: { type: String, default: '' }, // 관리자 답변칸
    createdAt: { type: Date, default: Date.now }
});
const DM = mongoose.models.DM || mongoose.model('DM', dmSchema);

// 1. DM 화면 보여주기 (유저는 자기것만, 관리자는 전부 다!)
app.get('/contact', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.'); location.href='/login';</script>");
    }
    
    let dms = [];
    if (req.session.user.role === 'admin') {
        // 관리자는 모든 유저의 DM을 최신순으로 봅니다.
        dms = await DM.find().sort({ createdAt: -1 });
    } else {
        // 일반 유저는 '내 아이디'로 보낸 DM만 봅니다.
        dms = await DM.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
    }
    res.render('contact', { user: req.session.user, dms: dms });
});

// 2. 유저가 관리자에게 메세지 보내기
app.post('/contact/send', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/login');
    await new DM({ userId: req.session.user.id, message: req.body.message }).save();
    res.redirect('/contact');
});

// 3. 관리자가 답변 달기
app.post('/contact/reply/:id', async (req, res) => {
    // 관리자만 답변할 수 있는 강력한 방어막!
    if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/');
    }
    await DM.findByIdAndUpdate(req.params.id, { reply: req.body.reply });
    res.redirect('/contact');
});


// 4. DM 삭제 기능 (유저는 본인 것만, 관리자는 전부 다 지울 수 있음!)
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 실행 중: ${PORT}`));