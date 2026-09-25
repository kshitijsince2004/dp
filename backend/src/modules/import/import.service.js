// Batch lifecycle for the bulk-import module (Integration 3, WP4/WP5). Owns the
// `import_batches`/`import_batch_errors` rows end to end: create (parse+validate+persist),
// claim (the atomic pre-confirm handoff to the async worker — WP5 adds processBatch alongside
// claimBatch in this same file), cancel, and the scoped list/detail reads. Controllers never
// touch these tables directly — this is the one place that does, matching P1.2's "one write
// path" discipline extended to the import module's own bookkeeping tables.
import fs from 'fs';
import db from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { getLogger } from '../../utils/logger.js';
import { readWorkbook, INVALID_PARENT_CODE, effectiveRecordType, UNKNOWN_LAYOUT_MESSAGE } from './import.parse.js';
import { validateBatch } from './import.validate.js';
import { createImportedRecord } from '../records/records.service.js';
import { normalizeRegistryRow, parseApplicableTypes } from './registry-sync.util.js';

// STYLE ANCHOR match (logging-instrumentation-2026-07-22, HANDOFF.md §7): matches
// records.service.js exactly — getLogger('import.service') bound once, log.debug/info/warn/
// error(event, data) from then on. This is the batch-lifecycle layer: every state transition
// (VALIDATION_PENDING -> VALIDATED -> CONFIRMED -> IMPORTED/FAILED), every per-row write
// attempt/salvage/reject inside processBatch, and every claim/cancel decision gets a line.
const log = getLogger('import.service');

const MAX_INLINE_ERRORS = 500;

// FIX 3 (2026-07) — Postgres's default-generated name for the `UNIQUE (ps_id, fir_year, fir_no)`
// constraint on fir_details (migrations/20260711000003_locations_records_details.js:92; no
// explicit CONSTRAINT name given there, so Postgres auto-names it `<table>_<cols>_key`).
// Verified live against the dev DB: `SELECT conname FROM pg_constraint WHERE conrelid =
// 'fir_details'::regclass AND contype = 'u'` -> `fir_details_ps_id_fir_year_fir_no_key`. This
// is the ONLY 23505 processBatch's write loop is allowed to downgrade to a WARNING — every
// other unique-violation (a different table/index entirely) is a genuine write failure.
const FIR_DETAILS_UNIQUE_CONSTRAINT = 'fir_details_ps_id_fir_year_fir_no_key';

/** Registry rows applicable to `recordType`, active, pre-shimmed (WP0's normalizeRegistryRow)
 * — the same map readWorkbook/validateBatch/composeRecordPayload all consume.
 *
 * FIX 4 follow-up (2026-07): field_registry has NO 'KALANDRA' entries in applicable_record_types
 * anywhere (it is stored/classified as ARREST — effectiveRecordType() is the one shared
 * translation point, same as createImportedRecord's writeRecordType). Filtering against the raw
 * import recordType silently returned an EMPTY map for KALANDRA batches — breaking registry-
 * driven coercion, requiredness, and auto-included-field detection for every KALANDRA row, not
 * just the advisory submit-requirements check FIX 4 fixed directly. Translate here too, so every
 * caller (createBatch/processBatch, and everything downstream: readWorkbook, validateBatch) gets
 * the same ARREST-backed registry KALANDRA has always been meant to use. */
async function buildRegistryMap(recordType) {
  const effectiveType = effectiveRecordType(recordType);
  log.debug('buildRegistryMap: enter', { recordType, effectiveType });
  const rows = (await db('field_registry').where('is_active', true)).map(normalizeRegistryRow);
  const map = {};
  for (const f of rows) {
    if (parseApplicableTypes(f.applicable_record_types).includes(effectiveType)) map[f.field_key] = f;
  }
  log.debug('buildRegistryMap: exit', { recordType, effectiveType, activeFieldCount: rows.length, applicableFieldCount: Object.keys(map).length });
  return map;
}

/**
 * T2 (03-TRIAGE-MATRIX.md/D2) — legacy-only IO auto-provision. Called from processBatch right
 * before createImportedRecord, for rows import.validate.js flagged with
 * `payload.needsIoAutoProvision` (an unregistered PIS on a legacy row). Idempotent per
 * `pis_no` — `investigating_officers.pis_no` carries a GLOBAL unique index (not PS-scoped;
 * `migrations/20260711000001_org_identity.js:52`), so this looks up by PIS ALONE first (never
 * scoped to `psId`) and reuses whatever it finds, even if registered under a different PS —
 * that's still strictly better than a 23505 crash, and matches what the unique index actually
 * enforces. `investigating_officers` has no `extra`/`source_system` column (unlike
 * records/detail tables) — T7.1's migration is scoped to the gender/property CHECK expansion
 * only, so no schema change is added here either; provenance is instead embedded directly in
 * `name` (visible to any SHO listing IOs for verification) rather than a new column. Exact
 * provenance mechanism was explicitly left to "architect's call at implementation" (D2) —
 * flagged in the Wave A report as the concrete choice made.
 */
