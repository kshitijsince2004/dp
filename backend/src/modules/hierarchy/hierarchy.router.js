import { Router } from 'express';
import * as hierarchyController from './hierarchy.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow } from '../../middleware/rbac.middleware.js';

const router = Router();

// Read operations: Any auth
router.get('/tree', authMiddleware, hierarchyController.getTree);
router.get('/scope', authMiddleware, hierarchyController.getScope);
router.get('/nodes', authMiddleware, hierarchyController.getNodes);
router.get('/', authMiddleware, hierarchyController.getNodes);

// Write operations: SYSTEM_ADMIN only
router.post('/nodes', authMiddleware, allow('SYSTEM_ADMIN'), hierarchyController.createNode);
router.post('/', authMiddleware, allow('SYSTEM_ADMIN'), hierarchyController.createNode);

router.put('/nodes/:id', authMiddleware, allow('SYSTEM_ADMIN'), hierarchyController.updateNode);
router.put('/:id', authMiddleware, allow('SYSTEM_ADMIN'), hierarchyController.updateNode);

router.delete('/nodes/:id', authMiddleware, allow('SYSTEM_ADMIN'), hierarchyController.deleteNode);
router.delete('/:id', authMiddleware, allow('SYSTEM_ADMIN'), hierarchyController.deleteNode);

export default router;
