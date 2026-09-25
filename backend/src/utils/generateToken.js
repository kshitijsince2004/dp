import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * THE token utility — the only place tokens are built, signed and verified.
 *
 * Canonical access payload (snake_case, ids only — names/codes come from /me,
 * so a hierarchy rename never leaves stale data inside live tokens):
 *   { sub, username, badge_no, role, level, ps_id, district_id, sub_div_id }
 * Refresh payload: { sub }.
 *
 * auth.middleware.js normalizes the decoded payload onto req.user (adds the
 * legacy id/userId/psId/districtId aliases) — downstream code never re-derives.
 */

// Single source of truth for role → hierarchy level.
// ACP is a live role (scope = sub_div_id) even though the workflow chain skips it
// until ACP transitions are added to config/workflow/. JCP/SCP are their own
// levels per the workflow config (from_level/to_level values), not HQ.
export const ROLE_LEVELS = {
  HC: 'PS',
  SHO: 'PS',
  ACP: 'SUB_DIV',
  DISTRICT_OFFICER: 'DISTRICT',
  JCP: 'JCP',
  SCP: 'SCP',
  HQ_ANALYST: 'HQ',
  HQ_ADMIN: 'HQ',
  SYSTEM_ADMIN: 'HQ',
};

export const getLevelFromRole = (role) => ROLE_LEVELS[role] ?? null;

/**
 * Build the canonical access-token payload from a users row.
 */
export const buildAccessPayload = (user) => ({
  sub: user.id,
  username: user.username,
  badge_no: user.badge_no,
  role: user.role,
  level: getLevelFromRole(user.role),
  ps_id: user.ps_id || null,
  district_id: user.district_id || null,
  sub_div_id: user.sub_div_id || null,
});

export const signAccessToken = (payload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES });

export const signRefreshToken = (userId) =>
  jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES });

export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_SECRET);

export const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);
