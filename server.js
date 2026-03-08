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
// 🌟 이제 이미지와 오디오 파일을 모두 받을 수 있게 설정합니다.
const upload = multer({ storage: storage });

const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => console.log('✅ DB 연결 성공! (비밀번호 숨김 모드)'))
    .catch(err => console.log('❌ DB 에러:', err.message));

// 🌟 음악 설계도에 '오디오 URL'과 '댓글(comments)' 항목 추가
const musicSchema = new mongoose.Schema({
    name: String, artist: String, genre: String, aiTool: String, lyrics: String,
    uploader: String, uploaderRealName: String, imageUrl: String, audioUrl: String,
    comments: [{ author: String, text: String, date: { type: Date, default: Date.now } }],
    createdAt: { type: Date, default: Date.now }
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

app.get('/', async (req, res) => {
    try {
        let artists = await Music.find().sort({ createdAt: -1 });
        if (artists.length === 0) {
            artists = [{
                _id: "dummy", name: "첫 곡의 주인공이 되어보세요!", artist: "RANKING AI", genre: "안내", aiTool: "시스템",
                lyrics: "아직 등록된 곡이 없습니다. 위에서 음원을 업로드 해주세요.", 
                uploader: "admin", uploaderRealName: "관리자", audioUrl: "",
                imageUrl: "https://via.placeholder.com/150/222222/00e5ff?text=No+Music"
            }];
        }
        res.render('index', { artists: artists }); 
    } catch (err) {
        console.log("DB 에러:", err);
        res.send("<h1>데이터를 불러오는 중 에러가 발생했습니다.</h1>");
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
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.get('/signup', (req, res) => res.render('signup'));
app.get('/board', (req, res) => res.render('board', { posts: [] }));
app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('접근 권한이 없습니다!'); location.href='/';</script>");
    }
    res.render('admin', { stats: { users: 0, musics: 0, reports: 0 } });
});

// 🌟 사진과 MP3 파일을 동시에 받아서 DB에 저장하는 마법!
app.post('/add-music', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
    try {
        const { name, artist, genre, aiTool, lyrics, realName } = req.body;
        const uploader = req.session.user ? req.session.user.id : 'guest';
        
        // 사진과 음원 파일이 서버에 잘 올라왔는지 확인 후 경로 저장
        const imageUrl = req.files && req.files['image'] ? `/uploads/${req.files['image'][0].filename}` : 'https://via.placeholder.com/150/111111/00e5ff?text=Album';
        const audioUrl = req.files && req.files['audio'] ? `/uploads/${req.files['audio'][0].filename}` : '';

        const newMusic = new Music({
            name, artist, genre, aiTool, lyrics, uploaderRealName: realName, uploader, imageUrl, audioUrl
        });

        await newMusic.save();
        res.redirect('/'); 
    } catch (err) {
        console.log("저장 실패:", err);
        res.send("<script>alert('음원 등록 실패!'); location.href='/';</script>");
    }
});

// 🌟 곡마다 댓글을 달 수 있게 해주는 특별한 길 추가
app.post('/add-comment/:id', async (req, res) => {
    try {
        const musicId = req.params.id;
        const text = req.body.commentText;
        const author = req.session.user ? req.session.user.id : '익명';

        const music = await Music.findById(musicId);
        if(music) {
            music.comments.push({ author: author, text: text });
            await music.save(); // 댓글을 곡 데이터 안에 쏙 집어넣고 저장
        }
        res.redirect('/'); // 댓글 달면 바로 메인화면 새로고침
    } catch (err) {
        console.log("댓글 저장 에러:", err);
        res.redirect('/');
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 포트 ${PORT}에서 실행 중!`));
