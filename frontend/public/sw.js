const CACHE_NAME = 'mahjong-pwa-v3';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/audio/bgm.mp3',
  '/audio/chow.mp3',
  '/audio/discard.mp3',
  '/audio/draw.mp3',
  '/audio/kong.mp3',
  '/audio/pong.mp3',
  '/audio/tingpai.mp3',
  '/audio/win.mp3',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

// Cache-first for hashed static assets (JS/CSS with content hash in filename)
const STATIC_CACHE_PATTERN = /\/assets\/[a-zA-Z0-9_-]+\.[a-f0-9]{8}\.\w+$/;

// Cache-first for static media (audio, icons) - immutable content
const MEDIA_CACHE_PATTERN = /^\/(audio|icons)\//;

// Network-first for HTML pages and API routes
const NETWORK_FIRST_PATTERN = /\/(index\.html)?$/;

// Install - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy:
// - Socket.IO: skip entirely (real-time data, not cacheable)
// - Hashed static assets (JS/CSS): cache-first (immutable content)
// - HTML pages: network-first with cache fallback
// - Other assets (images, fonts): stale-while-revalidate
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip socket.io and non-http requests
  if (url.pathname.startsWith('/socket.io/')) return;
  if (!url.protocol.startsWith('http')) return;

  // Cache-first for hashed static assets and static media
  if (STATIC_CACHE_PATTERN.test(url.pathname) || MEDIA_CACHE_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML navigation
  if (event.request.mode === 'navigate' || NETWORK_FIRST_PATTERN.test(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Stale-while-revalidate for other assets (SVG icons, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
