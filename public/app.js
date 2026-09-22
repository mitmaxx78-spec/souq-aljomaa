'use strict';

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function formatMoney(minor, currency) {
  const n = Number(minor || 0);
  return n.toLocaleString('ar-SY') + ' ' + (currency === 'SYP' || !currency ? 'ل.س' : currency);
}

function timeLeft(endsAtIso) {
  const ms = new Date(endsAtIso).getTime() - Date.now();
  if (ms <= 0) return 'خلص المزاد';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 24) return `${Math.floor(h / 24)} يوم و ${h % 24} ساعة`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function fetchCategories() {
  const res = await fetch('/api/listings/categories');
  const data = await res.json();
  return data.categories || [];
}

function cardHtml(item) {
  const isAuction = item.kind === 'AUCTION';
  const isJob = item.category === 'وظائف';
  const price = isAuction
    ? formatMoney(item.current_price_minor, item.currency)
    : (item.price_minor ? formatMoney(item.price_minor, item.currency) : (isJob ? 'الراتب يذكر عند التواصل' : 'السعر عند التواصل'));
  const badge = isAuction
    ? `<span class="badge auction">مزاد · ${escapeHtml(item.bid_count || 0)} مزايدة</span>`
    : isJob ? `<span class="badge">وظيفة</span>` : `<span class="badge">سعر ثابت</span>`;
  const featured = item.is_featured ? `<span class="badge auction">⭐ مميز</span>` : '';
  return `
    <a class="card" href="/listing?id=${encodeURIComponent(item.id)}">
      <div class="thumb">${isJob ? '💼' : 'صورة'}</div>
      ${featured}${badge}
      <div class="title">${escapeHtml(item.title)}</div>
      <div class="meta">${escapeHtml(item.area)} · ${escapeHtml(item.category)}</div>
      <div class="price">${price}</div>
    </a>`;
}

async function loadAdBanner(containerId, placement) {
  // Shows ONE ad at a time (never stacked) and rotates through the rest
  // automatically, so a placement with several ads doesn't pile up as a
  // tall column of banners.
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const res = await fetch('/api/ads?placement=' + encodeURIComponent(placement || 'home_banner'));
    const data = await res.json();
    const ads = data.ads || [];
    if (!ads.length) { el.innerHTML = ''; return; }

    let i = 0;
    const render = () => {
      const ad = ads[i];
      el.innerHTML = `
        <a class="ad-banner" href="${escapeHtml(ad.target_url)}" target="_blank" rel="noopener sponsored">
          <img src="${escapeHtml(ad.image_url)}" alt="${escapeHtml(ad.title)}" loading="lazy">
        </a>`;
    };
    render();
    if (ads.length > 1) {
      setInterval(() => { i = (i + 1) % ads.length; render(); }, 6000);
    }
  } catch (err) {
    el.innerHTML = '';
  }
}

async function loadListings({ kind, category, q, area, gridId, limit }) {
  const grid = document.getElementById(gridId);
  try {
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (category) params.set('category', category);
    if (q) params.set('q', q);
    if (area) params.set('area', area);
    const res = await fetch('/api/listings?' + params.toString());
    const data = await res.json();
    let items = data.listings || [];
    if (limit) items = items.slice(0, limit);
    grid.innerHTML = items.length
      ? items.map(cardHtml).join('')
      : `<p class="empty">ما في إعلانات هلق بهالقسم.</p>`;
  } catch (err) {
    grid.innerHTML = `<p class="empty">صار خطأ بالتحميل، حدّث الصفحة.</p>`;
  }
}

const CATEGORY_ICONS = {
  'سيارات': '🚗',
  'عقارات': '🏠',
  'مزارع وأراضي': '🌾',
  'حيوانات ومواشي': '🐐',
  'أثاث': '🛋️',
  'إلكترونيات': '📱',
  'أجهزة منزلية': '🧺',
  'ملابس': '👕',
  'وظائف': '💼',
  'أخرى': '🗂️',
};

// Renders the category tiles and highlights the active one on click, but
// does not itself reload any grid -- the caller (home.js) owns that, since
// it also has to fold in whatever's in the search bar at the same time.
async function renderCategoryFilter(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.classList.add('cat-grid');
  const cats = await fetchCategories();
  el.innerHTML = ['الكل', ...cats]
    .map((c, i) => `
      <button data-cat="${i === 0 ? '' : escapeHtml(c)}" class="cat-tile ${i === 0 ? 'is-active' : ''}">
        <span class="cat-icon">${i === 0 ? '🛍️' : (CATEGORY_ICONS[c] || '🗂️')}</span>
        <span class="cat-label">${escapeHtml(c)}</span>
      </button>`)
    .join('');
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    el.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  });
}

// theme.js (loaded in <head>, before this file) defines wireThemeToggle
// globally; it no-ops on pages without a #themeToggle button.
if (typeof wireThemeToggle === 'function') wireThemeToggle('themeToggle');
