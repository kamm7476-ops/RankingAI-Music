require('dotenv').config();
const mongoose = require('mongoose');

// 1. DB 연결 (선생님의 .env에 있는 주소 사용)
mongoose.connect(process.env.DB_URI)
  .then(() => console.log("✅ DB 연결 성공! 주소 변환을 시작합니다..."))
  .catch(err => console.error("❌ DB 연결 실패:", err));

// 2. 음악 데이터 모델 정의 (기존 server.js의 스키마와 맞춰야 함)
const Music = mongoose.model('Music', new mongoose.Schema({
    audioUrl: String,
    imageUrl: String
}), 'musics'); // 'musics'는 실제 컬렉션 이름입니다.

async function updateUrls() {
    const r2BaseUrl = "https://pub-41b43f3940094c2f9b1030c7384b767a.r2.dev";
    
    const songs = await Music.find({});
    console.log(`🔍 총 ${songs.length}곡을 찾았습니다.`);

    for (let song of songs) {
        // 기존 클라우디너리 주소에서 파일명만 추출하는 로직
        if (song.audioUrl && song.audioUrl.includes('cloudinary')) {
            const audioFileName = song.audioUrl.split('/').pop();
            const imageFileName = song.imageUrl ? song.imageUrl.split('/').pop() : null;

            song.audioUrl = `${r2BaseUrl}/${audioFileName}`;
            if (imageFileName) {
                song.imageUrl = `${r2BaseUrl}/${imageFileName}`;
            }

            await song.save();
            console.log(`🎶 변환 완료: ${audioFileName}`);
        }
    }

    console.log("✨ 모든 곡의 주소가 R2로 변경되었습니다! 이제 사이트에서 확인해 보세요.");
    process.exit();
}

updateUrls();