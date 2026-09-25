import { Router } from 'express';
import * as reportsController from '../reports/reports.controller.js';
import * as auditController from '../audit/audit.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow } from '../../middleware/rbac.middleware.js';

// NOTE: custom-fields routes retired — field management is now consolidated in
// /api/v1/fields (fields.router.js) using scope_level on field_registry.

const router = Router();

router.get('/stats', authMiddleware, allow('HQ_ADMIN', 'SYSTEM_ADMIN'), reportsController.getAdminStats);

router.post('/audit-verify', authMiddleware, allow('SYSTEM_ADMIN'), auditController.verifyAuditChainEndpoint);
router.get('/audit-log',     authMiddleware, allow('SYSTEM_ADMIN'), auditController.getAdminAuditLogs);

export default router;