/** T7.2/T7.3 — the exact sanitized error_message shape for a generic write failure (any DB/JS
 * throw from createImportedRecord OTHER than the already-handled 23505 unique-violation race).
 * Pulled out to its own exported function purely so it's directly unit-testable (T7.3) without
 * needing a live DB round-trip to prove "never err.message verbatim" — same object literal
 * processBatch inserted inline before this refactor, no behavior change. */
export function sanitizedWriteFailedRow(batchId, rowIdx) {
  return {
    batch_id: batchId, row_number: rowIdx, field_key: null,
    error_code: 'WRITE_FAILED', severity: 'ERROR',
    error_message: `This row could not be saved due to a system error (ref: ${batchId}/${rowIdx}). Report this to your administrator.`,
  };
}

export async function ensureAutoProvisionedIo(trx, psId, pisNo) {
  const norm = String(pisNo || '').trim();
  log.debug('ensureAutoProvisionedIo: enter', { psId, pisNo: norm });
  if (!norm) {
    log.error('ensureAutoProvisionedIo: rejected — empty PIS number', { psId });
    throw new Error('ensureAutoProvisionedIo requires a non-empty PIS number');
  }

  const existing = await trx('investigating_officers').whereRaw('LOWER(pis_no) = LOWER(?)', [norm]).first();
  if (existing) {
    log.debug('ensureAutoProvisionedIo: found existing IO by PIS, reusing', { psId, pisNo: norm, ioId: existing.id, ioPsId: existing.ps_id });
    return existing;
  }

  try {
    // FIX 5 (2026-07): `users`/`investigating_officers.name` is varchar(100). The previous
    // template ("Auto-registered IO (PIS ${norm}) — pending SHO verification") is 52 fixed
    // chars + up to 50 for a PIS number = up to 102 chars, overflowing the column and turning
    // a legitimate legacy-IO auto-provision into a raw DB error. Shortened while keeping the
    // "Auto-registered" prefix (the provenance/queryability marker SHOs and any later
    // `WHERE name LIKE 'Auto-registered%'` audit rely on) — still 26 fixed chars + PIS, so a
    // PIS up to 74 chars fits without truncation; `.slice(0, 100)` is the defensive backstop
    // for anything longer than that.
    const name = `Auto-registered IO (PIS ${norm})`.slice(0, 100);
    const [row] = await trx('investigating_officers').insert({
      ps_id: psId,
      pis_no: norm,
      name,
      is_active: true,
    }).returning('*');
    log.info('ensureAutoProvisionedIo: auto-provisioned new investigating_officers row', { psId, pisNo: norm, ioId: row.id });
    return row;
  } catch (err) {
    if (err.code === '23505') {
      // Idempotency race backstop — another row in this batch (or a concurrent process)
      // inserted this exact pis_no between our SELECT and INSERT.
      const row = await trx('investigating_officers').whereRaw('LOWER(pis_no) = LOWER(?)', [norm]).first();
      if (row) {
        log.warn('ensureAutoProvisionedIo: race backstop — insert collided, reusing concurrently-inserted row', { psId, pisNo: norm, ioId: row.id });
        return row;
      }
    }
    log.error('ensureAutoProvisionedIo: failed', { psId, pisNo: norm, err });
    throw err;
  }
}

/** Walks hierarchy_nodes.parent_id up from a PS to its DISTRICT ancestor — same pattern the
 * old controller used at validate time (kept, not reinvented). Exported: WP6's controller-
 * level DISTRICT_OFFICER district-membership check (P5.6) reuses this instead of a second
 * copy of the same walk. */
export async function districtForPs(psId) {
  log.debug('districtForPs: enter', { psId });
  let node = await db('hierarchy_nodes').where({ id: psId }).first();
  while (node && node.node_type !== 'DISTRICT') {
    if (!node.parent_id) { log.warn('districtForPs: walk hit a node with no parent before reaching DISTRICT', { psId, stoppedAt: node.id, nodeType: node.node_type }); return null; }
    node = await db('hierarchy_nodes').where({ id: node.parent_id }).first();
  }
  log.debug('districtForPs: exit', { psId, districtId: node?.id || null });
  return node || null;
}

/** Resolves the { psId, districtId, districtName, psName } batchScope object validateBatch and
 * this file's own persistence step need. Callers (the controller) supply an ALREADY-DECIDED,
 * ALREADY-AUTHORIZED target psId — this function only resolves display names + the district
 * chain for the PS_MISMATCH sanity check and the spine's district_id stamp; it does not itself
 * enforce who's allowed to target what PS (that's the router/controller's job, P5.6/WP6). */
async function resolveBatchScope(psId) {
  log.debug('resolveBatchScope: enter', { psId });
  const psNode = await db('hierarchy_nodes').where({ id: psId }).first();
  if (!psNode) {
    log.warn('resolveBatchScope: rejected — target PS not found', { psId });
    throw new ApiError(400, 'Target police station not found');
  }
  const districtNode = await districtForPs(psId);
  const scope = {
    psId,
    districtId: districtNode ? districtNode.id : null,
    districtName: districtNode ? districtNode.name : null,
    psName: psNode.name,
  };
  log.debug('resolveBatchScope: exit', scope);
  return scope;
}

