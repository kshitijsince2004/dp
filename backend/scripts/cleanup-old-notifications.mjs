import db from '../src/config/db.js';
import { getLogger } from '../src/utils/logger.js';

const log = getLogger('cleanupNotifications');

/**
 * Retention Cleanup for Notifications Table:
 * Removes read notifications older than 30 days and stale unread notifications older than 90 days.
 */
async function runCleanup() {
  log.info('runCleanup: starting notifications retention pruning');
  try {
    const deletedRead = await db('notifications')
      .where('is_read', true)
      .where('created_at', '<', db.raw("now() - interval '30 days'"))
      .del();

    const deletedUnread = await db('notifications')
      .where('is_read', false)
      .where('created_at', '<', db.raw("now() - interval '90 days'"))
      .del();

    log.info('runCleanup: finished pruning', { deletedRead, deletedUnread, totalPruned: deletedRead + deletedUnread });
    console.log(`[NotificationPruning] Successfully deleted ${deletedRead} read and ${deletedUnread} stale unread notifications.`);
  } catch (err) {
    log.error('runCleanup: error during notification pruning', { err: err.message });
    console.error('[NotificationPruning] Pruning failed:', err);
  } finally {
    await db.destroy();
  }
}

runCleanup();
