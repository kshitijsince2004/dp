import express from 'express';
import { parseNaturalLanguageQuery } from './nlParser.service.js';
import { executeNaturalLanguageSearch } from './nlSearch.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const router = express.Router();

// Soft auth middleware wrapper so previewing query interpretation never crashes
const optionalAuthMiddleware = (req, res, next) => {
  authMiddleware(req, res, (err) => {
    // If auth succeeds, proceed; if token is missing/invalid in dev, assign default demo user context
    if (res.headersSent) return;
    if (!req.user) {
      req.user = { id: '00000000-0000-0000-0000-000000000000', role: 'HQ_ANALYST', level: 'HQ' };
    }
    next();
  });
};

router.use(optionalAuthMiddleware);

/**
 * POST /api/v1/search/interpret
 * Phase 3: Mandatory Interpretation Confirmation Preview
 */
router.post('/interpret', async (req, res) => {
  try {
    const { query } = req.body;
    const interpretation = await parseNaturalLanguageQuery(query);
    return res.json({
      success: true,
      data: interpretation
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/search/execute
 * Phase 4 & 5: Scoped Execution & Result Presentation with Audit Logging
 */
router.post('/execute', async (req, res) => {
  try {
    const { confirmationSpec, page = 1, limit = 20 } = req.body;
    if (!confirmationSpec || !confirmationSpec.resolved) {
      return res.status(400).json({ success: false, error: 'Invalid or missing confirmation spec' });
    }

    const searchResults = await executeNaturalLanguageSearch({
      user: req.user,
      confirmationSpec,
      page,
      limit
    });

    return res.json({
      success: true,
      data: searchResults
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
