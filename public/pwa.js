'use strict';
// Registers the service worker and always shows an "install app" button.
// - Android/Chrome/Edge: the browser's native install prompt fires
//   (beforeinstallprompt); we just trigger it.
// - iOS Safari: there is no install-prompt API at all, so we show a small
//   instructions card walking through Share -> "Add to Home Screen".
// - Already installed (running standalone): the button hides itself.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  function instructionsHtml() {
    if (isIOS()) {
      return `
        <h3>📲 نزّل التطبيق على آيفون</h3>
        <ol>
          <li>دوس على زر المشاركة <b>⬆️ Share</b> تحت (أو فوق) بمتصفح Safari</li>
          <li>مرّر تحت ودوس <b>"إضافة إلى الشاشة الرئيسية"</b> / <b>"Add to Home Screen"</b></li>
          <li>دوس <b>"إضافة"</b> / <b>"Add"</b> فوق يمين</li>
        </ol>
        <p class="sub">وبتصير أيقونة الموقع على شاشة هاتفك متل تطبيق عادي.</p>`;
    }
    if (/android/i.test(navigator.userAgent)) {
      return `
        <h3>📲 نزّل التطبيق</h3>
        <ol>
          <li>دوس على النقاط الثلاث <b>⋮</b> فوق يمين المتصفح</li>
          <li>دوس <b>"تثبيت التطبيق"</b> / <b>"Install app"</b> أو <b>"إضافة إلى الشاشة الرئيسية"</b></li>
        </ol>
        <p class="sub">وبتصير أيقونة الموقع على شاشة هاتفك متل تطبيق عادي.</p>`;
    }
    return `
      <h3>📲 نزّل التطبيق</h3>
      <ol>
        <li>دوس على أيقونة التثبيت ⊕ بشريط العنوان (يمين مكان كتابة الرابط)</li>
        <li>أو من قائمة المتصفح (⋮) دوس <b>"تثبيت..."</b> / <b>"Install..."</b></li>
      </ol>
      <p class="sub">وبيصير الموقع فاتح بنافذته الخاصة متل برنامج عادي.</p>`;
  }

  function showInstructions() {
    if (document.getElementById('pwaIosSheet')) return;
    const sheet = document.createElement('div');
    sheet.id = 'pwaIosSheet';
    sheet.className = 'pwa-sheet';
    sheet.innerHTML = `
      <div class="pwa-sheet-card">
        <button class="pwa-sheet-close" type="button" aria-label="سكر">✕</button>
        ${instructionsHtml()}
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector('.pwa-sheet-close').addEventListener('click', () => sheet.remove());
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.remove(); });
  }

  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('installApp');
    if (!btn) return;

    if (isStandalone()) {
      btn.style.display = 'none';
      return;
    }
    // Always visible (not just after beforeinstallprompt) so iOS users see
    // it too -- Safari never fires that event.
    btn.style.display = 'inline-flex';

    btn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        btn.style.display = 'none';
        return;
      }
      showInstructions();
    });
  });
})();
