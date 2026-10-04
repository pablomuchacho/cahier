const CACHE = 'cahier-v10';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=15',
  './styles.css',
  './js/app.js?v=15',
  './js/db.js?v=10',
  './js/app.js',
  './js/db.js',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) await cache.put(url, res);
          } catch (err) {
            console.warn('Cache asset failure (non-bloquant):', url, err);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // 1. Tenter le réseau pour avoir la version la plus fraîche si en ligne
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone());
          return response;
        }
      } catch {
        // Hors-ligne ou connexion coupée : bascule immédiate sur le cache local
      }

      // 2. Chercher dans le cache (correspondance exacte)
      const cached = await cache.match(request);
      if (cached) return cached;

      // 3. Chercher dans le cache en ignorant les query strings (?v=...)
      const cachedLoose = await cache.match(request, { ignoreSearch: true });
      if (cachedLoose) return cachedLoose;

      // 4. Si c'est une navigation de page et qu'on est hors-ligne
      if (request.mode === 'navigate') {
        const indexUrl = new URL('./index.html', self.location).href;
        const rootUrl = new URL('./', self.location).href;
        return (
          (await cache.match(indexUrl)) ||
          (await cache.match(rootUrl)) ||
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          Response.error()
        );
      }

      return Response.error();
    })()
  );
});
