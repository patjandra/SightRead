// Lets SightRead load with no network by keeping its own static files.
//
// Only this app's public build output is stored here: hashed bundles under
// /assets/, the MediaPipe files, and the HTML shell. API traffic (/api/*),
// anything that isn't a GET, and other origins are never touched, so no
// account data ever passes through this cache.
//
// Bump CACHE when the un-hashed files (mediapipe-wasm/, icons) change; old
// caches are deleted on activate.
const CACHE = "sightread-shell-v2";
const SHELL = "/index.html";
const NAV_TIMEOUT_MS = 5000;

/** How to answer a request: "navigation", "cache-first", or null (leave it alone). */
function strategyFor(url, method, mode, origin) {
  if (method !== "GET") return null;
  const u = new URL(url);
  if (u.origin !== origin) return null;
  if (u.pathname.startsWith("/api/")) return null;
  if (mode === "navigate") return "navigation";
  if (
    u.pathname.startsWith("/assets/") ||
    u.pathname.startsWith("/mediapipe-wasm/") ||
    u.pathname.startsWith("/mediapipe-models/")
  ) {
    return "cache-first";
  }
  if (/^\/(favicon-\d+|apple-touch-icon|sight-read-logo)\.png$/.test(u.pathname)) return "cache-first";
  return null;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function navigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { signal: AbortSignal.timeout(NAV_TIMEOUT_MS) });
    // Every route serves the same SPA shell; keep the latest copy.
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      cache.put(SHELL, res.clone());
    }
    return res;
  } catch (err) {
    const shell = await cache.match(SHELL);
    if (shell) return shell;
    throw err;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    // Best effort: with no network yet, the shell is stored on the first navigation instead.
    caches.open(CACHE).then((cache) => cache.add(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const strategy = strategyFor(request.url, request.method, request.mode, self.location.origin);
  if (strategy === "navigation") event.respondWith(navigation(request));
  else if (strategy === "cache-first") event.respondWith(cacheFirst(request));
});

// The page that registered us loaded its files before we controlled it; it
// sends their URLs so the first offline reload already works.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of event.data.urls) {
        if (strategyFor(url, "GET", "no-cors", self.location.origin) !== "cache-first") continue;
        if (await cache.match(url)) continue;
        try {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
        } catch {
          // Best effort; it will be cached the next time it is requested.
        }
      }
    })()
  );
});
