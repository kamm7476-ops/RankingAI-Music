const fs = require('fs');

async function translateText(text) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        return data[0].map(x => x[0]).join('');
    } catch (e) { return text; }
}

async function fetchAndSave() {
    console.log("🚀 미국 구글 뉴스 수집 시작...");
    const query = encodeURIComponent('"AI Music" OR "Suno AI" OR "Udio"');
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en&gl=US&ceid=US:en`;
    
    try {
        const response = await fetch(rssUrl);
        const xmlText = await response.text();
        
        const items = xmlText.match(/<item>([\s\S]*?)<\/item>/g).slice(0, 30);
        const newsData = [];

        for (const item of items) {
            const title = item.match(/<title>(.*?)<\/title>/)?.[1] || "";
            const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
            const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
            const desc = item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
            const pureDesc = desc.replace(/<[^>]*>?/gm, '').substring(0, 100);

            console.log(`📝 번역 중: ${title.substring(0, 20)}...`);
            const translatedTitle = await translateText(title);
            const translatedDesc = await translateText(pureDesc);

            newsData.push({
                title: translatedTitle,
                desc: translatedDesc,
                link: link,
                date: new Date(pubDate).toLocaleDateString('ko-KR')
            });
        }

        // 👇 여기가 핵심입니다! public 폴더 안으로 저장 위치를 바꿨습니다!
        fs.writeFileSync('public/news-data.json', JSON.stringify(newsData, null, 2));
        console.log("✅ public/news-data.json 저장 완료!");
    } catch (error) {
        console.error("❌ 에러 발생:", error);
    }
}

fetchAndSave();