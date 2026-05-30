const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
// 설정: 수집할 출처 도메인 & 검색 키워드
// ═══════════════════════════════════════════════════════════════
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
// Google 번역 유틸
// ═══════════════════════════════════════════════════════════════
async function translateText(text) {
    if (!text || text.trim() === '') return '';
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        return data[0].map(x => x[0]).join('');
    } catch {
        return text; // 번역 실패 시 원문 반환
    }
}

// ═══════════════════════════════════════════════════════════════
// RSS XML 파서
// ═══════════════════════════════════════════════════════════════
function parseRssItems(xmlText) {
    const items = [];
    const matched = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const item of matched) {
        // 제목
        const title = (
            item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
            item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''
        )
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&#\d+;/g, '').trim();

        // 링크
        const link = (
            item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
            item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] || ''
        ).trim();

        // 날짜
        const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';

        // 설명
        const rawDesc =
            item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
            item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';
        const pureDesc = rawDesc
            .replace(/<[^>]*>/gm, '')
            .replace(/&[a-z#0-9]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 150);

        // 제목·링크 둘 다 없으면 스킵
        if (!title || !link) continue;

        items.push({ title, link, pubDate, desc: pureDesc });
    }
    return items;
}

// ═══════════════════════════════════════════════════════════════
// RSS 단일 소스 수집
// ═══════════════════════════════════════════════════════════════
async function fetchRss(url, label) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankingAI-NewsBot/2.0)' },
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) {
            console.log(`⚠️  [${label}] HTTP ${res.status} — 스킵`);
            return [];
        }
        const items = parseRssItems(await res.text());
        console.log(`   ✅ [${label}] ${items.length}개 수집`);
        return items;
    } catch (e) {
        console.log(`   ⚠️  [${label}] 실패: ${e.message}`);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════
// 메인: 수집 → 중복제거 → 번역 → 저장
// ═══════════════════════════════════════════════════════════════
async function fetchAndSave() {
    console.log('━'.repeat(55));
    console.log('🚀 도메인별 AI 뉴스 수집 시작');
    console.log(`📋 출처 (${DOMAINS.length}개): ${DOMAINS.join(', ')}`);
    console.log(`🔍 키워드: ${KEYWORD}`);
    console.log('━'.repeat(55));

    // 각 도메인 → Google News RSS (site: 연산자로 도메인 한정)
    const jobs = DOMAINS.map(domain => ({
        label: domain,
        url: `https://news.google.com/rss/search?q=${encodeURIComponent(
            `(${KEYWORD}) site:${domain}`
        )}&hl=en&gl=US&ceid=US:en`,
    }));

    // ── 병렬 수집 ─────────────────────────────────────────────
    console.log('\n[1단계] RSS 수집 (병렬)');
    const rawArrays = await Promise.all(jobs.map(j => fetchRss(j.url, j.label)));
    const allRaw = rawArrays.flat();
    console.log(`\n   → 전체 수집: ${allRaw.length}개`);

    // ── 중복 제거 (제목 앞 35자 소문자) ──────────────────────
    const seen = new Set();
    const unique = allRaw.filter(item => {
        const key = item.title.toLowerCase().replace(/\s+/g, '').substring(0, 35);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // 최신순 정렬 → 상위 50개
    unique.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    const topItems = unique.slice(0, 50);
    console.log(`   → 중복 제거 후: ${topItems.length}개`);

    // ── 번역 ──────────────────────────────────────────────────
    console.log('\n[2단계] 번역');
    const newsData = [];

    for (const item of topItems) {
        // 방어 필터 ①: 원문 제목·설명이 빈 경우 저장 안 함
        if (!item.title.trim() || !item.desc.trim()) {
            console.log(`   🚫 스킵(빈 필드): "${item.title.substring(0, 30) || '제목없음'}"`);
            continue;
        }

        console.log(`   📝 번역: ${item.title.substring(0, 50)}...`);
        const translatedTitle = await translateText(item.title);
        const translatedDesc  = await translateText(item.desc);

        // 방어 필터 ②: 번역 결과도 빈 경우 저장 안 함
        if (!translatedTitle.trim() || !translatedDesc.trim()) {
            console.log(`   🚫 스킵(번역 실패)`);
            continue;
        }

        // 출처 도메인 추출
        const source = DOMAINS.find(d => item.link.includes(d)) || 'Global';

        newsData.push({
            title:  translatedTitle,
            desc:   translatedDesc,
            link:   item.link,
            source: source,
            date:   item.pubDate
                ? new Date(item.pubDate).toLocaleDateString('ko-KR')
                : '날짜 미상',
        });
    }

    // ── 저장 ──────────────────────────────────────────────────
    fs.writeFileSync('public/news-data.json', JSON.stringify(newsData, null, 2));
    console.log('\n' + '━'.repeat(55));
    console.log(`✅ 저장 완료: ${newsData.length}개 → public/news-data.json`);
    console.log('━'.repeat(55));
}

fetchAndSave();
