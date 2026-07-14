import db from '../config/db.js';

export const allow = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        success: false,
        code: 'FORBIDDEN',
        message: 'Insufficient permissions'
      });
    }
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
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { role, ps_id, district_id, sub_div_id } = req.user;
  req.jurisdictionQuery = {};

  if (role === 'HC' || role === 'SHO') {
    if (!ps_id) {
      return res.status(403).json({ success: false, message: 'User is not bound to a Police Station' });
    }
    req.jurisdictionQuery.ps_id = ps_id;
  } else if (role === 'ACP') {
    if (!sub_div_id) {
      return res.status(403).json({ success: false, message: 'User is not bound to a Sub-Division' });
    }
    req.jurisdictionQuery.sub_div_id = sub_div_id;
  } else if (role === 'DISTRICT_OFFICER') {
    if (!district_id) {
      return res.status(403).json({ success: false, message: 'User is not bound to a District' });
    }
    req.jurisdictionQuery.district_id = district_id;
  } else if (!GLOBAL_SCOPE_ROLES.includes(role)) {
    // Default-deny: an unrecognized role must never fall through to global scope
    return res.status(403).json({ success: false, message: `Unknown role: ${role}` });
  }

  next();
};

export const verifyRecordAccess = async (recordId, user) => {
  const { role, ps_id, district_id, sub_div_id } = user;
  if (GLOBAL_SCOPE_ROLES.includes(role)) {
    return true;
  }

  const record = await db('records').where({ id: recordId }).first();
  if (!record) {
    throw new Error('Record not found');
  }

  if (role === 'HC' || role === 'SHO') {
    if (record.ps_id !== ps_id) {
      throw new Error('Access denied: Record falls outside your police station jurisdiction');
    }
  } else if (role === 'ACP') {
    if (record.sub_div_id !== sub_div_id) {
      throw new Error('Access denied: Record falls outside your sub-division jurisdiction');
    }
  } else if (role === 'DISTRICT_OFFICER') {
    if (record.district_id !== district_id) {
      throw new Error('Access denied: Record falls outside your district jurisdiction');
    }
  } else {
    // Default-deny for unrecognized roles
    throw new Error(`Access denied: unknown role ${role}`);
  }

  return true;
};
