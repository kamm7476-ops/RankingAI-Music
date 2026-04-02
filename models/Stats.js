const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    dailyVisitors: { type: Number, default: 0 },
    totalVisitors: { type: Number, default: 0 },
    dailyPlays: { type: Number, default: 0 },
    totalPlays: { type: Number, default: 0 }, // 👈 범인은 바로 여기! 이 끝에 쉼표(,)가 빠져있었을 겁니다.

    // 회원/비회원 구분 기록장
    memberVisitors: { type: Number, default: 0 },
    guestVisitors: { type: Number, default: 0 },
    memberPlays: { type: Number, default: 0 },
    guestPlays: { type: Number, default: 0 }
});

module.exports = mongoose.model('Stats', statsSchema);
