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

// 🌟 1. 몽고DB에 음악을 저장할 '데이터 설계도(Schema)' 만들기
const musicSchema = new mongoose.Schema({
    name: String,
    artist: String,
    genre: String,
    aiTool: String,
    lyrics: String,
    uploader: String,
    uploaderRealName: String,
    imageUrl: String,
    audioUrl: String,
    createdAt: { type: Date, default: Date.now } // 업로드된 시간 자동 기록
});
const Music = mongoose.model('Music', musicSchema);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 🌟 2. 메인 화면 (임시 데이터가 아니라 '진짜 DB'에서 곡을 꺼내옵니다!)
app.get('/', async (req, res) => {
    try {
        // 최신순(-1)으로 DB에 저장된 음악들을 모두 가져옵니다.
        let artists = await Music.find().sort({ createdAt: -1 });
        
        // 만약 DB가 텅 비어있다면, 안내 메시지용 가짜 데이터를 하나 보여줍니다.
        if (artists.length === 0) {
            artists = [{
                name: "첫 곡의 주인공이 되어보세요!", artist: "RANKING AI", genre: "안내", aiTool: "시스템",
                lyrics: "아직 등록된 곡이 없습니다. 위에서 음원을 업로드 해주세요.", 
                uploader: "admin", uploaderRealName: "관리자",
                imageUrl: "https://via.placeholder.com/150/222222/00e5ff?text=No+Music"
            }];
        }
        res.render('index', { artists: artists }); 
    } catch (err) {
        console.log(err);
        res.send("데이터를 불러오는 중 에러가 발생했습니다.");
    }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'kamm7476' && pw === 'ranking2026') {
        req.session.user = { id: id, name: '최고관리자', role: 'admin' };
    } else {
        req.session.user = { id: id, name: '일반유저', role: 'user' };
    }
    res.redirect('/');
});
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});
app.get('/signup', (req, res) => res.render('signup'));
app.get('/board', (req, res) => {
    res.render('board', { posts: [] });
});
app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('접근 권한이 없습니다! (관리자 전용)'); location.href='/';</script>");
    }
    res.render('admin', { stats: { users: 0, musics: 0, reports: 0 } });
});

// 🌟 3. 곡 등록 시 DB에 "진짜로 저장"하는 핵심 마법!
app.post('/add-music', upload.single('image'), async (req, res) => {
    try {
        const { name, artist, genre, aiTool, lyrics, realName } = req.body;
        const uploader = req.session.user ? req.session.user.id : 'guest';
        
        // 이미지를 올렸으면 그 경로를, 안 올렸으면 기본 이미지를 씁니다.
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/150/111111/00e5ff?text=Album';

        // 새로 받은 곡 정보 포장하기
        const newMusic = new Music({
            name, artist, genre, aiTool, lyrics,
            uploaderRealName: realName,
            uploader, imageUrl
        });

        // 몽고DB에 영구 저장!
        await newMusic.save();
        console.log(`✅ DB 저장 성공: ${name}`);

        res.redirect('/'); // 저장이 끝나면 메인 화면으로 돌아가기
    } catch (err) {
        console.log("❌ 음악 저장 실패:", err);
        res.send("<script>alert('음원 등록에 실패했습니다.'); location.href='/';</script>");
    }
});

app.post('/add-post', (req, res) => res.redirect('/board'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 포트 ${PORT}에서 실행 중!`));
