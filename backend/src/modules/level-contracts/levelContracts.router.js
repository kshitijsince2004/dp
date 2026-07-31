import { Router } from 'express';
import * as controller from './levelContracts.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

router.use(authMiddleware, enforceScope);

// Read-only over the API: contracts are config-as-data (config/contracts/*.json,
// npm run sync-config). Mutation routes stay registered for backward compatibility but
// return 405 — see levelContracts.controller.js `mutationNotAllowed`.
router.get('/', allow('SYSTEM_ADMIN'), controller.listContracts);
router.post('/', allow('SYSTEM_ADMIN'), controller.mutationNotAllowed);
router.put('/:id', allow('SYSTEM_ADMIN'), controller.mutationNotAllowed);

export default router;
