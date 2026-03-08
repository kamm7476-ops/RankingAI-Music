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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    if (!req.session.user) {
        req.session.user = { id: 'kamm7476', name: '관리자본명', role: 'admin' }; 
    }
    res.locals.user = req.session.user;
    next();
});

// 메인 화면 (차트)
app.get('/', (req, res) => {
    const artists = [
        { 
            name: "밤양갱 (AI Cover)", 
            artist: "비비(BIBI)", 
            genre: "K-POP", 
            aiTool: "Suno AI",
            lyrics: "[00:00] 달디달고 달디달고 달디단\n[00:05] 밤양갱 밤양갱", 
            uploader: "kamm7476", 
            uploaderRealName: "관리자본명",
            imageUrl: "https://via.placeholder.com/150/111111/00e5ff?text=Album",
            // 🌟 임시로 재생할 수 있는 샘플 음악 URL 추가
            audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
        }
    ];
    res.render('index', { artists: artists }); 
});

app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));

// 🌟 소통을 위한 커뮤니티(게시판) 화면 보여주기
app.get('/board', (req, res) => {
    // 임시 게시글 데이터
    const posts = [
        { title: "Suno AI로 만든 곡 평가해주세요!", author: "음악초보", date: "2026-03-08" },
        { title: "요즘 이 차트 1위 곡 미쳤네요;;", author: "리스너", date: "2026-03-08" },
        { title: "가사 싱크 어떻게 맞추나요?", author: "창작자", date: "2026-03-07" }
    ];
    res.render('board', { posts: posts });
});

// 🌟 게시판 글쓰기 처리 (지금은 작성 후 게시판으로 돌아가게 설정)
app.post('/add-post', (req, res) => {
    console.log("새 게시글이 등록되었습니다.");
    res.redirect('/board');
});

app.post('/add-music', upload.single('image'), (req, res) => {
    res.redirect('/'); 
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 포트 ${PORT}에서 실행 중!`));
