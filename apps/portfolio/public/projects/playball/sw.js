const CACHE = 'playball-v2';
const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icon.svg',
  './css/styles.css',
  './js/auth.js',
  './js/store.js',
  './js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never intercept Spotify, Firebase, or GitHub API traffic
  if (['api.spotify.com', 'accounts.spotify.com', 'sdk.scdn.co',
       'api.github.com', 'raw.githubusercontent.com',
       'firestore.googleapis.com', 'identitytoolkit.googleapis.com',
       'securetoken.googleapis.com', 'www.googleapis.com', 'apis.google.com',
       'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return;

  // Same-origin: network-first so deploys show up immediately; cache fallback offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Cross-origin (CDN assets, album art): cache-first.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
