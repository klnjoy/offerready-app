/* OfferReady service worker (hand-written, no build plugin).
 *
 *  - App shell: index.html plus the files it references are cached on install,
 *    so the app opens offline after the first visit.
 *  - /assets/* (content-hashed by Vite): cache-first; new hashes are fetched
 *    from the network and cached as they are used.
 *  - Page navigations: network-first, falling back to the cached index.html
 *    when offline (the app routes on the client).
 *  - Never cached: anything on another origin (the API on Vercel, Supabase,
 *    Stripe, fonts) and any same-origin /api/ path.
 *
 * RELEASE is replaced with the build id at build time (vite.config.ts), so a
 * new deploy changes this file, the browser installs the new worker, and the
 * app shows "Update available". The new worker waits until the user refreshes
 * (message SKIP_WAITING); old caches are deleted when it activates. */

const RELEASE = "__OR_RELEASE__";
const PREFIX = "offerready-";
const CACHE = PREFIX + RELEASE;
const SCOPE = new URL("./", self.location.href).pathname; // e.g. /offerready-app/
const INDEX = SCOPE; // the shell is stored under the scope URL
const ASSETS = SCOPE + "assets/";
const SHELL_EXTRA = ["manifest.webmanifest", "favicon.svg", "icons/icon-192.png", "apple-touch-icon.png"];
const MAX_ASSETS = 160;
const NAV_TIMEOUT_MS = 6000;

function cacheable(url) {
  if (url.origin !== self.location.origin) return false; // API, Supabase, Stripe, fonts
  if (!url.pathname.startsWith(SCOPE)) return false; // outside the app (e.g. the study site)
  if (/\/api\//.test(url.pathname)) return false; // same-origin API proxy
  return true;
}

function okToStore(res) {
  return res && res.ok && res.status === 200 && (res.type === "basic" || res.type === "default");
}

async function precacheShell() {
  const cache = await caches.open(CACHE);
  const res = await fetch(INDEX, { cache: "no-cache", credentials: "same-origin" });
  if (!okToStore(res)) throw new Error("shell fetch failed: " + res.status);
  const html = await res.clone().text();
  await cache.put(INDEX, res);
  const urls = new Set(SHELL_EXTRA.map((p) => SCOPE + p));
  const re = /\s(?:src|href)="([^"#]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], self.location.origin + INDEX);
      if (cacheable(u)) urls.add(u.pathname);
    } catch (_) { /* ignore odd urls */ }
  }
  urls.delete(INDEX);
  await Promise.allSettled([...urls].map(async (u) => {
    const r = await fetch(u, { cache: "no-cache", credentials: "same-origin" });
    if (okToStore(r)) await cache.put(u, r);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    // Assets the page loaded before this worker took control (first visit).
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(data.urls.slice(0, 80).map(async (raw) => {
        const u = new URL(raw, self.location.origin);
        if (!cacheable(u) || !u.pathname.startsWith(ASSETS)) return;
        if (await cache.match(u.pathname)) return;
        const r = await fetch(u.pathname, { credentials: "same-origin" });
        if (okToStore(r)) await cache.put(u.pathname, r);
      }));
    })());
  }
});

async function trimAssets(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((k) => new URL(k.url).pathname.startsWith(ASSETS));
  for (let i = 0; i < assets.length - MAX_ASSETS; i++) await cache.delete(assets[i]);
}

async function assetFirst(request, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url.pathname);
  if (hit) return hit;
  const res = await fetch(request);
  if (okToStore(res)) {
    await cache.put(url.pathname, res.clone());
    trimAssets(cache);
  }
  return res;
}

async function navigation(request) {
  const cache = await caches.open(CACHE);
  const net = fetch(request);
  let res;
  try {
    res = await Promise.race([
      net,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS)),
    ]);
  } catch (_) {
    // Offline or very slow: serve the cached shell if there is one.
    const shell = await cache.match(INDEX);
    if (shell) {
      net.catch(() => {});
      return shell;
    }
    try { res = await net; } catch (_) { res = null; }
  }
  if (res) {
    // Keep the shell fresh whenever the app root itself loads.
    const path = new URL(request.url).pathname;
    if (okToStore(res) && (path === INDEX || path === INDEX + "index.html")) await cache.put(INDEX, res.clone());
    return res;
  }
  {
    return new Response("<!doctype html><meta charset=utf-8><title>Offline</title><p style=\"font:16px system-ui;padding:24px\">You're offline and OfferReady hasn't been saved on this device yet. Connect and reload.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function shellFile(request, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url.pathname);
  const update = fetch(request).then(async (res) => {
    if (okToStore(res)) await cache.put(url.pathname, res.clone());
    return res;
  });
  if (hit) {
    update.catch(() => {});
    return hit;
  }
  return update;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!cacheable(url)) return; // the browser handles it; nothing is cached
  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
    return;
  }
  if (url.pathname.startsWith(ASSETS)) {
    event.respondWith(assetFirst(request, url));
    return;
  }
  if (SHELL_EXTRA.some((p) => url.pathname === SCOPE + p)) {
    event.respondWith(shellFile(request, url));
  }
  // Everything else (e.g. other same-origin files) goes to the network as usual.
});
