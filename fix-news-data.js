// 기존 news-data.json의 불량 데이터를 즉시 정리하는 스크립트
const fs = require('fs');

function cleanText(str) {
    if (!str) return '';
    return str
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .replace(/&amp;/g,  '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g,  "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]*>?/g, '')
        .replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isReal(str, min) {
    const c = cleanText(str);
    return c.length >= (min || 4) && /[a-zA-Z가-힣0-9]/.test(c);
}

const raw = JSON.parse(fs.readFileSync(__dirname + '/public/news-data.json', 'utf-8'));

const fixed = raw
    .map(item => ({
        ...item,
        title: cleanText(item.title).substring(0, 200),
        desc:  cleanText(item.desc).substring(0, 150),
    }))
    .filter(item =>
        isReal(item.title, 6) &&
        isReal(item.desc,  10) &&
        item.link && item.link.startsWith('http')
    );

fs.writeFileSync(__dirname + '/public/news-data.json', JSON.stringify(fixed, null, 2));
console.log(`정리 전: ${raw.length}개 → 정리 후: ${fixed.length}개`);
if (raw.length !== fixed.length) {
    console.log(`🚫 제거된 불량 기사: ${raw.length - fixed.length}개`);
} else {
    console.log('✅ 모든 기사 정상 (제거 없음)');
}
