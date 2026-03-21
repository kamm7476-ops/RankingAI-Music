const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // 🌟 핵심: 가입하면 무조건 'user'(일반 유저)로 설정됨
  role: { type: String, default: 'user' }, 
  createdAt: { type: Date, default: Date.now } 
});

module.exports = mongoose.model('User', userSchema);