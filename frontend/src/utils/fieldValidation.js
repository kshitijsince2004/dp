// Central, data-driven validation for every dynamic-form field, in every record type.

export function parseRules(rawRules) {
  if (!rawRules) return {};
  if (typeof rawRules === 'object') return rawRules;
  try { return JSON.parse(rawRules); } catch { return {}; }
}

const CURRENT_YEAR = new Date().getFullYear();

const digitsOnly = (s) => s.replace(/\D/g, '');
const lettersOnly = (s) => s.replace(/[^\p{L}\s.'-]/gu, '');

const MOBILE_MSG = { en: 'Enter a valid 10-digit mobile number', hi: 'मान्य 10 अंकों का मोबाइल नंबर दर्ज करें' };
const EMAIL_MSG = { en: 'Enter a valid email address', hi: 'मान्य ईमेल पता दर्ज करें' };

const NAME_SUFFIXES = ['_first_name', '_middle_name', '_last_name', '_father_name', '_father_husband_name', '_relative_name', '_parent_name'];
const NAME_KEYS = new Set(['parents_name', 'accused_name', 'complainant_name', 'arrested_name', 'missing_name', 'deceased_name', 'caller_name', 'informant_name', 'io_name', 'operator_name', 'arresting_officer']);

const RULES = [
  {
    name: 'gd_no',
    test: (key) => key === 'gd_no',
    sanitize: (v) => digitsOnly(v).slice(0, 15),
  },
  {
    name: 'fir_no',
    test: (key) => key === 'fir_no',
    // "104/2026" — digits, a single slash, then the year. The number before the slash
    // is deliberately uncapped (station FIR numbers vary in length); only the year
    // after the slash is capped, at 4 digits. Extra slashes collapse into the year
    // segment instead of being silently dropped.
    sanitize: (v) => {
      const cleaned = v.replace(/[^\d/]/g, '');
      const i = cleaned.indexOf('/');
      if (i === -1) return cleaned;
      return `${cleaned.slice(0, i)}/${cleaned.slice(i + 1).replace(/\//g, '').slice(0, 4)}`;
    },
    pattern: /^\d+\/\d{4}$/,
    message: { en: 'FIR number must be in the format Number/Year, e.g. 104/2026', hi: 'प्राथमिकी संख्या Number/Year प्रारूप में होनी चाहिए, जैसे 104/2026' },
  },
  {
    name: 'mobile_country_code',
    test: (key) => key.endsWith('_mobile_country_code'),
    sanitize: (v) => {
      const plus = v.startsWith('+') ? '+' : '';
      return (plus + digitsOnly(v)).slice(0, 4);
    },
  },
  {
    name: 'email',
    test: (key) => key.endsWith('_email'),
    sanitize: (v) => v.replace(/[^\w@.+-]/g, ''),
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: EMAIL_MSG,
  },
  {
    name: 'mobile',
    test: (key) => key.includes('mobile') || key.endsWith('_phone_number'),
    sanitize: (v) => digitsOnly(v).slice(0, 10),
    pattern: /^[6-9]\d{9}$/,
    message: MOBILE_MSG,
  },
  {
    name: 'pincode',
    test: (key) => key.endsWith('pincode'),
    sanitize: (v) => digitsOnly(v).slice(0, 6),
    pattern: /^\d{6}$/,
    message: { en: 'Pincode must be exactly 6 digits', hi: 'पिनकोड ठीक 6 अंकों का होना चाहिए' },
  },
  {
    name: 'age_month',
    test: (key) => key.endsWith('_age_month'),
    sanitize: (v) => digitsOnly(v).slice(0, 2),
    validate: (v) => Number(v) >= 0 && Number(v) <= 11,
    message: { en: 'Month must be between 0 and 11', hi: 'महीना 0 से 11 के बीच होना चाहिए' },
  },
  {
    name: 'age',
    test: (key) => key === 'age' || key.endsWith('_age') || key.endsWith('_age_year'),
    sanitize: (v) => digitsOnly(v).slice(0, 3),
    validate: (v) => Number(v) >= 0 && Number(v) <= 120,
    message: { en: 'Enter a valid age (0-120)', hi: 'मान्य आयु दर्ज करें (0-120)' },
  },
  {
    name: 'birth_year',
    test: (key) => key.endsWith('_birth_year'),
    sanitize: (v) => digitsOnly(v).slice(0, 4),
    validate: (v) => Number(v) >= 1900 && Number(v) <= CURRENT_YEAR,
    message: { en: `Enter a valid year (1900-${CURRENT_YEAR})`, hi: `मान्य वर्ष दर्ज करें (1900-${CURRENT_YEAR})` },
  },
  {
    name: 'coordinate',
    test: (key) => /(^|_)(latitude|longitude)$/.test(key),
    sanitize: (v) => {
      const neg = v.startsWith('-') ? '-' : '';
      const [intPart = '', ...dec] = v.replace(/[^0-9.]/g, '').split('.');
      return neg + intPart + (dec.length ? `.${dec.join('')}` : '');
    },
    pattern: /^-?\d{1,3}(\.\d+)?$/,
    message: { en: 'Enter a valid coordinate', hi: 'मान्य निर्देशांक दर्ज करें' },
  },
  {
    name: 'imei',
    test: (key) => key === 'phone_imei',
    sanitize: (v) => digitsOnly(v).slice(0, 15),
    validate: (v) => v.length === 15,
    message: { en: 'IMEI must be exactly 15 digits', hi: 'IMEI ठीक 15 अंकों का होना चाहिए' },
  },
  {
    name: 'vehicle_no',
    test: (key) => key === 'vehicle_no',
    sanitize: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11),
    pattern: /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/,
    message: { en: 'Enter a valid vehicle registration number (e.g. DL01AB1234)', hi: 'मान्य वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234)' },
  },
  {
    name: 'chassis_engine_no',
    test: (key) => key.endsWith('chassis_no') || key.endsWith('engine_no'),
    sanitize: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''),
  },
  {
    name: 'person_name',
    test: (key) => NAME_KEYS.has(key) || NAME_SUFFIXES.some((sfx) => key.endsWith(sfx)),
    sanitize: lettersOnly,
  },
  {
    name: 'phone_type',
    test: (_key, type) => type === 'PHONE',
    sanitize: (v) => digitsOnly(v).slice(0, 10),
    pattern: /^[6-9]\d{9}$/,
    message: MOBILE_MSG,
  },
  {
    name: 'email_type',
    test: (_key, type) => type === 'EMAIL',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: EMAIL_MSG,
  },
  {
    name: 'number_type',
    test: (_key, type) => type === 'NUMBER',
    sanitize: digitsOnly,
  },
];

