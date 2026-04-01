const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true }, // 예: '2026-04-01'
    dailyVisitors: { type: Number, default: 0 },
    totalVisitors: { type: Number, default: 0 },
    dailyPlays: { type: Number, default: 0 },
    totalPlays: { type: Number, default: 0 }
});

module.exports = mongoose.model('Stats', statsSchema);
