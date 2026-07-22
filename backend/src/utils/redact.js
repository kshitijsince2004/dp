/**
 * Redaction helper (logging-instrumentation-2026-07-22, foundation) — MANDATORY use on any
 * object that may carry a secret before it is passed as a log's second argument. See
 * docs/logging-instrumentation-2026-07-22/HANDOFF.md §3 "REDACTION" — no exceptions.
 *
 * Case-insensitive key match against `SENSITIVE_KEYS`. Shallow clone (never mutates the input).
 * Nested one level: a sensitive key found on a direct child object is also masked, but redact()
 * does not recurse arbitrarily deep — callers logging deeply-nested payloads should redact()
 * each level they log.
 */

export const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'access_token',
  'refresh_token',
  'token',
  'authorization',
  'csrftoken',
  'cookie',
  'jwt',
]);

function isSensitiveKey(key) {
  return SENSITIVE_KEYS.has(String(key).toLowerCase());
}

/** Presence/length only for strings (useful to confirm "a token was in fact sent" without ever
 * printing it) — anything else sensitive (objects, numbers, booleans) is fully masked. */
function maskValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return { hasValue: true, len: value.length };
  return '[REDACTED]';
}

function redactShallow(obj) {
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clone)) {
    if (isSensitiveKey(key)) {
      clone[key] = maskValue(clone[key]);
    }
  }
  return clone;
}

/** Shallow-clones `obj`, masking any sensitive key at the top level AND one level of nesting
 * (direct child objects/arrays). Non-object input is returned unchanged (nothing to redact). */
export function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const clone = redactShallow(obj);

  for (const key of Object.keys(clone)) {
    const val = clone[key];
    if (val && typeof val === 'object' && !isSensitiveKey(key)) {
      clone[key] = redactShallow(val);
    }
  }

  return clone;
}
