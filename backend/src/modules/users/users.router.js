import { Router } from 'express';
import * as usersController from './users.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

const DISTRICT_ROLES = ['DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

// User Listing & Detail: DISTRICT+ roles, plus SHO (scoped to their own PS — item 7: SHO
// provisions their own PS's HC users). enforceScope binds req.jurisdictionQuery so
// DISTRICT_OFFICER only sees their district, SHO only their PS, HQ roles stay global.
router.get('/', authMiddleware, allow('SHO', ...DISTRICT_ROLES), enforceScope, usersController.getUsers);
router.get('/:id', authMiddleware, allow('SHO', ...DISTRICT_ROLES), enforceScope, usersController.getUser);

// User Modification: SYSTEM_ADMIN (any user) or SHO (HC users in their own PS only —
// createUser/updateUser/deleteUser/resetPassword enforce the HC+own-ps_id restriction).
router.post('/', authMiddleware, allow('SYSTEM_ADMIN', 'SHO'), usersController.createUser);
router.put('/:id', authMiddleware, allow('SYSTEM_ADMIN', 'SHO'), usersController.updateUser);
router.delete('/:id', authMiddleware, allow('SYSTEM_ADMIN', 'SHO'), usersController.deleteUser);
router.post('/:id/reset-password', authMiddleware, allow('SYSTEM_ADMIN', 'SHO'), usersController.resetPassword);

export default router;
