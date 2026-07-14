import { Router } from 'express';
import * as usersController from './users.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

const DISTRICT_ROLES = ['DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

// User Listing & Detail: DISTRICT+ roles. enforceScope binds req.jurisdictionQuery
// so DISTRICT_OFFICER only ever sees users in their own district; HQ roles stay global.
router.get('/', authMiddleware, allow(...DISTRICT_ROLES), enforceScope, usersController.getUsers);
router.get('/:id', authMiddleware, allow(...DISTRICT_ROLES), enforceScope, usersController.getUser);

// User Modification: SYSTEM_ADMIN only
router.post('/', authMiddleware, allow('SYSTEM_ADMIN'), usersController.createUser);
router.put('/:id', authMiddleware, allow('SYSTEM_ADMIN'), usersController.updateUser);
router.delete('/:id', authMiddleware, allow('SYSTEM_ADMIN'), usersController.deleteUser);
router.post('/:id/reset-password', authMiddleware, allow('SYSTEM_ADMIN'), usersController.resetPassword);

export default router;
