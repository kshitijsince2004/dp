import * as eventBus from '../eventBus.js';
import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { pushToUser } from '../../modules/notifications/sse.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('notifyHandler');

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
  log.debug('createNotification: wrote notifications row', { notificationId: row.id, userId: row.user_id, type: row.type, recordId: row.record_id });
  // Push live to any open browser tabs for this user
  pushToUser(row.user_id, 'notification', row);
  log.debug('createNotification: pushed via SSE', { notificationId: row.id, userId: row.user_id });
  return row;
}

export async function init() {
  log.info('init: registering event subscriptions', { events: ['record.submitted', 'record.approved', 'record.sent_back', 'compilation.submitted'] });

  // ── 1. HC submits a record → notify SHOs at that station ──────────────
  await eventBus.subscribe('record.submitted', 'notifications-submit-queue', async (payload) => {
    const { record_id, performed_by } = payload;
    log.debug('record.submitted: received', { recordId: record_id, performedBy: performed_by });
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) {
        log.warn('record.submitted: record not found, skipping notification', { recordId: record_id });
        return;
      }

      const shos = await db('users').where({ role: 'SHO', ps_id: record.ps_id, is_active: true });
      log.debug('record.submitted: resolved SHOs to notify', { recordId: record_id, psId: record.ps_id, shoCount: shos.length });
      for (const sho of shos) {
        await createNotification({
          type: 'RECORD_SUBMITTED',
          params: { record_type: record.record_type },
          user_id: sho.id,
          record_id,
        });
      }
      log.info('record.submitted: notified SHOs', { recordId: record_id, notifiedCount: shos.length });
    } catch (err) {
      log.error('record.submitted: notification handling failed', { recordId: record_id, err });
    }
  });

  // ── 2. SHO / ACP approves a record → notify the HC who created it ─────
  await eventBus.subscribe('record.approved', 'notifications-approve-queue', async (payload) => {
    const { record_id, performed_by, comment } = payload;
    log.debug('record.approved: received', { recordId: record_id, performedBy: performed_by });
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) {
        log.warn('record.approved: record not found, skipping notification', { recordId: record_id });
        return;
      }

      await createNotification({
        type: 'RECORD_APPROVED',
        params: { record_type: record.record_type },
        user_id: record.created_by,
        record_id,
      });
      log.info('record.approved: notified creator', { recordId: record_id, userId: record.created_by });
    } catch (err) {
      log.error('record.approved: notification handling failed', { recordId: record_id, err });
    }
  });

  // ── 3. SHO sends a record back → notify the HC who created it ─────────
  await eventBus.subscribe('record.sent_back', 'notifications-sendback-queue', async (payload) => {
    const { record_id, performed_by, comment } = payload;
    log.debug('record.sent_back: received', { recordId: record_id, performedBy: performed_by, hasComment: !!comment });
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) {
        log.warn('record.sent_back: record not found, skipping notification', { recordId: record_id });
        return;
      }

      await createNotification({
        type: 'RECORD_SENT_BACK',
        params: { record_type: record.record_type, comment: comment || null },
        user_id: record.created_by,
        record_id,
      });
      log.info('record.sent_back: notified creator', { recordId: record_id, userId: record.created_by });
    } catch (err) {
      log.error('record.sent_back: notification handling failed', { recordId: record_id, err });
    }
  });

  // ── 4. District submits compilation → notify HQ officers ──────────────
  await eventBus.subscribe('compilation.submitted', 'notifications-compilation-queue', async (payload) => {
    const { compilation_id, district_id, period, submitted_by } = payload;
    log.debug('compilation.submitted: received', { compilationId: compilation_id, districtId: district_id, period, submittedBy: submitted_by });
    try {
      const hqUsers = await db('users')
        .whereIn('role', ['HQ_ANALYST', 'HQ_ADMIN'])
        .where({ is_active: true });
      log.debug('compilation.submitted: resolved HQ users to notify', { compilationId: compilation_id, hqUserCount: hqUsers.length });

      for (const hqUser of hqUsers) {
        await createNotification({
          type: 'COMPILATION_SUBMITTED',
          // record_id FKs to records — a compilation id does NOT belong there
          params: { period, compilation_id: compilation_id || null },
          user_id: hqUser.id,
          record_id: null,
        });
      }
      log.info('compilation.submitted: notified HQ users', { compilationId: compilation_id, notifiedCount: hqUsers.length });
    } catch (err) {
      log.error('compilation.submitted: notification handling failed', { compilationId: compilation_id, err });
    }
  });
}
