const CACHE_NAME = 'beisia-work-records-v16';
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
  event.respondWith(
    fetch(event.request)
      .then((response) => response)
      .catch(() => caches.match(event.request))
  );
});