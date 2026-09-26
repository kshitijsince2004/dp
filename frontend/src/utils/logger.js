// Singleton client-side debug logger (logging-instrumentation-2026-07-22, foundation-owned).
// See docs/logging-instrumentation-2026-07-22/HANDOFF.md for the full contract this implements.
//
// Usage everywhere else in the frontend:
//   import { log } from '../utils/logger.js';
//   log.debug('event:name', { some: 'data' });
//
// Dev/prod gate (HANDOFF §3b): when LOG_ENABLED is false, every method on `log` is a cheap
// no-op — zero console mirroring, zero IndexedDB writes, zero network traffic, zero overhead.

import { getApiBaseUrl } from '../config/apiBase.js';

export const LOG_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEBUG_LOGGING === 'true';

const RING_CAP = 2000;
const FLUSH_INTERVAL_MS = 5000;
const API_BASE = getApiBaseUrl();
const CLIENT_LOG_ENDPOINT = `${API_BASE}/logs/client`;

function makeId(prefix) {
  try {
    return crypto.randomUUID();
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// One session id per tab load — the filename the backend stores this tab's log lines under
// (`backend/logs/frontend/<sessionId>.log`).
export const sessionId = makeId('sess');

/** A fresh id for one API call — attached as the `x-request-id` header by api.js's request
 * interceptor, so the backend log line for that call and this frontend's log line for it share
 * the same value and can be grep'd together. */
export function newRequestId() {
  return makeId('req');
}

// ── in-memory ring (feeds downloadLogs()) + persisted copy (IndexedDB, localStorage fallback) ──

let ring = []; // full session history, capped — downloadLogs() reads from here
let pending = []; // entries not yet flushed to the backend

const DB_NAME = 'pharos-client-logs';
const STORE_NAME = 'entries';
let idbPromise = null;

function openIdb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: '_idbId', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

const LS_FALLBACK_KEY = 'pharos_client_logs_fallback';

async function persistEntry(entry) {
  // Only persist errors/warnings to long-term storage to keep UI thread fast; in-memory ring keeps everything
  if (entry.level !== 'error' && entry.level !== 'warn') return;
  try {
    const db = await openIdb();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).add(entry);
      return;
    }
  } catch {
    // fall through to localStorage
  }
  try {
    const existing = JSON.parse(localStorage.getItem(LS_FALLBACK_KEY) || '[]');
    existing.push(entry);
    while (existing.length > 200) existing.shift();
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(existing));
  } catch {
    // localStorage full/unavailable
  }
}

function pushEntry(level, event, data) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    sessionId,
    requestId: data?.requestId ?? null,
    url: typeof window !== 'undefined' ? window.location.href : null,
    data: data ?? null,
  };

  ring.push(entry);
  if (ring.length > RING_CAP) ring.shift();
  pending.push(entry);
  if (pending.length > RING_CAP) pending.shift();

  if (import.meta.env.DEV) {
    const consoleFn = console[level] || console.log;
    consoleFn(`[${entry.ts}] ${level.toUpperCase()} ${event}`, data ?? '');
  }

  persistEntry(entry);
  scheduleFlush();

  if (level === 'error') flush();
}

// ── batch flush to the backend ───────────────────────────────────────────────────────────────

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (pending.length) flush();
  }, FLUSH_INTERVAL_MS);
}

let flushing = false;
function flush() {
  if (flushing || pending.length === 0) return;
  flushing = true;
  const toSend = pending;
  pending = [];
  // RAW fetch — deliberately NOT the app's axios instance (utils/api.js). That instance is
  // interceptor-wrapped (auth/logging); routing the log-shipping POST through it risks
  // feedback loops or auth failures swallowing logs (HANDOFF §6.1/§6.2). This is the one
  // deliberate bypass in the whole pipe.
  fetch(CLIENT_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, entries: toSend }),
    keepalive: true,
  })
    .catch(() => {
      // Never route a flush failure back through `log.*` — that would re-enqueue an entry and
      // could recurse (flush fails -> log the failure -> triggers another flush -> ...). Silently
      // drop the network attempt; the IndexedDB/localStorage copy already has these entries, and
      // the "Download logs" button is the documented fallback when ingest itself is unreachable.
    })
    .finally(() => {
      flushing = false;
    });
}

if (typeof window !== 'undefined' && LOG_ENABLED) {
  window.addEventListener('beforeunload', () => flush());
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }
}

// ── public API ────────────────────────────────────────────────────────────────────────────────

function noop() {}

const realLog = {
  debug: (event, data) => pushEntry('debug', event, data),
  info: (event, data) => pushEntry('info', event, data),
  warn: (event, data) => pushEntry('warn', event, data),
  error: (event, data) => pushEntry('error', event, data),
};

/** `log.debug/info/warn/error(event, data)` — see module doc comment. All four are no-ops when
 * `LOG_ENABLED` is false (prod without the override flag). */
export const log = LOG_ENABLED ? realLog : { debug: noop, info: noop, warn: noop, error: noop };

/** Exports the current session's full ring buffer as a downloadable NDJSON `.log` file — the
 * manual fallback path for when the backend ingest itself is broken/unreachable (HANDOFF §6.5).
 * No-op when logging is disabled (nothing was ever buffered). */
export function downloadLogs() {
  if (!LOG_ENABLED || typeof document === 'undefined') return;
  const content = ring.map((e) => JSON.stringify(e)).join('\n');
  const blob = new Blob([content], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pharos-client-logs-${sessionId}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default log;