/**
 * Create + fully validate a batch in one call: inserts the `import_batches` row, parses the
 * uploaded file, runs validateBatch, persists every finding (the full set, always — WP4's
 * error taxonomy) plus the `__INVALID_PARENT__` sentinel rows confirm will need, and leaves
 * the batch in `VALIDATED`. Never leaves a batch in `VALIDATION_PENDING` on return — either
 * this succeeds through to VALIDATED or it throws (the controller's job to mark FAILED /
 * clean up the temp file on that path, since only it knows the HTTP-level failure semantics).
 *
 * @param user          req.user — uploaded_by, and (for CASE dup-checks etc.) the acting identity
 * @param recordType    'CASE' | 'ARREST' | 'KALANDRA' | 'UIDB' | 'MISSING' | 'PCR_CALL'
 * @param isLegacy      boolean
 * @param targetPsId    resolved + authorized by the caller (WP6) — never taken from the body
 * @param filePath      the multer-saved temp file's path
 * @returns { batch, errors (capped to MAX_INLINE_ERRORS for the HTTP response), errorsTruncated }
 */
export async function createBatch({ user, recordType, isLegacy, targetPsId, filePath }) {
  log.debug('createBatch: enter', { userId: user.id, recordType, isLegacy, targetPsId, filePath });
  try {
    const batchScope = await resolveBatchScope(targetPsId);

    const [batch] = await db('import_batches')
      .insert({
        record_type: recordType, is_legacy: isLegacy, uploaded_by: user.id,
        ps_id: batchScope.psId, district_id: batchScope.districtId,
        file_path: filePath, status: 'VALIDATION_PENDING',
      })
      .returning('*');
    log.info('createBatch: wrote import_batches row (VALIDATION_PENDING)', { batchId: batch.id, recordType, isLegacy, psId: batchScope.psId });

    const registryMap = await buildRegistryMap(recordType);
    const parsed = await readWorkbook(recordType, filePath, registryMap);
    if (parsed && parsed.unknownLayout) {
      // T9 (03-TRIAGE-MATRIX.md) — the file's headers didn't fingerprint-match any known layout
      // (current or a registered historical one) well enough to trust; friendly single-message
      // rejection instead of a per-row cascade of missing-column errors.
      log.warn('createBatch: rejected — unknown layout', { batchId: batch.id, recordType });
      throw new ApiError(400, UNKNOWN_LAYOUT_MESSAGE);
    }
    if (!parsed) {
      log.warn('createBatch: rejected — main worksheet not found', { batchId: batch.id, recordType });
      throw new ApiError(400, 'Invalid template: main worksheet not found');
    }
    log.debug('createBatch: workbook parsed', {
      batchId: batch.id, recordType, parentRows: parsed.parentRows.length,
      childSheetCounts: Object.fromEntries(Object.entries(parsed.childSheets || {}).map(([role, rows]) => [role, rows.length])),
    });

    const { errorRows, invalidParentKeys, counts } = await validateBatch(db, {
      recordType, isLegacy, batchScope, parsed, registryMap,
    });
    log.debug('createBatch: validateBatch complete', { batchId: batch.id, recordType, counts, errorRowCount: errorRows.length, invalidParentKeyCount: invalidParentKeys.size });

    await db.transaction(async (trx) => {
      if (errorRows.length) {
        const errorPayloads = errorRows.map((e) => ({
          batch_id: batch.id, row_number: e.row ?? 0, field_key: e.field_key || null,
          error_code: e.code, severity: e.severity, error_message: e.message,
        }));
        for (let i = 0; i < errorPayloads.length; i += 500) {
          await trx('import_batch_errors').insert(errorPayloads.slice(i, i + 500));
        }
        log.debug('createBatch: persisted import_batch_errors rows', { batchId: batch.id, count: errorPayloads.length });
      }
      if (invalidParentKeys.size) {
        // Authoritative persisted parent-invalidation set — confirm (WP5) reads these back by
        // canonical key instead of re-deriving them, so validate and confirm can never disagree
        // about which FIRs were rejected even if the underlying file is re-read independently.
        const sentinelPayloads = [...invalidParentKeys].map((canon) => ({
          batch_id: batch.id, row_number: 0, field_key: null,
          error_code: INVALID_PARENT_CODE, severity: 'ERROR', error_message: canon,
        }));
        for (let i = 0; i < sentinelPayloads.length; i += 500) {
          await trx('import_batch_errors').insert(sentinelPayloads.slice(i, i + 500));
        }
        log.debug('createBatch: persisted invalid-parent sentinel rows', { batchId: batch.id, count: sentinelPayloads.length });
      }
      await trx('import_batches').where({ id: batch.id }).update({
        status: 'VALIDATED', total_rows: counts.total, valid_rows: counts.valid,
        invalid_rows: counts.invalid, updated_at: trx.fn.now(),
      });
      log.info('createBatch: import_batches transitioned to VALIDATED', { batchId: batch.id, ...counts });
    });

    const visibleErrors = errorRows.filter((e) => e.code !== INVALID_PARENT_CODE);
    log.info('createBatch: exit', {
      batchId: batch.id, recordType, isLegacy, ...counts,
      visibleErrorCount: visibleErrors.length, errorsTruncated: visibleErrors.length > MAX_INLINE_ERRORS,
    });
    return {
      batch: { ...batch, status: 'VALIDATED', total_rows: counts.total, valid_rows: counts.valid, invalid_rows: counts.invalid },
      errors: visibleErrors.slice(0, MAX_INLINE_ERRORS),
      errorsTruncated: visibleErrors.length > MAX_INLINE_ERRORS,
      counts,
    };
  } catch (err) {
    log.error('createBatch: failed', { userId: user.id, recordType, isLegacy, targetPsId, err });
    throw err;
  }
}

