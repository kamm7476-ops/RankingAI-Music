const fs = require('fs');

const DOMAINS = [
    'musicbusinessworldwide.com',
    'musically.com',
    'techcrunch.com',
    'theverge.com',
    'venturebeat.com',
    'billboard.com',
    'rollingstone.com',
];
const KEYWORD = '"AI" OR "AI Music" OR "Suno" OR "Udio" OR "generative music"';

// ═══════════════════════════════════════════════════════════════
// cleanText: 엔티티 디코딩 → HTML 태그 제거 → URL 제거 순서가 핵심
// Google News RSS는 <a href=...>를 &lt;a href=...&gt; 로 인코딩해서 전달하기 때문에
// 엔티티를 먼저 복원하지 않으면 태그 제거 정규식이 작동하지 않음
// ═══════════════════════════════════════════════════════════════
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

async function translateText(raw) {
    const text = cleanText(raw);
    if (!isReal(text)) return '';
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
        const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        return cleanText(data[0].map(x => x[0]).join(''));
    } catch {
        return text;
    }
}

function parseRssItems(xmlText, sourceDomain) {
    const items = [];
    const matched = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const raw of matched) {
        const rawTitle =
            raw.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
            raw.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
        const title = cleanText(rawTitle);

        const link = (
            raw.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
            raw.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] || ''
        ).trim();

        const pubDate = raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';

        const rawDesc =
            raw.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
            raw.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';
        const desc = cleanText(rawDesc).substring(0, 150);

        if (!isReal(title, 6) || !link.startsWith('http')) continue;

        items.push({ title, link, pubDate, desc, sourceDomain });
    }
    return items;
}

async function fetchRss(url, label) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankingAI-NewsBot/2.0)' },
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) { console.log(`⚠️  [${label}] HTTP ${res.status}`); return []; }
        const items = parseRssItems(await res.text(), label);
        console.log(`   ✅ [${label}] ${items.length}개`);
        return items;
    } catch (e) {
        console.log(`   ⚠️  [${label}] 실패: ${e.message}`);
        return [];
    }
}

async function fetchAndSave() {
    console.log('━'.repeat(55));
    console.log('🚀 도메인별 AI 뉴스 수집 시작');
    console.log(`📋 출처 ${DOMAINS.length}개 | 키워드: ${KEYWORD}`);
    console.log('━'.repeat(55));

    const jobs = DOMAINS.map(domain => ({
        label: domain,
        url: `https://news.google.com/rss/search?q=${encodeURIComponent(
            `(${KEYWORD}) site:${domain}`
        )}&hl=en&gl=US&ceid=US:en`,
    }));

    console.log('\n[1단계] RSS 수집');
    const allRaw = (await Promise.all(jobs.map(j => fetchRss(j.url, j.label)))).flat();
    console.log(`   → 수집 합계: ${allRaw.length}개`);

    const seen = new Set();
    const unique = allRaw
        .filter(item => {
            const key = item.title.toLowerCase().replace(/\s+/g, '').substring(0, 35);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
        .slice(0, 50);
    console.log(`   → 중복 제거 후: ${unique.length}개`);

    console.log('\n[2단계] 번역 & 최종 필터링');
    const newsData = [];

    for (const item of unique) {
        if (!isReal(item.title, 6)) { console.log(`   🚫 제목 불량 스킵`); continue; }
        if (!isReal(item.desc, 10)) { console.log(`   🚫 설명 없음 스킵: ${item.title.substring(0,30)}`); continue; }

        console.log(`   📝 번역: ${item.title.substring(0, 50)}...`);
        const translatedTitle = await translateText(item.title);
        const translatedDesc  = await translateText(item.desc);

        if (!isReal(translatedTitle, 6) || !isReal(translatedDesc, 10)) {
            console.log(`   🚫 번역 결과 불량 스킵`);
            continue;
        }

        newsData.push({
            title:  translatedTitle,
            desc:   translatedDesc,
            link:   item.link,
            source: item.sourceDomain || 'Global',
            date:   item.pubDate
                ? new Date(item.pubDate).toLocaleDateString('ko-KR')
                : '날짜 미상',
        });
    }

    const clean = newsData.filter(n =>
        isReal(n.title, 6) && isReal(n.desc, 10) && n.link.startsWith('http')
    );

    fs.writeFileSync(__dirname + '/public/news-data.json', JSON.stringify(clean, null, 2));
    console.log('\n' + '━'.repeat(55));
    console.log(`✅ 저장 완료: ${clean.length}개 → public/news-data.json`);
    console.log('━'.repeat(55));
}

fetchAndSave();
