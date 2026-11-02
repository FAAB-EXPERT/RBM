const CACHE_NAME = 'faab-gar-pwa-cache-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './faab-gar-logo.svg',
  './logo.png',
  './favicon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CLEAR_AND_UPDATE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ne jamais intercepter l'endpoint local de sauvegarde ni les requêtes d'authentification Firebase/Google
  if (
    url.pathname.includes('__faab_save_export') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('identitytoolkit')
  ) {
    return;
  }

  // Stratégie Network-First avec repli sur le cache pour garantir que l'application est toujours à jour en ligne tout en fonctionnant hors-ligne
  event.respondWith(
    fetch(req)
      .then(networkRes => {
        if (
          networkRes &&
          networkRes.status === 200 &&
          (networkRes.type === 'basic' || networkRes.type === 'cors') &&
          url.origin === self.location.origin
        ) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, clone).catch(() => {});
          });
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(req).then(cached => {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./');
          }
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
  );
});
