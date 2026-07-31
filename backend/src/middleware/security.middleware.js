import { getLogger } from '../utils/logger.js';

const log = getLogger('security.middleware');

function isIntranetIp(ip) {
  if (!ip) return false;
  let cleanIp = ip;
  if (ip.startsWith('::ffff:')) {
    cleanIp = ip.substring(7);
  }
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') return true;

  if (cleanIp.startsWith('10.')) return true;
  if (cleanIp.startsWith('192.168.')) return true;
  if (cleanIp.startsWith('172.')) {
    const parts = cleanIp.split('.');
    if (parts.length >= 2) {
      const secondPart = parseInt(parts[1], 10);
      if (secondPart >= 16 && secondPart <= 31) return true;
    }
  }
  return false;
}

export const ipAllowlistMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (process.env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true') {
    return next();
  }

  const enforceIntranet = process.env.ENFORCE_INTRANET === 'true';
  if (enforceIntranet && !isIntranetIp(clientIp)) {
    log.warn('ipAllowlistMiddleware: rejected — IP outside allowed intranet range', { clientIp, path: req.path });
    return res.status(403).json({
      status: 'error',
      success: false,
      code: 'FORBIDDEN',
      message: `Access denied: IP address ${clientIp} is outside the allowed intranet range.`
    });
  }
  log.debug('ipAllowlistMiddleware: allowed', { clientIp, enforceIntranet, path: req.path });
  next();
};

import crypto from 'crypto';

export const csrfDoubleSubmitMiddleware = (req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  let csrfTokenCookie = req.cookies ? req.cookies['csrfToken'] : null;

  // 1. Always provision a CSRF token if the user doesn't have one
  if (!csrfTokenCookie) {
    csrfTokenCookie = crypto.randomUUID();
    res.cookie('csrfToken', csrfTokenCookie, {
      httpOnly: false, // Frontend needs to read this for double-submit
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });
    log.debug('csrfDoubleSubmitMiddleware: provisioned new csrfToken cookie', { path: req.path });
  }

  // 2. Safe methods are always allowed
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 3. Exempt initial Authentication endpoints because the browser won't
  // have the token to send in the header yet (it gets provisioned on this response)
  const exemptPaths = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/auth/login', '/api/auth/refresh'];
  if (exemptPaths.includes(req.path)) {
    log.debug('csrfDoubleSubmitMiddleware: exempt path, skipping check', { path: req.path });
    return next();
  }

  if (process.env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true') {
    return next();
  }

  const csrfTokenHeader = req.headers['x-csrf-token'];

  // 4. Validate Double-Submit matching
  if (!csrfTokenCookie || !csrfTokenHeader || csrfTokenCookie !== csrfTokenHeader) {
    log.warn('csrfDoubleSubmitMiddleware: rejected — CSRF token mismatch or missing', {
      path: req.path, method: req.method, hasCookie: !!csrfTokenCookie, hasHeader: !!csrfTokenHeader,
    });
    return res.status(403).json({
      status: 'error',
      success: false,
      code: 'FORBIDDEN',
      message: 'CSRF token mismatch or missing. Double-submit token validation failed.'
    });
  }
  log.debug('csrfDoubleSubmitMiddleware: token matched, allowed', { path: req.path, method: req.method });
  next();
};

const rateLimitStores = {};

export const roleRateLimitMiddleware = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  if (process.env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true') {
    return next();
  }

  const userId = req.user.userId || req.user.id;
  const role = req.user.role;

  let limit = 100;
  if (role === 'HC') limit = 200;
  else if (role === 'SHO') limit = 150;
  else if (role === 'HQ_ANALYST' || role === 'HQ_ADMIN') limit = 300;
  else if (role === 'SYSTEM_ADMIN') limit = 50;

  const now = Date.now();
  if (!rateLimitStores[userId]) {
    rateLimitStores[userId] = [];
  }

  rateLimitStores[userId] = rateLimitStores[userId].filter(timestamp => now - timestamp < 60000);

  if (rateLimitStores[userId].length >= limit) {
    log.warn('roleRateLimitMiddleware: limit hit', { userId, role, limit, path: req.path });
    return res.status(429).json({
      status: 'error',
      success: false,
      code: 'RATE_LIMITED',
      message: 'Too many requests for your role. Please try again later.'
    });
  }

  rateLimitStores[userId].push(now);
  log.debug('roleRateLimitMiddleware: allowed', { userId, role, limit, currentCount: rateLimitStores[userId].length, path: req.path });
  next();
};
