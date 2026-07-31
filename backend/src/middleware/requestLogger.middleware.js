import crypto from 'crypto';
import { runWithContext } from '../utils/requestContext.js';
import { getLogger } from '../utils/logger.js';
import { redact } from '../utils/redact.js';

const log = getLogger('http');

/** Splits `req.originalUrl` into a bare path + a redacted query object. Load-bearing: the SSE
 * auth path (`sseAuthMiddleware`, notifications stream) carries the raw access token as
 * `?token=...` because EventSource cannot set custom headers — logging `originalUrl` verbatim
 * would print a full JWT into every backend log file. `redact()` masks any sensitive-named query
 * param (token/access_token/jwt/etc, case-insensitive) while still recording which params were
 * present, which is what caught this exact leak during foundation verification. */
function safeUrlParts(req) {
  const raw = req.originalUrl || '';
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return { url: raw };
  const urlPath = raw.slice(0, qIndex);
  const query = Object.fromEntries(new URLSearchParams(raw.slice(qIndex + 1)));
  return { url: urlPath, query: redact(query) };
}

/**
 * Foundation's request-correlation + request/response logging middleware
 * (logging-instrumentation-2026-07-22, HANDOFF.md §2/§4). Registered EARLY in app.js — right
 * after cookieParser, before everything else (including the client-log ingest router) — so:
 *
 *   1. Every request gets an `x-request-id` (read from the incoming header if the caller
 *      already has one — e.g. the frontend's api.js interceptor — otherwise generated here).
 *   2. The rest of the request's handling runs inside `runWithContext(...)` (AsyncLocalStorage,
 *      utils/requestContext.js), so every `getLogger(...)` call anywhere on this request's stack
 *      — controller, service, mapper, event publish — picks up the SAME requestId automatically,
 *      with zero parameters threaded through any function signature.
 *   3. The id is echoed back via the `x-request-id` response header so the frontend can log the
 *      same id it sent and the two logs correlate 1:1 for one API call.
 *
 * userId/role: `req.user` is not populated yet at this point for the normal flow (authMiddleware
 * runs later, per-router) — that's fine, the context is intentionally mutable via
 * `setContext({ userId, role })`, which any router's own auth step can call once it resolves
 * `req.user`, to enrich every subsequent log line on this request with who made it. Not wiring
 * that up anywhere is not a bug — the requestId alone is the load-bearing correlation key this
 * middleware exists to provide; userId enrichment is a bonus a later agent can add cheaply.
 */
export function requestLoggerMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim()
    ? incomingId.trim()
    : crypto.randomUUID();

  res.setHeader('x-request-id', requestId);

  const ctx = {
    requestId,
    userId: req.user?.id || req.user?.userId || req.user?.sub || null,
    role: req.user?.role || null,
  };

  runWithContext(ctx, () => {
    const startedAt = process.hrtime.bigint();
    const urlParts = safeUrlParts(req);

    log.info('request:start', { method: req.method, ...urlParts });
    // Body logged separately at debug (dropped entirely outside dev) and always redacted —
    // request:start above intentionally carries only method/url per the convention.
    if (req.body && Object.keys(req.body).length) {
      log.debug('request:body', { method: req.method, ...urlParts, body: redact(req.body) });
    }

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      log.info('request:finish', {
        method: req.method,
        ...urlParts,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  });
}
