import { Router } from 'express';
import { getQueue } from '../records/records.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

router.get('/queue', authMiddleware, enforceScope, getQueue);

export default router;
