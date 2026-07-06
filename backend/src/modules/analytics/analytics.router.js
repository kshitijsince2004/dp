import { Router } from 'express';
import * as analyticsController from './analytics.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

router.get('/summary', authMiddleware, enforceScope, analyticsController.getSummary);
router.get('/overview', authMiddleware, enforceScope, analyticsController.getOverview);
router.get('/by-crime-head', authMiddleware, enforceScope, analyticsController.getByCrimeHead);
router.get('/by-ps', authMiddleware, enforceScope, analyticsController.getByPs);
router.get('/status-breakdown', authMiddleware, enforceScope, analyticsController.getStatusBreakdown);

router.get('/trends', authMiddleware, enforceScope, (req, res, next) => {
  if (req.query.recordType) {
    return analyticsController.getTrends(req, res, next);
  }
  return analyticsController.getCombinedTrends(req, res, next);
});

router.get('/compare', authMiddleware, enforceScope, analyticsController.getCompare);
router.get('/export', authMiddleware, enforceScope, analyticsController.exportSpreadsheet);
router.get('/ps-dashboard', authMiddleware, enforceScope, analyticsController.getPsDashboardSummary);
router.get('/case-type-breakdown', authMiddleware, enforceScope, analyticsController.getCaseTypeBreakdown);
router.get('/cases-by-month', authMiddleware, enforceScope, analyticsController.getCasesByMonthTrend);

export default router;
