// Authorization middleware. RBAC is now owned by SuperTokens UserRoles (roles + permissions
// seeded from modules/auth/rbac.catalog.js). Jurisdiction scope stays application-managed here
// because it is geographic, not a role capability.
//
// The public API is UNCHANGED so no router changed:
//   - allow(...roles) / requireRole(...roles) : role gate (reads the role off the verified
//                                               session via req.user, canonicalising DISTRICT).
//   - enforceScope                            : injects req.jurisdictionQuery (ps/subdiv/district).
//   - verifyRecordAccess(recordId, user)      : record-level jurisdiction check.
//   - requirePermission(...perms)  [NEW]      : permission gate using the SuperTokens st-perm
//                                               claim (falls back to the catalog). Prefer this
//                                               over hardcoded role lists for new routes.
import db from '../config/db.js';
import { getLogger } from '../utils/logger.js';
import { ROLE_PERMISSIONS, canonicalRole } from '../modules/auth/rbac.catalog.js';

const log = getLogger('rbac.middleware');

const roleOf = (req) => canonicalRole(req.user?.role);

export const allow = (...roles) => {
  const allowed = roles.map(canonicalRole);
  return (req, res, next) => {
    if (!req.user) {
      log.warn('allow: rejected — no req.user (authMiddleware did not run first?)', { requiredRoles: allowed, path: req.path });
      return res.status(401).json({ status: 'error', success: false, code: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    if (!allowed.includes(roleOf(req))) {
      log.warn('allow: denied — role not in allow-list', { userId: req.user.id, role: req.user.role, requiredRoles: allowed, path: req.path });
      return res.status(403).json({ status: 'error', success: false, code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }
    log.debug('allow: permitted', { userId: req.user.id, role: req.user.role, requiredRoles: allowed, path: req.path });
    next();
  };
};

export const requireRole = (...roles) => allow(...roles);

/**
 * Permission gate. Reads the SuperTokens permission claim (st-perm) from the verified session;
 * if it is absent (older session, or claim not populated) it falls back to the static catalog
 * for the user's role. Passes when the user has ALL listed permissions.
 */
export const requirePermission = (...perms) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', success: false, code: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    let granted = [];
    try {
      const claim = req.session?.getAccessTokenPayload?.()['st-perm'];
      if (claim && Array.isArray(claim.v)) granted = claim.v;
    } catch (e) { /* fall through to catalog */ }
    if (granted.length === 0) {
      granted = ROLE_PERMISSIONS[roleOf(req)] || [];
    }
    const missing = perms.filter((p) => !granted.includes(p));
    if (missing.length > 0) {
      log.warn('requirePermission: denied', { userId: req.user.id, role: req.user.role, missing, path: req.path });
      return res.status(403).json({ status: 'error', success: false, code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }
    log.debug('requirePermission: permitted', { userId: req.user.id, role: req.user.role, required: perms, path: req.path });
    next();
  };
};

// Roles with global (unscoped) read. JCP/SCP review queues are gated by record status (workflow
// config), not geography, and HQ roles are global by definition.
const GLOBAL_SCOPE_ROLES = ['JCP', 'SCP', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

export const enforceScope = (req, res, next) => {
  if (!req.user) {
    log.warn('enforceScope: rejected — no req.user', { path: req.path });
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const role = roleOf(req);
  const { ps_id, district_id, sub_div_id } = req.user;
  req.jurisdictionQuery = {};
  log.debug('enforceScope: enter', { userId: req.user.id, role, psId: ps_id, districtId: district_id, subDivId: sub_div_id, path: req.path });

  if (role === 'HC' || role === 'SHO') {
    if (!ps_id) {
      log.warn('enforceScope: rejected — user not bound to a Police Station', { userId: req.user.id, role });
      return res.status(403).json({ success: false, message: 'User is not bound to a Police Station' });
    }
    req.jurisdictionQuery.ps_id = ps_id;
  } else if (role === 'ACP') {
    if (!sub_div_id) {
      log.warn('enforceScope: rejected — user not bound to a Sub-Division', { userId: req.user.id, role });
      return res.status(403).json({ success: false, message: 'User is not bound to a Sub-Division' });
    }
    req.jurisdictionQuery.sub_div_id = sub_div_id;
  } else if (role === 'DISTRICT_OFFICER') {
    if (!district_id) {
      log.warn('enforceScope: rejected — user not bound to a District', { userId: req.user.id, role });
      return res.status(403).json({ success: false, message: 'User is not bound to a District' });
    }
    req.jurisdictionQuery.district_id = district_id;
  } else if (!GLOBAL_SCOPE_ROLES.includes(role)) {
    // Default-deny: an unrecognized role must never fall through to global scope.
    log.warn('enforceScope: rejected — unknown role, default-deny', { userId: req.user.id, role });
    return res.status(403).json({ success: false, message: `Unknown role: ${role}` });
  }

  log.debug('enforceScope: scope decision', { userId: req.user.id, role, jurisdictionQuery: req.jurisdictionQuery });
  next();
};

export const verifyRecordAccess = async (recordId, user) => {
  const role = canonicalRole(user.role);
  const { ps_id, district_id, sub_div_id } = user;
  log.debug('verifyRecordAccess: enter', { recordId, userId: user.id, role });
  if (GLOBAL_SCOPE_ROLES.includes(role)) {
    log.debug('verifyRecordAccess: allowed — global scope role', { recordId, userId: user.id, role });
    return true;
  }

  const record = await db('records').where({ id: recordId }).first();
  if (!record) {
    log.warn('verifyRecordAccess: denied — record not found', { recordId, userId: user.id });
    throw new Error('Record not found');
  }

  if (role === 'HC' || role === 'SHO') {
    if (record.ps_id !== ps_id) throw new Error('Access denied: Record falls outside your police station jurisdiction');
  } else if (role === 'ACP') {
    if (record.sub_div_id !== sub_div_id) throw new Error('Access denied: Record falls outside your sub-division jurisdiction');
  } else if (role === 'DISTRICT_OFFICER') {
    if (record.district_id !== district_id) throw new Error('Access denied: Record falls outside your district jurisdiction');
  } else {
    throw new Error(`Access denied: unknown role ${role}`);
  }

  log.debug('verifyRecordAccess: allowed', { recordId, userId: user.id, role });
  return true;
};