const DEFAULT_RULE = { name: 'default' };

export function resolveFieldRule(field) {
  const key = field?.field_key || '';
  const type = (field?.field_type || 'TEXT').toUpperCase();
  return RULES.find((r) => r.test(key, type)) || DEFAULT_RULE;
}

/** Keystroke-level filter — strips characters a field can never legally contain. */
export function sanitizeFieldValue(field, rawValue) {
  if (typeof rawValue !== 'string') return rawValue;
  const rule = resolveFieldRule(field);
  return rule.sanitize ? rule.sanitize(rawValue) : rawValue;
}

export function checkFieldFormat(field, value, lang = 'en') {
  const rule = resolveFieldRule(field);
  const strVal = String(value ?? '');
  if (!strVal) return null;

  const failed = (rule.pattern && !rule.pattern.test(strVal)) || (rule.validate && !rule.validate(strVal));
  if (!failed || !rule.message) return null;
  return lang === 'hi' ? rule.message.hi : rule.message.en;
}

export function getFieldError(field, value, lang = 'en') {
  const rules = parseRules(field?.validation_rules);
  const isEmpty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

  if (isEmpty) {
    if (!rules.required) return null;
    const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
    return lang === 'hi' ? `${label} आवश्यक है` : `${label} is required`;
  }

  return checkFieldFormat(field, value, lang);
}

