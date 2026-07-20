// Reusable, registry-driven field-value validators (bug batch 2026-07-20, #10).
//
// P2 (ENGINEERING_BASELINE) constrain→normalize→enforce, "reject only the impossible":
// a field opts into one of these by carrying `validation_rules.pattern: "<name>"` in
// config/fields/*.json. `validateFieldPattern` (read by DynamicForm's validateSection) then
// rejects only values that are genuinely wrong for that kind of field — never blocks a merely
// unusual-but-plausible entry. This is the SINGLE place the rules live; do not scatter
// per-field regexes across renderers (that was the pre-2026-07-20 debt).
//
// Named patterns:
//   "name"    — person names must not contain digits (officers were typing numbers into name
//               fields). Letters (any script), spaces, and the usual name punctuation
//               (. ' - /) are allowed; a digit anywhere is rejected.
//   "latlong" — latitude/longitude must be numeric (optional leading sign + digits + optional
//               single decimal part). Alphabetic input was silently coerced to null by the
//               write path (data loss); reject it at entry instead.
//   "mobile"  — exactly 10 digits (Indian mobile). Digits only, length exactly 10.

const MESSAGES = {
  name: { en: 'Name cannot contain numbers', hi: 'नाम में अंक नहीं हो सकते' },
  latlong: { en: 'Enter a valid number (e.g. 28.6139)', hi: 'मान्य संख्या दर्ज करें (उदा. 28.6139)' },
  mobile: { en: 'Enter a 10-digit mobile number', hi: '10 अंकों का मोबाइल नंबर दर्ज करें' },
};

// A digit anywhere makes a name invalid. (Everything else is permitted — we only reject the
// one thing that is definitely wrong for a name.)
const NAME_HAS_DIGIT = /\d/;
// Optional sign, 1+ integer digits, optional single decimal group. Rejects letters entirely.
const LATLONG_OK = /^[+-]?\d+(\.\d+)?$/;
const MOBILE_OK = /^\d{10}$/;

/** Validate a value against a named pattern. Returns null when the value is acceptable (empty
 * values are always acceptable here — requiredness is a separate concern), otherwise a
 * human-readable, localized error string. Unknown pattern names are a no-op (null). */
export function validatePattern(patternName, value, lang = 'en') {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  if (str === '') return null;

  let ok;
  switch (patternName) {
    case 'name': ok = !NAME_HAS_DIGIT.test(str); break;
    case 'latlong': ok = LATLONG_OK.test(str); break;
    case 'mobile': ok = MOBILE_OK.test(str); break;
    default: return null; // unknown pattern → don't block
  }
  if (ok) return null;
  const msg = MESSAGES[patternName];
  return lang === 'hi' ? msg.hi : msg.en;
}

/** Convenience: validate a field's value from its parsed validation_rules. */
export function validateFieldPattern(rules, value, lang = 'en') {
  if (!rules || !rules.pattern) return null;
  return validatePattern(rules.pattern, value, lang);
}
