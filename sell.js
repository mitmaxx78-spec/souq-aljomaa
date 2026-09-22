'use strict';

(function () {
  const form = document.getElementById('sellForm');
  const pickFixed = document.getElementById('pickFixed');
  const pickAuction = document.getElementById('pickAuction');
  const priceField = document.getElementById('priceField');
  const auctionFields = document.getElementById('auctionFields');
  const msg = document.getElementById('formMsg');
  const submitBtn = document.getElementById('submitBtn');
  let kind = 'FIXED';

  function setKind(k) {
    kind = k;
    pickFixed.classList.toggle('is-on', k === 'FIXED');
    pickAuction.classList.toggle('is-on', k === 'AUCTION');
    priceField.style.display = k === 'FIXED' ? '' : 'none';
    auctionFields.style.display = k === 'AUCTION' ? '' : 'none';
  }
  pickFixed.addEventListener('click', () => setKind('FIXED'));
  pickAuction.addEventListener('click', () => setKind('AUCTION'));

  const priceLabel = document.querySelector('label[for="priceMinor"]');
  const priceInput = document.getElementById('priceMinor');
  const defaultPriceLabel = priceLabel ? priceLabel.textContent : '';
  const defaultPricePlaceholder = priceInput ? priceInput.placeholder : '';

  fetch('/api/listings/categories')
    .then((r) => r.json())
    .then((data) => {
      const sel = document.getElementById('category');
      sel.innerHTML = (data.categories || [])
        .map((c) => `<option value="${c}">${c}</option>`)
        .join('');
      sel.addEventListener('change', () => {
        const isJob = sel.value === 'وظائف';
        if (isJob) {
          pickAuction.style.display = 'none';
          setKind('FIXED');
          if (priceLabel) priceLabel.textContent = 'الراتب (اختياري)';
          if (priceInput) priceInput.placeholder = 'مثلاً: يذكر عند التواصل';
        } else {
          pickAuction.style.display = '';
          if (priceLabel) priceLabel.textContent = defaultPriceLabel;
          if (priceInput) priceInput.placeholder = defaultPricePlaceholder;
        }
      });
    });

  function digitCount(v) {
    return String(v).replace(/\D/g, '').length;
  }

  // Pin-drop location picker (Leaflet + OpenStreetMap, self-hosted, no API
  // key or per-request cost). Entirely optional: the free-text "المنطقة"
  // field above stays the required field, this just adds precise lat/lng
  // when the seller bothers to use it.
  let pickedLat = null;
  let pickedLng = null;
  const DAMASCUS = [33.5138, 36.2765];
  let map = null;
  let marker = null;

  function ensureMap() {
    if (map) return;
    if (typeof L === 'undefined') return; // leaflet failed to load -- form still works without it
    L.Icon.Default.imagePath = '/vendor/leaflet/images/';
    map = L.map('pickMap', { zoomAnimation: false }).setView(DAMASCUS, 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);
    map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
  }

  function setPin(lat, lng) {
    pickedLat = lat;
    pickedLng = lng;
    ensureMap();
    if (!map) return;
    if (marker) marker.setLatLng([lat, lng]);
    else marker = L.marker([lat, lng], { draggable: true }).addTo(map).on('dragend', () => {
      const p = marker.getLatLng();
      pickedLat = p.lat;
      pickedLng = p.lng;
      paintCoords();
    });
    map.setView([lat, lng], 14);
    paintCoords();
  }

  function paintCoords() {
    const el = document.getElementById('mapCoords');
    if (el && pickedLat != null) {
      el.textContent = `📍 تم تحديد الموقع (${pickedLat.toFixed(4)}, ${pickedLng.toFixed(4)})`;
    }
  }

  document.getElementById('locateBtn').addEventListener('click', () => {
    ensureMap();
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPin(pos.coords.latitude, pos.coords.longitude),
      () => { /* permission denied or unavailable -- user can still click the map itself */ }
    );
  });

  // Draw the map once even before the user asks for their location, so
  // clicking straight on it to drop a pin also works.
  ensureMap();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.className = 'msg';

    const phone = document.getElementById('phone').value.trim();
    if (digitCount(phone) < 9) {
      msg.textContent = 'رقم التلفون ناقص، تأكد منه.';
      msg.className = 'msg err';
      return;
    }

    const images = document.getElementById('images').value
      .split(',').map((s) => s.trim()).filter(Boolean);

    const body = {
      sellerName: document.getElementById('sellerName').value.trim(),
      phone,
      category: document.getElementById('category').value,
      title: document.getElementById('title').value.trim(),
      description: document.getElementById('description').value.trim(),
      area: document.getElementById('area').value.trim(),
      kind,
      images: images.length ? images : undefined,
      website: document.getElementById('website').value,
    };

    if (pickedLat != null && pickedLng != null) {
      body.lat = pickedLat;
      body.lng = pickedLng;
    }

    if (kind === 'FIXED') {
      const rawPrice = document.getElementById('priceMinor').value.replace(/\D/g, '');
      if (rawPrice) body.priceMinor = Number(rawPrice);
    } else {
      body.startingPriceMinor = Number(document.getElementById('startingPriceMinor').value.replace(/\D/g, ''));
      body.durationHours = Number(document.getElementById('durationHours').value) || 48;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري النشر…';

    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        msg.textContent = (data.error && data.error.message) || 'صار خطأ، جرب كمان مرة';
        msg.className = 'msg err';
        submitBtn.disabled = false;
        submitBtn.textContent = 'انشر الإعلان';
        return;
      }
      try { localStorage.setItem('souq_seller_id', data.sellerId); } catch (e) {}
      form.innerHTML = `
        <p class="msg ok" style="font-size:16px">تم استلام إعلانك! رح ينشر بعد ما نراجعه بوقت قصير.</p>
        <p class="sub">احفظ هالرابط، فيه بتشوف رصيدك وإعلاناتك: <br><a href="/me?id=${encodeURIComponent(data.sellerId)}">${location.origin}/me?id=${encodeURIComponent(data.sellerId)}</a></p>`;
    } catch (err) {
      msg.textContent = 'ما قدرنا نوصل للسيرفر، تأكد من النت وجرب كمان مرة';
      msg.className = 'msg err';
      submitBtn.disabled = false;
      submitBtn.textContent = 'انشر الإعلان';
    }
  });
})();
