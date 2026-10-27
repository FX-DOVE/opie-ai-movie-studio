// ReelForge tunnel helper: the free tunnel's browser-warning cookie lasts only ~10 minutes; after that every
// request (JS chunks, API calls, images) gets an HTML warning page instead. Tag every same-origin GET so the
// tunnel always passes it straight through. Non-GET requests are tagged by the page's fetch/XHR patch.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const r = e.request;
  // never touch navigations (a followed redirect served for a navigation is a network error) or non-tunnel hosts
  if (r.mode === "navigate" || !self.location.hostname.includes("pinggy")) return;
  if (r.method !== "GET" || new URL(r.url).origin !== self.location.origin) return;
  const h = new Headers(r.headers); h.set("X-Pinggy-No-Screen", "1");
  e.respondWith(fetch(r.url, { method: "GET", headers: h, credentials: "include", cache: r.cache === "only-if-cached" ? "default" : r.cache, redirect: "follow", signal: r.signal }).catch(() => fetch(r)));
});
