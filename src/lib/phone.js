'use strict';

/**
 * Phone canonicalisation for the public signup forms.
 *
 * The waiting list counts one row per person and the per-area totals decide
 * which neighbourhood opens first. Without this, one person who writes
 * "0912 345 678" on Monday and "+963912345678" on Friday is two people in two
 * different tallies, and the launch decision is made on an inflated number.
 *
 * Syrian mobiles are 09XXXXXXXX nationally and +963 9XXXXXXXX internationally,
 * so both collapse onto +9639XXXXXXXX. Anything that does not look Syrian is
 * left alone apart from stripping punctuation — guessing a country code for a
 * number we do not recognise would corrupt it rather than clean it.
 */

// Arabic-Indic and Eastern Arabic-Indic digits, in order 0-9. A phone typed on
// an Arabic keyboard arrives as ٠٩١٢..., which every later step would treat as
// non-numeric and discard entirely.
const AR_DIGITS = /[٠-٩۰-۹]/g;

function asciiDigits(s) {
  return s.replace(AR_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * @param {string} raw whatever the person typed
 * @returns {string} canonical form, or the cleaned input when unrecognised
 */
function normalizePhone(raw) {
  if (typeof raw !== 'string') return '';

  let s = asciiDigits(raw).trim();

  // Keep a leading + as a marker that the country code is already present,
  // then drop every other non-digit: spaces, dashes, brackets, dots, and the
  // RTL/LTR marks a phone keyboard can leave behind.
  const hadPlus = s.startsWith('+') || s.startsWith('00');
  s = s.replace(/\D/g, '');
  if (s.startsWith('00')) s = s.slice(2);

  if (!s) return '';

  // National form: 09XXXXXXXX -> +9639XXXXXXXX. Only when a leading zero is
  // followed by a 9, which is what every Syrian mobile starts with.
  if (!hadPlus && s.startsWith('09') && s.length === 10) {
    return '+963' + s.slice(1);
  }

  // Country code present, with or without the +.
  if (s.startsWith('963')) {
    const rest = s.slice(3).replace(/^0+/, '');
    if (rest.length === 9 && rest.startsWith('9')) return '+963' + rest;
    return '+963' + rest;
  }

  // Bare mobile without the trunk zero: 9XXXXXXXX.
  if (!hadPlus && s.length === 9 && s.startsWith('9')) {
    return '+963' + s;
  }

  // Not a Syrian number we recognise. Preserve it rather than mangle it: a
  // German number typed by someone in Leipzig is still a real lead.
  return hadPlus ? '+' + s : s;
}

/**
 * A number is usable if we can actually call or message it. Nine digits is the
 * shortest real national number; anything below that is a typo, and telling
 * the person so is what keeps them from retyping the same thing and giving up.
 */
function isCallable(normalized) {
  const digits = String(normalized).replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

module.exports = { normalizePhone, isCallable };
