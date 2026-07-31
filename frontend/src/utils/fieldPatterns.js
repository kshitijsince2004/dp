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
//   "name"      — person names must not contain digits (officers were typing numbers into name
//                 fields). Letters (any script), spaces, and the usual name punctuation
//                 (. ' - /) are allowed; a digit anywhere is rejected.
//   "latlong"   — latitude/longitude must be numeric (optional leading sign + digits + optional
//                 single decimal part). Alphabetic input was silently coerced to null by the
//                 write path (data loss); reject it at entry instead.
//   "mobile"    — exactly 10 digits (Indian mobile). Digits only, length exactly 10.
//   "pincode"   — exactly 6 digits (Indian PIN code). Digits only, length exactly 6
//                 (bug batch 2026-07-23, #B4 — was plain TEXT, accepted anything).
//   "age_range" — UIDB "Approximate Age" — the value is entered by an officer describing an
//                 unidentified body, so it stays free-ish (e.g. "unknown", "30", "25-30", "60+")
//                 rather than a strict integer; only rejects the impossible: a bare number (or
//                 either end of a range) outside 0-120, or content that isn't a number/range/
//                 "unknown" at all (bug batch 2026-07-23, #B9).

const MESSAGES = {
  name: { en: 'Name cannot contain numbers', hi: 'नाम में अंक नहीं हो सकते' },
  latlong: { en: 'Enter a valid number (e.g. 28.6139)', hi: 'मान्य संख्या दर्ज करें (उदा. 28.6139)' },
  mobile: { en: 'Enter a 10-digit mobile number', hi: '10 अंकों का मोबाइल नंबर दर्ज करें' },
  pincode: { en: 'Enter a 6-digit pin code', hi: '6 अंकों का पिन कोड दर्ज करें' },
  age_range: { en: 'Enter an age, a range (e.g. 25-30), "60+", or "Unknown"', hi: 'आयु, एक सीमा (उदा. 25-30), "60+", या "अज्ञात" दर्ज करें' },
};

// A digit anywhere makes a name invalid. (Everything else is permitted — we only reject the
// one thing that is definitely wrong for a name.)
const NAME_HAS_DIGIT = /\d/;
// Optional sign, 1+ integer digits, optional single decimal group. Rejects letters entirely.
const LATLONG_OK = /^[+-]?\d+(\.\d+)?$/;
const MOBILE_OK = /^\d{10}$/;
const PINCODE_OK = /^\d{6}$/;
// digits[-digits] | digits+ | "unknown" (case-insensitive) — e.g. "30", "25-30", "60+", "Unknown".
const AGE_RANGE_SHAPE = /^(\d{1,3})(?:\s*-\s*(\d{1,3})|\+)?$/;

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
    case 'pincode': ok = PINCODE_OK.test(str); break;
    case 'age_range': {
      if (/^unknown$/i.test(str)) { ok = true; break; }
      const m = AGE_RANGE_SHAPE.exec(str);
      if (!m) { ok = false; break; }
      const a = Number(m[1]);
      const b = m[2] !== undefined ? Number(m[2]) : null;
      ok = a >= 0 && a <= 120 && (b === null || (b >= 0 && b <= 120 && b >= a));
      break;
    }
    default: return null; // unknown pattern → don't block
  }
  if (ok) return null;
  const msg = MESSAGES[patternName];
  return lang === 'hi' ? msg.hi : msg.en;
}

const RANGE_MESSAGE = (min, max, lang) => {
  if (min !== undefined && max !== undefined) {
    return lang === 'hi' ? `${min} और ${max} के बीच मान दर्ज करें` : `Enter a value between ${min} and ${max}`;
  }
  if (min !== undefined) return lang === 'hi' ? `${min} या उससे अधिक मान दर्ज करें` : `Enter a value of ${min} or more`;
  return lang === 'hi' ? `${max} या उससे कम मान दर्ज करें` : `Enter a value of ${max} or less`;
};

/** Convenience: validate a field's value from its parsed validation_rules. Checks the named
 * `pattern` (if any) first, then a numeric `min`/`max` range (if either is present — e.g. the
 * *_age_year / age NUMBER fields, bug batch 2026-07-23 #B9) so both constraints share the one
 * registry-driven entry point DynamicForm already calls. */
export function validateFieldPattern(rules, value, lang = 'en') {
  if (!rules) return null;
  const patternErr = rules.pattern ? validatePattern(rules.pattern, value, lang) : null;
  if (patternErr) return patternErr;

  if ((rules.min !== undefined || rules.max !== undefined) && value !== undefined && value !== null && value !== '') {
    const n = Number(value);
    if (!Number.isNaN(n)) {
      if ((rules.min !== undefined && n < rules.min) || (rules.max !== undefined && n > rules.max)) {
        return RANGE_MESSAGE(rules.min, rules.max, lang);
      }
    }
  }
  return null;
}
