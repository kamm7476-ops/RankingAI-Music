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
    .then(() => console.log('✅ DB Connected!'))
    .catch(err => console.log('❌ DB Error: ' + err.message));

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ranking-secret', resave: false, saveUninitialized: true }));

app.use((req, res, next) => {
    if (!req.session.lang) req.session.lang = 'ko';
    const translations = {
        ko: { title: "멜론 랭킹 AI", upload: "아티스트 등록" },
        en: { title: "Melon Ranking AI", upload: "Add Artist" }
    };
    res.locals.t = translations[req.session.lang];
    res.locals.currentLang = req.session.lang;
    next();
});

app.get('/', (req, res) => {
    res.render('index', { artists: [] }); 
});

app.post('/add-artist', upload.single('image'), (req, res) => {
    res.redirect('/');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
