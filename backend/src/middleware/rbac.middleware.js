import db from '../config/db.js';
import { getLogger } from '../utils/logger.js';

const log = getLogger('rbac.middleware');

export const allow = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      log.warn('allow: rejected — no req.user (authMiddleware did not run first?)', { requiredRoles: roles, path: req.path });
      return res.status(401).json({
        status: 'error',
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }
    if (!roles.includes(req.user.role)) {
      log.warn('allow: denied — role not in allow-list', { userId: req.user.id, role: req.user.role, requiredRoles: roles, path: req.path });
      return res.status(403).json({
        status: 'error',
        success: false,
        code: 'FORBIDDEN',
        message: 'Insufficient permissions'
      });
    }
    log.debug('allow: permitted', { userId: req.user.id, role: req.user.role, requiredRoles: roles, path: req.path });
    next();
  };
};

export const requireRole = (...roles) => allow(...roles);


// Roles with global (unscoped) read: JCP/SCP review queues are gated by record
// status (workflow config), not geography — no zone/range FK exists on users by
// design. HQ roles are global by definition.
const GLOBAL_SCOPE_ROLES = ['JCP', 'SCP', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

export const enforceScope = (req, res, next) => {
  if (!req.user) {
    log.warn('enforceScope: rejected — no req.user', { path: req.path });
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { role, ps_id, district_id, sub_div_id } = req.user;
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
  } else if (role === 'DISTRICT_OFFICER' || role === 'DISTRICT') {
    if (!district_id) {
      log.warn('enforceScope: rejected — user not bound to a District', { userId: req.user.id, role });
      return res.status(403).json({ success: false, message: 'User is not bound to a District' });
    }
    req.jurisdictionQuery.district_id = district_id;
  } else if (!GLOBAL_SCOPE_ROLES.includes(role)) {
    // Default-deny: an unrecognized role must never fall through to global scope
    log.warn('enforceScope: rejected — unknown role, default-deny (never falls through to global)', { userId: req.user.id, role });
    return res.status(403).json({ success: false, message: `Unknown role: ${role}` });
  }

  log.debug('enforceScope: scope decision', { userId: req.user.id, role, jurisdictionQuery: req.jurisdictionQuery });
  next();
};

export const verifyRecordAccess = async (recordId, user) => {
  const { role, ps_id, district_id, sub_div_id } = user;
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
    if (record.ps_id !== ps_id) {
      log.warn('verifyRecordAccess: denied — record outside PS jurisdiction', { recordId, userId: user.id, role, userPsId: ps_id, recordPsId: record.ps_id });
      throw new Error('Access denied: Record falls outside your police station jurisdiction');
    }
  } else if (role === 'ACP') {
    if (record.sub_div_id !== sub_div_id) {
      log.warn('verifyRecordAccess: denied — record outside sub-division jurisdiction', { recordId, userId: user.id, role, userSubDivId: sub_div_id, recordSubDivId: record.sub_div_id });
      throw new Error('Access denied: Record falls outside your sub-division jurisdiction');
    }
  } else if (role === 'DISTRICT_OFFICER' || role === 'DISTRICT') {
    if (record.district_id !== district_id) {
      log.warn('verifyRecordAccess: denied — record outside district jurisdiction', { recordId, userId: user.id, role, userDistrictId: district_id, recordDistrictId: record.district_id });
      throw new Error('Access denied: Record falls outside your district jurisdiction');
    }
  } else {
    // Default-deny for unrecognized roles
    log.warn('verifyRecordAccess: denied — unknown role, default-deny', { recordId, userId: user.id, role });
    throw new Error(`Access denied: unknown role ${role}`);
  }

  log.debug('verifyRecordAccess: allowed', { recordId, userId: user.id, role });
  return true;
};
