const CACHE_NAME = 'beisia-work-records-v19';
const APP_FILES = [
  './',
  './index.html',
  './account.html',
  './account.js',
  './access-control.js',
  './cloud-config.js',
  './purchase.html',
  './integration-guide.html',
  './user-manual.html',
  './manifest.webmanifest',
  './terms.html',
  './privacy.html',
  './legal-notice.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const networkResponse = fetch(event.request).then((response) => {
    if (response.ok) {
      const responseToCache = response.clone();
      caches.open(CACHE_NAME)
        .then((cache) => cache.put(event.request, responseToCache))
        .catch((error) => console.warn('キャッシュの更新に失敗しました。', error));
    }
    return response;
  });

  event.waitUntil(networkResponse.catch((error) => {
    console.warn('バックグラウンド更新に失敗しました。', error);
  }));
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => cachedResponse || networkResponse)
  );
});