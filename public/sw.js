const CACHE_NAME = "pi-124-schedule-v3";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg"];

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
  if (new URL(request.url).pathname.startsWith("/vlsu-api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("/index.html");
        return new Response("", { status: 504, statusText: "Offline" });
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
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
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
