// Nano Studio service worker: makes the page itself open with no connection.
// (The model is Chrome's own and is already offline — this covers the app shell and fonts.)
//
// Strategy
//   - app files, hosted:    serve from cache instantly, refresh in the background,
//                           and tell the page when a newer version has arrived
//   - app files, localhost: network first, so local edits show up on reload
//   - Google Fonts:         CSS stale-while-revalidate, font files cache-first
const VERSION = 'v1';
const SHELL = `nano-shell-${VERSION}`;
const FONTS = `nano-fonts-${VERSION}`;
const SHELL_FILES = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function notifyUpdate() {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) client.postMessage({ type: 'update-ready' });
}

// Fetch a fresh copy, store it, and report whether it differs from what was cached.
async function refresh(cache, request, cached) {
  // A navigation request can't be re-issued with new options, so rebuild it from its URL.
  const fresh = await fetch(request.mode === 'navigate' ? new Request(request.url, { cache: 'no-cache' }) : request);
  if (!fresh || !(fresh.ok || fresh.type === 'opaque')) return fresh;
  let changed = false;
  if (cached && fresh.ok && request.mode === 'navigate') {
    const [before, after] = await Promise.all([cached.clone().text(), fresh.clone().text()]);
    changed = before !== after;
  }
  await cache.put(request, fresh.clone());
  if (changed) notifyUpdate();
  return fresh;
}

// Any navigation inside the app (./, index.html, ?query) is the same single page.
async function lookup(cache, request) {
  const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  return hit || (request.mode === 'navigate' ? cache.match('./') : undefined);
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await lookup(cache, event.request);
  const update = refresh(cache, event.request, cached).catch(() => null);
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  return (await update) || Response.error();
}

async function networkFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(event.request);
    if (fresh.ok) cache.put(event.request, fresh.clone());
    return fresh;
  } catch (_) {
    return (await lookup(cache, event.request)) || Response.error();
  }
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const fresh = await fetch(event.request);
  if (fresh.ok || fresh.type === 'opaque') cache.put(event.request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(DEV ? networkFirst(event, SHELL) : staleWhileRevalidate(event, SHELL));
  } else if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event, FONTS));
  } else if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(event, FONTS));
  }
});
