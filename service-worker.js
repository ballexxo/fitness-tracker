const CACHE_NAME = "fitness-tracker-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/style.css",
  "/auth.js",
  "/config.js",
  "/dashboard.js",
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
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  event.respondWith((async () => {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const networkResponse = await fetch(request);

      if (
        request.url.startsWith(self.location.origin) &&
        networkResponse &&
        networkResponse.status === 200 &&
        !networkResponse.redirected
      ) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }

      return networkResponse;
    } catch (error) {
      if (request.mode === "navigate") {
        const fallback = await caches.match("/dashboard.html");
        if (fallback) return fallback;

        const indexFallback = await caches.match("/index.html");
        if (indexFallback) return indexFallback;
      }

      throw error;
    }
  })());
});

self.addEventListener("push", event => {
  const data = event.data.json();

  self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon.png",
    data: {
      url: data.url
    }
  });
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
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
