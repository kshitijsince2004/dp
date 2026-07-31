import { Router } from 'express';
import * as logsController from './logs.controller.js';

const router = Router();

// Deliberately NO authMiddleware / enforceScope / rate-limiter here. This route's exemption from
// auth, CSRF, and rate-limiting is achieved entirely by WHERE it is mounted in app.js (before
// ipAllowlistMiddleware / csrfDoubleSubmitMiddleware / apiLimiter) — see the mount-point comment
// there. It must accept logs from a browser that is logged out or whose auth is broken, since
// that is precisely when a tester needs the pipe most
// (docs/logging-instrumentation-2026-07-22/HANDOFF.md §6).
router.post('/client', logsController.ingestClientLogs);

export default router;
