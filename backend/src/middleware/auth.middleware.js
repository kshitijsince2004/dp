import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getLogger, logger } from '../utils/logger.js';
import { setContext } from '../utils/requestContext.js';
import { roleRateLimitMiddleware } from './security.middleware.js';

// B3 scope (logging-instrumentation-2026-07-22, HANDOFF.md §3): auth is a bug hotspot —
// token-present/verify-outcome is logged below, the token itself NEVER (only `{ hasToken }`
// and, once decoded, `{ userId, role }`). Also wires the EXTRA TASK from the HANDOFF: once
// `req.user` is set, `setContext({ userId, role })` enriches every downstream log line on this
// request with who made it, not just the ambient requestId.
const log = getLogger('auth.middleware');

const isKeycloakEnabled = !!process.env.KEYCLOAK_URL;

/**
 * The access token carries the canonical snake_case payload only
 * ({ sub, username, badge_no, role, level, ps_id, district_id, sub_div_id } —
 * see utils/generateToken.js). This shim adds the aliases legacy module code
 * still reads (id/userId/psId/districtId/subDivId/badgeNo). It is the ONLY
 * place aliases are produced; drain callers to snake_case, then delete it.
 */
const normalizeAuthUser = (decoded) => ({
  ...decoded,
  id: decoded.sub ?? decoded.id,
  userId: decoded.sub ?? decoded.id,
  badgeNo: decoded.badge_no,
  psId: decoded.ps_id ?? null,
  districtId: decoded.district_id ?? null,
  subDivId: decoded.sub_div_id ?? null,
});

let keycloak = null;
if (isKeycloakEnabled) {
  try {
    const { default: KeycloakConnect } = await import('keycloak-connect');
    keycloak = new KeycloakConnect({}, {
      realm: 'pharos',
      'auth-server-url': process.env.KEYCLOAK_URL,
      resource: 'pharos-api',
      'bearer-only': true
    });
  } catch (err) {
    logger.warn('[Auth] Failed to initialize keycloak-connect, falling back to JWT.', err.message);
  }
}

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  log.debug('authMiddleware: enter', { hasToken: !!(authHeader && authHeader.startsWith('Bearer ')), method: req.method, path: req.path });
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log.warn('authMiddleware: rejected — Bearer token missing', { method: req.method, path: req.path });
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required: Bearer token is missing'
    });
  }

  const token = authHeader.split(' ')[1];

  const proceed = () => {
    log.debug('authMiddleware: proceeding to role rate limiter', { userId: req.user?.id, role: req.user?.role });
    roleRateLimitMiddleware(req, res, next);
  };

  // 1. Try local custom JWT verification first (fallback/test suite compatibility)
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = normalizeAuthUser(decoded);
    // EXTRA TASK (HANDOFF.md, B3): req.user.id / req.user.role are the canonical fields
    // normalizeAuthUser guarantees (id aliases decoded.sub, role passes through from the
    // token payload verbatim) — enrich the ambient request context so every log line
    // downstream of this point carries who made the request, not just the requestId.
    setContext({ userId: req.user.id, role: req.user.role });
    log.info('authMiddleware: local JWT verified', { userId: req.user.id, role: req.user.role, path: req.path });
    return proceed();
  } catch (error) {
    log.debug('authMiddleware: local JWT verification failed, trying Keycloak fallback', { path: req.path, keycloakEnabled: isKeycloakEnabled, err: error.message });
    // 2. Custom JWT failed, try Keycloak if enabled
    if (isKeycloakEnabled && keycloak) {
      keycloak.grantManager.validateAccessToken(token)
        .then(userToken => {
          if (userToken) {
            const content = userToken.content;
            req.user = normalizeAuthUser({
              sub: content.sub,
              username: content.preferred_username || content.username || '',
              badge_no: content.preferred_username || content.badgeNo || content.badge_no || '',
              role: content.role || (content.realm_access?.roles?.find(r => ['HC','SHO','ACP','DISTRICT_OFFICER','JCP','SCP','HQ_ANALYST','HQ_ADMIN','SYSTEM_ADMIN'].includes(r))) || 'HC',
              level: content.level || 'PS',
              ps_id: content.psId || content.ps_id || null,
              district_id: content.districtId || content.district_id || null,
              sub_div_id: content.subDivId || content.sub_div_id || null,
            });
            setContext({ userId: req.user.id, role: req.user.role });
            log.info('authMiddleware: Keycloak token verified', { userId: req.user.id, role: req.user.role, path: req.path });
            return proceed();
          } else {
            log.warn('authMiddleware: rejected — Keycloak token invalid/expired', { path: req.path });
            return res.status(401).json({
              status: 'error',
              success: false,
              code: 'UNAUTHORIZED',
              message: 'Invalid or expired Keycloak token'
            });
          }
        })
        .catch(err => {
          log.error('authMiddleware: Keycloak verification failed', { path: req.path, err });
          return res.status(401).json({
            status: 'error',
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentication token verification failed: ' + err.message
          });
        });
    } else {
      log.warn('authMiddleware: rejected — invalid/expired token, Keycloak not enabled', { path: req.path });
      return res.status(401).json({
        status: 'error',
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token'
      });
    }
  }
};

export const requireAuth = () => authMiddleware;

/**
 * Lightweight JWT verifier for SSE connections.
 * EventSource cannot set custom headers, so the client passes
 * the access token as ?token= in the query string.
 */
export const sseAuthMiddleware = (req, res, next) => {
  const token = req.query.token;
  log.debug('sseAuthMiddleware: enter', { hasToken: !!token, path: req.path });
  if (!token) {
    log.warn('sseAuthMiddleware: rejected — token query param missing', { path: req.path });
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required: token query param is missing'
    });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = normalizeAuthUser(decoded);
    setContext({ userId: req.user.id, role: req.user.role });
    log.info('sseAuthMiddleware: SSE token verified', { userId: req.user.id, role: req.user.role, path: req.path });
    return next();
  } catch (error) {
    log.warn('sseAuthMiddleware: rejected — invalid/expired SSE token', { path: req.path, err: error.message });
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired SSE token'
    });
  }
};
