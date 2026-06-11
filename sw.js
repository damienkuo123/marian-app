// sw.js (PWA + Web Push)
self.addEventListener('install', (e) => {
    self.skipWaiting(); // 強制立即接管
    console.log('[Service Worker] Installed');
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Activated');
    e.waitUntil(self.clients.claim());
});

// Chrome 嚴格規定：必須有 fetch 監聽器才算合格的 PWA
// 管理頁與入口頁必須永遠優先抓最新版，避免 adminCard / 權限切換被舊 HTML 或舊 API layer 卡住。
const TAPPIE_NO_CACHE_PATHS = [
    '/admin.html',
    '/tap.html',
    '/console.html',
    '/station.html',
    '/tappie-api.js'
];

function shouldBypassRuntimeCache(requestUrl) {
    const url = new URL(requestUrl);
    return TAPPIE_NO_CACHE_PATHS.some(path => url.pathname.endsWith(path));
}

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    if (shouldBypassRuntimeCache(e.request.url)) {
        e.respondWith(
            fetch(new Request(e.request, { cache: 'no-store' }))
                .catch(() => fetch(e.request))
                .catch(() => new Response("請檢查網路連線"))
        );
        return;
    }

    // 其他資源維持原本網路通行，避免影響 GAS / Supabase / Web Push。
    e.respondWith(fetch(e.request).catch(() => {
        return new Response("請檢查網路連線");
    }));
});

self.addEventListener('push', (event) => {
    let payload = {};

    try {
        payload = event.data ? event.data.json() : {};
    } catch (err) {
        payload = { title: 'Tappie 通知', body: event.data ? event.data.text() : '您有一則新的通知。' };
    }

    const title = payload.title || 'Tappie 通知';
    const options = {
        body: payload.body || '您有一則新的通知。',
        icon: payload.icon || '/assets/app-icon.png',
        badge: payload.badge || '/assets/app-icon.png',
        data: {
            url: payload.url || payload.clickUrl || '/',
            ...(payload.data || {})
        },
        tag: payload.tag || 'tappie-notification',
        renotify: true
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification?.data?.url || '/';

    event.waitUntil((async () => {
        const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const absoluteTarget = new URL(targetUrl, self.location.origin).href;

        for (const client of allClients) {
            if (client.url === absoluteTarget && 'focus' in client) return client.focus();
        }

        if (clients.openWindow) return clients.openWindow(absoluteTarget);
    })());
});
