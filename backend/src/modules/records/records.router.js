import { Router } from 'express';
import * as recordsController from './records.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

router.get('/', authMiddleware, enforceScope, recordsController.getRecords);
router.post('/search', authMiddleware, enforceScope, recordsController.searchRecords);
router.get('/check-duplicate', authMiddleware, recordsController.checkDuplicate);
router.get('/:id', authMiddleware, recordsController.getRecord);

router.post('/', authMiddleware, allow('HC'), recordsController.create);
router.put('/:id', authMiddleware, allow('HC', 'SHO', 'DISTRICT_OFFICER', 'DISTRICT'), recordsController.update);
router.delete('/:id', authMiddleware, allow('HC'), recordsController.deleteRecord);
router.post('/:id/submit', authMiddleware, allow('HC'), recordsController.submit);
router.put('/:id/submit', authMiddleware, allow('HC'), recordsController.submit);

router.post('/:id/approve', authMiddleware, allow('SHO', 'DISTRICT_OFFICER'), recordsController.approve);
router.post('/:id/jcp-approve', authMiddleware, allow('JCP'), recordsController.jcpApprove);
router.post('/:id/scp-approve', authMiddleware, allow('SCP'), recordsController.scpApprove);
router.post('/:id/seal', authMiddleware, allow('HQ_ADMIN'), recordsController.seal);
router.post('/:id/send-back', authMiddleware, allow('SHO', 'DISTRICT_OFFICER', 'JCP', 'SCP'), recordsController.sendBack);

// Domain status update (item 9) — distinct from workflow transitions above: case/missing/
// uidb/PCR-call status progression + worked-out flip, each dated via record_status_events.
router.patch('/:id/status', authMiddleware, allow('HC', 'SHO', 'DISTRICT_OFFICER', 'DISTRICT'), recordsController.updateStatus);

// Registry-driven status field/options catalog (WS8) — same role trio as the PATCH above;
// GET /:id/status-options never collides with the bare GET /:id route (different segment
// count), so no reordering is needed, but it's kept beside its PATCH sibling for readability.
router.get('/:id/status-options', authMiddleware, allow('HC', 'SHO', 'DISTRICT_OFFICER', 'DISTRICT'), recordsController.getStatusOptions);

// Support both standard override routes
router.patch('/:id/case-head', authMiddleware, allow('DISTRICT_OFFICER', 'DISTRICT'), recordsController.overrideHead);
router.patch('/:id/override', authMiddleware, allow('DISTRICT_OFFICER', 'DISTRICT'), recordsController.overrideHead);

export default router;
