const CACHE = 'cahier-v8';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/app.js?v=13',
  './js/db.js?v=10',
  './js/app.js',
  './js/db.js',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      if (request.mode === 'navigate') {
        const indexUrl = new URL('./index.html', self.location).href;
        const rootUrl = new URL('./', self.location).href;
        return (await cache.match(indexUrl)) || (await cache.match(rootUrl)) || (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
      return Response.error();
    }
  })());
});
