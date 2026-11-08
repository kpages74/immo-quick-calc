// Service Worker: Offline-Nutzung. Bei jeder Änderung der Dateien die Version erhöhen,
// damit alte Caches entfernt und die neuen Dateien geladen werden.
const CACHE_VERSION = 'v4';
const CACHE_NAME = `immo-quick-calc-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './calc.js',
  './manifest.webmanifest',
  './icons/logo.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('immo-quick-calc-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Netzwerk zuerst (Aktualität), bei Fehler der Cache (Offline).
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