// Config-driven pattern checks — a field's own validation_rules can carry a named
// `pattern` and/or numeric `min`/`max`, independent of the field_key-based RULES table
// above. Covers cases the key-based rules don't: DECEASED/UIDB "Approximate Age" (free-ish
// text like "25-30", "60+", "Unknown") and generic numeric ranges from field config.
const PATTERN_MESSAGES = {
  name: { en: 'Name cannot contain numbers', hi: 'नाम में अंक नहीं हो सकते' },
  latlong: { en: 'Enter a valid number (e.g. 28.6139)', hi: 'मान्य संख्या दर्ज करें (उदा. 28.6139)' },
  mobile: { en: 'Enter a 10-digit mobile number', hi: '10 अंकों का मोबाइल नंबर दर्ज करें' },
  pincode: { en: 'Enter a 6-digit pin code', hi: '6 अंकों का पिन कोड दर्ज करें' },
  age_range: { en: 'Enter an age, a range (e.g. 25-30), "60+", or "Unknown"', hi: 'आयु, एक सीमा (उदा. 25-30), "60+", या "अज्ञात" दर्ज करें' },
};

const NAME_HAS_DIGIT = /\d/;
const LATLONG_OK = /^[+-]?\d+(\.\d+)?$/;
const MOBILE_PATTERN_OK = /^\d{10}$/;
const PINCODE_PATTERN_OK = /^\d{6}$/;
// digits[-digits] | digits+ | "unknown" (case-insensitive) — e.g. "30", "25-30", "60+", "Unknown".
const AGE_RANGE_SHAPE = /^(\d{1,3})(?:\s*-\s*(\d{1,3})|\+)?$/;

function validateNamedPattern(patternName, value, lang = 'en') {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  if (str === '') return null;

  let ok;
  switch (patternName) {
    case 'name': ok = !NAME_HAS_DIGIT.test(str); break;
    case 'latlong': ok = LATLONG_OK.test(str); break;
    case 'mobile': ok = MOBILE_PATTERN_OK.test(str); break;
    case 'pincode': ok = PINCODE_PATTERN_OK.test(str); break;
    case 'age_range': {
      if (/^unknown$/i.test(str)) { ok = true; break; }
      const m = AGE_RANGE_SHAPE.exec(str);
      if (!m) { ok = false; break; }
      const a = Number(m[1]);
      const b = m[2] !== undefined ? Number(m[2]) : null;
      ok = a >= 0 && a <= 120 && (b === null || (b >= 0 && b <= 120 && b >= a));
      break;
    }
    default: return null; // unknown pattern name → don't block
  }
  if (ok) return null;
  const msg = PATTERN_MESSAGES[patternName];
  return lang === 'hi' ? msg.hi : msg.en;
}

const RANGE_MESSAGE = (min, max, lang) => {
  if (min !== undefined && max !== undefined) {
    return lang === 'hi' ? `${min} और ${max} के बीच मान दर्ज करें` : `Enter a value between ${min} and ${max}`;
  }
  if (min !== undefined) return lang === 'hi' ? `${min} या उससे अधिक मान दर्ज करें` : `Enter a value of ${min} or more`;
  return lang === 'hi' ? `${max} या उससे कम मान दर्ज करें` : `Enter a value of ${max} or less`;
};

/** Checks a field's own `validation_rules.pattern` (name) and `min`/`max`. Runs for ANY
 * non-empty value, required or not — empty is left to getFieldError's requiredness check. */
export function validateFieldPattern(rules, value, lang = 'en') {
  if (!rules) return null;
  const patternErr = rules.pattern ? validateNamedPattern(rules.pattern, value, lang) : null;
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
