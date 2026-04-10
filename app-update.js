if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            window.location.reload();
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!window.__swReloaded) {
          window.__swReloaded = true;
          window.location.reload();
        }
      });
    } catch (error) {
      console.error('Service Worker Update Fehler:', error);
    }
  });
}