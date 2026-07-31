import express from 'express';
import * as notificationsController from './notifications.controller.js';
import { registerClient, removeClient, getConnectedCount } from './sse.js';
import { authMiddleware, sseAuthMiddleware } from '../../middleware/auth.middleware.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('notifications.routes');

const router = express.Router();

/**
 * GET /notifications/stream
 * Server-Sent Events endpoint. The browser opens a persistent connection here.
 * Authentication uses ?token= query param because EventSource cannot set headers.
 * CSRF is not required because this is a GET request and SSE is read-only.
 */
router.get('/stream', sseAuthMiddleware, (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  log.debug('GET /stream: enter — SSE connection requested', { userId });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Send initial connection confirmation event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, ts: new Date().toISOString() })}\n\n`);

  // Register this response in the SSE registry
  registerClient(userId, res);
  log.info('GET /stream: SSE connection opened', { userId, connectedUsers: getConnectedCount() });

  // Heartbeat every 25 seconds to keep connection alive through proxies/load balancers
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch (err) {
      log.warn('GET /stream: heartbeat write failed, stopping interval', { userId, err });
      clearInterval(heartbeat);
    }
  }, 25000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
    log.info('GET /stream: SSE connection closed', { userId, connectedUsers: getConnectedCount() });
  });
});

// REST routes — all require standard Bearer auth
router.get('/', authMiddleware, notificationsController.getNotifications);
router.get('/count', authMiddleware, notificationsController.getNotificationCount);
router.patch('/:id/read', authMiddleware, notificationsController.markAsRead);
router.patch('/read-all', authMiddleware, notificationsController.markAllAsRead);

export default router;
