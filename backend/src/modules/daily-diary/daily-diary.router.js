import express from 'express';
import * as dailyDiaryController from './daily-diary.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { enforceScope } from '../../middleware/rbac.middleware.js';

const router = express.Router();

// Preview row counts for 34 reports
router.get('/records-preview', authMiddleware, enforceScope, dailyDiaryController.getPreview);

// Export/compile Excel workbook
router.get('/export', authMiddleware, enforceScope, dailyDiaryController.exportExcel);

// Section 7 Option A: Get all reports data
router.get('/data', authMiddleware, enforceScope, dailyDiaryController.getDataAll);

// Section 7 Option B: Get a single report's data
router.get('/data/:tableName', authMiddleware, enforceScope, dailyDiaryController.getDataByTable);

export default router;
