import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Ambient per-request correlation context (logging-instrumentation-2026-07-22, foundation).
 *
 * `requestLogger.middleware.js` wraps every request in `runWithContext({ requestId, userId,
 * role }, next)`. From that point on, ANY code running on this request's call stack — service,
 * mapper, event handler, whatever — can call `getRequestId()` / `getContext()` and get the same
 * values back, with zero parameters threaded through function signatures. `utils/logger.js`'s
 * format calls `getRequestId()` on every log line so the requestId shows up automatically.
 *
 * This is the single most important design point in the whole logging effort (HANDOFF.md §2):
 * do not invent a second, per-module correlation scheme (e.g. passing `requestId` as an explicit
 * function argument) — it already exists ambiently here.
 */
const als = new AsyncLocalStorage();

/** Run `fn` with `{ requestId, userId, role }` bound as the ambient context for its entire
 * (async) call stack, including anything scheduled from within it. */
export function runWithContext(ctx, fn) {
  const store = {
    requestId: ctx?.requestId ?? null,
    userId: ctx?.userId ?? null,
    role: ctx?.role ?? null,
  };
  return als.run(store, fn);
}

/** The full ambient context, or null if called outside any `runWithContext` (e.g. at boot, in a
 * script, or in a background cron job that never wrapped itself — those simply log without a
 * requestId, which is correct: there is no request to correlate). */
export function getContext() {
  return als.getStore() || null;
}

/** Convenience accessor — `utils/logger.js`'s format calls this on every line. */
export function getRequestId() {
  return als.getStore()?.requestId ?? null;
}

/** Merge additional fields (e.g. `{ userId, role }` once authMiddleware has resolved them) into
 * the CURRENT request's already-running context. No-op outside a context — callers don't need to
 * guard for that themselves. */
export function setContext(partial) {
  const store = als.getStore();
  if (!store || !partial) return;
  Object.assign(store, partial);
}
