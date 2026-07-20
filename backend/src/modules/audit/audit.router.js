import { Router } from 'express';
import * as auditController from './audit.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

const DISTRICT_ROLES = ['DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

// Chain verification (read-only report): SYSTEM_ADMIN
router.get('/chain-verify', authMiddleware, allow('SYSTEM_ADMIN'), auditController.verifyAuditChainEndpoint);

// Chain verification + enforcement (freezes broken records unless ?freeze=false): SYSTEM_ADMIN
router.post('/chain-verify', authMiddleware, allow('SYSTEM_ADMIN'), auditController.verifyAuditChainEndpoint);

// Manual freeze / privileged unfreeze of a single record: SYSTEM_ADMIN
router.post('/records/:recordId/freeze', authMiddleware, allow('SYSTEM_ADMIN'), auditController.freezeRecordEndpoint);
router.post('/records/:recordId/unfreeze', authMiddleware, allow('SYSTEM_ADMIN'), auditController.unfreezeRecordEndpoint);

// Record revision history: Any auth, scoped (P5.1) — single-record access verified in the controller
router.get('/record/:recordId', authMiddleware, enforceScope, auditController.getRecordAudit);

// User audit actions query: DISTRICT+ roles, scoped (P5.1) — district check on the target user in the controller
router.get('/user/:userId', authMiddleware, enforceScope, allow(...DISTRICT_ROLES), auditController.getUserAudit);

// Standard audit log viewer fallback
router.get('/', authMiddleware, allow('HQ_ADMIN', 'SYSTEM_ADMIN'), auditController.getAuditLogs);

export default router;
