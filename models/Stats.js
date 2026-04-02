const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true }, // 예: '2026-04-01'
    dailyVisitors: { type: Number, default: 0 },
    totalVisitors: { type: Number, default: 0 },
    dailyPlays: { type: Number, default: 0 },
    totalPlays: { type: Number, default: 0 }
    // 👇 [추가된 부분] 회원/비회원 구분 기록장
    memberVisitors: { type: Number, default: 0 }, // 오늘 회원 방문
    guestVisitors: { type: Number, default: 0 },  // 오늘 비회원 방문
    memberPlays: { type: Number, default: 0 },    // 오늘 회원 재생
    guestPlays: { type: Number, default: 0 }      // 오늘 비회원 재생
    
});

module.exports = mongoose.model('Stats', statsSchema);
