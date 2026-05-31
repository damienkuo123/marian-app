// sw.js (完美過件版)
self.addEventListener('install', (e) => {
    self.skipWaiting(); // 強制立即接管
    console.log('[Service Worker] Installed');
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Activated');
});

// Chrome 嚴格規定：必須有 fetch 監聽器才算合格的 PWA
self.addEventListener('fetch', (e) => {
    // 這裡我們只做最簡單的網路通行，不影響你的 GAS 運作
    e.respondWith(fetch(e.request).catch(() => {
        return new Response("請檢查網路連線");
    }));
});