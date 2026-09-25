/**
 * Role -> hierarchy level mapping. This is the only responsibility left in this file after the
 * SuperTokens migration: token signing/verification now lives in SuperTokens (see
 * config/supertokens.js and modules/auth/auth.controller.js). The old JWT sign/verify helpers
 * were removed. ROLE_LEVELS / getLevelFromRole are still imported by levelContracts.service.js
 * and auth.controller.js, so they stay here.
 *
 * ACP is a live role (scope = sub_div_id) even though the workflow chain skips it until ACP
 * transitions are added to config/workflow/. JCP/SCP are their own levels per the workflow
 * config, not HQ.
 */
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
 * Builds the identity + scope object that is written into the SuperTokens session access-token
 * payload at login. (Previously this was the JWT claim set; now it is the session payload.)
 */
export const buildAccessPayload = (user) => ({
  username: user.username,
  badge_no: user.badge_no,
  role: user.role,
  level: getLevelFromRole(user.role),
  ps_id: user.ps_id || null,
  district_id: user.district_id || null,
  sub_div_id: user.sub_div_id || null,
});
