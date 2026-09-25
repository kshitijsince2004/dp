/**
 * PHAROS Report Builder — Router
 * ================================
 * All routes are under /api/v1/reports/builder and /api/reports/builder
 * (mounted as a sub-path on the existing reports router).
 *
 * Auth: all routes require Bearer JWT (authMiddleware).
 * Scope: enforceScope sets req.jurisdictionQuery for row-level filtering.
 * PII gating: done inside the controller/config (filterFieldsForRole).
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { enforceScope, allow } from '../../middleware/rbac.middleware.js';
import * as ctrl from './report-builder.controller.js';

const router = Router();

// All routes require auth + scope enforcement
router.use(authMiddleware, enforceScope);

// ── Field Dictionary ──────────────────────────────────────────────────────────
// GET /api/reports/builder/metadata
// Returns the reportable field dictionary filtered by caller's role.
router.get('/metadata', ctrl.getMetadata);

// ── Query Preview ─────────────────────────────────────────────────────────────
// POST /api/reports/builder/query
// Paginated preview of a custom report query. No file generated.
// Body: { table, join?, fields[], filters?, sort?, page?, pageSize? }
router.post('/query', ctrl.runQuery);

// ── Export (Async) ────────────────────────────────────────────────────────────
// POST /api/reports/builder/export
// Queues an async export job. Returns job_id immediately.
// Body: { table, join?, fields[], filters?, sort?, format: 'csv'|'xlsx'|'pdf' }
router.post('/export', ctrl.startExport);

// GET /api/reports/builder/export/:jobId
// Poll job status OR download the file if status=READY.
router.get('/export/:jobId', ctrl.getExportStatus);

// ── Saved Report Templates ────────────────────────────────────────────────────
// GET  /api/reports/builder/saved         — list current user's saved templates
// POST /api/reports/builder/saved         — create a new saved template
// PUT  /api/reports/builder/saved/:id     — update
// DEL  /api/reports/builder/saved/:id     — delete
router.get('/quick-access', ctrl.getQuickAccessReports);
router.get('/saved',     ctrl.listSavedReports);
router.post('/saved',    ctrl.createSavedReport);
router.post('/saved/:id/run', ctrl.runSavedReport);
router.put('/saved/:id', ctrl.updateSavedReport);
router.delete('/saved/:id', ctrl.deleteSavedReport);


// ── Lookup Dropdowns ──────────────────────────────────────────────────────────
// GET /api/reports/builder/lookups/:type
// type: districts | police-stations | crime-heads | case-status |
//       arrestee-status | workflow-status | record-types
router.get('/lookups/:type', ctrl.getLookupValues);

// ── Cross-Match Reports ───────────────────────────────────────────────────────
// POST /api/reports/builder/cross-match/missing-uidb
// Similarity match between MISSING and UIDB records (§4.5).
// Body: { gender?, age_min?, age_max?, description_keywords?, max_results? }
router.post('/cross-match/missing-uidb', ctrl.crossMatchMissingUidb);

// ── Audit Log (Admin only) ────────────────────────────────────────────────────
// GET /api/reports/builder/audit
// Shows who ran what report and exported what.
router.get('/audit', allow('HQ_ADMIN', 'SYSTEM_ADMIN'), ctrl.getBuilderAuditLog);

export default router;
