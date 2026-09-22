'use strict';

(function () {
  const main = document.getElementById('main');

  function getSavedId() {
    try { return localStorage.getItem('souq_seller_id') || ''; } catch (e) { return ''; }
  }
  function saveId(id) {
    try { localStorage.setItem('souq_seller_id', id); } catch (e) {}
  }

  const urlId = new URLSearchParams(location.search).get('id');
  if (urlId) saveId(urlId);
  const sellerId = urlId || getSavedId();

  const statusLabel = { PENDING: 'بانتظار المراجعة', APPROVED: 'منشور', REJECTED: 'مرفوض', SOLD: 'مباع', ENDED: 'خلص' };
  const statusPill = { PENDING: 'pending', APPROVED: 'ok', REJECTED: 'bad', SOLD: 'ok', ENDED: '' };

  function renderGate() {
    main.innerHTML = `
      <div class="hero"><h1>حسابي</h1><p>لكل ما تنشر إعلان، بنعطيك رابط حسابك. الصقه هون.</p></div>
      <form class="card" id="gateForm">
        <label for="idInput">رابط أو رمز حسابك</label>
        <input id="idInput" placeholder="lst_... أو الرمز يلي انعطيتلك ياه">
        <button class="primary" type="submit">دخول</button>
      </form>`;
    document.getElementById('gateForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const val = document.getElementById('idInput').value.trim();
      if (!val) return;
      location.href = '/me?id=' + encodeURIComponent(val);
    });
  }

  async function renderDashboard(id) {
    try {
      const res = await fetch(`/api/wallet/me/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      const { seller, listings, topups, featureCostMinor, featureDays } = data;

      main.innerHTML = `
        <div class="card balance-card">
          <div class="sub">رصيدك الحالي</div>
          <div class="amount">${formatMoney(seller.balance_minor, 'ل.س')}</div>
          <div class="sub">${escapeHtml(seller.name)} · ${escapeHtml(seller.phone)}</div>
        </div>

        <div class="section-title"><h2>اشحن رصيدك</h2></div>
        <form class="card" id="topupForm">
          <label for="amount">المبلغ (ل.س)</label>
          <input id="amount" inputmode="numeric" placeholder="مثلاً 20000" required>
          <label for="method">طريقة الدفع</label>
          <select id="method">
            <option value="SHAM_CASH">شام كاش</option>
            <option value="BANK_TRANSFER">حوالة بنكية</option>
            <option value="OTHER">وسيلة تانية</option>
          </select>
          <label for="ref">رقم الحوالة أو أي تفصيل يساعدنا نتأكد (اختياري)</label>
          <input id="ref" maxlength="300">
          <button class="primary" type="submit">أرسل طلب الشحن</button>
          <div class="msg" id="topupMsg"></div>
          <p class="hint sub">بعد ما ترسل، بيتراجع الطلب يدوياً وبينضاف الرصيد بعد التأكد من وصول الحوالة.</p>
        </form>

        <div class="section-title"><h2>طلبات الشحن</h2></div>
        <div class="card">
          <ul class="mini-list" id="topupList">
            ${topups.length ? topups.map((t) => `
              <li><span>${formatMoney(t.amount_minor, 'ل.س')}</span><span class="pill ${statusPill[t.status]}">${statusLabel[t.status] || t.status}</span></li>
            `).join('') : '<li class="sub">ما في طلبات شحن بعد</li>'}
          </ul>
        </div>

        <div class="section-title"><h2>إعلاناتي</h2></div>
        <div class="card">
          <ul class="mini-list" id="listingList">
            ${listings.length ? listings.map((l) => {
              const featured = l.featured_until && new Date(l.featured_until) > new Date();
              const price = l.kind === 'AUCTION' ? formatMoney(l.current_price_minor, l.currency) : formatMoney(l.price_minor, l.currency);
              return `
              <li style="flex-direction:column; align-items:stretch; gap:6px">
                <div style="display:flex; justify-content:space-between">
                  <span>${escapeHtml(l.title)}</span>
                  <span class="pill ${statusPill[l.status]}">${statusLabel[l.status] || l.status}</span>
                </div>
                <div class="sub">${price}${featured ? ' · <span class="pill ok">مميز</span>' : ''}</div>
                ${l.status === 'APPROVED' && !featured ? `<button class="ghost feature-btn" data-id="${l.id}">مميّز الإعلان (${formatMoney(featureCostMinor, 'ل.س')} / ${featureDays} أيام)</button>` : ''}
              </li>`;
            }).join('') : '<li class="sub">ما في إعلانات بعد</li>'}
          </ul>
        </div>
      `;

      document.getElementById('topupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('topupMsg');
        msg.textContent = '';
        msg.className = 'msg';
        const amountMinor = Number(document.getElementById('amount').value.replace(/\D/g, ''));
        try {
          const r = await fetch('/api/wallet/topups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sellerId: id,
              amountMinor,
              method: document.getElementById('method').value,
              referenceNote: document.getElementById('ref').value.trim() || undefined,
            }),
          });
          const d = await r.json();
          if (!r.ok) {
            msg.textContent = (d.error && d.error.message) || 'صار خطأ';
            msg.className = 'msg err';
            return;
          }
          msg.textContent = 'تم إرسال طلب الشحن!';
          msg.className = 'msg ok';
          setTimeout(() => location.reload(), 900);
        } catch (err) {
          msg.textContent = 'ما قدرنا نوصل للسيرفر';
          msg.className = 'msg err';
        }
      });

      main.querySelectorAll('.feature-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const r = await fetch(`/api/wallet/listings/${btn.dataset.id}/feature`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sellerId: id }),
            });
            const d = await r.json();
            if (!r.ok) {
              alert((d.error && d.error.message) || 'صار خطأ');
              btn.disabled = false;
              return;
            }
            location.reload();
          } catch (err) {
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      main.innerHTML = '<p class="empty">ما لقينا هالحساب. تأكد من الرابط.</p>';
    }
  }

  if (!sellerId) renderGate();
  else renderDashboard(sellerId);
})();
