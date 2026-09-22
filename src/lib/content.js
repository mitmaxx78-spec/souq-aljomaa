'use strict';

// Everything here can be edited from /admin without a deploy. Shipped
// defaults live in code; only what Rex actually changes gets a row in
// site_content, so "never touched" and "reset to default" are the same state.
const DEFAULTS = {
  site_name: 'سوق الجمعة',
  hero_title: 'سوق الجمعة',
  hero_sub: 'بيع واشتري كل شي — بسعر ثابت أو بالمزاد',
  whatsapp: '+963 994 229 504',
  footer_note: 'كل إعلان بينراجع قبل ما ينشر، مشان أمان الكل.',

  // Small floating help widget: three quick FAQ answers plus a form that
  // opens a support ticket. All editable so the FAQ text stays current
  // without a deploy.
  help_title: 'مساعدة',
  help_intro: 'عندك سؤال أو مشكلة؟ اقرا الأسئلة الشائعة أو ابعتلنا رسالة.',
  faq1_q: 'كيف بضيف إعلان؟',
  faq1_a: 'اضغط "أعلن" فوق، عبّي المعلومات، وإعلانك بينشر بعد ما نراجعه بوقت قصير.',
  faq2_q: 'في حدا نصبني أو الإعلان مو متل ما وصفوه؟',
  faq2_a: 'روح لصفحة الإعلان واضغط "أبلغ عن هالإعلان"، أو ابعتلنا رسالة من هون وقلنا شو صار.',
  faq3_q: 'كيف بستعيد رصيدي أو بعرف وين راح؟',
  faq3_a: 'روح لصفحة "حسابي" (بالرابط يلي انعطيته لما نشرت أول إعلان) وفيها كل عمليات رصيدك.',
};

const FIELDS = [
  { group: 'عام', keys: ['site_name', 'hero_title', 'hero_sub', 'whatsapp', 'footer_note'] },
  { group: 'مساعدة الزوار', keys: ['help_title', 'help_intro', 'faq1_q', 'faq1_a', 'faq2_q', 'faq2_a', 'faq3_q', 'faq3_a'] },
];

const LABELS = {
  site_name: 'اسم الموقع',
  hero_title: 'العنوان الرئيسي',
  hero_sub: 'العنوان الفرعي',
  whatsapp: 'رقم الواتساب للتواصل',
  footer_note: 'ملاحظة أسفل الصفحة',
  help_title: 'عنوان نافذة المساعدة',
  help_intro: 'مقدمة نافذة المساعدة',
  faq1_q: 'سؤال شائع 1', faq1_a: 'جواب سؤال 1',
  faq2_q: 'سؤال شائع 2', faq2_a: 'جواب سؤال 2',
  faq3_q: 'سؤال شائع 3', faq3_a: 'جواب سؤال 3',
};

function merge(overrides) {
  return { ...DEFAULTS, ...(overrides || {}) };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function render(html, values) {
  return html.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (key in values) return escapeHtml(values[key]);
    return m;
  });
}

module.exports = { DEFAULTS, FIELDS, LABELS, merge, render };
