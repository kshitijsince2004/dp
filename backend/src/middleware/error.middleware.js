import { ApiError } from '../utils/ApiError.js';
import { getLogger } from '../utils/logger.js';
import { redact } from '../utils/redact.js';

const log = getLogger('error.middleware');

/**
 * Global Express error handler.
 * Must be the LAST middleware registered in app.js.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // Enriched, structured (HANDOFF.md §3): `err` as the meta key lets the logger's
  // `expandErrorMeta` format expand name/message/stack/code automatically (same convention as
  // records.service.js) — no need to hand-pluck `err.stack` separately. Body/query redacted
  // since a request that errored may carry the exact secret-bearing payload the redaction rule
  // exists for (e.g. a login failure). This does not duplicate requestLogger.middleware.js's
  // request:start/finish lines — those log the request lifecycle; this logs the failure detail.
  log.error('errorHandler: unhandled error reached global handler', {
    statusCode: err.statusCode || 500,
    method: req.method,
    // `req.path` only, NEVER req.originalUrl — the SSE auth route carries the raw JWT as
    // `?token=...` (EventSource can't set headers), and req.originalUrl includes the query
    // string verbatim. requestLogger.middleware.js's safeUrlParts() exists for this exact leak;
    // this handler isn't allowed to touch that foundation-owned file, so it just avoids the
    // query string entirely rather than reimplementing redaction on the URL.
    path: req.path,
    userId: req.user?.id || null,
    role: req.user?.role || null,
    body: req.body && Object.keys(req.body).length ? redact(req.body) : undefined,
    query: req.query && Object.keys(req.query).length ? redact(req.query) : undefined,
    err,
  });

  // Known operational error
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
      timestamp: err.timestamp,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({
      success: false,
      statusCode: 422,
      message: 'Validation failed',
      errors,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message: `${field} already exists`,
      errors: [],
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: `Invalid ${err.path}: ${err.value}`,
      errors: [],
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Invalid or expired token',
      errors: [],
    });
  }

  // Fallback — 500 Internal Server Error
  return res.status(500).json({
    success: false,
    statusCode: 500,
    message: 'Internal server error',
    errors: [],
  });
};

/**
 * 404 Not Found handler — register AFTER all routes.
 */
export const notFound = (req, res) => {
  // path only, not originalUrl — same query-string/JWT-leak reasoning as errorHandler above.
  log.warn('notFound: route not found', { method: req.method, path: req.path });
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
};
