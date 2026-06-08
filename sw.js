// PRIMA Service Worker – v2 (Royal Government Theme)
// Strategy: network-first for app shell (HTML/CSS/JS), cache-first for static assets (fonts, leaflet).
const CACHE = 'prima-v4.10.19';
const NETWORK_FIRST = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/ai.js',
  './js/chatbot.js',
  './js/analytics.js',
  './js/app.js'
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
