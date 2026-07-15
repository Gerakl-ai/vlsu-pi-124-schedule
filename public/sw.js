const CACHE_NAME = "lad-pi-124-v27";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/images/hero-obsidian-campus.jpg"
];

async function discoverBuildAssets() {
  try {
    const response = await fetch("/index.html", { cache: "no-store" });
    const html = await response.text();
    const matches = [...html.matchAll(/(?:src|href)="([^"]+)"/g)];
    return matches
      .map((match) => match[1])
      .filter((url) => url.startsWith("/assets/") || url.startsWith("assets/"))
      .map((url) => (url.startsWith("/") ? url : `/${url}`));
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
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
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
      caches.match("/index.html").then(async (cached) => {
        const fresh = fetch(request, { cache: "no-store" }).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone)));
          }
          return response;
        });

        if (cached) {
          event.waitUntil(fresh.catch(() => undefined));
          return cached;
        }

        return fresh.catch(async () => (await caches.match("/index.html")) || Response.error());
      })
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
