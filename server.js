const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const app = express();

// 1. 이미지 업로드 설정 (public/uploads/ 폴더에 저장)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// 2. 몽고DB 연결 (비밀번호 ranking2026)
const DB_URI = "mongodb+srv://kamm7476:ranking2026@cluster0.y95nodi.mongodb.net/RankingAI?retryWrites=true&w=majority";
mongoose.connect(DB_URI)
    .then(() => console.log('✅ RANKING AI DB 완벽 연결!'))
    .catch(err => console.log('❌ DB 에러:', err.message));

// 3. 서버 기본 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ranking-ai-secret', resave: false, saveUninitialized: true }));

// 4. 회원 관리 미들웨어 (테스트를 위해 임시로 로그인된 상태로 만듭니다)
app.use((req, res, next) => {
    // 실제로는 로그인 화면에서 받아와야 하지만, 기능을 눈으로 확인하시도록 임시 계정을 넣었습니다.
    if (!req.session.user) {
        req.session.user = { id: 'kamm7476', name: '관리자본명', role: 'admin' }; 
    }
    res.locals.user = req.session.user;
    next();
});

// 5. 메인 화면 출력 (지니/멜론 스타일 데이터 전송)
app.get('/', (req, res) => {
    // 테스트용 임시 곡 데이터 (가사, 비공개 이름 포함)
    const artists = [
        { 
            name: "밤양갱", 
            artist: "비비(BIBI)", 
            genre: "K-POP", 
            lyrics: "[00:00] 달디달고 달디달고 달디단\n[00:05] 밤양갱 밤양갱", 
            uploader: "kamm7476", 
            uploaderRealName: "관리자본명",
            imageUrl: "https://via.placeholder.com/150/111111/00e5ff?text=Album" // 임시 앨범 이미지
        }
    ];
    res.render('index', { artists: artists }); 
});

// 6. 음악 업로드 처리 (곡명, 아티스트, 장르, 가사, 실명 등)
app.post('/add-music', upload.single('image'), (req, res) => {
    const { name, artist, genre, lyrics, realName } = req.body;
    const uploader = req.session.user ? req.session.user.id : 'guest';
    
    console.log(`새로운 곡 등록됨: ${name} / 업로더 실명: ${realName}`);
    res.redirect('/'); // 업로드 후 메인으로 돌아가기
});

// 7. 서버 실행
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 RANKING AI 포트 ${PORT}에서 실행 중!`));
