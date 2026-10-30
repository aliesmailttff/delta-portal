// sw.js — v2: الصفحات network-first (التحديثات توصل فوراً) والأصول الثابتة cache-first
const CACHE = 'delta-portal-v3';
const CORE = ['./', './index.html', './manifest.json', './css/app.css', './js/app.js', './icon-192.png', './icon-512.png'];
const API_HOSTS = ['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com',
  'firebasestorage.googleapis.com','www.googleapis.com','firebaseinstallations.googleapis.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(CORE.map(u => c.add(u)))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (API_HOSTS.includes(url.hostname)) return;              // بيانات Firebase دايماً من الشبكة
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('.html') || (url.origin === self.location.origin && /\.(js|css)$/.test(url.pathname)) ||
                url.pathname.endsWith('firebase-config.js') || url.pathname.endsWith('manifest.json');
  if (fresh) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => caches.match(req).then(m => m || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(m => m || fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
