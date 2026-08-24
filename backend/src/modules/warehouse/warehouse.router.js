/**
 * Warehouse API Router
 * =====================
 * Mounts reporting warehouse management, pivot builder, and export endpoints.
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { getStatus, getReportableFields, runReport, exportReport } from './warehouse.controller.js';

const router = Router();

// Auth required for all warehouse routes
router.use(authMiddleware);

// GET /api/v1/warehouse/status (or /api/warehouse/status)
router.get('/status', getStatus);

// GET /api/v1/warehouse/fields
router.get('/fields', getReportableFields);

// POST /api/v1/warehouse/run
router.post('/run', runReport);

// POST /api/v1/warehouse/export
router.post('/export', exportReport);

export default router;
