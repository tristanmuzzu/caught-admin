// Caches the app shell so it opens instantly and offline. Never touches caught.studio requests:
// admin data is always fetched fresh and never stored.
const CACHE = "caught-admin-v2";
const SHELL = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "img/caught-mark.svg",
  "img/icon-192.png", "img/icon-512.png", "img/apple-touch-icon.png", "fonts/anton.woff2", "fonts/archivo.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  // network first so a new version shows on the next open; the cache only when offline
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
