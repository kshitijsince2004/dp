import * as notificationsService from './notifications.service.js';

// authMiddleware guarantees req.user on every route this controller serves
// (notifications.routes.js mounts it on all REST routes) — no mock-user
// fallback. If it's ever somehow absent, fail closed with 401 rather than
// silently reading/writing another identity's notifications.
const requireUserId = (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    res.status(401).json({ status: 'error', success: false, message: 'Authentication required' });
    return null;
  }
  return userId;
};

export const getNotifications = async (req, res, next) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const notifications = await notificationsService.getNotifications(userId, req.query);
    res.status(200).json({ status: 'success', data: notifications });
  } catch (error) {
    next(error);
  }
};

export const getNotificationCount = async (req, res, next) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const count = await notificationsService.getUnreadCount(userId);
    res.status(200).json({ status: 'success', data: { count } });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;
    const updated = await notificationsService.markAsRead(id, userId);
    res.status(200).json({ status: 'success', data: updated });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await notificationsService.markAllAsRead(userId);
    res.status(200).json({ status: 'success', message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};
