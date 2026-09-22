'use strict';

// Floating help widget, loaded on every page. Now a small rule-based chat
// assistant (like the "chat with us" bubble on big marketplaces): answers
// common questions instantly from a built-in knowledge base + the FAQ text
// set from /admin, offers quick-reply chips for the most common questions,
// and hands off to a real human (via the existing support-ticket endpoint)
// only when it can't answer. No external AI API, no network dependency
// beyond the one /api/site-content + /api/support calls already used here.
(function () {
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function digitCount(v) {
    return String(v).replace(/\D/g, '').length;
  }

  // Each entry: keywords (Arabic, no diacritics needed -- matched with
  // simple substring test) -> answer. Order matters a little: first match
  // wins, so more specific phrases are listed before generic ones.
  function buildKnowledgeBase(content) {
    const kb = [
      {
        id: 'sell',
        label: 'كيف أنشر إعلان؟',
        keywords: ['كيف أعلن', 'كيف اعلن', 'نشر اعلان', 'نشر إعلان', 'ضيف اعلان', 'بيع', 'أبيع', 'ابيع'],
        answer: 'بسيطة: دوس على "أعلن" فوق بالموقع، عبي بيانات الغرض (العنوان، الفئة، الوصف، السعر أو تفاصيل المزاد)، وحط رقم تلفونك ليتواصلوا معك المشترين. إعلانك بينشر بعد ما نراجعه بوقت قصير.',
      },
      {
        id: 'auction',
        label: 'كيف أشارك بمزاد؟',
        keywords: ['مزاد', 'ازايد', 'أزايد', 'مزايدة', 'زيادة السعر'],
        answer: 'من صفحة "المزادات" بتلاقي كل الإعلانات يلي عم يصير عليها مزاد، مع الوقت المتبقي والسعر الحالي. فوت على أي إعلان وشوف تفاصيله، وتواصل مع صاحب الإعلان مباشرة (واتساب) لتأكيد مزايدتك.',
      },
      {
        id: 'my-ads',
        label: 'كيف بلاقي إعلاناتي؟',
        keywords: ['اعلاناتي', 'إعلاناتي', 'حسابي', 'رصيدي', 'الاعلانات تبعي'],
        answer: 'لما تنشر أول إعلان، بيوصلك رابط خاص فيه معرّف حسابك — احفظه! من صفحة "حسابي" فيك تشوف كل إعلاناتك وحالتها (تحت المراجعة / منشور).',
      },
      {
        id: 'contact-seller',
        label: 'كيف أتواصل مع البائع؟',
        keywords: ['اتواصل مع البائع', 'تواصل مع صاحب الاعلان', 'كيف احكي معه', 'رقم البائع', 'واتساب البائع'],
        answer: 'بصفحة أي إعلان في زر "تواصل عبر واتساب" بيوديك مباشرة لمحادثة مع البائع على رقمه. حالياً التواصل بيصير عبر واتساب مباشرة، ما في شات داخل الموقع لسه.',
      },
      {
        id: 'install',
        label: 'كيف أثبت الموقع متل تطبيق؟',
        keywords: ['تثبيت', 'تطبيق', 'تنزيل التطبيق', 'app', 'تحميل الموقع'],
        answer: 'دوس على زر "📲 نزّل التطبيق" بأعلى الصفحة وبيطلعلك شرح خطوة خطوة حسب جهازك (آيفون أو أندرويد أو كمبيوتر) — من دون ما تحتاج متجر تطبيقات.',
      },
      {
        id: 'language',
        label: 'كيف أبدل اللغة؟',
        keywords: ['اللغة', 'language', 'sprache', 'انجليزي', 'الماني'],
        answer: 'فوق الصفحة، جنب زر الوضع الليلي، في زر صغير (ع / EN / DE) دوس عليه وبيبدل لغة الموقع بين العربي والإنجليزي والألماني.',
      },
      {
        id: 'payment',
        label: 'كيف بصير الدفع؟',
        keywords: ['دفع', 'الدفع', 'بايبال', 'فيزا', 'كاش'],
        answer: 'المنصة حالياً بس منصة إعلانات وربط بين البائع والمشتري — ما في دفع إلكتروني عبر الموقع. الدفع والتسليم بيتفقوا عليه البائع والمشتري مباشرة (كاش عادةً)، فحاول تتأكد من الغرض والشخص قبل ما تدفع أو توصل الغرض.',
      },
      {
        id: 'complaint',
        label: 'عندي شكوى / تعرضت لنصب',
        keywords: ['شكوى', 'نصب', 'احتيال', 'محتال', 'مشكلة مع بائع', 'مشكلة مع مشتري'],
        answer: null, // handled specially: opens the human support form
      },
      {
        id: 'delete-listing',
        label: 'كيف أحذف أو عدل إعلاني؟',
        keywords: ['احذف اعلان', 'حذف الاعلان', 'عدل اعلان', 'تعديل الاعلان'],
        answer: 'لهلق التعديل أو الحذف بيصير من طرفنا -- ابعتلنا رسالة من هون (زر "تواصل مع فريق الدعم" تحت) وحدد رقم/رابط الإعلان ورح نساعدك بأسرع وقت.',
      },
    ];
    // Fold the admin-editable FAQ into the same knowledge base so editing it
    // from /admin also improves the bot's answers, not just the static panel.
    if (content) {
      [1, 2, 3].forEach((i) => {
        const q = content['faq' + i + '_q'];
        const a = content['faq' + i + '_a'];
        if (q && a) {
          kb.push({ id: 'faq' + i, label: q, keywords: [q], answer: a });
        }
      });
    }
    return kb;
  }

  function findAnswer(kb, text) {
    const t = text.trim();
    if (!t) return null;
    // Exact chip clicks match by id via a separate path; this is for typed
    // free text -- simple substring scoring, longest keyword match wins.
    let best = null;
    let bestLen = 0;
    kb.forEach((entry) => {
      entry.keywords.forEach((kw) => {
        if (t.includes(kw) && kw.length > bestLen) {
          best = entry;
          bestLen = kw.length;
        }
      });
    });
    return best;
  }

  async function init() {
    let content;
    try {
      content = await (await fetch('/api/site-content')).json();
    } catch (e) {
      content = null; // the bot still works with its built-in knowledge base
    }

    const kb = buildKnowledgeBase(content);

    const fab = document.createElement('button');
    fab.className = 'help-fab';
    fab.setAttribute('aria-label', 'مساعدة');
    fab.textContent = '💬';

    const panel = document.createElement('div');
    panel.className = 'help-panel help-chat hidden';
    panel.innerHTML = `
      <button class="help-close" type="button" aria-label="سكر">✕</button>
      <h3>🤖 مساعد سوق الجمعة</h3>
      <p class="sub">اسألني عن أي شي بالموقع، أو دوس أحد الأسئلة تحت</p>
      <div class="chat-log" id="chatLog"></div>
      <div class="chat-chips" id="chatChips"></div>
      <form id="chatForm" class="chat-input-row">
        <input id="chatInput" placeholder="اكتب سؤالك هون..." autocomplete="off">
        <button class="primary" type="submit">إرسال</button>
      </form>
      <form id="widgetForm" class="hidden">
        <p class="sub" style="margin-top:0">تمام، وصف المشكلة وحط رقم تلفونك، وفريقنا بيرد عليك:</p>
        <select id="widgetTopic">
          <option value="QUESTION">سؤال</option>
          <option value="DISPUTE">نزاع بيني وبين حدا</option>
          <option value="COMPLAINT">شكوى</option>
          <option value="OTHER">شي تاني</option>
        </select>
        <input id="widgetPhone" placeholder="رقم تلفونك" required>
        <textarea id="widgetMsg" placeholder="اكتب رسالتك هون..." required></textarea>
        <button class="primary" type="submit">ابعت لفريق الدعم</button>
        <div class="msg" id="widgetStatus"></div>
      </form>
    `;

    document.body.appendChild(panel);
    document.body.appendChild(fab);

    const log = panel.querySelector('#chatLog');
    const chipsEl = panel.querySelector('#chatChips');
    const chatForm = panel.querySelector('#chatForm');
    const chatInput = panel.querySelector('#chatInput');
    const supportForm = panel.querySelector('#widgetForm');

    function addBubble(text, who) {
      const b = document.createElement('div');
      b.className = 'chat-bubble ' + (who === 'user' ? 'from-user' : 'from-bot');
      b.textContent = text;
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
    }

    function renderChips() {
      chipsEl.innerHTML = kb
        .filter((e) => e.label)
        .map((e) => `<button type="button" class="chat-chip" data-id="${e.id}">${escapeHtml(e.label)}</button>`)
        .join('');
    }

    function openSupportForm(prefillMsg) {
      chatForm.classList.add('hidden');
      chipsEl.classList.add('hidden');
      supportForm.classList.remove('hidden');
      if (prefillMsg) panel.querySelector('#widgetMsg').value = prefillMsg;
    }

    function handleEntry(entry) {
      addBubble(entry.label || entry.keywords[0], 'user');
      if (entry.id === 'complaint' || entry.answer === null) {
        addBubble('تأسف تسمع هيك. عشان نساعدك أسرع وأدق، حاسبنا رح ياخد بلاغك مباشرة:', 'bot');
        openSupportForm('');
        return;
      }
      addBubble(entry.answer, 'bot');
    }

    renderChips();
    addBubble('أهلاً! 👋 أنا مساعد سوق الجمعة، اسألني عن أي شي بالموقع.', 'bot');

    chipsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.chat-chip');
      if (!btn) return;
      const entry = kb.find((k) => k.id === btn.dataset.id);
      if (entry) handleEntry(entry);
    });

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      addBubble(text, 'user');
      chatInput.value = '';
      const match = findAnswer(kb, text);
      if (match && match.answer) {
        addBubble(match.answer, 'bot');
      } else if (match && match.id === 'complaint') {
        addBubble('تأسف تسمع هيك. عشان نساعدك أسرع وأدق، حاسبنا رح ياخد بلاغك مباشرة:', 'bot');
        openSupportForm(text);
      } else {
        addBubble('ما فهمت سؤالك تماماً 🙏 فيك تجرب صياغة تانية، أو دوس هون وفريقنا بيرد عليك بنفسه:', 'bot');
        const helpBtn = document.createElement('button');
        helpBtn.type = 'button';
        helpBtn.className = 'chat-chip chat-chip-cta';
        helpBtn.textContent = 'تواصل مع فريق الدعم';
        helpBtn.addEventListener('click', () => openSupportForm(text));
        log.appendChild(helpBtn);
        log.scrollTop = log.scrollHeight;
      }
    });

    document.body.appendChild(panel);
    document.body.appendChild(fab);

    function toggle(open) {
      panel.classList.toggle('hidden', !open);
    }
    fab.addEventListener('click', () => toggle(panel.classList.contains('hidden')));
    panel.querySelector('.help-close').addEventListener('click', () => toggle(false));

    supportForm.addEventListener('submit', async (e) => {
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
        supportForm.innerHTML = '<p class="msg ok">وصلتنا رسالتك، رح نرد عليك قريباً.</p>';
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
