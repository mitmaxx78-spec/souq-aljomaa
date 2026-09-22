'use strict';
// Registers the service worker and shows a simple "install app" button
// when the browser supports it (Android/Chrome/Edge). iOS Safari has no
// install prompt API — users add via Share > "Add to Home Screen" instead.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('installApp');
    if (btn) btn.style.display = 'inline-flex';
  });

  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('installApp');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.style.display = 'none';
    });
  });
})();
