'use strict';

let currentCategory = null;

function currentFilters() {
  return {
    category: currentCategory,
    q: (document.getElementById('searchQ') || {}).value || '',
    area: (document.getElementById('searchArea') || {}).value || '',
  };
}

function refreshHome() {
  const f = currentFilters();
  loadListings({ kind: 'FIXED', category: f.category, q: f.q, area: f.area, gridId: 'fixedGrid', limit: 12 });
  loadListings({ kind: 'AUCTION', category: f.category, q: f.q, area: f.area, gridId: 'auctionGrid', limit: 8 });
}

renderCategoryFilter('cats').then(() => {
  const catsEl = document.getElementById('cats');
  if (catsEl) {
    catsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      currentCategory = btn.dataset.cat || null;
      refreshHome();
    });
  }
});

refreshHome();
loadAdBanner('adBanner', 'home_banner');

// Small animated promo strip above the ad banner -- cycles through a few
// calls-to-action ("start selling now", "start earning online"...) with a
// gentle fade, in the site's own brand colors. Pure CSS/JS, no images.
(function runPromoBanner() {
  const el = document.getElementById('promoText');
  if (!el) return;
  const messages = [
    '🚀 ابدأ الآن ببيع منتجاتك على سوق الجمعة',
    '💰 ابدأ الآن بالكسب أونلاين من غرفتك',
    '📢 انشر إعلانك بثواني ووصّل لآلاف المشترين',
    '⏱️ جرب المزاد وبيع غراضك بأحسن سعر',
  ];
  let i = 0;
  function show(idx) {
    el.classList.remove('is-in');
    setTimeout(() => {
      el.textContent = messages[idx];
      requestAnimationFrame(() => el.classList.add('is-in'));
    }, 250);
  }
  show(i);
  setInterval(() => {
    i = (i + 1) % messages.length;
    show(i);
  }, 3800);
})();

const searchBar = document.getElementById('searchBar');
if (searchBar) {
  searchBar.addEventListener('submit', (e) => {
    e.preventDefault();
    refreshHome();
  });
}
