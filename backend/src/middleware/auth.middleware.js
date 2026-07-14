import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { roleRateLimitMiddleware } from './security.middleware.js';

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
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required: Bearer token is missing'
    });
  }

  const token = authHeader.split(' ')[1];

  const proceed = () => {
    roleRateLimitMiddleware(req, res, next);
  };

  // 1. Try local custom JWT verification first (fallback/test suite compatibility)
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = normalizeAuthUser(decoded);
    return proceed();
  } catch (error) {
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
            return proceed();
          } else {
            return res.status(401).json({
              status: 'error',
              success: false,
              code: 'UNAUTHORIZED',
              message: 'Invalid or expired Keycloak token'
            });
          }
        })
        .catch(err => {
          return res.status(401).json({
            status: 'error',
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentication token verification failed: ' + err.message
          });
        });
    } else {
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
  if (!token) {
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
    return next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired SSE token'
    });
  }
};
