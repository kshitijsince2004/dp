import { Router } from 'express';
import * as analyticsController from './analytics.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

router.get('/summary', authMiddleware, enforceScope, analyticsController.getSummary);
router.get('/overview', authMiddleware, enforceScope, analyticsController.getOverview);
router.get('/by-crime-head', authMiddleware, enforceScope, analyticsController.getByCrimeHead);
router.get('/by-ps', authMiddleware, enforceScope, analyticsController.getByPs);
router.get('/by-district', authMiddleware, enforceScope, analyticsController.getByDistrict);
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
router.get('/arrests-trend', authMiddleware, enforceScope, analyticsController.getArrestsTrend);

// HC Dashboard v2 (FIR/Kalandra/Heinous KPIs, crime-head matrix, case-status breakdown)
router.get('/ps-dashboard-v2', authMiddleware, enforceScope, analyticsController.getPsDashboardStatsV2);
router.get('/arrest-trend-breakdown', authMiddleware, enforceScope, analyticsController.getArrestsTrendBreakdown);
router.get('/crime-head-matrix', authMiddleware, enforceScope, analyticsController.getCrimeHeadMatrix);
router.get('/case-status-breakdown', authMiddleware, enforceScope, analyticsController.getCaseStatusBreakdown);
router.get('/crime-head-year-trend', authMiddleware, enforceScope, analyticsController.getCrimeHeadYearTrend);

// Specialized Operational Command Domains
router.get('/property-recovery', authMiddleware, enforceScope, analyticsController.getPropertyRecoveryStats);
router.get('/investigation-disposal', authMiddleware, enforceScope, analyticsController.getInvestigationDisposalStats);
router.get('/community-safety', authMiddleware, enforceScope, analyticsController.getCommunitySafetyStats);
router.get('/beat-preventive', authMiddleware, enforceScope, analyticsController.getBeatPreventiveStats);

export default router;
