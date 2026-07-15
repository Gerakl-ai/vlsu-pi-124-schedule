const CACHE_NAME = "lad-pi-124-v34";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/images/hero-obsidian-campus.jpg",
  "/images/hero-porcelain-campus.jpg"
];

async function discoverBuildAssets() {
  try {
    const response = await fetch("/index.html", { cache: "no-store" });
    const html = await response.text();
    const matches = [...html.matchAll(/(?:src|href)="([^"]+)"/g)];
    const directAssets = matches
      .map((match) => match[1])
      .filter((url) => url.startsWith("/assets/") || url.startsWith("assets/"))
      .map((url) => (url.startsWith("/") ? url : `/${url}`));
    const nestedAssets = await Promise.all(directAssets.filter((url) => url.endsWith(".js")).map(async (asset) => {
      try {
        const script = await (await fetch(asset, { cache: "no-store" })).text();
        return [...script.matchAll(/["'(]((?:\/?assets\/|\.\.?\/)[^"'()\s]+\.(?:js|css|png|jpg|jpeg|webp|svg))/g)]
          .map((match) => new URL(match[1], new URL(asset, self.location.origin)).pathname);
      } catch {
        return [];
      }
    }));
    return [...new Set([...directAssets, ...nestedAssets.flat()])];
  } catch {
    return [];
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const buildAssets = await discoverBuildAssets();
      await cache.addAll([...APP_SHELL, ...buildAssets]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      ),
      self.registration.navigationPreload?.enable?.() ?? Promise.resolve()
    ])
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/vlsu-api/")) return;
  if (url.pathname.startsWith("/app-api/")) return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          const response = preloaded || await fetch(request, { cache: "no-store" });
          if (!response.ok) throw new Error(`Navigation failed with ${response.status}`);
          const cache = await caches.open(CACHE_NAME);
          await cache.put("/index.html", response.clone());
          return response;
        } catch {
          return (await caches.match("/index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (requestMatch) => {
      const cached = requestMatch || await caches.match(url.pathname);
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, clone)));
          }
          return response;
        })
        .catch(() => cached || new Response("", { status: 504, statusText: "Offline" }));

      if (cached) {
        event.waitUntil(fresh.catch(() => undefined));
        return cached;
      }

      return fresh;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "schedule-notification") return;
  const { title, body, tag } = event.data.payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: "/" }
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "Лад · ПИ-124", body: "Проверьте ближайшую пару.", tag: "lad-schedule-push", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) return existing.focus();
      if (self.clients.openWindow) return self.clients.openWindow(event.notification.data?.url || "/");
      return undefined;
    })
  );
});
