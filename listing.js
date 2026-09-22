'use strict';

(function () {
  const main = document.getElementById('main');
  const id = new URLSearchParams(location.search).get('id');
  let countdownTimer = null;

  if (!id) {
    main.innerHTML = '<p class="empty">مافي إعلان محدد.</p>';
    return;
  }

  function digitCount(v) {
    return String(v).replace(/\D/g, '').length;
  }

  function waLink(text) {
    const num = String(document.body.dataset.wa || '').replace(/\D/g, '');
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  function mapBlockHtml(listing) {
    if (listing.lat == null || listing.lng == null) return '';
    return `<div id="listingMap" class="mini-map" style="margin-top:14px"></div>`;
  }

  function paintMap(listing) {
    if (listing.lat == null || listing.lng == null) return;
    if (typeof L === 'undefined' || !document.getElementById('listingMap')) return;
    L.Icon.Default.imagePath = '/vendor/leaflet/images/';
    const map = L.map('listingMap', { zoomControl: true, dragging: true, scrollWheelZoom: false, zoomAnimation: false })
      .setView([listing.lat, listing.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);
    L.marker([listing.lat, listing.lng]).addTo(map);
  }

  function reportBlockHtml() {
    return `
      <details style="margin-top:14px">
        <summary class="sub" style="cursor:pointer">أبلغ عن هالإعلان</summary>
        <form id="reportForm" class="card" style="margin-top:8px">
          <label for="reportReason">السبب</label>
          <select id="reportReason">
            <option value="SCAM">نصب / احتيال</option>
            <option value="PROHIBITED">محتوى ممنوع</option>
            <option value="WRONG_INFO">المعلومات مو صحيحة</option>
            <option value="OFFENSIVE">محتوى مسيء</option>
            <option value="OTHER">شي تاني</option>
          </select>
          <label for="reportNote">تفاصيل (اختياري)</label>
          <textarea id="reportNote"></textarea>
          <button class="ghost" type="submit">أرسل البلاغ</button>
          <div class="msg" id="reportMsg"></div>
        </form>
      </details>`;
  }

  function wireReportForm(listingId) {
    const form = document.getElementById('reportForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('reportMsg');
      msg.textContent = '';
      msg.className = 'msg';
      try {
        const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}/reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: document.getElementById('reportReason').value,
            note: document.getElementById('reportNote').value.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          msg.textContent = (data.error && data.error.message) || 'صار خطأ';
          msg.className = 'msg err';
          return;
        }
        form.innerHTML = '<p class="msg ok">وصل بلاغك، رح نراجعه.</p>';
      } catch (err) {
        msg.textContent = 'ما قدرنا نوصل للسيرفر';
        msg.className = 'msg err';
      }
    });
  }

  function renderFixed(listing, images) {
    const gallery = images.length
      ? `<img src="${escapeHtml(images[0])}" alt="">`
      : (listing.category === 'وظائف' ? '💼' : 'صورة');
    const isJob = listing.category === 'وظائف';
    const priceText = listing.price_minor
      ? formatMoney(listing.price_minor, listing.currency)
      : (isJob ? 'الراتب يذكر عند التواصل' : 'السعر عند التواصل');
    const text = `مرحبا، مهتم بإعلان "${listing.title}" (رقم ${listing.id}) على ${document.title}`;
    main.innerHTML = `
      <div class="detail-gallery">${gallery}</div>
      <h1 style="margin:16px 0 4px">${escapeHtml(listing.title)}</h1>
      <p class="meta">${escapeHtml(listing.area)} · ${escapeHtml(listing.category)}</p>
      <p class="price" style="font-size:22px">${priceText}</p>
      <p>${escapeHtml(listing.description).replace(/\n/g, '<br>')}</p>
      <a class="wa" href="${waLink(text)}" target="_blank" rel="noopener">${isJob ? 'تواصل مع الجهة الناشرة عالواتساب' : 'تواصل مع البايع عالواتساب'}</a>
      ${mapBlockHtml(listing)}
      ${reportBlockHtml()}
    `;
    wireReportForm(listing.id);
    paintMap(listing);
  }

  function renderAuction(listing, images, bids) {
    const gallery = images.length
      ? `<img src="${escapeHtml(images[0])}" alt="">`
      : 'صورة';
    const ended = new Date(listing.ends_at) <= new Date() || listing.status === 'ENDED';
    main.innerHTML = `
      <div class="detail-gallery">${gallery}</div>
      <h1 style="margin:16px 0 4px">${escapeHtml(listing.title)}</h1>
      <p class="meta">${escapeHtml(listing.area)} · ${escapeHtml(listing.category)}</p>
      <p class="price" style="font-size:22px" id="curPrice">${formatMoney(listing.current_price_minor, listing.currency)}</p>
      <p class="countdown" id="countdown">${ended ? 'خلص المزاد' : timeLeft(listing.ends_at)}</p>
      <p>${escapeHtml(listing.description).replace(/\n/g, '<br>')}</p>

      <ul class="bid-list" id="bidList">
        ${bids.length
          ? bids.map((b) => `<li><span>${escapeHtml(b.bidder_name)}</span><span>${formatMoney(b.amount_minor, listing.currency)}</span></li>`).join('')
          : '<li><span class="empty">ما في مزايدات بعد، كون أول واحد!</span></li>'}
      </ul>

      ${ended ? '<p class="empty">المزاد خلص، ما بينقبل مزايدات جديدة.</p>' : `
      <form class="card" id="bidForm">
        <div>
          <label for="amountMinor">مزايدتك (ل.س)</label>
          <input id="amountMinor" inputmode="numeric" placeholder="أكتر من ${formatMoney(listing.current_price_minor, listing.currency)}" required>
        </div>
        <div>
          <label for="bidderName">اسمك</label>
          <input id="bidderName" maxlength="80" required>
        </div>
        <div>
          <label for="bidPhone">رقم تلفونك</label>
          <input id="bidPhone" inputmode="tel" placeholder="09xxxxxxxx" required>
        </div>
        <button type="submit" class="primary">زايد الآن</button>
        <div class="msg" id="bidMsg"></div>
      </form>`}
      ${mapBlockHtml(listing)}
      ${reportBlockHtml()}
    `;
    wireReportForm(listing.id);
    paintMap(listing);

    if (!ended) {
      countdownTimer = setInterval(() => {
        const el = document.getElementById('countdown');
        if (!el) return clearInterval(countdownTimer);
        const left = timeLeft(listing.ends_at);
        el.textContent = left;
        if (left === 'خلص المزاد') {
          clearInterval(countdownTimer);
          location.reload();
        }
      }, 1000);

      document.getElementById('bidForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const bidMsg = document.getElementById('bidMsg');
        bidMsg.textContent = '';
        bidMsg.className = 'msg';

        const phone = document.getElementById('bidPhone').value.trim();
        if (digitCount(phone) < 9) {
          bidMsg.textContent = 'رقم التلفون ناقص';
          bidMsg.className = 'msg err';
          return;
        }

        const body = {
          bidderName: document.getElementById('bidderName').value.trim(),
          phone,
          amountMinor: Number(document.getElementById('amountMinor').value.replace(/\D/g, '')),
        };

        try {
          const res = await fetch(`/api/listings/${encodeURIComponent(id)}/bids`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) {
            bidMsg.textContent = (data.error && data.error.message) || 'صار خطأ';
            bidMsg.className = 'msg err';
            return;
          }
          location.reload();
        } catch (err) {
          bidMsg.textContent = 'ما قدرنا نوصل للسيرفر';
          bidMsg.className = 'msg err';
        }
      });
    }
  }

  fetch(`/api/listings/${encodeURIComponent(id)}`)
    .then((r) => {
      if (!r.ok) throw new Error('not found');
      return r.json();
    })
    .then(({ listing, images, bids }) => {
      if (listing.kind === 'AUCTION') renderAuction(listing, images, bids);
      else renderFixed(listing, images);
      document.title = `${listing.title} — ${document.title.split(' — ').pop()}`;
      const canon = document.createElement('link');
      canon.rel = 'canonical';
      canon.href = `/listing?id=${encodeURIComponent(listing.id)}`;
      document.head.appendChild(canon);
    })
    .catch(() => {
      main.innerHTML = '<p class="empty">هاد الإعلان مو موجود أو انشال.</p>';
    });
})();
