'use strict';

function refreshAuctions() {
  const q = (document.getElementById('searchQ') || {}).value || '';
  const area = (document.getElementById('searchArea') || {}).value || '';
  loadListings({ kind: 'AUCTION', q, area, gridId: 'auctionGrid', limit: 100 });
}

refreshAuctions();

const searchBar = document.getElementById('searchBar');
if (searchBar) {
  searchBar.addEventListener('submit', (e) => {
    e.preventDefault();
    refreshAuctions();
  });
}
