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

// 🌟 접속한 사람의 로그인 정보를 화면으로 전달 (이제 강제로 관리자를 만들지 않습니다!)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 메인 화면
app.get('/', (req, res) => {
    const artists = [
        { 
            name: "밤양갱 (AI Cover)", artist: "비비(BIBI)", genre: "K-POP", aiTool: "Suno AI",
            lyrics: "[00:00] 달디달고 달디달고 달디단\n[00:05] 밤양갱 밤양갱", 
            uploader: "kamm7476", uploaderRealName: "관리자본명",
            imageUrl: "https://via.placeholder.com/150/111111/00e5ff?text=Album",
            audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
        }
    ];
    res.render('index', { artists: artists }); 
});

// 로그인 화면 보여주기
app.get('/login', (req, res) => res.render('login'));

// 🌟 실제 로그인 처리 로직
app.post('/login', (req, res) => {
    const { id, pw } = req.body;

    // 관리자 아이디(kamm7476)와 비밀번호(ranking2026)를 입력했을 때만 특별 권한 부여!
    if (id === 'kamm7476' && pw === 'ranking2026') {
        req.session.user = { id: id, name: '최고관리자', role: 'admin' };
        console.log('👑 관리자 로그인 성공!');
    } else {
        // 그 외의 아이디로 로그인하면 일반 유저 권한 부여 (임시)
        req.session.user = { id: id, name: '일반유저', role: 'user' };
        console.log(`👤 일반 유저 로그인: ${id}`);
    }
    
    res.redirect('/'); // 로그인 후 메인으로 이동
});

// 🌟 로그아웃 기능
app.get('/logout', (req, res) => {
    req.session.destroy(); // 로그인 기록 삭제
    res.redirect('/');
});

app.get('/signup', (req, res) => res.render('signup'));

app.get('/board', (req, res) => {
    const posts = [
        { title: "Suno AI로 만든 곡 평가해주세요!", author: "음악초보", date: "2026-03-08" },
        { title: "요즘 이 차트 1위 곡 미쳤네요;;", author: "리스너", date: "2026-03-08" }
    ];
    res.render('board', { posts: posts });
});

// 관리자 전용 공간 보안 확인
app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send("<script>alert('접근 권한이 없습니다! (관리자 전용)'); location.href='/';</script>");
    }
    res.render('admin', { stats: { users: 154, musics: 32, reports: 0 } });
});

app.post('/add-post', (req, res) => res.redirect('/board'));
app.post('/add-music', upload.single('image'), (req, res) => res.redirect('/'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 포트 ${PORT}에서 실행 중!`));
