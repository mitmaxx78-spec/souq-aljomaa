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

const searchBar = document.getElementById('searchBar');
if (searchBar) {
  searchBar.addEventListener('submit', (e) => {
    e.preventDefault();
    refreshHome();
  });
}
