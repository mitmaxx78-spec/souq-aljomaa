'use strict';

(function () {
  const KEY_STORE = 'souq_admin_key';
  let currentStatus = 'PENDING';

  const gate = document.getElementById('gate');
  const panel = document.getElementById('panel');
  const statusText = document.getElementById('statusText');

  function getKey() {
    try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }
  function setKey(k) {
    try { localStorage.setItem(KEY_STORE, k); } catch (e) {}
  }
  function clearKey() {
    try { localStorage.removeItem(KEY_STORE); } catch (e) {}
  }

  async function api(path, opts) {
    const res = await fetch('/api/admin' + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': getKey(),
        ...(opts && opts.headers),
      },
    });
    if (res.status === 403) throw new Error('FORBIDDEN');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || 'error');
    return data;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
  function formatMoney(minor, currency) {
    return Number(minor || 0).toLocaleString('ar-SY') + ' ' + (currency || 'ل.س');
  }

  async function loadListings() {
    const list = document.getElementById('listingList');
    list.innerHTML = '<li class="sub">جاري التحميل…</li>';
    try {
      const data = await api('/listings?status=' + currentStatus);
      if (!data.listings.length) {
        list.innerHTML = '<li class="sub">ما في شي هون.</li>';
        return;
      }
      list.innerHTML = data.listings.map((l) => {
        const price = l.kind === 'AUCTION'
          ? formatMoney(l.current_price_minor, l.currency) + ` (${l.bid_count} مزايدة)`
          : formatMoney(l.price_minor, l.currency);
        const actions = currentStatus === 'PENDING'
          ? `<button class="mini" data-act="APPROVED" data-id="${l.id}">وافق</button>
             <button class="mini danger" data-act="REJECTED" data-id="${l.id}">ارفض</button>`
          : currentStatus === 'APPROVED'
            ? `<button class="mini" data-act="SOLD" data-id="${l.id}">تم البيع</button>`
            : '';
        return `
          <li class="item">
            <div class="row-top">
              <strong>${escapeHtml(l.title)}</strong>
              <span class="sub">${l.kind === 'AUCTION' ? 'مزاد' : 'ثابت'}</span>
            </div>
            ${l.is_flagged ? `<span class="pill bad">⚠ محتوى مشبوه: ${escapeHtml(l.flag_reason || '')}</span>` : ''}
            <div class="sub">${escapeHtml(l.category)} · ${escapeHtml(l.area)} · ${price}</div>
            <div class="sub">البايع: ${escapeHtml(l.seller_name)} · ${escapeHtml(l.seller_phone)}</div>
            <div class="actions">${actions}</div>
          </li>`;
      }).join('');
    } catch (err) {
      list.innerHTML = '<li class="sub">صار خطأ بالتحميل.</li>';
    }
  }

  document.getElementById('listingList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api(`/listings/${btn.dataset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: btn.dataset.act }),
      });
      loadListings();
    } catch (err) {
      btn.disabled = false;
    }
  });

  document.getElementById('statusTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    document.querySelectorAll('#statusTabs button').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    currentStatus = btn.dataset.status;
    loadListings();
  });

  const reasonLabel = { SCAM: 'نصب/احتيال', PROHIBITED: 'محتوى ممنوع', WRONG_INFO: 'معلومات غلط', OFFENSIVE: 'مسيء', OTHER: 'شي تاني' };
  const topicLabel = { DISPUTE: 'نزاع', QUESTION: 'سؤال', COMPLAINT: 'شكوى', OTHER: 'شي تاني' };
  let currentReportStatus = 'PENDING';
  let currentTicketStatus = 'OPEN';

  async function loadReports() {
    const list = document.getElementById('reportList');
    list.innerHTML = '<li class="sub">جاري التحميل…</li>';
    try {
      const data = await api('/reports?status=' + currentReportStatus);
      list.innerHTML = data.reports.length ? data.reports.map((r) => `
        <li class="item">
          <div class="row-top">
            <strong>${escapeHtml(r.listing_title)}</strong>
            <span class="sub">${reasonLabel[r.reason] || r.reason}</span>
          </div>
          ${r.note ? `<div class="sub">${escapeHtml(r.note)}</div>` : ''}
          ${r.reporter_phone ? `<div class="sub">من: ${escapeHtml(r.reporter_phone)}</div>` : ''}
          <div class="actions">
            ${currentReportStatus === 'PENDING' ? `
              <button class="mini" data-ract="RESOLVED" data-rid="${r.id}">تم الحل</button>
              <button class="mini danger" data-ract="DISMISSED" data-rid="${r.id}">تجاهل</button>
            ` : ''}
          </div>
        </li>`).join('') : '<li class="sub">ما في شي هون.</li>';
    } catch (err) {
      list.innerHTML = '<li class="sub">صار خطأ بالتحميل.</li>';
    }
  }

  document.getElementById('reportList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-ract]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api(`/reports/${btn.dataset.rid}`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.ract }) });
      loadReports();
    } catch (err) {
      btn.disabled = false;
    }
  });

  document.getElementById('reportTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-rstatus]');
    if (!btn) return;
    document.querySelectorAll('#reportTabs button').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    currentReportStatus = btn.dataset.rstatus;
    loadReports();
  });

  async function loadTickets() {
    const list = document.getElementById('ticketList');
    list.innerHTML = '<li class="sub">جاري التحميل…</li>';
    try {
      const data = await api('/tickets?status=' + currentTicketStatus);
      list.innerHTML = data.tickets.length ? data.tickets.map((t) => `
        <li class="item">
          <div class="row-top">
            <strong>${topicLabel[t.topic] || t.topic}</strong>
            <span class="sub">${escapeHtml(t.phone)}</span>
          </div>
          <div class="sub">${escapeHtml(t.message)}</div>
          <div class="actions">
            ${currentTicketStatus === 'OPEN' ? `<button class="mini" data-kact="CLOSED" data-kid="${t.id}">سكر</button>` : ''}
          </div>
        </li>`).join('') : '<li class="sub">ما في شي هون.</li>';
    } catch (err) {
      list.innerHTML = '<li class="sub">صار خطأ بالتحميل.</li>';
    }
  }

  document.getElementById('ticketList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-kact]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api(`/tickets/${btn.dataset.kid}`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.kact }) });
      loadTickets();
    } catch (err) {
      btn.disabled = false;
    }
  });

  document.getElementById('ticketTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-kstatus]');
    if (!btn) return;
    document.querySelectorAll('#ticketTabs button').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    currentTicketStatus = btn.dataset.kstatus;
    loadTickets();
  });

  let currentTopupStatus = 'PENDING';
  const topupStatusLabel = { PENDING: 'بانتظار', APPROVED: 'مقبول', REJECTED: 'مرفوض' };

  async function loadTopups() {
    const list = document.getElementById('topupList');
    list.innerHTML = '<li class="sub">جاري التحميل…</li>';
    try {
      const data = await api('/topups?status=' + currentTopupStatus);
      if (!data.topups.length) {
        list.innerHTML = '<li class="sub">ما في شي هون.</li>';
        return;
      }
      list.innerHTML = data.topups.map((t) => `
        <li class="item">
          <div class="row-top">
            <strong>${formatMoney(t.amount_minor, 'ل.س')}</strong>
            <span class="sub">${escapeHtml(t.method)}</span>
          </div>
          <div class="sub">${escapeHtml(t.seller_name)} · ${escapeHtml(t.seller_phone)}</div>
          ${t.reference_note ? `<div class="sub">${escapeHtml(t.reference_note)}</div>` : ''}
          <div class="actions">
            ${currentTopupStatus === 'PENDING' ? `
              <button class="mini" data-tact="APPROVED" data-tid="${t.id}">وصلتني، اقبل</button>
              <button class="mini danger" data-tact="REJECTED" data-tid="${t.id}">ارفض</button>
            ` : `<span class="sub">${topupStatusLabel[t.status]}</span>`}
          </div>
        </li>`).join('');
    } catch (err) {
      list.innerHTML = '<li class="sub">صار خطأ بالتحميل.</li>';
    }
  }

  document.getElementById('topupList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-tact]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api(`/topups/${btn.dataset.tid}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: btn.dataset.tact }),
      });
      loadTopups();
    } catch (err) {
      btn.disabled = false;
    }
  });

  document.getElementById('topupTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tstatus]');
    if (!btn) return;
    document.querySelectorAll('#topupTabs button').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    currentTopupStatus = btn.dataset.tstatus;
    loadTopups();
  });

  async function loadAds() {
    const el = document.getElementById('adsList');
    el.innerHTML = '<p class="sub">جاري التحميل…</p>';
    try {
      const data = await api('/ads');
      el.innerHTML = data.ads.length
        ? `<ul class="rows">${data.ads.map((a) => `
            <li class="item">
              <div class="row-top">
                <strong>${escapeHtml(a.title)}</strong>
                <span class="pill ${a.is_active ? 'ok' : 'bad'}">${a.is_active ? 'شغال' : 'موقوف'}</span>
              </div>
              <div class="sub">${escapeHtml(a.target_url)}</div>
              <div class="actions">
                <button class="mini" data-adtoggle="${a.id}" data-active="${a.is_active}">${a.is_active ? 'وقفه' : 'شغّله'}</button>
                <button class="mini danger" data-addel="${a.id}">احذف</button>
              </div>
            </li>`).join('')}</ul>`
        : '<p class="sub">ما في بانرات مضافة.</p>';
    } catch (err) {
      el.innerHTML = '<p class="sub">صار خطأ بالتحميل.</p>';
    }
  }

  document.getElementById('adsList').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('button[data-adtoggle]');
    const delBtn = e.target.closest('button[data-addel]');
    if (toggleBtn) {
      toggleBtn.disabled = true;
      const isActive = toggleBtn.dataset.active === 'true';
      try {
        await api(`/ads/${toggleBtn.dataset.adtoggle}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !isActive }),
        });
        loadAds();
      } catch (err) {
        toggleBtn.disabled = false;
      }
    } else if (delBtn) {
      delBtn.disabled = true;
      try {
        await api(`/ads/${delBtn.dataset.addel}`, { method: 'DELETE' });
        loadAds();
      } catch (err) {
        delBtn.disabled = false;
      }
    }
  });

  document.getElementById('adForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('adMsg');
    msg.textContent = '';
    msg.className = 'msg';
    try {
      await api('/ads', {
        method: 'POST',
        body: JSON.stringify({
          title: document.getElementById('adTitle').value.trim(),
          imageUrl: document.getElementById('adImage').value.trim(),
          targetUrl: document.getElementById('adTarget').value.trim(),
        }),
      });
      document.getElementById('adForm').reset();
      msg.textContent = 'انضاف!';
      msg.className = 'msg ok';
      loadAds();
    } catch (err) {
      msg.textContent = 'صار خطأ، تأكد من الروابط.';
      msg.className = 'msg err';
    }
  });

  let contentDirty = {};

  async function loadContent() {
    const form = document.getElementById('contentForm');
    form.innerHTML = '<p class="sub">جاري التحميل…</p>';
    try {
      const data = await api('/content');
      form.innerHTML = data.groups.map((g) => `
        <div>
          ${g.fields.map((f) => `
            <label for="c_${f.key}">${escapeHtml(f.label)}</label>
            <input id="c_${f.key}" data-key="${f.key}" value="${escapeHtml(f.value)}">
          `).join('')}
        </div>`).join('');
      form.querySelectorAll('input').forEach((inp) => {
        inp.addEventListener('input', () => { contentDirty[inp.dataset.key] = inp.value; });
      });
    } catch (err) {
      form.innerHTML = '<p class="sub">صار خطأ بالتحميل.</p>';
    }
  }

  document.getElementById('contentSave').addEventListener('click', async () => {
    const msg = document.getElementById('contentMsg');
    if (!Object.keys(contentDirty).length) {
      msg.textContent = 'ما في شي تغيّر.';
      msg.className = 'msg';
      return;
    }
    try {
      await api('/content', { method: 'PUT', body: JSON.stringify(contentDirty) });
      contentDirty = {};
      msg.textContent = 'انحفظ!';
      msg.className = 'msg ok';
    } catch (err) {
      msg.textContent = 'صار خطأ بالحفظ.';
      msg.className = 'msg err';
    }
  });

  document.getElementById('keySave').addEventListener('click', async () => {
    const val = document.getElementById('keyInput').value.trim();
    if (!val) return;
    setKey(val);
    await boot();
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearKey();
    location.reload();
  });

  async function boot() {
    if (!getKey()) {
      gate.classList.remove('hidden');
      panel.classList.add('hidden');
      statusText.textContent = 'محتاج مفتاح';
      return;
    }
    try {
      await api('/listings?status=PENDING');
      gate.classList.add('hidden');
      panel.classList.remove('hidden');
      statusText.textContent = 'متصل';
      loadListings();
      loadReports();
      loadTickets();
      loadTopups();
      loadAds();
      loadContent();
    } catch (err) {
      clearKey();
      gate.classList.remove('hidden');
      panel.classList.add('hidden');
      document.getElementById('gateMsg').textContent = 'المفتاح غلط';
      document.getElementById('gateMsg').className = 'msg err';
      statusText.textContent = 'مفتاح غلط';
    }
  }

  boot();
})();

if (typeof wireThemeToggle === 'function') wireThemeToggle('themeToggle');
