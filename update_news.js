const fs = require('fs');

async function translateText(text) {
    if (!text || text.trim() === '') return '';
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        return data[0].map(x => x[0]).join('');
    } catch (e) { return text; }
}

function parseRssItems(xmlText) {
    const items = [];
    const matched = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of matched) {
        const title = (
            item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s)?.[1] ||
            item.match(/<title>(.*?)<\/title>/s)?.[1] || ''
        ).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

        const link = (
            item.match(/<link>(.*?)<\/link>/s)?.[1] ||
            item.match(/<guid[^>]*>(.*?)<\/guid>/s)?.[1] || ''
        ).trim();

        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1] || '';

        const rawDesc =
            item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/s)?.[1] ||
            item.match(/<description>([\s\S]*?)<\/description>/s)?.[1] || '';
        const pureDesc = rawDesc
            .replace(/<[^>]*>/gm, '')
            .replace(/&[a-z#0-9]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 130);

        if (!title || !link) continue;
        items.push({ title, link, pubDate, desc: pureDesc });
    }
    return items;
}

async function fetchRss(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) return [];
        return parseRssItems(await res.text());
    } catch (e) {
        console.log(`⚠️  RSS 스킵: ${url.substring(0, 70)}`);
        return [];
    }
}

async function fetchAndSave() {
    console.log('🚀 글로벌 AI 뮤직 뉴스 수집 시작...');

    const encQ = s => encodeURIComponent(s);
    const googleNews = (q, lang = 'en', gl = 'US') =>
        `https://news.google.com/rss/search?q=${encQ(q)}&hl=${lang}&gl=${gl}&ceid=${gl}:${lang}`;

    const rssUrls = [
        // ── Google News: 핵심 AI 음악 서비스 ──────────────────────────────
        googleNews('"Suno AI" OR "Suno" OR "Udio" OR "Udio AI"'),
        // ── Google News: 생성 음악 기술 ───────────────────────────────────
        googleNews('"AI Music" OR "generative music" OR "text to music" OR "AI song"'),
        // ── Google News: 플랫폼·모델 ──────────────────────────────────────
        googleNews('"Stable Audio" OR "MusicLM" OR "MusicGen" OR "AudioCraft" OR "AI composer"'),
        // ── Google News: 산업·트렌드 ──────────────────────────────────────
        googleNews('"music AI" OR "AI music industry" OR "AI music generator" OR "neural music"'),
        // ── Google News: 영국판 (다른 편집부) ────────────────────────────
        googleNews('"AI Music" OR "Suno" OR "Udio" OR "generative music"', 'en', 'GB'),
        // ── Hacker News: AI music 키워드 ─────────────────────────────────
        'https://hnrss.org/newest?q=AI+music&count=20',
        // ── Hacker News: Suno / Udio ──────────────────────────────────────
        'https://hnrss.org/newest?q=Suno+OR+Udio&count=20',
    ];

    // 병렬 수집
    const allRaw = (await Promise.all(rssUrls.map(fetchRss))).flat();

    // 중복 제거 (제목 앞 30자 기준)
    const seen = new Set();
    const unique = [];
    for (const item of allRaw) {
        const key = item.title.toLowerCase().replace(/\s+/g, '').substring(0, 30);
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }

    // 최신순 정렬 → 상위 50개
    unique.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    const topItems = unique.slice(0, 50);
    console.log(`📰 중복 제거 후 ${topItems.length}개 기사 → 번역 시작`);

    const newsData = [];
    for (const item of topItems) {
        if (!item.title.trim()) continue;

        console.log(`📝 번역: ${item.title.substring(0, 45)}...`);
        const translatedTitle = await translateText(item.title);
        const translatedDesc  = await translateText(item.desc);

        // 제목·설명 둘 다 있는 항목만 저장
        if (!translatedTitle.trim() || !translatedDesc.trim()) continue;

        newsData.push({
            title: translatedTitle,
            desc:  translatedDesc,
            link:  item.link,
            date:  item.pubDate
                ? new Date(item.pubDate).toLocaleDateString('ko-KR')
                : '날짜 미상'
        });
    }

    fs.writeFileSync('public/news-data.json', JSON.stringify(newsData, null, 2));
    console.log(`✅ ${newsData.length}개 기사 저장 완료! (public/news-data.json)`);
}

fetchAndSave();
