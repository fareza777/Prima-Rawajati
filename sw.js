// PRIMA Service Worker – v2 (Royal Government Theme)
// Strategy: network-first for app shell (HTML/CSS/JS), cache-first for static assets (fonts, leaflet).
const CACHE = 'prima-v4.12.3';
const NETWORK_FIRST = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/ai.js',
  './js/chatbot.js',
  './js/analytics.js',
  './js/app.js',
  './js/push.js',
  './js/announcement-import.js',
  './js/publish-flow.js',
  './lib/announcement.mjs',
  './lib/publish-flow.mjs'
];
const CACHE_FIRST = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://unpkg.com/leaflet',
  'https://unpkg.com/lucide',
  'https://cdnjs.cloudflare.com'
];

// On install: pre-cache shell, take over immediately
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(NETWORK_FIRST)).catch(() => {})
  );
  self.skipWaiting();
});

// On activate: wipe old caches so users always get the new version after SW update
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Never cache API endpoints (chat proxy must always be live)
  if (url.includes('/api/')) return;

  // Cache-first for third-party static assets
  if (CACHE_FIRST.some(prefix => url.startsWith(prefix))) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // Network-first for everything else (app shell) → always fresh when online
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && new URL(url).origin === self.location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Allow page to force-skip-waiting via postMessage
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const safeUrl = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')
    ? data.url
    : '/?s=info';
  event.waitUntil(self.registration.showNotification(data.title || 'PRIMA Rawajati', {
    body: data.body || 'Ada informasi terbaru untuk warga.',
    icon: '/img/icons/icon-192.png',
    badge: '/img/icons/icon-192.png',
    tag: data.tag || 'prima-info',
    renotify: false,
    data: { url: safeUrl }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification?.data?.url || '/?s=info';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
