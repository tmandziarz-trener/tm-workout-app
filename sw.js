// Minimalny Service Worker — wymagany, żeby przeglądarka uznała apkę za "instalowalną" (PWA).
// Cache'ujemy tylko statyczną powłokę (HTML/CSS/JS/logo) — dane z Supabase (pomiary, treningi,
// wiadomości) muszą zawsze iść na żywo do sieci, więc nigdy ich tu nie cache'ujemy.

const CACHE_NAME = 'tmworkout-shell-v1';
const SHELL_FILES = [
  '/index.html',
  '/trener.html',
  '/style.css',
  '/exercises.js',
  '/logo.png',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nigdy nie cache'ujemy wywołań do Supabase ani innych API — zawsze świeże dane z sieci.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Tylko GET nadaje się do cache'owania.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
