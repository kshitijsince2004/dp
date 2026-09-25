import bcrypt from 'bcryptjs';
import db from '../../config/db.js';
import { env } from '../../config/env.js';
import { getLogger } from '../../utils/logger.js';
import { getLevelFromRole } from '../../utils/generateToken.js';

// After the SuperTokens migration this service is credential + scope logic ONLY. It no longer
// issues, stores, or refreshes tokens — SuperTokens owns the session. auth.controller.js calls
// verifyCredentials() to check badge+password, then creates the SuperTokens session itself
// (it needs req/res). Redis and the refresh-token store are gone.
const log = getLogger('auth.service');

/**
 * Backfill missing scope FKs by climbing the hierarchy.
 * Chain is HQ -> ZONE -> RANGE -> DISTRICT -> SUB_DIV -> PS, so a PS's parent is its SUB_DIV
 * and the district is TWO hops up. Seeds populate all three; this is a safety net.
 */
export async function resolveScope(user) {
  const scope = {
    ps_id: user.ps_id || null,
    sub_div_id: user.sub_div_id || null,
    district_id: user.district_id || null,
  };
  if (scope.ps_id && !scope.sub_div_id) {
    const ps = await db('hierarchy_nodes').where({ id: scope.ps_id }).first();
    scope.sub_div_id = ps?.parent_id || null;
  }
  if (scope.sub_div_id && !scope.district_id) {
    const subDiv = await db('hierarchy_nodes').where({ id: scope.sub_div_id }).first();
    scope.district_id = subDiv?.parent_id || null;
  }
  return scope;
}

const isDev = env.NODE_ENV === 'development';

// Dev-only login sugar: map memorable names/emails to seeded badge numbers.
const DEV_BADGE_ALIASES = [
  [/ramesh|hc001/, 'HC001'],
  [/vikram|sho001/, 'SHO001'],
  [/mahesh|acp001/, 'ACP001'],
  [/priya|do001|dcp/, 'DO001'],
  [/neha|hqa001|analyst/, 'HQA001'],
  [/rajiv|hqd001|hq_admin/, 'HQD001'],
  [/system|sa001/, 'SA001'],
];

const USER_COLUMNS = [
  'id', 'username', 'badge_no', 'name', 'password_hash', 'role',
  'ps_id', 'district_id', 'sub_div_id', 'is_active', 'last_login',
];

const findByBadgeOrUsername = async (value) => {
  const lower = value.toLowerCase();
  return (
    (await db('users').select(USER_COLUMNS).whereRaw('LOWER(badge_no) = ?', [lower]).first()) ||
    (await db('users').select(USER_COLUMNS).whereRaw('LOWER(username) = ?', [lower]).first())
  );
};

/**
 * Verify badge/username + password against the users table (bcrypt). Returns the identity +
 * resolved scope that the controller writes into the SuperTokens session payload. Throws on
 * bad credentials or a deactivated account. NEVER logs the password.
 */
export const verifyCredentials = async (badgeNo, password) => {
  const normalizedBadgeNo = String(badgeNo).trim();
  log.debug('verifyCredentials: enter', { badgeNo: normalizedBadgeNo, hasPassword: !!password });

  let user = await findByBadgeOrUsername(normalizedBadgeNo);
  if (!user && isDev) {
    const alias = DEV_BADGE_ALIASES.find(([re]) => re.test(normalizedBadgeNo.toLowerCase()));
    if (alias) user = await findByBadgeOrUsername(alias[1]);
  }
  if (!user) {
    log.warn('verifyCredentials: rejected — user not found', { badgeNo: normalizedBadgeNo });
    throw new Error('Invalid badge number or password');
  }
  if (!user.is_active) {
    log.warn('verifyCredentials: rejected — user deactivated', { userId: user.id });
    throw new Error('User account is deactivated');
  }

  let isMatch = await bcrypt.compare(password, user.password_hash);
  // Dev-only backdoor: seeded dev passwords are interchangeable. Never log the candidate values.
  if (!isMatch && isDev && ['Password123', 'test123', 'Test@1234'].includes(password)) {
    for (const p of ['Password123', 'test123', 'Test@1234']) {
      if (p !== password) { isMatch = await bcrypt.compare(p, user.password_hash); if (isMatch) break; }
    }
  }
  if (!isMatch) {
    log.warn('verifyCredentials: rejected — password mismatch', { userId: user.id });
    throw new Error('Invalid badge number or password');
  }

  const scope = await resolveScope(user);
  await db('users').where({ id: user.id }).update({ last_login: new Date().toISOString() });
  log.info('verifyCredentials: success', { userId: user.id, badgeNo: user.badge_no, role: user.role });

  return {
    id: user.id,
    username: user.username,
    badge_no: user.badge_no,
    name: user.name,
    role: user.role,
    level: getLevelFromRole(user.role),
    ps_id: scope.ps_id,
    district_id: scope.district_id,
    sub_div_id: scope.sub_div_id,
  };
};
