import * as eventBus from '../eventBus.js';
import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { pushToUser } from '../../modules/notifications/sse.js';
import { logger } from '../../utils/logger.js';

/**
 * Helper: insert a notification row and push it instantly via SSE.
 * New-schema shape (2026-07): { user_id, type, params, record_id } — `type` is
 * an i18n key rendered at read time, `params` carries the interpolation values.
 */
async function createNotification(notif) {
  const row = {
    id: uuidv4(),
    ...notif,
    is_read: false,
    created_at: new Date().toISOString(),
  };
  await db('notifications').insert(row);
  // Push live to any open browser tabs for this user
  pushToUser(row.user_id, 'notification', row);
  return row;
}

export async function init() {
  // ── 1. HC submits a record → notify SHOs at that station ──────────────
  await eventBus.subscribe('record.submitted', 'notifications-submit-queue', async (payload) => {
    const { record_id, performed_by } = payload;
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) return;

      const shos = await db('users').where({ role: 'SHO', ps_id: record.ps_id, is_active: true });
      for (const sho of shos) {
        await createNotification({
          type: 'RECORD_SUBMITTED',
          params: { record_type: record.record_type },
          user_id: sho.id,
          record_id,
        });
      }
    } catch (err) {
      logger.error('[NotifyHandler] Submit notification failed:', err.message);
    }
  });

  // ── 2. SHO / ACP approves a record → notify the HC who created it ─────
  await eventBus.subscribe('record.approved', 'notifications-approve-queue', async (payload) => {
    const { record_id, performed_by, comment } = payload;
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) return;

      await createNotification({
        type: 'RECORD_APPROVED',
        params: { record_type: record.record_type },
        user_id: record.created_by,
        record_id,
      });
    } catch (err) {
      logger.error('[NotifyHandler] Approve notification failed:', err.message);
    }
  });

  // ── 3. SHO sends a record back → notify the HC who created it ─────────
  await eventBus.subscribe('record.sent_back', 'notifications-sendback-queue', async (payload) => {
    const { record_id, performed_by, comment } = payload;
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) return;

      await createNotification({
        type: 'RECORD_SENT_BACK',
        params: { record_type: record.record_type, comment: comment || null },
        user_id: record.created_by,
        record_id,
      });
    } catch (err) {
      logger.error('[NotifyHandler] Send back notification failed:', err.message);
    }
  });

  // ── 4. District submits compilation → notify HQ officers ──────────────
  await eventBus.subscribe('compilation.submitted', 'notifications-compilation-queue', async (payload) => {
    const { compilation_id, district_id, period, submitted_by } = payload;
    try {
      const hqUsers = await db('users')
        .whereIn('role', ['HQ_ANALYST', 'HQ_ADMIN'])
        .where({ is_active: true });

      for (const hqUser of hqUsers) {
        await createNotification({
          type: 'COMPILATION_SUBMITTED',
          // record_id FKs to records — a compilation id does NOT belong there
          params: { period, compilation_id: compilation_id || null },
          user_id: hqUser.id,
          record_id: null,
        });
      }
    } catch (err) {
      logger.error('[NotifyHandler] Compilation notification failed:', err.message);
    }
  });
}
