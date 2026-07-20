import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';
import * as ctrl from './record-links.controller.js';

const router = Router();

router.get('/link-types',          authMiddleware,                                ctrl.getLinkTypes);
router.get('/person-search',       authMiddleware, enforceScope,                  ctrl.personSearch);
router.get('/record/:recordId',    authMiddleware, enforceScope,                  ctrl.getLinksForRecord);
router.post('/',                   authMiddleware, enforceScope, allow('HC', 'SHO', 'HQ_ADMIN', 'SYSTEM_ADMIN'), ctrl.createLink);
router.delete('/:id',              authMiddleware, enforceScope, allow('HC', 'SHO', 'HQ_ADMIN', 'SYSTEM_ADMIN'), ctrl.deleteLink);

export default router;
