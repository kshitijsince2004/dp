import { Router } from 'express';
import * as reportsController from './reports.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow } from '../../middleware/rbac.middleware.js';
import reportBuilderRouter from '../report-builder/report-builder.router.js';

const router = Router();

// ── Report Builder (Custom Report Engine) ─────────────────────────────────────
// Mounts at /api/reports/builder and /api/v1/reports/builder
// Must be declared BEFORE any :id parameterized routes to avoid conflicts.

router.use('/builder', reportBuilderRouter);

router.get('/templates', authMiddleware, reportsController.getTemplates);
router.post('/generate', authMiddleware, reportsController.generateReport);
router.get('/status/:id', authMiddleware, reportsController.getJobStatus);
router.get('/download/:id/:filename?', reportsController.downloadReport);
router.get('/history', authMiddleware, reportsController.getReportsHistory);
router.get('/trace/:recordId', authMiddleware, reportsController.traceRecord);


// Scheduled reports CRUD (HQ/Admin only)
router.get('/schedules', authMiddleware, allow('HQ_ADMIN', 'SYSTEM_ADMIN'), reportsController.listSchedules);
router.post('/schedules', authMiddleware, allow('HQ_ADMIN', 'SYSTEM_ADMIN'), reportsController.createSchedule);
router.put('/schedules/:id', authMiddleware, allow('HQ_ADMIN', 'SYSTEM_ADMIN'), reportsController.updateSchedule);
router.delete('/schedules/:id', authMiddleware, allow('HQ_ADMIN', 'SYSTEM_ADMIN'), reportsController.deleteSchedule);
router.post('/schedules/:id/run', authMiddleware, allow('HQ_ADMIN', 'SYSTEM_ADMIN'), reportsController.runScheduleNow);

// Also expose /stats on the reports router in case mounted as /api/admin
router.get('/stats', authMiddleware, allow('HQ_ADMIN', 'SYSTEM_ADMIN'), reportsController.getAdminStats);

export default router;
