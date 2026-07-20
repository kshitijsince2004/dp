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

/**
 * CASE is the "one" side of CASE_ARREST/CASE_MISSING — it never has its own RESOLVERS entry
 * (that map is keyed by the "many" side's record_type). When a CASE is created or updated,
 * back-resolve any ARREST/MISSING records already sitting in the same PS with a matching
 * fir_no that aren't linked yet. This direction is necessary (not just symmetric tidiness)
 * because data-entry/import order is never guaranteed — an arrest or missing-person report
 * can be filed or bulk-imported before its case, or after; operators fill end-of-day
 * paperwork in whatever order it physically arrives (Integration 3, docs/new-db-integration/
 * 03-import.md C7). Same idempotent onConflict pattern as the forward direction below — no
 * pre-check for existing links, the unique constraint absorbs repeat attempts on every
 * record.updated for a busy CASE.
 */
async function backfillOrphansForCase(caseRecord, fir) {
  for (const [type, cfg] of Object.entries(RESOLVERS)) {
    const linkType = await db('link_type_registry').where({ code: cfg.linkTypeCode, is_active: true }).first();
    if (!linkType) {
      logger.warn(`[LinkResolver] link_type_registry code "${cfg.linkTypeCode}" not found — run npm run db:seed`);
      continue;
    }

    const candidates = await db(`${cfg.detailTable} as d`)
      .join('records as r', 'r.id', 'd.record_id')
      .where({ 'd.fir_no': fir.fir_no, 'r.ps_id': caseRecord.ps_id, 'r.record_type': type })
      .select('d.record_id', 'd.fir_date', 'r.created_by');

    for (const cand of candidates) {
      // Same fir_year-disjunct leniency as the forward direction (mirrored): only require
      // equality when BOTH sides carry a year. fir_details.fir_year is allocator-assigned
      // and NULL on every row today (allocator not built — see Deferrals), so this is a
      // no-op in practice until then, not dead code.
      if (fir.fir_year != null && cand.fir_date) {
        const candYear = new Date(cand.fir_date).getFullYear();
        if (candYear !== fir.fir_year) continue;
      }

      await db('record_links')
        .insert({
          id: uuidv4(), link_type_id: linkType.id,
          source_record_id: caseRecord.id, target_record_id: cand.record_id,
          metadata: JSON.stringify({ resolved_via: 'fir_no_backfill', fir_no: fir.fir_no }),
          created_by: cand.created_by,
        })
        .onConflict(['source_record_id', 'target_record_id', 'link_type_id'])
        .ignore();
    }
  }
}

async function resolveAndLink(recordId) {
  const record = await db('records').where({ id: recordId }).first();
  if (!record) return;

  if (record.record_type === 'CASE') {
    const fir = await db('fir_details').where({ record_id: recordId }).first();
    if (!fir || !fir.fir_no) return;
    await backfillOrphansForCase(record, fir);
    return;
  }

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
