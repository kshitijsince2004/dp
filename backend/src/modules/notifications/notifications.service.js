import { db } from '../../config/db.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('notifications.service');

export const getNotifications = async (userId, filters) => {
  log.debug('getNotifications: enter', { userId, filters });
  let query = db('notifications').where('user_id', userId);

  if (filters.read !== undefined) {
    query = query.where('is_read', filters.read === 'true');
  }

  const limit = filters.limit ? parseInt(filters.limit, 10) : 20;
  const page = filters.page ? parseInt(filters.page, 10) : 1;
  const offset = (page - 1) * limit;

  const rows = await query.limit(limit).offset(offset).orderBy('created_at', 'desc');
  log.debug('getNotifications: exit', { userId, resultCount: rows.length, page, limit });
  return rows;
};

export const getUnreadCount = async (userId) => {
  log.debug('getUnreadCount: enter', { userId });
  const result = await db('notifications')
    .where({ user_id: userId, is_read: false })
    .count('* as count')
    .first();
  const count = parseInt(result.count, 10);
  log.debug('getUnreadCount: exit', { userId, count });
  return count;
};

export const markAsRead = async (id, userId) => {
  log.debug('markAsRead: enter', { notificationId: id, userId });
  const [updated] = await db('notifications')
    .where({ id, user_id: userId })
    .update({ is_read: true, read_at: new Date() })
    .returning('*');
  if (!updated) {
    log.warn('markAsRead: no matching notification updated', { notificationId: id, userId });
  } else {
    log.info('markAsRead: wrote notifications row', { notificationId: id, userId });
  }
  return updated;
};

export const markAllAsRead = async (userId) => {
  log.debug('markAllAsRead: enter', { userId });
  const result = await db('notifications')
    .where({ user_id: userId, is_read: false })
    .update({ is_read: true, read_at: new Date() });
  log.info('markAllAsRead: exit', { userId, updatedCount: result });
};

