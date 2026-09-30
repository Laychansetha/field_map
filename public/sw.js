const CACHE_NAME = 'ibis-field-navigator-v53';

const PRECACHE_URLS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './vendor/leaflet.js',
  './vendor/leaflet.css',
  './vendor/images/marker-icon.png',
  './vendor/images/marker-icon-2x.png',
  './vendor/images/marker-shadow.png',
  './vendor/images/layers.png',
  './vendor/images/layers-2x.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png',
  './data/index.json',
  './data/plots.geojson'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline assets & plots data...');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Dynamic backend API calls: always bypass service worker cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For origin assets
  if (url.origin === location.origin) {
    // App shell files: Network First with cache fallback (ensures immediate visibility of updates)
    const isAppShell = url.pathname === '/' ||
                       url.pathname.endsWith('.html') ||
                       url.pathname.endsWith('.js') ||
                       url.pathname.endsWith('.css');

    if (isAppShell) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => caches.match(event.request))
      );
      return;
    }

    // Static data / images / vendor files: Cache First with network fallback
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // External tile maps (ESRI/OSM): Network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

