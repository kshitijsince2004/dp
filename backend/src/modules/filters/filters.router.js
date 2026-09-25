import { Router } from 'express';
import * as controller from './filters.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

router.use(authMiddleware, enforceScope);

router.get('/presets', controller.listPresets);
router.get('/duration-presets', controller.listDurationPresets);
router.post('/presets', controller.createPreset);
router.delete('/presets/:id', controller.deletePreset);

export default router;
