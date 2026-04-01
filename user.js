const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // 🌟 [추가됨!] 아티스트명(별명) 저장하는 칸!
  nickname: { type: String, default: "" }, 
  
  // 🌟 핵심: 가입하면 무조건 'user'(일반 유저)로 설정됨
  role: { type: String, default: 'user' }, 
  createdAt: { type: Date, default: Date.now },

  // ==========================================
  // 🌟 [새로 추가됨!] 관리자 통계용 로그인 카운터
  // ==========================================
  totalLogins: { type: Number, default: 0 }, // 총 접속 횟수
  todayLogins: { type: Number, default: 0 }, // 오늘 접속 횟수
  lastLoginDate: { type: String, default: '' } // 마지막 접속 날짜 (자정 지나면 초기화하기 위함)
});

module.exports = mongoose.model('User', userSchema);
