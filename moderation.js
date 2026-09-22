'use strict';

// A deterministic first pass, not an AI reviewer -- a real content-moderation
// AI (reading photos, understanding context, catching coded language) is a
// separate, ongoing cost this project doesn't have yet. What this can do
// cheaply and reliably: catch a listing that names something outright illegal
// to sell, in plain Arabic or Latin script, before a human ever has to see
// it. BLOCKED stops the submission outright with a clear reason. FLAGGED
// still goes to the normal PENDING queue but is marked so an admin reviewing
// a stack of listings knows which ones need a closer read first -- it never
// approves or rejects anything on its own.
const BLOCKED_TERMS = [
  'سلاح', 'مسدس', 'رشاش', 'قنبلة', 'متفجرات', 'ذخيرة',
  'مخدرات', 'حشيش', 'كوكايين', 'هيروين', 'حبوب مخدرة',
  'weapon', 'gun', 'pistol', 'explosive', 'ammunition',
  'drugs', 'cocaine', 'heroin',
];

const FLAGGED_TERMS = [
  'جواز سفر', 'هوية شخصية', 'بطاقة شخصية', // trading in ID documents
  'عملة مزورة', 'مزور',
  'passport', 'fake id', 'counterfeit',
];

function scan(text) {
  const t = String(text || '').toLowerCase();
  const blocked = BLOCKED_TERMS.find((term) => t.includes(term.toLowerCase()));
  if (blocked) return { blocked: true, term: blocked };
  const flagged = FLAGGED_TERMS.find((term) => t.includes(term.toLowerCase()));
  if (flagged) return { blocked: false, flagged: true, term: flagged };
  return { blocked: false, flagged: false };
}

module.exports = { scan };
