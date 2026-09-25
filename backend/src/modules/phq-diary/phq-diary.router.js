import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { enforceScope } from '../../middleware/rbac.middleware.js';
import { generateDiary, previewDiary } from './phq-diary.controller.js';

const router = express.Router();

// GET  /api/phq-diary/preview   — JSON preview (no file generated)
router.get('/preview', authMiddleware, enforceScope, previewDiary);

// POST /api/phq-diary/generate  — generate & download xlsx
// Accepts date + scope in body or query
router.post('/generate', authMiddleware, enforceScope, generateDiary);

// Convenience GET alias (download directly from browser address bar)
router.get('/generate', authMiddleware, enforceScope, generateDiary);

export default router;
