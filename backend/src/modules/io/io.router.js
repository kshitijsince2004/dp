import { Router } from 'express';
import * as ioController from './io.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

router.use(authMiddleware, enforceScope);

// Read: HC/SHO (own PS), ACP (own sub-division), DISTRICT_OFFICER (own district), HQ roles (global)
router.get('/', allow('HC', 'SHO', 'ACP', 'DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'), ioController.listIOs);

// Write: SHO curates their own PS, ACP curates PS within their sub-division, SYSTEM_ADMIN any
router.post('/', allow('SHO', 'ACP', 'SYSTEM_ADMIN'), ioController.createIO);
router.patch('/:id', allow('SHO', 'ACP', 'SYSTEM_ADMIN'), ioController.updateIO);
router.delete('/:id', allow('SHO', 'ACP', 'SYSTEM_ADMIN'), ioController.deleteIO);

export default router;
