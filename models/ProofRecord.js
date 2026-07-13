const mongoose = require('mongoose');

// 🌟 미발매 음원 저작권(선점) 증명 원장
// fileHash: 브라우저 Web Crypto API로 뽑은 SHA-256 지문 (파일 자체는 서버에 올리지 않음)
// signature: 서버만 아는 비밀키(PROOF_HMAC_SECRET)로 만든 HMAC-SHA256 서명 -> 위변조 여부 검증용
const proofSchema = new mongoose.Schema({
    certId: { type: String, required: true, unique: true },
    uploaderId: { type: String, default: 'Guest' },
    artistName: { type: String, required: true },
    trackTitle: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileHash: { type: String, required: true },
    signature: { type: String, required: true },
    timestamp: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.ProofRecord || mongoose.model('ProofRecord', proofSchema);