/** Atomic VALIDATED -> CONFIRMED claim (§4.7). 0 rows updated means someone else already
 * claimed it, or it's not in a claimable state — the caller (controller) turns that into the
 * right 409/400. Does NOT start processing — that's the confirm handler's job (WP5), triggered
 * by the event this function's caller publishes after the claim succeeds. */
export async function claimBatch(batchId, userId) {
  log.debug('claimBatch: enter', { batchId, userId });
  const batch = await db('import_batches').where({ id: batchId }).first();
  if (!batch) { log.warn('claimBatch: rejected — batch not found', { batchId, userId }); throw new ApiError(404, 'Batch not found'); }
  if (batch.uploaded_by !== userId) { log.warn('claimBatch: rejected — not the uploader', { batchId, userId, uploadedBy: batch.uploaded_by }); throw new ApiError(403, 'Only the user who uploaded the batch can confirm it'); }
  if (batch.status === 'IMPORTED') { log.warn('claimBatch: rejected — already IMPORTED', { batchId, userId }); throw new ApiError(409, 'This batch has already been imported.'); }
  if (batch.status === 'CONFIRMED') { log.warn('claimBatch: rejected — already CONFIRMED (in progress)', { batchId, userId }); throw new ApiError(409, 'This batch is already being imported. Please wait for it to finish.'); }
  if (batch.status !== 'VALIDATED') { log.warn('claimBatch: rejected — not VALIDATED', { batchId, userId, currentStatus: batch.status }); throw new ApiError(400, `Batch is not ready for confirmation (status must be VALIDATED, is ${batch.status})`); }
  if (!batch.file_path || !fs.existsSync(batch.file_path)) { log.warn('claimBatch: rejected — temp file missing', { batchId, userId, filePath: batch.file_path }); throw new ApiError(410, 'Physical temp file has expired or was removed'); }

  const claimed = await db('import_batches')
    .where({ id: batchId, status: 'VALIDATED' })
    .update({ status: 'CONFIRMED', confirmed_at: db.fn.now() });
  if (claimed === 0) {
    const current = await db('import_batches').where({ id: batchId }).first();
    log.warn('claimBatch: rejected — atomic claim lost the race', { batchId, userId, currentStatus: current?.status });
    if (current?.status === 'IMPORTED') throw new ApiError(409, 'This batch has already been imported.');
    throw new ApiError(409, 'This batch is already being imported. Please wait for it to finish.');
  }
  log.info('claimBatch: exit — import_batches transitioned to CONFIRMED', { batchId, userId });
  return { ...batch, status: 'CONFIRMED' };
}

/** CANCELLED is legal only pre-confirm (D6 — records are append-only, there's no undo once
 * writing has started; a batch already CONFIRMED/IMPORTED must run to completion). */
export async function cancelBatch(batchId, userId) {
  log.debug('cancelBatch: enter', { batchId, userId });
  const batch = await db('import_batches').where({ id: batchId }).first();
  if (!batch) { log.warn('cancelBatch: rejected — batch not found', { batchId, userId }); throw new ApiError(404, 'Batch not found'); }
  if (batch.uploaded_by !== userId) { log.warn('cancelBatch: rejected — not the uploader', { batchId, userId, uploadedBy: batch.uploaded_by }); throw new ApiError(403, 'Only the user who uploaded the batch can cancel it'); }
  if (!['VALIDATION_PENDING', 'VALIDATED'].includes(batch.status)) {
    log.warn('cancelBatch: rejected — batch already past the cancellable stage', { batchId, userId, currentStatus: batch.status });
    throw new ApiError(409, `Batch cannot be cancelled once ${batch.status} — records may already be written.`);
  }
  await db('import_batches').where({ id: batchId }).update({ status: 'CANCELLED', updated_at: db.fn.now() });
  log.info('cancelBatch: import_batches transitioned to CANCELLED', { batchId, userId });
  try {
    if (batch.file_path && fs.existsSync(batch.file_path)) {
      fs.unlinkSync(batch.file_path);
      log.debug('cancelBatch: deleted temp file', { batchId, filePath: batch.file_path });
    }
  } catch (err) {
    log.warn('cancelBatch: failed to delete temp file for cancelled batch', { batchId, filePath: batch.file_path, err });
  }
  log.info('cancelBatch: exit', { batchId, userId });
  return { id: batchId, status: 'CANCELLED' };
}

/** P5.1 — every list carries the jurisdiction predicate. `jurisdictionQuery` is req.jurisdictionQuery
 * from enforceScope: {ps_id} for HC, {district_id} for DISTRICT_OFFICER, {} for global roles. */
