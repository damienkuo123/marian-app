// sw.js (PWA + Web Push)
// TAPPIE_SW_CROSS_ORIGIN_BYPASS_HOTFIX_20260725
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
    '/index.html',
    '/dashboard.html',
    '/lobby.html',
    '/battle.html',
    '/arena.html',
    '/admin.html',
    '/tap.html',
    '/student-app.html',
    '/console.html',
    '/station.html',
    '/manifest.json',
    '/tappie-api.js',
    '/tappie-student-session.js'
];

function shouldBypassRuntimeCache(requestUrl) {
    const url = new URL(requestUrl);
    return TAPPIE_NO_CACHE_PATHS.some(path => url.pathname.endsWith(path));
}

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    const requestUrl = new URL(e.request.url);

    // Cross-origin requests must bypass the Service Worker completely.
    // This includes Cloudflare R2 avatar assets, jsDelivr, GAS, Supabase, etc.
    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    const offlineResponse = () => new Response("請檢查網路連線", {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
            "Content-Type": "text/plain; charset=UTF-8",
            "Cache-Control": "no-store",
            "X-Tappie-SW-Fallback": "1"
        }
    });

    if (shouldBypassRuntimeCache(e.request.url)) {
        e.respondWith(
            fetch(new Request(e.request, { cache: 'no-store' }))
                .catch(() => fetch(e.request))
                .catch(() => offlineResponse())
        );
        return;
    }

    // Same-origin resources remain network-first.
    // On true network failure return a real 503, never a fake HTTP 200.
    e.respondWith(
        fetch(e.request)
            .catch(() => offlineResponse())
    );
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
