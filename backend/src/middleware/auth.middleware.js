// Authentication middleware — now backed by SuperTokens Session (was custom JWT + optional
// Keycloak). The public API is UNCHANGED so no router or call site had to change:
//   - authMiddleware      : verifies the session and populates req.user in the exact legacy
//                           shape (id/userId/role/level/ps_id/district_id/sub_div_id + camel
//                           aliases), then chains the per-role rate limiter, exactly as before.
//   - sseAuthMiddleware   : verifies the access token passed as ?token= (EventSource cannot set
//                           the Authorization header), using SuperTokens' request-less verify.
//   - requireAuth         : unchanged alias.
//
// Why req.user is still populated: enforceScope and verifyRecordAccess (rbac.middleware.js)
// read jurisdiction off req.user, and dozens of controllers read req.user.id/role. Rather than
// touch all of them, authMiddleware rebuilds req.user from the session's access-token payload
// (role + level + scope are written there at login — see auth.controller.js).
import Session from 'supertokens-node/recipe/session';
import { verifySession } from 'supertokens-node/recipe/session/framework/express';
import { getLogger } from '../utils/logger.js';
import { setContext } from '../utils/requestContext.js';
import { roleRateLimitMiddleware } from './security.middleware.js';

const log = getLogger('auth.middleware');

// The access-token payload -> legacy req.user shape. This is the single place the aliases are
// produced (mirrors the previous normalizeAuthUser shim).
const buildReqUser = (userId, payload = {}) => ({
  sub: userId,
  id: userId,
  userId,
  username: payload.username ?? null,
  badge_no: payload.badge_no ?? null,
  badgeNo: payload.badge_no ?? null,
  role: payload.role ?? null,
  level: payload.level ?? null,
  ps_id: payload.ps_id ?? null,
  psId: payload.ps_id ?? null,
  district_id: payload.district_id ?? null,
  districtId: payload.district_id ?? null,
  sub_div_id: payload.sub_div_id ?? null,
  subDivId: payload.sub_div_id ?? null,
});

// Reused verifySession instance. On failure it calls next(err); the SuperTokens errorHandler()
// mounted in app.js turns that into the correct 401 (and the TRY_REFRESH_TOKEN response the
// frontend SDK needs to auto-refresh), so we must NOT hand-format that error here.
const verify = verifySession({ sessionRequired: true });

export const authMiddleware = (req, res, next) => {
  log.debug('authMiddleware: enter', { method: req.method, path: req.path });
  verify(req, res, (err) => {
    if (err) {
      log.warn('authMiddleware: session verification failed', { path: req.path, err: err?.type || err?.message });
      return next(err);
    }
    try {
      const payload = req.session.getAccessTokenPayload();
      req.user = buildReqUser(req.session.getUserId(), payload);
      setContext({ userId: req.user.id, role: req.user.role });
      log.info('authMiddleware: session verified', { userId: req.user.id, role: req.user.role, path: req.path });
      return roleRateLimitMiddleware(req, res, next);
    } catch (e) {
      log.error('authMiddleware: failed to build req.user from session', { path: req.path, err: e.message });
      return next(e);
    }
  });
};

export const requireAuth = () => authMiddleware;

/**
 * SSE session verifier. EventSource cannot send the Authorization header, so the client passes
 * the current access token (Session.getAccessToken() on the frontend) as ?token=. We verify it
 * with SuperTokens' request-less API and populate req.user the same way.
 */
export const sseAuthMiddleware = async (req, res, next) => {
  const token = req.query.token;
  log.debug('sseAuthMiddleware: enter', { hasToken: !!token, path: req.path });
  if (!token) {
    log.warn('sseAuthMiddleware: rejected — token query param missing', { path: req.path });
    return res.status(401).json({
      status: 'error', success: false, code: 'UNAUTHORIZED',
      message: 'Authentication required: token query param is missing',
    });
  }
  try {
    const session = await Session.getSessionWithoutRequestResponse(token, undefined, { sessionRequired: true });
    req.session = session;
    req.user = buildReqUser(session.getUserId(), session.getAccessTokenPayload());
    setContext({ userId: req.user.id, role: req.user.role });
    log.info('sseAuthMiddleware: SSE token verified', { userId: req.user.id, role: req.user.role, path: req.path });
    return next();
  } catch (error) {
    log.warn('sseAuthMiddleware: rejected — invalid/expired SSE token', { path: req.path, err: error?.type || error?.message });
    return res.status(401).json({
      status: 'error', success: false, code: 'UNAUTHORIZED',
      message: 'Invalid or expired SSE token',
    });
  }
};
