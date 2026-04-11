// 앱 설치 조건을 통과하기 위한 초경량 서비스 워커
self.addEventListener('install', (e) => {
    console.log('[RAM App] 설치 완료!');
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    // 일단 모든 요청은 원래대로 통과시킵니다 (에러 방지)
    return;
});
