// Seeds the SuperTokens Core with the RBAC catalog and assigns roles to existing users.
// Idempotent and best-effort: called at startup after the DB connects. A failure here (for
// example the Core still booting) is logged and never crashes the API — it retries next boot.
import UserRoles from 'supertokens-node/recipe/userroles';
import db from '../../config/db.js';
import { ROLE_PERMISSIONS, canonicalRole } from './rbac.catalog.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('rbac.seed');
const DEFAULT_TENANT = 'public';

// Create each role in the Core and (re)attach its permission set. createNewRoleOrAddPermissions
// is additive and idempotent, so this is safe to run on every boot.
export async function seedRolesAndPermissions() {
  log.info('seedRolesAndPermissions: enter', { roleCount: Object.keys(ROLE_PERMISSIONS).length });
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    await UserRoles.createNewRoleOrAddPermissions(role, permissions);
    log.debug('seedRolesAndPermissions: role synced', { role, permissionCount: permissions.length });
  }
  log.info('seedRolesAndPermissions: exit — all roles + permissions synced');
}

// Attach each app user's role (from users.role) to their SuperTokens identity so the
// UserRoleClaim / PermissionClaim populate on their next session. Runs over the users table.
export async function assignRolesToExistingUsers() {
  const users = await db('users').select('id', 'role');
  log.info('assignRolesToExistingUsers: enter', { userCount: users.length });
  let assigned = 0;
  for (const u of users) {
    const role = canonicalRole(u.role);
    if (!role || !ROLE_PERMISSIONS[role]) continue;
    try {
      await UserRoles.addRoleToUser(DEFAULT_TENANT, u.id, role);
      assigned += 1;
    } catch (err) {
      log.warn('assignRolesToExistingUsers: failed for user', { userId: u.id, role, err: err.message });
    }
  }
  log.info('assignRolesToExistingUsers: exit', { assigned, total: users.length });
}

// One call for startup wiring.
export async function seedRbac() {
  try {
    await seedRolesAndPermissions();
    await assignRolesToExistingUsers();
  } catch (err) {
    log.error('seedRbac: failed (non-fatal, will retry next boot)', { err: err.message });
  }
}

export default seedRbac;
