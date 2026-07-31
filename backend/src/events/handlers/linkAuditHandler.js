import * as eventBus from '../eventBus.js';
import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('linkAuditHandler');

export async function init() {
  log.info('init: registering event subscription', { pattern: 'link.*' });

  await eventBus.subscribe('link.*', 'link-audit-queue', async (payload) => {
    const {
      link_id, link_type_code,
      source_record_id, target_record_id,
      created_by, deleted_by, action
    } = payload;
    log.debug('link.*: received', { linkId: link_id, linkTypeCode: link_type_code, sourceRecordId: source_record_id, targetRecordId: target_record_id, action });

    try {
      const actorId = created_by || deleted_by;
      if (!actorId) {
        log.warn('link.*: no actor id (created_by/deleted_by) on payload, skipping audit write', { linkId: link_id });
        return;
      }

      const actor = await db('users').where({ id: actorId }).first();
      const actionLabel = action || (deleted_by ? 'LINK_DELETED' : 'LINK_CREATED');
      const changedAt = new Date().toISOString();
      const linkMeta = JSON.stringify({ link_id, link_type_code });
      log.debug('link.*: resolved actor + action label', { linkId: link_id, actorId, actorRole: actor?.role || null, actionLabel });

      const entries = [];
      if (source_record_id) {
        entries.push({
          id: uuidv4(),
          table_name: 'record_links',
          record_id: source_record_id,
          action: actionLabel,
          changed_by_id: actorId,
          changed_by_role: actor?.role || 'UNKNOWN',
          changed_at: changedAt,
          new_value: JSON.stringify({ ...JSON.parse(linkMeta), other_record_id: target_record_id })
        });
      }
      if (target_record_id) {
        entries.push({
          id: uuidv4(),
          table_name: 'record_links',
          record_id: target_record_id,
          action: actionLabel,
          changed_by_id: actorId,
          changed_by_role: actor?.role || 'UNKNOWN',
          changed_at: changedAt,
          new_value: JSON.stringify({ ...JSON.parse(linkMeta), other_record_id: source_record_id })
        });
      }
      log.debug('link.*: built audit_logs entries', { linkId: link_id, entryCount: entries.length });

      if (entries.length > 0) {
        await db('audit_logs').insert(entries);
        log.info('link.*: wrote audit_logs rows', { linkId: link_id, actionLabel, entryCount: entries.length, sourceRecordId: source_record_id, targetRecordId: target_record_id });
      } else {
        log.debug('link.*: no source/target record id on payload, nothing written', { linkId: link_id });
      }
    } catch (err) {
      log.error('link.*: handling failed', { linkId: link_id, err });
    }
  });
}
