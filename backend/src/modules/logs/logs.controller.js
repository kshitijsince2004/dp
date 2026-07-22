import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { getLogger } from '../../utils/logger.js';
import { redact } from '../../utils/redact.js';

const log = getLogger('logs.controller');

const FRONTEND_LOG_DIR = path.join(process.cwd(), 'logs', 'frontend');

// sessionId becomes a filename on disk (`<sessionId>.log`) — a safe slug (alnum + dash, bounded
// length) is REJECTED-if-not-matching rather than sanitized-and-continued: anything containing a
// path separator, `..`, or a null byte is a client sending garbage/an attack, not something to
// clean up and proceed with (P2's "reject only the impossible" spirit, applied to a filename
// instead of a form field).
const SAFE_SESSION_ID = /^[A-Za-z0-9-]{1,128}$/;

/**
 * Best-effort JWT decode — attaches a userId to stored log lines when a valid token IS present,
 * but NEVER rejects the request for a missing/invalid/expired one. This route's entire purpose
 * (HANDOFF.md §6 trap #3) is to keep accepting logs from a browser whose auth is broken or that
 * is simply logged out — exactly the state a tester is often in while reproducing an auth bug.
 */
function bestEffortUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    return decoded.sub ?? decoded.id ?? null;
  } catch {
    return null;
  }
}

/**
 * POST /logs/client — ingest a batch of frontend log entries (NDJSON-friendly: one JSON line per
 * entry) and append them to `backend/logs/frontend/<sessionId>.log`. Dev/prod gated by
 * `env.DEBUG_LOGGING` (HANDOFF.md §3b): when off, responds 204 and writes nothing at all — no
 * partial/soft-disabled behavior to reason about.
 */
export async function ingestClientLogs(req, res) {
  if (!env.DEBUG_LOGGING) {
    return res.status(204).end();
  }

  const { sessionId, entries } = req.body || {};

  if (typeof sessionId !== 'string' || !SAFE_SESSION_ID.test(sessionId)) {
    log.warn('ingestClientLogs: rejected invalid sessionId', { sessionIdType: typeof sessionId });
    return res.status(400).json({ success: false, message: 'Invalid or missing sessionId' });
  }
  if (!Array.isArray(entries)) {
    return res.status(400).json({ success: false, message: 'entries must be an array' });
  }
  if (entries.length === 0) {
    return res.status(200).json({ success: true, stored: 0 });
  }

  const userId = bestEffortUserId(req);
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
  const receivedAt = new Date().toISOString();

  const lines = entries
    .map((entry) => {
      const safeEntry = redact(entry && typeof entry === 'object' ? entry : { value: entry });
      return JSON.stringify({ ...safeEntry, receivedAt, ip, userId });
    })
    .join('\n') + '\n';

  const filePath = path.join(FRONTEND_LOG_DIR, `${sessionId}.log`);

  try {
    fs.mkdirSync(FRONTEND_LOG_DIR, { recursive: true });
    fs.appendFileSync(filePath, lines);
  } catch (err) {
    log.error('ingestClientLogs: failed to write client log file', { err, sessionId });
    return res.status(500).json({ success: false, message: 'Failed to store logs' });
  }

  log.debug('ingestClientLogs: stored', { sessionId, count: entries.length, hasUser: !!userId });
  return res.status(200).json({ success: true, stored: entries.length });
}
