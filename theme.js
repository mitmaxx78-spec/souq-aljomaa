'use strict';
// Runs synchronously, before the stylesheet paints, so there's no flash of
// the wrong theme. Explicit choice (localStorage) wins; otherwise we follow
// the device's own light/dark setting.
(function () {
  try {
    var saved = localStorage.getItem('souq_theme');
    var theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

function wireThemeToggle(btnId) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  function paint() {
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.textContent = cur === 'light' ? '🌙' : '☀️';
    btn.setAttribute('aria-label', cur === 'light' ? 'الوضع الليلي' : 'الوضع النهاري');
  }
  btn.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('souq_theme', next); } catch (e) {}
    paint();
  });
  paint();
}