export async function listBatches(jurisdictionQuery, { page = 1, limit = 20 } = {}) {
  log.debug('listBatches: enter', { jurisdictionQuery, page, limit });
  let query = db('import_batches');
  if (jurisdictionQuery.ps_id) { query = query.where('ps_id', jurisdictionQuery.ps_id); log.debug('listBatches: scoped by ps_id', { psId: jurisdictionQuery.ps_id }); }
  else if (jurisdictionQuery.district_id) { query = query.where('district_id', jurisdictionQuery.district_id); log.debug('listBatches: scoped by district_id', { districtId: jurisdictionQuery.district_id }); }

  const countRow = await query.clone().count('* as count').first();
  const rows = await query.clone().orderBy('created_at', 'desc').offset((page - 1) * limit).limit(limit);
  log.debug('listBatches: exit', { resultCount: rows.length, total: parseInt(countRow.count, 10) || 0, page, limit });
  return { rows, total: parseInt(countRow.count, 10) || 0, page, limit };
}

const LINK_TYPE_BY_RECORD_TYPE = { ARREST: 'CASE_ARREST', MISSING: 'CASE_MISSING' };

/** Live linked/unmatched counts (AD5) — computed on read, not stored, since linkResolver.js
 * resolves asynchronously after each imported record's `record.created` event; a batch's
 * counts can legitimately still be climbing seconds after `getBatchDetail` is first called.
 * Only ARREST/MISSING have a CASE_* link type; every other type returns {linked:0,unmatched:0}. */
async function computeLinkageCounts(batchId, recordType) {
  const linkTypeCode = LINK_TYPE_BY_RECORD_TYPE[recordType];
  if (!linkTypeCode) { log.debug('computeLinkageCounts: record type has no CASE_* link type, short-circuiting', { batchId, recordType }); return { linked: 0, unmatched: 0 }; }

  const importedIds = await db('records').where({ import_batch_id: batchId }).pluck('id');
  if (!importedIds.length) { log.debug('computeLinkageCounts: no imported records for this batch yet', { batchId, recordType }); return { linked: 0, unmatched: 0 }; }

  const linkedIds = await db('record_links')
    .join('link_type_registry', 'record_links.link_type_id', 'link_type_registry.id')
    .where('link_type_registry.code', linkTypeCode)
    .whereIn('record_links.target_record_id', importedIds)
    .pluck('record_links.target_record_id');

  const linked = new Set(linkedIds).size;
  log.debug('computeLinkageCounts: exit', { batchId, recordType, linkTypeCode, importedCount: importedIds.length, linked, unmatched: importedIds.length - linked });
  return { linked, unmatched: importedIds.length - linked };
}

export async function getBatchDetail(batchId, jurisdictionQuery) {
  log.debug('getBatchDetail: enter', { batchId, jurisdictionQuery });
  let query = db('import_batches').where({ id: batchId });
  if (jurisdictionQuery.ps_id) query = query.andWhere('ps_id', jurisdictionQuery.ps_id);
  else if (jurisdictionQuery.district_id) query = query.andWhere('district_id', jurisdictionQuery.district_id);
  const batch = await query.first();
  if (!batch) { log.info('getBatchDetail: not found (or out of jurisdiction)', { batchId }); return null; }

  const errors = await db('import_batch_errors')
    .where({ batch_id: batchId }).whereNot('error_code', INVALID_PARENT_CODE)
    .orderBy('row_number', 'asc');

  const linkage = await computeLinkageCounts(batchId, batch.record_type);

  log.info('getBatchDetail: exit', { batchId, status: batch.status, errorCount: errors.length, ...linkage });
  return { ...batch, errors, ...linkage };
}

// ── async confirm worker (Integration 3, WP5) ───────────────────────────────────────────

const PROGRESS_FLUSH_EVERY = 20;

/**
 * The actual confirm work — triggered by `importConfirmHandler.js`'s subscription to
 * `import.confirm.requested` (published by the confirm endpoint right after `claimBatch`
 * succeeds). Never called directly by a controller; the event is the only entry point.
 *
 * Re-derives everything from the source file rather than trusting anything computed at
 * validate time (AD7) — re-reads the workbook, and re-runs `validateBatch` in full. This is
 * deliberate, not wasted work: it guarantees byte-for-byte parity between what was validated
 * and what gets written, it's what actually invokes `validateRefLabels`'s legacy raw-value-
 * preservation side effect (C6 — there is no other call site that does this at write time),
 * and it naturally re-checks DUPLICATE_IN_DB against the database's CURRENT state (catching a
 * race where a different process imported the same FIR between the original validate and this
 * confirm) without any bespoke race-detection logic of its own — the unique-constraint catch
 * below is only the final backstop for the remaining single-row race window.
 *
 * Per-row failures (a single record's `createImportedRecord` throwing) are caught and recorded
 * as a WRITE_FAILED error row — one bad row never aborts the other 999 good ones. A crash of
 * the whole function (e.g. the source file went missing) is caught by the outer try/catch,
 * which marks the batch FAILED rather than leaving it stuck in CONFIRMED — RabbitMQ's
 * redelivery-on-crash (before this function's own completion) is the OTHER path back to
 * CONFIRMED, which the leading status guard below treats as a safe, idempotent resume.
 */
