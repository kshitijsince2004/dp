import { Router } from 'express';
import * as authController from './auth.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';

const router = Router();

const isDevOrTest = env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevOrTest ? 99999 : 10,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many requests' }
});

router.post('/login', authLimiter, authController.login);
// NOTE: token refresh is handled automatically by SuperTokens at
// POST /api/v1/auth/session/refresh (mounted by the SuperTokens express middleware in app.js).
// The old custom /auth/refresh route was removed.
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.me);
router.put('/change-password', authMiddleware, authController.changePassword);
router.post('/change-password', authMiddleware, authController.changePassword);
router.get('/notifications', authMiddleware, authController.getNotifications);
router.put('/notifications/:id/read', authMiddleware, authController.markNotificationRead);
router.patch('/notifications/:id/read', authMiddleware, authController.markNotificationRead);

export default router;

