import { db } from '../../config/db.js';

export const getNotifications = async (userId, filters) => {
  let query = db('notifications').where('user_id', userId);
  
  if (filters.read !== undefined) {
    query = query.where('is_read', filters.read === 'true');
  }

  const limit = filters.limit ? parseInt(filters.limit, 10) : 20;
  const page = filters.page ? parseInt(filters.page, 10) : 1;
  const offset = (page - 1) * limit;

  return await query.limit(limit).offset(offset).orderBy('created_at', 'desc');
};

export const getUnreadCount = async (userId) => {
  const result = await db('notifications')
    .where({ user_id: userId, is_read: false })
    .count('* as count')
    .first();
  return parseInt(result.count, 10);
};

export const markAsRead = async (id, userId) => {
  const [updated] = await db('notifications')
    .where({ id, user_id: userId })
    .update({ is_read: true, read_at: new Date() })
    .returning('*');
  return updated;
};

export const markAllAsRead = async (userId) => {
  await db('notifications')
    .where({ user_id: userId, is_read: false })
    .update({ is_read: true, read_at: new Date() });
};