export async function processBatch(batchId) {
  log.debug('processBatch: enter', { batchId });
  const batch = await db('import_batches').where({ id: batchId }).first();
  if (!batch) {
    log.warn('processBatch: batch not found', { batchId });
    return;
  }
  if (batch.status !== 'CONFIRMED') {
    // Idempotent redelivery guard (§4.6/G4) — already finished (IMPORTED/FAILED) or somehow
    // not yet claimed. Never re-run a batch that isn't in the exact state this function owns.
    log.info('processBatch: skipping — status is not CONFIRMED', { batchId, status: batch.status });
    return;
  }
  log.info('processBatch: starting confirm work', { batchId, recordType: batch.record_type, isLegacy: batch.is_legacy, psId: batch.ps_id });

  try {
    if (!batch.file_path || !fs.existsSync(batch.file_path)) {
      log.error('processBatch: source file no longer exists', { batchId, filePath: batch.file_path });
      throw new Error('Source file no longer exists — cannot confirm');
    }
    const uploader = await db('users').where({ id: batch.uploaded_by }).first();
    if (!uploader) { log.error('processBatch: uploading user account no longer exists', { batchId, uploadedBy: batch.uploaded_by }); throw new Error('Uploading user account no longer exists'); }

    const registryMap = await buildRegistryMap(batch.record_type);
    const parsed = await readWorkbook(batch.record_type, batch.file_path, registryMap);
    if (parsed && parsed.unknownLayout) { log.error('processBatch: rejected — unknown layout at confirm time', { batchId }); throw new Error(UNKNOWN_LAYOUT_MESSAGE); }
    if (!parsed) { log.error('processBatch: could not re-read the workbook at confirm time', { batchId }); throw new Error('Could not re-read the workbook at confirm time'); }
    log.debug('processBatch: workbook re-parsed', { batchId, parentRows: parsed.parentRows.length });

    const batchScope = await resolveBatchScope(batch.ps_id);
    const { composedPayloads, errorRows: confirmErrorRows } = await validateBatch(db, {
      recordType: batch.record_type, isLegacy: batch.is_legacy, batchScope, parsed, registryMap,
    });
    log.debug('processBatch: re-validated at confirm time', { batchId, composedCount: composedPayloads.length, confirmErrorRowCount: confirmErrorRows.length });

    // Persist confirm-time findings NOT already recorded at validate time (WP10, user
    // decision: auditing needs these). Anything newly discovered here — typically a
    // DUPLICATE_IN_DB from a cross-batch race between validate and confirm, or a reference
    // that changed underneath the batch — would otherwise vanish silently: its row is
    // excluded from composedPayloads, processed_rows lands below total_rows, and nothing in
    // import_batch_errors explains why. Append-only, deduped against the validate-time rows
    // on (row_number, error_code, field_key); the __INVALID_PARENT__ sentinels are NOT in
    // errorRows (they travel separately as invalidParentKeys) so they can't be re-inserted.
    const existingErrs = await db('import_batch_errors')
      .where({ batch_id: batchId }).select('row_number', 'error_code', 'field_key');
    const seenTriples = new Set(existingErrs.map((e) => `${e.row_number}|${e.error_code}|${e.field_key ?? ''}`));
    const freshErrs = confirmErrorRows
      .filter((e) => !seenTriples.has(`${e.row ?? 0}|${e.code}|${e.field_key ?? ''}`))
      .map((e) => ({
        batch_id: batchId, row_number: e.row ?? 0, field_key: e.field_key || null,
        error_code: e.code, severity: e.severity, error_message: e.message,
      }));
    for (let i = 0; i < freshErrs.length; i += 500) {
      await db('import_batch_errors').insert(freshErrs.slice(i, i + 500));
    }
    log.debug('processBatch: persisted confirm-time-only new error rows', { batchId, newErrorRowCount: freshErrs.length, dedupedAgainst: existingErrs.length });

    const scope = { ps_id: batchScope.psId, district_id: batchScope.districtId, sub_div_id: null };
    const status = batch.is_legacy ? 'LEGACY_IMPORTED' : 'DRAFT';
    const writeRecordType = effectiveRecordType(batch.record_type); // KALANDRA writes as ARREST

    let processedRows = 0;
    let importedRows = 0;
    const newErrorRows = [];

    // FIX 6 — per-batch IO auto-provision cache. Several rows in the same legacy batch
    // commonly share one IO (one officer investigating multiple FIRs/arrests), so without this
    // ensureAutoProvisionedIo's SELECT-then-maybe-INSERT ran once per ROW instead of once per
    // distinct PIS. ensureAutoProvisionedIo itself stays the source of truth (DB lookup +
    // idempotent insert-or-reuse on a real race) — this is purely an in-memory front for the
    // common within-batch repeat, keyed the same way the DB unique index is (case-insensitive
    // PIS, global — not PS-scoped, matching ensureAutoProvisionedIo's own lookup).
    const ioProvisionCache = new Map(); // normalized pis_no -> ioRow

    log.info('processBatch: write loop starting', { batchId, rowsToProcess: composedPayloads.length });
    for (const { payload } of composedPayloads) {
      processedRows++;
      log.debug('processBatch: row entry', { batchId, rowIdx: payload.rowIdx, sourceRef: payload.sourceRef, recordDate: payload.recordDate || null, needsIoAutoProvision: !!payload.needsIoAutoProvision });

      // Idempotency (C4/AD2) — the resume path. Same (import_batch_id, legacy_ref) pair means
      // this exact row was already written by an earlier, interrupted run of this function.
      const existing = await db('records')
        .where({ import_batch_id: batchId, legacy_ref: payload.sourceRef }).first();
      if (existing) {
        log.debug('processBatch: row already written by an earlier interrupted run — skipping (resume idempotency)', { batchId, rowIdx: payload.rowIdx, sourceRef: payload.sourceRef, existingRecordId: existing.id });
        continue;
      }

      try {
        // T2 — legacy IO auto-provision happens INSIDE this row's own try/catch: if it throws
        // (e.g. a genuinely malformed PIS despite passing validate-time's basic non-empty
        // check), this row alone gets WRITE_FAILED, same as any other per-row write failure —
        // never a whole-batch abort, and never a second, separate write path from
        // createImportedRecord's (P1.2 — investigating_officers is not a record/detail table,
        // so a small dedicated insert here doesn't violate "one write path for records").
        if (payload.needsIoAutoProvision) {
          const pisKey = String(payload.data.io_pis || '').trim().toLowerCase();
          let io = pisKey ? ioProvisionCache.get(pisKey) : undefined;
          if (io) log.debug('processBatch: row IO auto-provision — cache hit within this batch', { batchId, rowIdx: payload.rowIdx, pisKey, ioId: io.id });
          if (!io) {
            // FIX 9 (2026-07, accepted deviation — documented, not restructured): this insert
            // runs OUTSIDE the row's own createImportedRecord transaction (that transaction is
            // owned entirely by createImportedRecord itself, one write path per P1.2). If the
            // row's write below then fails, this IO row is NOT rolled back — it persists,
            // orphaned from any record. That's accepted as strictly better than the
            // alternative (re-provisioning it again on the operator's retry would just hit
            // ensureAutoProvisionedIo's own idempotent lookup-or-reuse and return the same
            // row): the insert is idempotent per pis_no, already marked "pending SHO
            // verification" in its name for exactly this kind of manual review, and reused
            // cleanly on any retry — never a duplicate, never silently lost.
            io = await ensureAutoProvisionedIo(db, batchScope.psId, payload.data.io_pis);
            if (pisKey) ioProvisionCache.set(pisKey, io);
          }
          payload.data.io_id = io.id;
          log.debug('processBatch: row IO auto-provision resolved', { batchId, rowIdx: payload.rowIdx, ioId: io.id });
        }

        const written = await createImportedRecord(
          uploader, writeRecordType, payload.recordDate, payload.data, null,
          { persons: payload.persons, properties: payload.properties, offences: payload.offences },
          { scope, isLegacy: batch.is_legacy, status, batchId, sourceRef: payload.sourceRef },
        );
        importedRows++;
        log.info('processBatch: row written', { batchId, rowIdx: payload.rowIdx, sourceRef: payload.sourceRef, recordId: written.id, status });
      } catch (err) {
        // FIX 3 (2026-07): a 23505 is unique_violation for ANY constraint on ANY table this
        // write touches (records/fir_details/arrest_details/persons/record_properties/
        // investigating_officers/...), not only the fir_details (ps_id, fir_year, fir_no) race
        // this catch block was written for. Treating every 23505 as that one specific race
        // mislabeled genuinely different failures (e.g. a stray duplicate on some other unique
        // index) as a benign "already imported by a concurrent process" WARNING instead of a
        // real WRITE_FAILED ERROR. Discriminate on the actual constraint name — only the named
        // fir_details unique constraint gets the friendly downgrade; everything else (including
        // an undefined err.constraint, a driver/pool edge case) falls through to the sanitized
        // WRITE_FAILED path with the raw error logged for debugging.
        if (err.code === '23505' && err.constraint === FIR_DETAILS_UNIQUE_CONSTRAINT) {
          // Unique-violation backstop (P2 enforce layer) — a race validateBatch's own
          // DUPLICATE_IN_DB check (run moments earlier, above) didn't catch: another process
          // wrote the same fir_details (ps_id, fir_year, fir_no) between that check and this
          // INSERT. Downgraded to a WARNING, not WRITE_FAILED — the row was skipped for a
          // meaningful, expected reason, not a genuine error.
          newErrorRows.push({
            batch_id: batchId, row_number: payload.rowIdx, field_key: 'fir_no',
            error_code: 'DUPLICATE_IN_DB', severity: 'WARNING',
            error_message: 'This FIR was imported by a concurrent process between validation and confirmation.',
          });
          log.warn('processBatch: row skipped — concurrent-write race on fir_details unique constraint', { batchId, rowIdx: payload.rowIdx, sourceRef: payload.sourceRef, constraint: err.constraint });
        } else {
          // T7.2 (03-TRIAGE-MATRIX.md/F6/F7) — never surface err.message verbatim to an
          // operator (DB_LEAK: raw constraint/SQL text is not actionable for a non-technical
          // police operator). Matrix text: "raw error goes to logger + import_batch_errors
          // metadata (a non-operator-facing column/field)" — `import_batch_errors` has NO
          // metadata/extra column today (migrations/...0006, checked) and this wave's ONE
          // permitted migration is scoped to T7.1's CHECK expansion, not new columns — so the
          // raw text goes to the logger only (debuggability preserved there); `error_message`
          // (the only place a batch-detail viewer/frontend reads from) gets the sanitized text
          // exclusively. Flagged in the Wave A report: a future wave adding a metadata column
          // would let both live in the DB as the matrix originally described.
          // Log the raw error WITH pg diagnostics (code/constraint/table/column) so an admin can
          // pinpoint the failing column fast — the 2026-07-20 arrest-import failure was an opaque
          // `value too long for type character varying(10)` whose column wasn't obvious from the
          // message alone. Operator-facing text stays sanitized (T7.2); this is logger-only.
          const diag = [err.code && `code=${err.code}`, err.constraint && `constraint=${err.constraint}`,
            err.table && `table=${err.table}`, err.column && `column=${err.column}`].filter(Boolean).join(' ');
          log.error('processBatch: row write failed', { batchId, rowIdx: payload.rowIdx, sourceRef: payload.sourceRef, diag: diag || null, err });
          newErrorRows.push(sanitizedWriteFailedRow(batchId, payload.rowIdx));
        }
      }

      if (processedRows % PROGRESS_FLUSH_EVERY === 0) {
        await db('import_batches').where({ id: batchId })
          .update({ processed_rows: processedRows, imported_rows: importedRows, updated_at: db.fn.now() });
        log.debug('processBatch: progress flushed', { batchId, processedRows, importedRows, totalRows: composedPayloads.length });
      }
    }
    log.info('processBatch: write loop complete', { batchId, processedRows, importedRows, failedOrSkipped: processedRows - importedRows, newErrorRowCount: newErrorRows.length });

    if (newErrorRows.length) {
      for (let i = 0; i < newErrorRows.length; i += 500) {
        await db('import_batch_errors').insert(newErrorRows.slice(i, i + 500));
      }
      log.debug('processBatch: persisted per-row write-failure/duplicate error rows', { batchId, count: newErrorRows.length });
    }

    await db('import_batches').where({ id: batchId }).update({
      status: 'IMPORTED', processed_rows: processedRows, imported_rows: importedRows,
      updated_at: db.fn.now(),
    });
    log.info('processBatch: exit — import_batches transitioned to IMPORTED', { batchId, recordType: batch.record_type, processedRows, importedRows });

    try {
      if (fs.existsSync(batch.file_path)) {
        fs.unlinkSync(batch.file_path);
        log.debug('processBatch: deleted temp file for completed batch', { batchId, filePath: batch.file_path });
      }
    } catch (err) {
      log.warn('processBatch: failed to delete temp file for completed batch', { batchId, filePath: batch.file_path, err });
    }
  } catch (err) {
    log.error('processBatch: failed', { batchId, err });
    try {
      await db('import_batches').where({ id: batchId })
        .update({ status: 'FAILED', error_message: err.message, updated_at: db.fn.now() });
      log.warn('processBatch: import_batches transitioned to FAILED', { batchId, errorMessage: err.message });
    } catch (updateErr) {
      log.error('processBatch: failed to mark batch FAILED too', { batchId, err: updateErr });
    }
    // Deliberately does not rethrow — eventBus.js nacks-without-requeue on a thrown error
    // (§4.6/G4), which would just drop the message with no record of why. Marking FAILED here
    // and returning normally (ack) is the correct terminal state; the batch is done, just
    // unsuccessfully. The 15-minute sweep (below) is for batches stuck in CONFIRMED with no
    // message at all (e.g. RabbitMQ itself lost it on the in-memory event bus path), not for batches that reached
    // this function and failed cleanly.
  }
}

