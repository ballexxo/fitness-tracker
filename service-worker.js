const CACHE_NAME = "fitness-tracker-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/auth.js",
  "/config.js",
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

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          const clonedResponse = networkResponse.clone();

          if (
            request.url.startsWith(self.location.origin) &&
            networkResponse.status === 200
          ) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }

          return networkResponse;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
    })
  );
});