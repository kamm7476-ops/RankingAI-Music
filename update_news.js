const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
// 설정
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
// ① 핵심 검증 유틸 — 진짜 내용인지 판별
//    trim()만으로는 못 잡는 유니코드 공백·HTML 잔여물까지 제거 후 판단
// ═══════════════════════════════════════════════════════════════
function cleanText(str) {
    if (!str) return '';
    return str
        .replace(/<[^>]*>/g, '')           // HTML 태그 제거
        .replace(/&[a-z#0-9]+;/gi, ' ')    // HTML 엔티티 → 공백
        .replace(/[ ​‌‍﻿]/g, ' ') // 유니코드 공백 → 공백
        .replace(/\s+/g, ' ')
        .trim();
}

function isReal(str, minLen = 4) {
    const c = cleanText(str);
    if (c.length < minLen) return false;
    // 의미 있는 글자(한글·영문·숫자)가 최소 1자 이상
    return /[a-zA-Z가-힣0-9]/.test(c);
}

// ═══════════════════════════════════════════════════════════════
// Google 번역 유틸
// ═══════════════════════════════════════════════════════════════
async function translateText(raw) {
    const text = cleanText(raw);
    if (!isReal(text)) return '';
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
        const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        const result = data[0].map(x => x[0]).join('');
        return cleanText(result); // 번역 결과도 클린 처리
    } catch {
        return text; // 번역 실패 → 원문 반환
    }
}

// ═══════════════════════════════════════════════════════════════
// RSS XML 파서
// ═══════════════════════════════════════════════════════════════
function parseRssItems(xmlText) {
    const items = [];
    const matched = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const raw of matched) {
        // 제목 — HTML 태그·엔티티까지 완전 제거 후 검증
        const rawTitle =
            raw.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
            raw.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
        const title = cleanText(rawTitle);

        // 링크
        const link = (
            raw.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
            raw.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] || ''
        ).trim();

        // 날짜
        const pubDate = raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';

        // 설명
        const rawDesc =
            raw.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
            raw.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';
        const desc = cleanText(rawDesc).substring(0, 150);

        // ── 원천 차단: 제목 또는 링크가 없으면 절대 추가하지 않음 ──
        if (!isReal(title, 6) || !link.startsWith('http')) continue;

        items.push({ title, link, pubDate, desc });
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
        if (!res.ok) { console.log(`⚠️  [${label}] HTTP ${res.status}`); return []; }
        const items = parseRssItems(await res.text());
        console.log(`   ✅ [${label}] ${items.length}개`);
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
    console.log(`📋 출처 ${DOMAINS.length}개 | 키워드: ${KEYWORD}`);
    console.log('━'.repeat(55));

    const jobs = DOMAINS.map(domain => ({
        label: domain,
        url: `https://news.google.com/rss/search?q=${encodeURIComponent(
            `(${KEYWORD}) site:${domain}`
        )}&hl=en&gl=US&ceid=US:en`,
    }));

    // ── 1단계: 병렬 수집 ──────────────────────────────────────
    console.log('\n[1단계] RSS 수집');
    const allRaw = (await Promise.all(jobs.map(j => fetchRss(j.url, j.label)))).flat();
    console.log(`   → 수집 합계: ${allRaw.length}개`);

    // ── 중복 제거 + 최신순 ────────────────────────────────────
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

    // ── 2단계: 번역 + 최종 저장 ───────────────────────────────
    console.log('\n[2단계] 번역 & 최종 필터링');
    const newsData = [];

    for (const item of unique) {

        // ── 저장 전 마지막 방어선: 제목 또는 설명이 실제 내용 없으면 저장 안 함
        if (!isReal(item.title, 6)) {
            console.log(`   🚫 스킵(제목 불량): "${item.title.substring(0, 30)}"`);
            continue;
        }
        if (!isReal(item.desc, 10)) {
            console.log(`   🚫 스킵(설명 없음): "${item.title.substring(0, 30)}"`);
            continue;
        }

        console.log(`   📝 번역: ${item.title.substring(0, 50)}...`);
        const translatedTitle = await translateText(item.title);
        const translatedDesc  = await translateText(item.desc);

        // 번역 후 재검증 — 번역이 깨져서 빈 문자열이 됐을 경우 저장 안 함
        if (!isReal(translatedTitle, 6) || !isReal(translatedDesc, 10)) {
            console.log(`   🚫 스킵(번역 결과 불량)`);
            continue;
        }

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

    // ── 저장 전 최종 검증 (JSON에 빈 항목 0건 보장) ─────────
    const clean = newsData.filter(n =>
        isReal(n.title, 6) && isReal(n.desc, 10) && n.link.startsWith('http')
    );

    fs.writeFileSync('public/news-data.json', JSON.stringify(clean, null, 2));
    console.log('\n' + '━'.repeat(55));
    console.log(`✅ 저장 완료: ${clean.length}개 → public/news-data.json`);
    console.log('━'.repeat(55));
}

fetchAndSave();
