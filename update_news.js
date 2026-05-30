const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
// AI 음악 뉴스 전용 검색 쿼리 (키워드 우선 방식)
// ═══════════════════════════════════════════════════════════════
const QUERIES = [
    // ── 핵심 서비스 ──────────────────────────────────────────
    '"Suno AI" OR "Suno" OR "Udio" OR "Udio AI"',
    // ── AI 음악 생성 기술 ────────────────────────────────────
    '"AI Music" OR "AI music generator" OR "music AI" OR "AI song"',
    // ── 생성 음악 트렌드 ─────────────────────────────────────
    '"generative music" OR "text to music" OR "AI composer" OR "AI音楽"',
    // ── AI 음악 모델·플랫폼 ──────────────────────────────────
    '"MusicLM" OR "MusicGen" OR "Stable Audio" OR "AudioCraft"',
    // ── 음악 산업 × AI ───────────────────────────────────────
    '"AI music" OR "Suno" site:musicbusinessworldwide.com',
    '"AI music" OR "Suno" OR "Udio" site:musically.com',
    '"AI music" site:billboard.com',
    '"AI music" site:rollingstone.com',
    '"AI music" site:theverge.com',
    '"AI music" OR "Suno" OR "Udio" site:techcrunch.com',
];

// AI 음악 관련 키워드 (제목 관련성 검사용)
const AI_MUSIC_KEYWORDS = [
    'ai music', 'suno', 'udio', 'generative music', 'music ai',
    'ai song', 'text to music', 'ai composer', 'musiclm', 'musicgen',
    'stable audio', 'audiocraft', 'ai-generated music', 'ai 음악',
    'music generator', 'ai 작곡', '생성 음악',
];

// ═══════════════════════════════════════════════════════════════
// cleanText: 엔티티 디코딩 → HTML 태그 제거 순서가 핵심
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

// 제목이 AI 음악과 관련 있는지 확인
function isAiMusicRelated(title) {
    const lower = title.toLowerCase();
    return AI_MUSIC_KEYWORDS.some(kw => lower.includes(kw));
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

function parseRssItems(xmlText, label) {
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

        items.push({ title, link, pubDate, desc, label });
    }
    return items;
}

async function fetchRss(url, label) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankingAI-NewsBot/2.0)' },
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) { console.log(`   ⚠️  [${label}] HTTP ${res.status}`); return []; }
        const items = parseRssItems(await res.text(), label);
        console.log(`   ✅ [${label}] ${items.length}개`);
        return items;
    } catch (e) {
        console.log(`   ⚠️  [${label}] 실패: ${e.message}`);
        return [];
    }
}

async function fetchAndSave() {
    console.log('━'.repeat(60));
    console.log('🎵 AI 음악 뉴스 수집 시작');
    console.log('━'.repeat(60));

    const rssBase = (q) =>
        `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=US&ceid=US:en`;

    const jobs = QUERIES.map((q, i) => ({
        url: rssBase(q),
        label: `Q${i + 1}`,
    }));

    // ── 1단계: 병렬 수집 ──────────────────────────────────────
    console.log('\n[1단계] RSS 수집');
    const allRaw = (await Promise.all(jobs.map(j => fetchRss(j.url, j.label)))).flat();
    console.log(`   → 전체 수집: ${allRaw.length}개`);

    // ── 2단계: AI 음악 관련 기사만 우선 분류 ──────────────────
    const related   = allRaw.filter(item => isAiMusicRelated(item.title));
    const unrelated = allRaw.filter(item => !isAiMusicRelated(item.title));
    console.log(`   → AI 음악 관련: ${related.length}개 / 기타: ${unrelated.length}개`);

    // 관련 기사 우선, 부족하면 기타 기사로 보충 (최대 50개)
    const pool = [...related, ...unrelated];

    // ── 3단계: 중복 제거 + 최신순 ────────────────────────────
    const seen = new Set();
    const unique = pool
        .filter(item => {
            const key = item.title.toLowerCase().replace(/\s+/g, '').substring(0, 35);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
        .slice(0, 50);
    console.log(`   → 중복 제거 후: ${unique.length}개`);

    // ── 4단계: 번역 & 저장 ────────────────────────────────────
    console.log('\n[2단계] 번역 & 최종 필터링');
    const newsData = [];

    for (const item of unique) {
        if (!isReal(item.title, 6)) continue;
        if (!isReal(item.desc, 10)) {
            console.log(`   🚫 설명 없음: ${item.title.substring(0, 40)}`);
            continue;
        }

        const tag = isAiMusicRelated(item.title) ? '🎵' : '📰';
        console.log(`   ${tag} 번역: ${item.title.substring(0, 55)}...`);

        const translatedTitle = await translateText(item.title);
        const translatedDesc  = await translateText(item.desc);

        if (!isReal(translatedTitle, 6) || !isReal(translatedDesc, 10)) continue;

        // 원본 영문 제목 끝 " - 출처이름" 추출 (예: "Suno raises $125M - TechCrunch" → "TechCrunch")
        const rawSource = item.title.match(/[-–]\s*([^-–]+?)\s*$/)?.[1]?.trim() || 'Global';

        newsData.push({
            title:  translatedTitle,
            desc:   translatedDesc,
            link:   item.link,
            source: rawSource,
            date:   item.pubDate
                ? new Date(item.pubDate).toLocaleDateString('ko-KR')
                : '날짜 미상',
        });
    }

    const clean = newsData.filter(n =>
        isReal(n.title, 6) && isReal(n.desc, 10) && n.link.startsWith('http')
    );

    fs.writeFileSync(__dirname + '/public/news-data.json', JSON.stringify(clean, null, 2));
    console.log('\n' + '━'.repeat(60));
    console.log(`✅ 저장 완료: ${clean.length}개 → public/news-data.json`);
    console.log('━'.repeat(60));
}

fetchAndSave();
