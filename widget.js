'use strict';

// Small floating help widget, loaded once on every page. Fetches its own
// copy of site content (same values already inlined into each page's HTML,
// nothing secret) so the FAQ text stays editable from /admin without
// re-templating every page for it.
(function () {
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function digitCount(v) {
    return String(v).replace(/\D/g, '').length;
  }

  async function init() {
    let content;
    try {
      content = await (await fetch('/api/site-content')).json();
    } catch (e) {
      return; // fail silently -- the widget is a convenience, never blocks the page
    }

    const fab = document.createElement('button');
    fab.className = 'help-fab';
    fab.setAttribute('aria-label', 'مساعدة');
    fab.textContent = '؟';

    const panel = document.createElement('div');
    panel.className = 'help-panel hidden';
    panel.innerHTML = `
      <button class="help-close" type="button" aria-label="سكر">✕</button>
      <h3>${escapeHtml(content.help_title)}</h3>
      <p class="sub">${escapeHtml(content.help_intro)}</p>
      <div class="faqs">
        <details class="faq-item"><summary>${escapeHtml(content.faq1_q)}</summary><p>${escapeHtml(content.faq1_a)}</p></details>
        <details class="faq-item"><summary>${escapeHtml(content.faq2_q)}</summary><p>${escapeHtml(content.faq2_a)}</p></details>
        <details class="faq-item"><summary>${escapeHtml(content.faq3_q)}</summary><p>${escapeHtml(content.faq3_a)}</p></details>
      </div>
      <form id="widgetForm">
        <select id="widgetTopic">
          <option value="QUESTION">سؤال</option>
          <option value="DISPUTE">نزاع بيني وبين حدا</option>
          <option value="COMPLAINT">شكوى</option>
          <option value="OTHER">شي تاني</option>
        </select>
        <input id="widgetPhone" placeholder="رقم تلفونك" required>
        <textarea id="widgetMsg" placeholder="اكتب رسالتك هون..." required></textarea>
        <button class="primary" type="submit">ابعت</button>
        <div class="msg" id="widgetStatus"></div>
      </form>
    `;

    document.body.appendChild(panel);
    document.body.appendChild(fab);

    function toggle(open) {
      panel.classList.toggle('hidden', !open);
    }
    fab.addEventListener('click', () => toggle(panel.classList.contains('hidden')));
    panel.querySelector('.help-close').addEventListener('click', () => toggle(false));

    panel.querySelector('#widgetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = panel.querySelector('#widgetStatus');
      status.textContent = '';
      status.className = 'msg';
      const phone = panel.querySelector('#widgetPhone').value.trim();
      if (digitCount(phone) < 9) {
        status.textContent = 'رقم التلفون ناقص';
        status.className = 'msg err';
        return;
      }
      try {
        const res = await fetch('/api/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            topic: panel.querySelector('#widgetTopic').value,
            message: panel.querySelector('#widgetMsg').value.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          status.textContent = (data.error && data.error.message) || 'صار خطأ';
          status.className = 'msg err';
          return;
        }
        panel.querySelector('#widgetForm').innerHTML = '<p class="msg ok">وصلتنا رسالتك، رح نرد عليك قريباً.</p>';
      } catch (err) {
        status.textContent = 'ما قدرنا نوصل للسيرفر';
        status.className = 'msg err';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