/**
 * Startup safety net (§4.6/G4) — re-publishes `import.confirm.requested` for any batch stuck
 * in CONFIRMED for more than `staleMinutes`. Covers the case where the original message never
 * reached a handler at all (in-memory event bus process restart mid-flight) — `processBatch`'s own
 * leading status guard makes redelivery always safe (a batch already IMPORTED/FAILED is a
 * no-op; a batch still genuinely CONFIRMED picks up via the idempotency check per row).
 * Called once from `importConfirmHandler.js`'s `init()`, not on a recurring timer — a fresh
 * check on every process start is what "startup sweep" means here, not a cron job.
 */
export async function sweepStaleConfirmedBatches(publish, staleMinutes = 15) {
  log.debug('sweepStaleConfirmedBatches: enter', { staleMinutes });
  const staleBatches = await db('import_batches')
    .where({ status: 'CONFIRMED' })
    .andWhere('confirmed_at', '<', db.raw(`now() - interval '${staleMinutes} minutes'`));
  for (const batch of staleBatches) {
    log.warn('sweepStaleConfirmedBatches: sweeping stale CONFIRMED batch — re-publishing confirm event', { batchId: batch.id, confirmedAt: batch.confirmed_at, staleMinutes });
    await publish('import.confirm.requested', { batch_id: batch.id });
  }
  log.info('sweepStaleConfirmedBatches: exit', { staleMinutes, sweptCount: staleBatches.length });
  return staleBatches.length;
}
