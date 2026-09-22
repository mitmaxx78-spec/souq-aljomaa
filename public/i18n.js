'use strict';
// Simple client-side translation layer for AR / EN / DE.
// Static text is tagged with data-i18n="key" (textContent) or
// data-i18n-ph="key" (placeholder attribute). Dynamic content coming from
// the database (ad titles, categories, descriptions) is not translated —
// only the site's own interface text.
(function () {
  var DICT = {
    nav_home:      { ar: 'الرئيسية',        en: 'Home',        de: 'Startseite' },
    nav_auctions:  { ar: 'المزادات',         en: 'Auctions',    de: 'Auktionen' },
    nav_sell:      { ar: 'أعلن',             en: 'Sell',        de: 'Verkaufen' },
    nav_me:        { ar: 'حسابي',            en: 'My Account',  de: 'Mein Konto' },

    home_hero_h1:  { ar: '{{hero_title}}',   en: '{{hero_title}}', de: '{{hero_title}}' },
    search_ph:     { ar: 'دور على غرض... (مثلاً: ثلاجة، سيارة كيا)', en: 'Search for an item... (e.g. fridge, Kia car)', de: 'Nach einem Artikel suchen... (z. B. Kühlschrank, Kia Auto)' },
    area_ph:       { ar: 'المنطقة (اختياري)', en: 'Area (optional)', de: 'Gebiet (optional)' },
    btn_search:    { ar: 'بحث',              en: 'Search',      de: 'Suchen' },
    latest_ads:    { ar: 'أحدث الإعلانات',    en: 'Latest listings', de: 'Neueste Anzeigen' },
    live_auctions: { ar: 'مزادات جارية',      en: 'Live auctions', de: 'Laufende Auktionen' },
    see_all:       { ar: 'شوف الكل ←',        en: 'See all →',   de: 'Alle ansehen →' },
    loading:       { ar: 'جاري التحميل…',      en: 'Loading…',    de: 'Wird geladen…' },
    fab_add:       { ar: '+ ضيف إعلان',       en: '+ New listing', de: '+ Anzeige aufgeben' },
    install_app:   { ar: '📲 نزّل التطبيق',    en: '📲 Install app', de: '📲 App installieren' },

    auctions_title: { ar: 'المزادات', en: 'Auctions', de: 'Auktionen' },
    auctions_h1:    { ar: 'المزادات الجارية', en: 'Live auctions', de: 'Laufende Auktionen' },
    auctions_sub:   { ar: 'زايد وشوف قديش وصل السعر لحظة بلحظة', en: 'Bid and watch the price update live', de: 'Bieten Sie mit und verfolgen Sie den Preis in Echtzeit' },
    search_auction_ph: { ar: 'دور على مزاد... (مثلاً: سيارة، ذهب)', en: 'Search auctions... (e.g. car, gold)', de: 'Auktionen durchsuchen... (z. B. Auto, Gold)' },

    sell_title:      { ar: 'أعلن', en: 'Sell', de: 'Verkaufen' },
    sell_h1:         { ar: 'ضيف إعلانك', en: 'Post your listing', de: 'Anzeige aufgeben' },
    sell_sub:        { ar: 'عبّي المعلومات، وإعلانك بينشر بعد ما نراجعه (خلال وقت قصير)', en: 'Fill in the details — your listing goes live after a quick review', de: 'Füllen Sie die Angaben aus — Ihre Anzeige wird nach kurzer Prüfung veröffentlicht' },
    label_kind:      { ar: 'نوع الإعلان', en: 'Listing type', de: 'Anzeigentyp' },
    kind_fixed:      { ar: 'سعر ثابت', en: 'Fixed price', de: 'Festpreis' },
    kind_auction:    { ar: 'مزاد', en: 'Auction', de: 'Auktion' },
    label_title:     { ar: 'عنوان الإعلان', en: 'Listing title', de: 'Anzeigentitel' },
    title_ph:        { ar: 'مثلاً: ثلاجة LG استعمال خفيف', en: 'e.g. LG fridge, lightly used', de: 'z. B. LG-Kühlschrank, leicht gebraucht' },
    label_category:  { ar: 'الفئة', en: 'Category', de: 'Kategorie' },
    label_description: { ar: 'الوصف', en: 'Description', de: 'Beschreibung' },
    description_ph:  { ar: 'اكتب تفاصيل الغرض، الحالة، سبب البيع...', en: 'Describe the item, its condition, reason for selling...', de: 'Beschreiben Sie den Artikel, Zustand, Verkaufsgrund...' },
    label_price:     { ar: 'السعر (ل.س)', en: 'Price (SYP)', de: 'Preis (SYP)' },
    price_ph:        { ar: 'مثلاً 500000', en: 'e.g. 500000', de: 'z. B. 500000' },
    label_start_price: { ar: 'سعر الانطلاق (ل.س)', en: 'Starting price (SYP)', de: 'Startpreis (SYP)' },
    start_price_ph:  { ar: 'مثلاً 100000', en: 'e.g. 100000', de: 'z. B. 100000' },
    label_duration:  { ar: 'مدة المزاد (بالساعات)', en: 'Auction duration (hours)', de: 'Auktionsdauer (Stunden)' },
    label_area:      { ar: 'المنطقة', en: 'Area', de: 'Gebiet' },
    area2_ph:        { ar: 'مثلاً: دمشق - المزة', en: 'e.g. Damascus - Mazzeh', de: 'z. B. Damaskus - Mazzeh' },
    label_map:       { ar: 'حدد موقعك على الخريطة (اختياري)', en: 'Pin your location on the map (optional)', de: 'Standort auf der Karte markieren (optional)' },
    locate_btn:      { ar: '📍 اضغط هون لتحدد موقعك، أو دبّس مكانك بالخريطة تحت', en: '📍 Tap to detect your location, or pin it on the map below', de: '📍 Tippen, um Ihren Standort zu erkennen, oder unten auf der Karte markieren' },
    label_images:    { ar: 'روابط صور (اختياري، افصل بينها بفاصلة)', en: 'Image links (optional, comma-separated)', de: 'Bild-Links (optional, durch Komma getrennt)' },
    images_ph:       { ar: 'https://...', en: 'https://...', de: 'https://...' },
    label_seller_name: { ar: 'اسمك', en: 'Your name', de: 'Ihr Name' },
    label_phone:     { ar: 'رقم تلفونك', en: 'Your phone number', de: 'Ihre Telefonnummer' },
    btn_publish:     { ar: 'انشر الإعلان', en: 'Publish listing', de: 'Anzeige veröffentlichen' },

    me_title: { ar: 'حسابي', en: 'My Account', de: 'Mein Konto' },
    listing_title: { ar: 'إعلان', en: 'Listing', de: 'Anzeige' }
  };

  var LANGS = ['ar', 'en', 'de'];
  var DIR = { ar: 'rtl', en: 'ltr', de: 'ltr' };
  var NAMES = { ar: 'ع', en: 'EN', de: 'DE' };

  function getLang() {
    try {
      var saved = localStorage.getItem('souq_lang');
      if (saved && LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    return 'ar';
  }

  function apply(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = DIR[lang];
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var entry = DICT[key];
      if (entry && entry[lang]) el.textContent = entry[lang];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      var entry = DICT[key];
      if (entry && entry[lang]) el.setAttribute('placeholder', entry[lang]);
    });
    var btn = document.getElementById('langToggle');
    if (btn) btn.textContent = NAMES[lang];
  }

  function setLang(lang) {
    try { localStorage.setItem('souq_lang', lang); } catch (e) {}
    apply(lang);
  }

  function cycle() {
    var cur = getLang();
    var idx = (LANGS.indexOf(cur) + 1) % LANGS.length;
    setLang(LANGS[idx]);
  }

  window.souqI18n = { getLang: getLang, setLang: setLang, apply: apply };

  document.addEventListener('DOMContentLoaded', function () {
    apply(getLang());
    var btn = document.getElementById('langToggle');
    if (btn) btn.addEventListener('click', cycle);
  });
})();
