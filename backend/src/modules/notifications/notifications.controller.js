import * as notificationsService from './notifications.service.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('notifications.controller');

// authMiddleware guarantees req.user on every route this controller serves
// (notifications.routes.js mounts it on all REST routes) — no mock-user
// fallback. If it's ever somehow absent, fail closed with 401 rather than
// silently reading/writing another identity's notifications.
const requireUserId = (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    log.warn('requireUserId: rejected — no authenticated user on request');
    res.status(401).json({ status: 'error', success: false, message: 'Authentication required' });
    return null;
  }
  return userId;
};

export const getNotifications = async (req, res, next) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    log.debug('getNotifications: enter', { userId, filters: req.query });
    const notifications = await notificationsService.getNotifications(userId, req.query);
    log.info('getNotifications: 200', { userId, resultCount: notifications.length });
    res.status(200).json({ status: 'success', data: notifications });
  } catch (error) {
    log.error('getNotifications: failed', { err: error });
    next(error);
  }
};

export const getNotificationCount = async (req, res, next) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    log.debug('getNotificationCount: enter', { userId });
    const count = await notificationsService.getUnreadCount(userId);
    log.debug('getNotificationCount: 200', { userId, count });
    res.status(200).json({ status: 'success', data: { count } });
  } catch (error) {
    log.error('getNotificationCount: failed', { err: error });
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;
    log.debug('markAsRead: enter', { notificationId: id, userId });
    const updated = await notificationsService.markAsRead(id, userId);
    log.info('markAsRead: 200', { notificationId: id, userId, found: !!updated });
    res.status(200).json({ status: 'success', data: updated });
  } catch (error) {
    log.error('markAsRead: failed', { err: error });
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    log.debug('markAllAsRead: enter', { userId });
    await notificationsService.markAllAsRead(userId);
    log.info('markAllAsRead: 200', { userId });
    res.status(200).json({ status: 'success', message: 'All notifications marked as read' });
  } catch (error) {
    log.error('markAllAsRead: failed', { err: error });
    next(error);
  }
};
