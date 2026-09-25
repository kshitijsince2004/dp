// RBAC permission catalog — the SINGLE SOURCE OF TRUTH for who can do what.
//
// Before this migration, authorization was ~200 scattered allow('ROLE_A','ROLE_B',...)
// role lists across 20 routers, with no central definition. This catalog centralises it:
// roles map to named permissions, the permissions are seeded into SuperTokens UserRoles
// (rbac.seed.js), and requirePermission() in rbac.middleware.js checks them.
//
// Two layers remain deliberately separate from this catalog:
//   1. Jurisdiction scope (ps_id / district_id / sub_div_id) — enforced by enforceScope /
//      verifyRecordAccess, because it is geographic, not a role capability.
//   2. Per-transition workflow rights — still driven by config/workflow/main.json
//      allowed_roles, because they are state-machine rules, not blanket capabilities.
//
// The nine canonical roles (users.role CHECK constraint). 'DISTRICT' is treated as an alias
// of 'DISTRICT_OFFICER' by the middleware; do not seed a separate 'DISTRICT' role.
export const ROLES = [
  'HC', 'SHO', 'ACP', 'DISTRICT_OFFICER', 'JCP', 'SCP',
  'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN',
];

// Every permission the app recognises. Verb:object naming. Tune these against product intent;
// this is data, not code, and changing it is a seed re-run, not a code change.
export const PERMISSIONS = {
  RECORD_CREATE: 'record:create',
  RECORD_READ: 'record:read',
  RECORD_UPDATE: 'record:update',
  RECORD_DELETE: 'record:delete',
  RECORD_SUBMIT: 'record:submit',
  WORKFLOW_APPROVE_SHO: 'workflow:approve_sho',
  WORKFLOW_APPROVE_DISTRICT: 'workflow:approve_district',
  WORKFLOW_APPROVE_JCP: 'workflow:approve_jcp',
  WORKFLOW_APPROVE_SCP: 'workflow:approve_scp',
  WORKFLOW_SEAL: 'workflow:seal',
  WORKFLOW_SEND_BACK: 'workflow:send_back',
  WORKFLOW_TRANSFER: 'workflow:transfer',
  WORKFLOW_OVERRIDE_HEAD: 'workflow:override_head',
  COMPILATION_MANAGE: 'compilation:manage',
  REPORT_READ: 'report:read',
  REPORT_GENERATE: 'report:generate',
  REPORT_SCHEDULE: 'report:schedule',
  USER_MANAGE: 'user:manage',
  USER_RESET_PASSWORD: 'user:reset_password',
  HIERARCHY_MANAGE: 'hierarchy:manage',
  FIELD_MANAGE: 'field:manage',
  FIELD_MANAGE_DISTRICT: 'field:manage_district',
  AUDIT_READ: 'audit:read',
  AUDIT_VERIFY: 'audit:verify',
  AUDIT_FREEZE: 'audit:freeze',
  IMPORT_MANAGE: 'import:manage',
  IO_MANAGE: 'io:manage',
  LEVEL_CONTRACT_MANAGE: 'level_contract:manage',
  WAREHOUSE_RUN: 'warehouse:run',
};

const P = PERMISSIONS;
const ALL = Object.values(PERMISSIONS);

// Role -> permissions. Derived from the current allow() usage across the routers, made
// explicit and consistent. Jurisdiction scope still narrows these to the user's PS/district.
export const ROLE_PERMISSIONS = {
  HC: [
    P.RECORD_CREATE, P.RECORD_READ, P.RECORD_UPDATE, P.RECORD_DELETE, P.RECORD_SUBMIT,
    P.IMPORT_MANAGE, P.REPORT_READ, P.REPORT_GENERATE,
  ],
  SHO: [
    P.RECORD_READ, P.RECORD_UPDATE,
    P.WORKFLOW_APPROVE_SHO, P.WORKFLOW_SEND_BACK, P.WORKFLOW_TRANSFER,
    P.USER_MANAGE, P.USER_RESET_PASSWORD, P.IO_MANAGE,
    P.REPORT_READ, P.REPORT_GENERATE,
  ],
  ACP: [
    P.RECORD_READ, P.IO_MANAGE, P.REPORT_READ,
  ],
  DISTRICT_OFFICER: [
    P.RECORD_READ, P.RECORD_UPDATE,
    P.WORKFLOW_APPROVE_DISTRICT, P.WORKFLOW_SEND_BACK, P.WORKFLOW_OVERRIDE_HEAD, P.WORKFLOW_TRANSFER,
    P.COMPILATION_MANAGE, P.FIELD_MANAGE_DISTRICT, P.IMPORT_MANAGE,
    P.REPORT_READ, P.REPORT_GENERATE, P.AUDIT_READ, P.USER_MANAGE,
  ],
  JCP: [
    P.RECORD_READ, P.WORKFLOW_APPROVE_JCP, P.WORKFLOW_SEND_BACK, P.REPORT_READ,
  ],
  SCP: [
    P.RECORD_READ, P.WORKFLOW_APPROVE_SCP, P.WORKFLOW_SEND_BACK, P.REPORT_READ,
  ],
  HQ_ANALYST: [
    P.RECORD_READ, P.REPORT_READ, P.REPORT_GENERATE, P.REPORT_SCHEDULE,
    P.AUDIT_READ, P.WAREHOUSE_RUN, P.USER_MANAGE,
  ],
  HQ_ADMIN: [
    P.RECORD_READ, P.REPORT_READ, P.REPORT_GENERATE, P.REPORT_SCHEDULE,
    P.WORKFLOW_SEAL, P.FIELD_MANAGE, P.HIERARCHY_MANAGE,
    P.AUDIT_READ, P.AUDIT_VERIFY, P.AUDIT_FREEZE,
    P.USER_MANAGE, P.USER_RESET_PASSWORD, P.LEVEL_CONTRACT_MANAGE, P.WAREHOUSE_RUN, P.IMPORT_MANAGE,
  ],
  SYSTEM_ADMIN: ALL, // superuser
};

// role -> hierarchy level (kept in sync with utils/generateToken.js ROLE_LEVELS).
export const ROLE_LEVEL = {
  HC: 'PS', SHO: 'PS', ACP: 'SUB_DIV', DISTRICT_OFFICER: 'DISTRICT',
  JCP: 'JCP', SCP: 'SCP', HQ_ANALYST: 'HQ', HQ_ADMIN: 'HQ', SYSTEM_ADMIN: 'HQ',
};

// Normalise the legacy 'DISTRICT' token to the canonical role.
export const canonicalRole = (role) => (role === 'DISTRICT' ? 'DISTRICT_OFFICER' : role);
