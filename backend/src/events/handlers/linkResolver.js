import * as eventBus from '../eventBus.js';
import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';

// Async link resolution (ruling 23c, ENGINEERING_BASELINE.md P1.7): a record write never
// resolves cross-record links inside its own transaction. It stores the as-entered FIR
// reference (arrest_details.fir_no/fir_date, missing_details.fir_no/fir_date) and commits;
// this post-commit subscriber does exactly one thing — resolve (ps_id, fir_year, fir_no)
// against the fir_details business key and insert the resulting record_links row, once,
// idempotently (the UNIQUE (source, target, link_type) triple absorbs retries). Unresolved
// references stay provenance-only and are retried on the next record.updated event.

const RESOLVERS = {
  ARREST: { detailTable: 'arrest_details', linkTypeCode: 'CASE_ARREST' },
  MISSING: { detailTable: 'missing_details', linkTypeCode: 'CASE_MISSING' },
};

async function resolveAndLink(recordId) {
  const record = await db('records').where({ id: recordId }).first();
  if (!record) return;
  const cfg = RESOLVERS[record.record_type];
  if (!cfg) return;

  const detail = await db(cfg.detailTable).where({ record_id: recordId }).first();
  if (!detail || !detail.fir_no) return;

  // `fir_details.fir_year` is allocator-assigned (ARCHITECTURE.md §6.2 FIR number
  // counter) — that allocator isn't built yet (deferred with the transfers module, per
  // this integration's handoff), so fir_year is NULL on every CASE record right now.
  // Resolving strictly on the full (ps_id, fir_year, fir_no) business key would never
  // match anything until the allocator lands. Scope by (ps_id, fir_no) — the only two
  // components actually populated today — and additionally require fir_year equality
  // ONLY when the CASE side has one set (a future-proofing no-op today, real disambiguation
  // once the allocator starts populating it).
  let caseFir = db('fir_details').where({ ps_id: record.ps_id, fir_no: detail.fir_no });
  const firYear = detail.fir_date ? new Date(detail.fir_date).getFullYear() : null;
  if (firYear) caseFir = caseFir.andWhere((b) => b.whereNull('fir_year').orWhere('fir_year', firYear));
  const match = await caseFir.first();
  if (!match) {
    logger.debug(`[LinkResolver] No CASE match yet for ${record.record_type} ${recordId} (fir_no=${detail.fir_no})`);
    return;
  }

  const linkType = await db('link_type_registry').where({ code: cfg.linkTypeCode, is_active: true }).first();
  if (!linkType) {
    logger.warn(`[LinkResolver] link_type_registry code "${cfg.linkTypeCode}" not found — run npm run db:seed`);
    return;
  }

  await db('record_links')
    .insert({
      id: uuidv4(), link_type_id: linkType.id,
      source_record_id: match.record_id, target_record_id: recordId,
      metadata: JSON.stringify({ resolved_via: 'fir_no', fir_no: detail.fir_no }),
      created_by: record.created_by,
    })
    .onConflict(['source_record_id', 'target_record_id', 'link_type_id'])
    .ignore();
}

export async function init() {
  await eventBus.subscribe('record.created', 'link-resolver-queue', async (payload) => {
    try {
      const recordId = payload.record_id;
      if (recordId) await resolveAndLink(recordId);
    } catch (err) {
      logger.error('[LinkResolver] record.created handling failed:', err.message);
    }
  });
  await eventBus.subscribe('record.updated', 'link-resolver-queue-updated', async (payload) => {
    try {
      const recordId = payload.record_id;
      if (recordId) await resolveAndLink(recordId);
    } catch (err) {
      logger.error('[LinkResolver] record.updated handling failed:', err.message);
    }
  });
}
