import { Router } from 'express';
import * as recordsController from './records.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authMiddleware, enforceScope, recordsController.getRecords);
router.post('/search', authMiddleware, enforceScope, recordsController.searchRecords);
router.get('/check-duplicate', authMiddleware, recordsController.checkDuplicate);
router.get('/attachments/download/:filename', authMiddleware, recordsController.downloadAttachment);
router.get('/:id', authMiddleware, recordsController.getRecord);

router.post('/:id/attachments', authMiddleware, allow('HC'), upload.single('file'), recordsController.uploadAttachment);
router.get('/:id/attachments', authMiddleware, recordsController.getAttachments);
router.delete('/:id/attachments/:aid', authMiddleware, allow('HC'), recordsController.deleteAttachment);

router.post('/', authMiddleware, allow('HC'), recordsController.create);
router.put('/:id', authMiddleware, allow('HC'), recordsController.update);
router.delete('/:id', authMiddleware, allow('HC'), recordsController.deleteRecord);
router.post('/:id/submit', authMiddleware, allow('HC'), recordsController.submit);
router.put('/:id/submit', authMiddleware, allow('HC'), recordsController.submit);

router.post('/:id/approve', authMiddleware, allow('SHO', 'DISTRICT_OFFICER'), recordsController.approve);
router.post('/:id/jcp-approve', authMiddleware, allow('JCP'), recordsController.jcpApprove);
router.post('/:id/scp-approve', authMiddleware, allow('SCP'), recordsController.scpApprove);
router.post('/:id/seal', authMiddleware, allow('HQ_ADMIN'), recordsController.seal);
router.post('/:id/send-back', authMiddleware, allow('SHO', 'DISTRICT_OFFICER', 'JCP', 'SCP'), recordsController.sendBack);

// Support both standard override routes
router.patch('/:id/case-head', authMiddleware, allow('DISTRICT_OFFICER'), recordsController.overrideHead);
router.patch('/:id/override', authMiddleware, allow('DISTRICT_OFFICER'), recordsController.overrideHead);

export default router;
