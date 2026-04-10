const CACHE_NAME = "fitness-tracker-v6";

const APP_SHELL = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/training.html",
  "/training-session.html",
  "/training-start-list.html",
  "/training-history.html",
  "/training-planning.html",
  "/personal-data.html",
  "/weekly-report.html",
  "/style.css",
  "/auth.js",
  "/config.js",
  "/dashboard.js",
  "/training-session.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-chevron.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(APP_SHELL);
      } catch (error) {
        console.error("Fehler beim Cachen der App-Shell:", error);
      }
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

function isAppCodeRequest(request) {
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return false;

  return (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".html")
  );
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return false;

  return (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".json")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);

        if (
          networkResponse &&
          networkResponse.status === 200 &&
          !networkResponse.redirected
        ) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        const cachedPage =
          await caches.match(request) ||
          await caches.match("/dashboard.html") ||
          await caches.match("/index.html");

        if (cachedPage) return cachedPage;
        throw error;
      }
    })());
    return;
  }

  if (isAppCodeRequest(request)) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);

        if (
          networkResponse &&
          networkResponse.status === 200 &&
          !networkResponse.redirected
        ) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        throw error;
      }
    })());
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith((async () => {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      const networkResponse = await fetch(request);

      if (
        networkResponse &&
        networkResponse.status === 200 &&
        !networkResponse.redirected
      ) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      }

      return networkResponse;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch (error) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;
      throw error;
    }
  })());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title || "Neue Nachricht", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: {
        url: data.url || "/dashboard.html",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/dashboard.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});