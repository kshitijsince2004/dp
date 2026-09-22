import { v4 as uuidv4 } from 'uuid';
import db from '../../config/db.js';
import * as eventBus from '../../events/eventBus.js';
import { computeRowHash, getPreviousHash, CURRENT_HASH_VERSION } from '../../utils/hash.js';
import { getLinksForRecord } from '../record-links/record-links.service.js';
import { toISO } from '../../utils/dateFormat.js';
import * as workflowEngine from '../workflow/workflow.engine.js';
import * as mapper from './records.mapper.js';
import { resolveMajorHead, resolveLocalHead, normalizeDate, deriveFirYear } from './records.normalize.js';
import { generateAndValidateStatutoryFir, resolveJurisdictionPrefix, getAllowedRegistrationTypes, getNextFirSerial } from './statutoryFir.service.js';
import { getStatusOptionsForType } from '../fields/statusOptions.config.js';
import { getLogger } from '../../utils/logger.js';
import { redact } from '../../utils/redact.js';

// STYLE ANCHOR (logging-instrumentation-2026-07-22, HANDOFF.md §7): this file is the canonical
// example every other module's logging is matched against. `getLogger('records.service')` at
// the top, `log.debug/info/warn/error(event, data)` from then on — event strings read
// `functionName: what happened`, second arg is always a structured object, the primary entity
// id (`recordId`/`batchId`/`userId`) is on every line where one exists. Correlation (requestId)
// is ambient via AsyncLocalStorage (utils/requestContext.js) — nothing here threads it manually.
const log = getLogger('records.service');

// ── Multi-Factor Person Comparison & Case-Arrest Sync Engine ──────────────────────────

/**
 * Multi-factor comparison engine comparing accused person record with arrested person record.
 * Compares Name, Relative Name/Parentage, Age/DOB (tolerance max 3 yrs), Gender, Mobile, etc.
 * Returns { isMatch: boolean, reason: string | null }
 */
export function comparePersons(personA, personB) {
  if (!personA || !personB) return { isMatch: false, reason: 'Missing person data' };

  const norm = (val) => (val || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');

  const nameA = norm(personA.name);
  const nameB = norm(personB.name);

  if (!nameA || !nameB) {
    return { isMatch: false, reason: 'Name missing' };
  }

  // Tokenize names
  const tokensA = nameA.split(' ').filter(Boolean);
  const tokensB = nameB.split(' ').filter(Boolean);
  const commonTokens = tokensA.filter((t) => tokensB.includes(t));

  if (commonTokens.length === 0 && nameA !== nameB) {
    return { isMatch: false, reason: `Names differ: "${nameA}" vs "${nameB}"` };
  }

  // 1. Father / Relative Name Conflict
  const relA = norm(personA.relative_name || personA.father_name || personA.relativeName || personA.fatherName);
  const relB = norm(personB.relative_name || personB.father_name || personB.relativeName || personB.fatherName);
  if (relA && relB && relA !== relB) {
    const relTokensA = relA.split(' ').filter(Boolean);
    const relTokensB = relB.split(' ').filter(Boolean);
    const firstNameA = relTokensA[0];
    const firstNameB = relTokensB[0];
    if (firstNameA && firstNameB && firstNameA !== firstNameB) {
      return { isMatch: false, reason: `Father/Relative name conflict: "${relA}" vs "${relB}"` };
    }
    if (!relA.includes(relB) && !relB.includes(relA)) {
      return { isMatch: false, reason: `Father/Relative name conflict: "${relA}" vs "${relB}"` };
    }
  }

  // 2. Age / DOB Conflict (Tolerance: max 3 years)
  const ageA = personA.age != null ? parseInt(personA.age, 10) : null;
  const ageB = personB.age != null ? parseInt(personB.age, 10) : null;
  if (ageA !== null && !isNaN(ageA) && ageA > 0 && ageB !== null && !isNaN(ageB) && ageB > 0) {
    if (Math.abs(ageA - ageB) > 3) {
      return { isMatch: false, reason: `Age conflict: ${ageA} vs ${ageB}` };
    }
  }

  // 3. Gender Conflict
  const genA = norm(personA.gender);
  const genB = norm(personB.gender);
  if (genA && genB && genA !== genB) {
    return { isMatch: false, reason: `Gender conflict: "${genA}" vs "${genB}"` };
  }

  // 4. Mobile Number Conflict
  const mobA = (personA.mobile_number || personA.mobile || '').toString().replace(/\D/g, '');
  const mobB = (personB.mobile_number || personB.mobile || '').toString().replace(/\D/g, '');
  if (mobA.length >= 10 && mobB.length >= 10 && mobA !== mobB) {
    return { isMatch: false, reason: `Mobile number conflict: "${mobA}" vs "${mobB}"` };
  }

  return { isMatch: true, reason: null };
}

/**
 * Checks if arrested persons on arrestRecordId match existing accused on caseRecordId.
 * If hard conflict or no match is found, automatically appends the arrested person as a new ACCUSED on caseRecordId.
 */
export async function syncArrestedToCaseAccused(trx, caseRecordId, arrestRecordId, user = {}) {
  log.debug('syncArrestedToCaseAccused: enter', { caseRecordId, arrestRecordId });
  const caseAccusedList = await trx('persons')
    .where({ record_id: caseRecordId, role: 'ACCUSED' })
    .orderBy('sort_order', 'asc');

  const arrestees = await trx('persons')
    .where({ record_id: arrestRecordId, role: 'ARRESTEE' })
    .orderBy('sort_order', 'asc');

  if (!arrestees.length) {
    log.debug('syncArrestedToCaseAccused: no arrestees found on arrest record', { arrestRecordId });
    return;
  }

  for (const arrestee of arrestees) {
    let matchedAccused = null;
    for (const accused of caseAccusedList) {
      const cmp = comparePersons(accused, arrestee);
      if (cmp.isMatch) {
        matchedAccused = accused;
        log.info('syncArrestedToCaseAccused: matched arrestee to existing accused', {
          caseRecordId, arrestRecordId, accusedId: accused.id, arresteeId: arrestee.id,
        });
        break;
      }
    }

    if (!matchedAccused) {
      const newAccusedId = uuidv4();
      const sortOrder = caseAccusedList.length + 1;
      const newAccusedRow = {
        id: newAccusedId,
        record_id: caseRecordId,
        role: 'ACCUSED',
        name: arrestee.name,
        relative_name: arrestee.relative_name || null,
        relation_type: arrestee.relation_type || null,
        age: arrestee.age || null,
        dob: arrestee.dob || null,
        gender: arrestee.gender || null,
        mobile: arrestee.mobile || arrestee.mobile_number || null,
        present_location_id: arrestee.present_location_id || null,
        perm_location_id: arrestee.perm_location_id || null,
        extra: typeof arrestee.extra === 'string' ? arrestee.extra : JSON.stringify(arrestee.extra || {}),
        sort_order: sortOrder,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      };
      await trx('persons').insert(newAccusedRow);
      caseAccusedList.push(newAccusedRow);
      log.info('syncArrestedToCaseAccused: appended new ACCUSED person to CASE record due to conflict/non-match', {
        caseRecordId, newAccusedId, name: arrestee.name,
      });
    }
  }
}

/**
 * Link ARREST record to CASE record via CASE_ARREST link and sync arrested person to accused list.
 */
export async function autoLinkArrestToCase(trx, arrestRecordId, psId, firNo, user = {}) {
  if (!firNo) return null;
  log.debug('autoLinkArrestToCase: enter', { arrestRecordId, psId, firNo });

  const caseMatch = await trx('records')
    .join('fir_details', 'records.id', 'fir_details.record_id')
    .where('records.record_type', 'CASE')
    .where('records.ps_id', psId)
    .where('fir_details.fir_no', firNo)
    .select('records.id as case_record_id')
    .first();

  if (!caseMatch) {
    log.debug('autoLinkArrestToCase: no matching CASE record found', { psId, firNo });
    return null;
  }

  const caseRecordId = caseMatch.case_record_id;
  const linkType = await trx('link_type_registry').where({ code: 'CASE_ARREST', is_active: true }).first();
  if (linkType) {
    const existingLink = await trx('record_links')
      .where({
        source_record_id: caseRecordId,
        target_record_id: arrestRecordId,
        link_type_id: linkType.id,
      })
      .first();

    if (!existingLink) {
      await trx('record_links').insert({
        id: uuidv4(),
        source_record_id: caseRecordId,
        target_record_id: arrestRecordId,
        link_type_id: linkType.id,
        metadata: JSON.stringify({ resolved_via: 'autoLinkArrestToCase', fir_no: firNo }),
        created_by: user ? user.id : null,
        created_at: trx.fn.now(),
      });
      log.info('autoLinkArrestToCase: created record_link CASE_ARREST', { caseRecordId, arrestRecordId });
    }
  }

  await syncArrestedToCaseAccused(trx, caseRecordId, arrestRecordId, user);
  return caseRecordId;
}

// ── shared write-path helpers (single write path, ARCHITECTURE.md §4.2) ─────────────────

/** Insert a `locations` row (or return null for an empty block). Used on CREATE, where
 * there is never a prior row to reconcile against. */
async function insertLocation(trx, cols) {
  if (!cols || !Object.keys(cols).length) return null;
  const id = uuidv4();
  await trx('locations').insert({ id, ...cols });
  log.debug('insertLocation: wrote locations row', { locationId: id });
  return id;
}

/** UPDATE in place when the owner already has a location for this slot, INSERT when new,
 * DELETE when the block was cleared — the one function both create (existingId always null)
 * and update paths share (`DB_SCHEMA.md` §3.5 ownership rule: one row per use). */
async function upsertLocation(trx, existingId, cols) {
  const hasCols = cols && Object.keys(cols).length > 0;
  if (!hasCols) {
    if (existingId) {
      await trx('locations').where({ id: existingId }).delete();
      log.debug('upsertLocation: cleared block, deleted locations row', { locationId: existingId });
    }
    return null;
  }
  if (existingId) {
    await trx('locations').where({ id: existingId }).update({ ...cols, updated_at: trx.fn.now() });
    log.debug('upsertLocation: updated existing locations row', { locationId: existingId });
    return existingId;
  }
  const id = uuidv4();
  await trx('locations').insert({ id, ...cols });
  log.debug('upsertLocation: inserted new locations row', { locationId: id });
  return id;
}

// ── Person UID generation ─────────────────────────────────────────────────────────────
const PERSON_UID_PREFIXES = {
  COMPLAINANT: 'COMP', VICTIM: 'VICT', ACCUSED: 'ACSD', ARRESTED: 'ARST',
  INFORMANT: 'INFO', MISSING: 'MISS', DECEASED: 'DCSD', CALLER: 'CALR',
};

async function generatePersonUid(trx, role) {
  const prefix = PERSON_UID_PREFIXES[role] || 'PERS';
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;
  const maxRow = await trx('persons')
    .where('uid', 'like', pattern)
    .orderBy('uid', 'desc')
    .select('uid')
    .first();
  let seq = 1;
  if (maxRow?.uid) {
    const lastPart = maxRow.uid.split('-').pop();
    const maxSeq = parseInt(lastPart, 10);
    if (!isNaN(maxSeq)) seq = maxSeq + 1;
  }
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

// ── Record UID generation ─────────────────────────────────────────────────────────────
const RECORD_TYPE_PREFIXES = {
  CASE: 'CASE', ARREST: 'ARST', MISSING: 'MISS', PCR_CALL: 'PCR', UIDB: 'UIDB',
};

async function generateRecordUid(trx, recordType, recordDate) {
  const prefix = RECORD_TYPE_PREFIXES[recordType] || 'REC';
  const year = recordDate ? new Date(recordDate).getFullYear() : new Date().getFullYear();
  const safeYear = isNaN(year) ? new Date().getFullYear() : year;
  const pattern = `${prefix}-${safeYear}-%`;
  const maxRow = await trx('records')
    .where('uid', 'like', pattern)
    .orderBy('uid', 'desc')
    .select('uid')
    .first();
  let seq = 1;
  if (maxRow?.uid) {
    const lastPart = maxRow.uid.split('-').pop();
    const maxSeq = parseInt(lastPart, 10);
    if (!isNaN(maxSeq)) seq = maxSeq + 1;
  }
  return `${prefix}-${safeYear}-${String(seq).padStart(6, '0')}`;
}

async function insertPersonEntry(trx, recordId, entry) {
  log.debug('insertPersonEntry: enter', { recordId, role: entry.role, sourceKind: entry.sourceKind, sourceIndex: entry.sourceIndex });
  const personId = uuidv4();
  const personUid = await generatePersonUid(trx, entry.role);
  const locationIdBySlot = {};
  for (const [slot, cols] of Object.entries(entry.locations)) {
    locationIdBySlot[slot] = await insertLocation(trx, cols);
  }
  const personCols = { ...entry.columns };
  for (const [slot, locId] of Object.entries(locationIdBySlot)) {
    const target = mapper.PERSON_LOCATION_SLOTS[slot];
    if (target?.table === 'persons') personCols[target.column] = locId;
  }
  await trx('persons').insert({
    id: personId, uid: personUid, record_id: recordId, role: entry.role, ...personCols,
    extra: JSON.stringify(entry.extra || {}), sort_order: entry.sourceIndex ?? 0,
  });
  log.debug('insertPersonEntry: wrote persons row', { recordId, personId, role: entry.role });
  for (const [subtypeTable, cols] of Object.entries(entry.subtypes || {})) {
    const subtypeCols = { ...cols };
    for (const [slot, locId] of Object.entries(locationIdBySlot)) {
      const target = mapper.PERSON_LOCATION_SLOTS[slot];
      if (target?.table === subtypeTable) subtypeCols[target.column] = locId;
    }
    await trx(subtypeTable).insert({ person_id: personId, ...subtypeCols });
    log.debug('insertPersonEntry: wrote subtype row', { recordId, personId, subtypeTable });
  }
  return personId;
}

/**
 * Id-preserving upsert for persons on UPDATE (C4 — never delete-and-reinsert: role subtype
 * rows cascade off `persons.id`, and while nothing references a person row directly today,
 * treating a person's identity as stable across edits is the correct model regardless).
 * Singleton roles (COMPLAINANT/MISSING/DECEASED/INFORMANT/CALLER) match the record's one
 * existing row of that role; repeater roles match by the `persons[].id` the client echoes
 * back (recomposeRecord always includes it). Returns { personIdBySourceIndex } for the
 * property linker.
 */
async function upsertPersons(trx, recordId, personEntries, oldPersonRows) {
  log.debug('upsertPersons: enter', { recordId, incomingCount: personEntries.length, existingCount: oldPersonRows.length });

  // ── B1 SAFETY NET (2026-07-23 bugfix batch) — narrow guard against delete-to-zero ──────────
  // PROVEN data loss (docs/bugfix-batch-2026-07-23/HANDOFF.md, record 1c71a6f7…, requestId
  // 661b33ed…): `updateRecord` treats `persons: undefined` as "don't touch" and `persons: []`
  // (provided-but-empty) as "clear all". A fragile frontend repeater-hydration race sometimes
  // fails to seed persons on an edit (e.g. after SHO send-back), so submit sent `persons: []`
  // and this function hard-deleted every victim/accused/arrestee (cascading subtype rows +
  // locations) with no recovery path. The frontend fix (deterministic repeater seeding) is the
  // real fix; this is the backend's defense-in-depth net for when a future FE regression
  // reintroduces the same shape of bug.
  //
  // Invariant: an empty-but-provided persons[] against a record that currently HAS AT LEAST ONE
  // person is never a legitimate state for any record type (CASE/ARREST/MISSING/PCR_CALL/UIDB
  // each always retain a complainant/arrestee/missing-person/caller/etc once created — there is
  // no real workflow action that intentionally reduces a record to zero persons via an edit).
  //
  // NEW BEHAVIOR (D1, flagged for orchestrator sign-off): when this exact shape is detected
  // (personEntries.length === 0 AND oldPersonRows.length > 0), the delete-to-zero is REFUSED —
  // this call degrades to `persons: undefined` semantics (existing persons are left completely
  // untouched, not one row is inserted/updated/deleted) instead of wiping the record. A `log.warn`
  // is emitted so the guard tripping is visible in normal log review, not just when it prevents a
  // reported incident.
  //
  // This is deliberately NARROW — it does NOT change behavior for:
  //   - `persons: []` against a record that already has zero persons (no-op either way).
  //   - `persons: undefined` (already means "don't touch", unaffected by this function at all —
  //     records.service.js's updateRecord only calls upsertPersons when persons !== undefined).
  //   - A non-empty incoming array that legitimately drops ONE of several existing persons (e.g.
  //     removing one of two accused) — that person is still deleted below exactly as before; only
  //     the ALL-existing-rows-to-zero case is guarded.
  if (personEntries.length === 0 && oldPersonRows.length > 0) {
    log.warn('upsertPersons: GUARD TRIPPED (B1 safety net) — refusing to delete all existing persons, left untouched', {
      recordId,
      existingCount: oldPersonRows.length,
      existingRoles: oldPersonRows.map((p) => ({ id: p.id, role: p.role })),
    });
    return {};
  }

  const oldById = new Map(oldPersonRows.map((p) => [p.id, p]));
  const oldByRole = new Map();
  for (const p of oldPersonRows) if (!mapper.REPEATER_ROLES.has(p.role)) oldByRole.set(p.role, p);

  const keptIds = new Set();
  const personIdBySourceIndex = {};

  for (const entry of personEntries) {
    const existing = mapper.REPEATER_ROLES.has(entry.role)
      ? (entry.existingId ? oldById.get(entry.existingId) : null)
      : oldByRole.get(entry.role);
    const personId = existing?.id || uuidv4();
    keptIds.add(personId);

    const locationIdBySlot = {};
    for (const slot of Object.keys(mapper.PERSON_LOCATION_SLOTS)) {
      const target = mapper.PERSON_LOCATION_SLOTS[slot];
      const ownerOld = target.table === 'persons' ? existing : existing?.subtypes?.[target.table];
      const existingLocId = ownerOld?.[target.column] || null;
      const cols = entry.locations[slot];
      if (!cols && !existingLocId) continue;
      locationIdBySlot[slot] = await upsertLocation(trx, existingLocId, cols);
    }

    const personCols = { ...entry.columns };
    for (const [slot, locId] of Object.entries(locationIdBySlot)) {
      const target = mapper.PERSON_LOCATION_SLOTS[slot];
      if (target.table === 'persons') personCols[target.column] = locId;
    }
    const row = {
      role: entry.role, ...personCols, extra: JSON.stringify(entry.extra || {}),
      sort_order: entry.sourceIndex ?? 0, updated_at: trx.fn.now(),
    };
    if (existing) {
      await trx('persons').where({ id: personId }).update(row);
      log.debug('upsertPersons: updated existing persons row', { recordId, personId, role: entry.role });
    } else {
      const personUid = await generatePersonUid(trx, entry.role);
      await trx('persons').insert({ id: personId, uid: personUid, record_id: recordId, ...row });
      log.debug('upsertPersons: inserted new persons row', { recordId, personId, uid: personUid, role: entry.role });
    }

    const subtypeTables = new Set([...Object.keys(entry.subtypes || {}), ...Object.keys(existing?.subtypes || {})]);
    for (const subtypeTable of subtypeTables) {
      const cols = { ...(entry.subtypes?.[subtypeTable] || {}) };
      for (const [slot, locId] of Object.entries(locationIdBySlot)) {
        const target = mapper.PERSON_LOCATION_SLOTS[slot];
        if (target.table === subtypeTable) cols[target.column] = locId;
      }
      const hadOld = !!existing?.subtypes?.[subtypeTable];
      const hasNew = Object.keys(cols).length > 0;
      if (!hasNew) {
        if (hadOld) {
          await trx(subtypeTable).where({ person_id: personId }).delete();
          log.debug('upsertPersons: cleared subtype row', { recordId, personId, subtypeTable });
        }
        continue;
      }
      if (hadOld) {
        await trx(subtypeTable).where({ person_id: personId }).update(cols);
        log.debug('upsertPersons: updated subtype row', { recordId, personId, subtypeTable });
      } else {
        await trx(subtypeTable).insert({ person_id: personId, ...cols });
        log.debug('upsertPersons: inserted subtype row', { recordId, personId, subtypeTable });
      }
    }

    if (entry.sourceKind === 'repeater') personIdBySourceIndex[entry.sourceIndex] = personId;
  }

  const personsToDelete = oldPersonRows.filter((old) => !keptIds.has(old.id));
  // [PHAROS-DEBUG] persons write lifecycle — reveals the "victim/accused removed after send-back"
  // class of data-loss: incoming entries (roles + whether they echoed an existing id) vs what the
  // DB already had vs what's about to be DELETED. If `deleting` is non-empty on an edit the user
  // didn't intend to clear persons, the frontend sent an incomplete persons[] (seed didn't run).
  log.info('upsertPersons: lifecycle summary', {
    recordId,
    incoming: personEntries.map((e) => ({ role: e.role, existingId: e.existingId || null })),
    existing: oldPersonRows.map((p) => ({ id: p.id, role: p.role })),
    kept: [...keptIds],
    deleting: personsToDelete.map((p) => ({ id: p.id, role: p.role })),
  });
  for (const old of personsToDelete) {
    const locIds = [old.present_location_id, old.perm_location_id,
      ...Object.values(old.subtypes || {}).flatMap((s) => [s.arrest_location_id, s.missing_location_id, s.found_location_id])]
      .filter(Boolean);
    await trx('persons').where({ id: old.id }).delete(); // cascades subtype rows
    if (locIds.length) await trx('locations').whereIn('id', locIds).delete();
    log.debug('upsertPersons: deleted removed persons row', { recordId, personId: old.id, role: old.role, cascadedLocations: locIds.length });
  }

  log.debug('upsertPersons: exit', { recordId, kept: keptIds.size, deleted: personsToDelete.length });
  return personIdBySourceIndex;
}

/** Id-preserving upsert for properties on UPDATE — REQUIRED, not a style choice:
 * `record_status_events.property_id` is `ON DELETE CASCADE`, so delete-and-reinsert would
 * silently destroy a property's status-change history on every unrelated edit.
 *
 * C16 (2026-07-26 bugfix batch) — upgraded from the 2026-07-23 correlated-only guard to the
 * SAME unconditional delete-to-zero guard `upsertPersons` has always had. Log-evidence
 * quantification (`temp delete later/logs(1)/logs/backend.log`, 32 "FULL WIPE" events across 6
 * records during the 2026-07-25 20:40-23:11 tester session): 29/32 were incoming===existing
 * ID-churn (every property re-submitted with no `id`, so each was treated as new — net count
 * unchanged, but it silently discards `record_status_events` history, a real but SEPARATE bug in
 * the frontend autosave payload, out of this module's scope, reported not fixed). The other 3/32
 * were genuine `properties: []` against a record that had 1-2 rows, with `persons[]` sent
 * correctly alongside (so the OLD correlated condition — requiring the persons guard to have
 * ALSO tripped — never engaged and did not protect them). One of those three (record
 * `b2918fd9-…`) is proven transient-then-recovered by a later autosave in the same session; the
 * other two are proven to have stayed at zero for the rest of the logged session — i.e. real,
 * observed data loss reaching the tester's "property section becomes empty" report.
 *
 * D1 (carried over from the 2026-07-23 persons ruling, applied identically here): a record
 * legitimately having zero properties IS a real state (a CASE may recover/seize nothing), but
 * this write path can no longer distinguish "officer intentionally cleared the only property"
 * from "frontend repeater-hydration race sent an empty array by accident" — exactly the
 * ambiguity that made the persons guard unconditional. Until the frontend gets an explicit
 * "clear all properties" affordance, this guard makes intentional full-clearing impossible via
 * a normal edit; that trade-off is accepted the same way it was for persons. Does NOT change
 * behavior for: `properties: []` against a record already at zero (no-op either way);
 * `properties` omitted entirely (already means "don't touch", never reaches this function);
 * or a non-empty incoming array that legitimately drops one of several existing properties
 * (still deleted below exactly as before — only the ALL-existing-rows-to-zero case is guarded). */
async function upsertProperties(trx, recordId, propertyEntries, oldPropertyRows, personIdBySourceIndex) {
  log.debug('upsertProperties: enter', { recordId, incomingCount: propertyEntries.length, existingCount: oldPropertyRows.length });

  if (propertyEntries.length === 0 && oldPropertyRows.length > 0) {
    log.warn('upsertProperties: GUARD TRIPPED (C16 delete-to-zero guard, matches B1 persons guard) — refusing to delete all existing properties, left untouched', {
      recordId,
      existingCount: oldPropertyRows.length,
      existingIds: oldPropertyRows.map((p) => p.id),
    });
    return { personIdBySourceIndex, statusChanges: [] };
  }

  const oldById = new Map(oldPropertyRows.map((p) => [p.id, p]));
  const keptIds = new Set();
  const statusChanges = []; // {propertyId, oldValue, newValue} for record_status_events

  for (const entry of propertyEntries) {
    const existing = entry.existingId ? oldById.get(entry.existingId) : null;
    const propertyId = existing?.id || uuidv4();
    keptIds.add(propertyId);
    const personId = entry.personIndex != null ? (personIdBySourceIndex[entry.personIndex] ?? null) : (existing?.person_id ?? null);
    const row = {
      person_id: personId, ...entry.columns, extra: JSON.stringify(entry.extra || {}),
      updated_at: trx.fn.now(),
    };
    if (existing) {
      if (entry.columns.status && existing.status && entry.columns.status !== existing.status) {
        statusChanges.push({ propertyId, oldValue: existing.status, newValue: entry.columns.status });
        log.debug('upsertProperties: detected property status change', { recordId, propertyId, oldValue: existing.status, newValue: entry.columns.status });
      }
      await trx('record_properties').where({ id: propertyId }).update(row);
      log.debug('upsertProperties: updated existing record_properties row', { recordId, propertyId });
    } else {
      await trx('record_properties').insert({ id: propertyId, record_id: recordId, sort_order: 0, ...row });
      log.debug('upsertProperties: inserted new record_properties row', { recordId, propertyId });
    }
  }

  const toDelete = oldPropertyRows.filter((p) => !keptIds.has(p.id)).map((p) => p.id);
  // NOTE (C16, 2026-07-26): the guard above already caught propertyEntries.length===0, so this
  // can no longer be a true "reach zero" wipe — it means every OLD row's id went unmatched while
  // `propertyEntries` was non-empty (the "ID-churn" pattern found while quantifying C16: the
  // frontend autosave omits `properties[].id`, so an existing property is deleted and
  // re-inserted under a brand-new id even though the net count is unchanged). That still silently
  // destroys `record_status_events` history per this function's doc comment, so it stays
  // elevated to `warn` for visibility — but it is a frontend defect (property id not echoed
  // back), out of this module's scope; reported to the Director rather than fixed here.
  const isFullReplace = oldPropertyRows.length > 0 && toDelete.length === oldPropertyRows.length;
  // [PHAROS-DEBUG] property write lifecycle — same shape/intent as upsertPersons above. (Calling
  // log.warn/log.info directly in each branch, not via a detached function reference — winston's
  // child-logger defaultMeta (the `module` tag) only merges correctly when the method is invoked
  // as `log.warn(...)`, not through a variable that lost its `this` binding.)
  const lifecycleFields = {
    recordId,
    incoming: propertyEntries.length,
    existing: oldPropertyRows.length,
    kept: keptIds.size,
    deleting: toDelete.length,
  };
  if (isFullReplace) {
    log.warn('upsertProperties: lifecycle summary — FULL ID-CHURN (all existing rows unmatched and replaced; net count unchanged but status-event history lost — see C16 note)', lifecycleFields);
  } else {
    log.info('upsertProperties: lifecycle summary', lifecycleFields);
  }
  if (toDelete.length) {
    await trx('record_properties').whereIn('id', toDelete).delete();
    log.debug('upsertProperties: deleted removed record_properties rows', { recordId, deletedIds: toDelete });
  }

  log.debug('upsertProperties: exit', { recordId, kept: keptIds.size, statusChanges: statusChanges.length });
  return { personIdBySourceIndex, statusChanges };
}

/** `fir_details.ps_id` is a deliberate denormalized copy of `records.ps_id` (DB_SCHEMA.md
 * §9.3 #3) solely to carry the `UNIQUE(ps_id, fir_year, fir_no)` business key — it isn't a
 * form field, so nothing in the registry maps to it; the write path stamps it directly, same
 * as the spine's own scoping ids (P5.4). No other detail table needs its own copy. */
function detailScopingColumns(recordType, psId) {
  return recordType === 'CASE' ? { ps_id: psId } : {};
}

/** record_offences has nothing referencing it — wholesale delete-and-reinsert is safe and
 * matches the documented pattern (a group can never half-update). */
async function replaceOffenceRows(trx, recordId, offenceRows) {
  await trx('record_offences').where({ record_id: recordId }).delete();
  if (!offenceRows.length) {
    log.debug('replaceOffenceRows: cleared record_offences, nothing to reinsert', { recordId });
    return;
  }
  await trx('record_offences').insert(offenceRows.map((o) => ({ id: uuidv4(), record_id: recordId, ...o })));
  log.debug('replaceOffenceRows: wrote record_offences rows', { recordId, count: offenceRows.length });
}

/** Frozen records (hash-chain break detected — DB_SCHEMA.md §9.4) reject every mutation until a
 * privileged reviewer unfreezes them. Enforced on ALL write paths, not just transitions, so a
 * freeze is a real tamper stop and not a suggestion. */
function assertNotFrozen(record) {
  if (record?.is_frozen) {
    log.warn('assertNotFrozen: rejected — record is frozen', { recordId: record?.id });
    const err = new Error('Record is frozen pending audit review and cannot be modified.');
    err.status = 423; // Locked
    throw err;
  }
}

/** THE single writer of `record_revisions` (P1.2 / DB_SCHEMA.md §4.3). Every change_type flows
 * through here; the hash chain is computed nowhere else. */
async function writeRevision(trx, { recordId, changeType, level, changedBy, comment, reason, ipAddress, fieldChanges }) {
  log.debug('writeRevision: enter', { recordId, changeType, level, changedBy, fieldChangeCount: (fieldChanges || []).length });
  // Serialize this record's chain. The row lock makes revision_number + prev_hash assignment
  // atomic even for callers that did not already lock the record (create/update); callers that
  // do lock (transition/override/status) simply re-hold it. UNIQUE(record_id, revision_number)
  // stays as the last-line backstop if two writers ever slip past the lock.
  await trx('records').where({ id: recordId }).forUpdate().first();

  // max(revision_number)+1, not count(*)+1: correct even if a revision is ever missing (a gap),
  // where count+1 would collide with an existing number.
  const revMaxRow = await trx('record_revisions').where({ record_id: recordId }).max('revision_number as max').first();
  const revisionNumber = (parseInt(revMaxRow?.max, 10) || 0) + 1;
  const prevHash = await getPreviousHash(recordId, trx);

  // Build the exact row to persist, then hash THAT object — one source of truth means the
  // hashed payload can never drift from the stored columns (the v1 bug this pass closed).
  const revisionRow = {
    id: uuidv4(),
    record_id: recordId,
    revision_number: revisionNumber,
    change_type: changeType,
    field_changes: JSON.stringify(fieldChanges || []),
    level: level || 'PS',
    changed_by: changedBy,
    changed_at: new Date().toISOString(),
    comment: comment || null,
    reason: reason || null,
    ip_address: ipAddress || null,
    prev_hash: prevHash,
    hash_version: CURRENT_HASH_VERSION,
  };
  revisionRow.row_hash = computeRowHash(revisionRow, prevHash);

  await trx('record_revisions').insert(revisionRow);
  log.info('writeRevision: wrote record_revisions row', {
    recordId, revisionId: revisionRow.id, revisionNumber, changeType, hashVersion: CURRENT_HASH_VERSION,
  });
}

async function writeAuditLog(trx, { recordId, action, user, fieldName, oldValue, newValue, reason, ipAddress }) {
  const id = uuidv4();
  await trx('audit_logs').insert({
    id, table_name: 'records', record_id: recordId, action,
    changed_by_id: user.id, changed_by_role: user.role, changed_at: new Date().toISOString(),
    field_name: fieldName || null,
    old_value: oldValue !== undefined ? JSON.stringify(oldValue) : null,
    new_value: newValue !== undefined ? JSON.stringify(newValue) : null,
    reason: reason || null, ip_address: ipAddress || null,
  });
  log.debug('writeAuditLog: wrote audit_logs row', { recordId, auditLogId: id, action, userId: user.id, fieldName: fieldName || null });
}

function calculateDiff(oldFlat, newFlat) {
  // Normalise values so that null / undefined / '' are all treated as "empty" and do not
  // produce phantom diff entries.  We still use JSON.stringify for objects/arrays so that
  // deep-equal comparison works correctly on nested structures.
  const normaliseVal = (v) => {
    if (v === null || v === undefined || v === '') return '__EMPTY__';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const diff = [];
  const allKeys = new Set([...Object.keys(oldFlat || {}), ...Object.keys(newFlat || {})]);
  for (const key of allKeys) {
    if (normaliseVal(oldFlat?.[key]) !== normaliseVal(newFlat?.[key])) {
      diff.push({ field_key: key, old_value: oldFlat?.[key] ?? '', new_value: newFlat?.[key] ?? '' });
    }
  }
  return diff;
}

// Domain-status columns record_status_events tracks (DB_SCHEMA.md §4.8's CHECK set) — the ONE
// source of truth for "which status_field applies to which record type/detail column", shared by
// updateDomainStatus (item 9) and getStatusOptions (WS8). Never duplicate this list elsewhere.
//
// Ruling 26 note: 'case_status' and 'custody_status' both ultimately target a column literally
// named `case_status` — but on DIFFERENT detail tables (fir_details vs arrest_details) backing
// DIFFERENT domain facts (a CASE's investigation status vs an ARREST's custody state). Before this
// change, updateDomainStatus resolved the target column via `column in detailRow` alone, which
// silently let statusField:'case_status' succeed against an ARREST record too (arrest_details
// happens to have its own same-named column) — an accidental leak, not a documented feature (the
// live frontend at RecordDetail.jsx even exploited it, see WS8 report). Gating by `recordType`
// here, not just column presence, closes that leak: 'case_status' now only ever touches
// fir_details, 'custody_status' only ever touches arrest_details.
const STATUS_FIELD_DEFS = [
  { statusField: 'case_status', recordType: 'CASE', column: 'case_status' },
  { statusField: 'custody_status', recordType: 'ARREST', column: 'case_status' },
  { statusField: 'missing_status', recordType: 'MISSING', column: 'missing_status' },
  { statusField: 'uidb_status', recordType: 'UIDB', column: 'uidb_status' },
  { statusField: 'final_call_status', recordType: 'PCR_CALL', column: 'final_call_status' },
  { statusField: 'is_worked_out', recordType: 'CASE', column: 'is_worked_out', valueType: 'boolean' },
  { statusField: 'sent_to_court_date', recordType: 'CASE', column: 'sent_to_court_date' },
  { statusField: 'court_case_no', recordType: 'CASE', column: 'court_case_no' },
  { statusField: 'court_name', recordType: 'CASE', column: 'court_name' },
  { statusField: 'court_disposal_type', recordType: 'CASE', column: 'court_disposal_type' },
  { statusField: 'court_disposal_date', recordType: 'CASE', column: 'court_disposal_date' },
  { statusField: 'supplementary_chargesheet_details', recordType: 'CASE', column: 'supplementary_chargesheet_details' },
];

// Derived, not hand-duplicated: detailTable -> { column -> statusField }, used by
// detectDetailStatusChanges so a plain updateRecord edit of a tracked column also emits a dated
// event (parity with the dedicated updateDomainStatus endpoint).
const STATUS_FIELD_BY_DETAIL_COLUMN = {};
for (const d of STATUS_FIELD_DEFS) {
  const table = mapper.DETAIL_TABLES[d.recordType];
  (STATUS_FIELD_BY_DETAIL_COLUMN[table] ??= {})[d.column] = d.statusField;
}

async function detectDetailStatusChanges(oldDetail, newDetailCols, detailTable) {
  const map = STATUS_FIELD_BY_DETAIL_COLUMN[detailTable];
  if (!map || !oldDetail) return [];
  const changes = [];
  for (const [column, statusField] of Object.entries(map)) {
    if (!(column in newDetailCols)) continue;
    const oldValue = oldDetail[column];
    const newValue = newDetailCols[column];
    const oldStr = oldValue === null || oldValue === undefined ? null : String(oldValue);
    const newStr = newValue === null || newValue === undefined ? null : String(newValue);
    if (oldStr === newStr) continue;
    changes.push({ statusField, oldValue: oldStr, newValue: newStr });
    log.debug('detectDetailStatusChanges: detected status change', { detailTable, column, statusField, oldValue: oldStr, newValue: newStr });
  }
  return changes;
}

async function writeStatusEvents(trx, recordId, user, changes, { effectiveDate, comment, propertyId } = {}) {
  for (const c of changes) {
    if (c.newValue === null) {
      log.debug('writeStatusEvents: skipped — clearing a status is not a dated event', { recordId, statusField: c.statusField });
      continue;
    }
    const id = uuidv4();
    await trx('record_status_events').insert({
      id, record_id: recordId, property_id: c.statusField === 'property_status' ? propertyId : null,
      status_field: c.statusField, old_value: c.oldValue, new_value: c.newValue,
      effective_date: effectiveDate || toISO(new Date().toISOString()),
      changed_by: user.id, changed_at: new Date().toISOString(), comment: comment || null,
    });
    log.info('writeStatusEvents: wrote record_status_events row', {
      recordId, statusEventId: id, statusField: c.statusField, oldValue: c.oldValue, newValue: c.newValue,
    });
  }
}

// ── read helpers ──────────────────────────────────────────────────────────────────────

async function enrichOffenceLabels(trx, rows) {
  if (!rows.length) return [];
  const actIds = [...new Set(rows.map((r) => r.act_id).filter((v) => v != null))];
  const sectionIds = [...new Set(rows.map((r) => r.section_id).filter(Boolean))];
  const majorIds = [...new Set(rows.map((r) => r.major_head_id).filter((v) => v != null))];
  const minorIds = [...new Set(rows.map((r) => r.minor_head_id).filter((v) => v != null))];
  const [acts, sections, majors, minors] = await Promise.all([
    actIds.length ? trx('ref.acts').whereIn('act_cd', actIds) : [],
    sectionIds.length ? trx('ref.sections').whereIn('section_code', sectionIds) : [],
    majorIds.length ? trx('ref.major_heads').whereIn('major_head_code', majorIds) : [],
    minorIds.length ? trx('ref.minor_heads').whereIn('minor_head_cd', minorIds) : [],
  ]);
  const actById = new Map(acts.map((a) => [a.act_cd, a.act_long]));
  const sectionById = new Map(sections.map((s) => [s.section_code, s.section]));
  const majorById = new Map(majors.map((m) => [m.major_head_code, m.major_head]));
  const minorById = new Map(minors.map((m) => [m.minor_head_cd, m.minor_head]));
  log.debug('enrichOffenceLabels: resolved ref.* labels', {
    rowCount: rows.length, actIds: actIds.length, sectionIds: sectionIds.length, majorIds: majorIds.length, minorIds: minorIds.length,
  });
  return rows.map((r) => ({
    ...r,
    act_label: r.other_act_name || actById.get(r.act_id) || null,
    section_label: sectionById.get(r.section_id) || null,
    major_head_label: majorById.get(r.major_head_id) || null,
    minor_head_label: minorById.get(r.minor_head_id) || null,
  }));
}

async function enrichDetailLabels(trx, detail) {
  if (!detail) return detail;
  if (detail.local_head_id != null) {
    const row = await trx('ref.local_heads').where({ local_head_cd: detail.local_head_id }).first();
    detail.local_head_id_label = row?.local_head || null;
    // #7a (2026-07-20): heinousness is DERIVED (read-only), not stored/entered — carry the
    // classification's crime_category ('HEINOUS' | 'OTHER') so recomposeRecord can surface the
    // Heinous Offence flag. Same row we already fetched — no extra query.
    detail.local_head_crime_category = row?.crime_category || null;
    log.debug('enrichDetailLabels: resolved local_head ref lookup', {
      localHeadId: detail.local_head_id, label: detail.local_head_id_label, crimeCategory: detail.local_head_crime_category,
    });
  }
  if (detail.beat_id) {
    const row = await trx('ref.beats').where({ beat_cd: detail.beat_id }).first();
    detail.beat_id_label = row?.beat_name || null;
    log.debug('enrichDetailLabels: resolved beat ref lookup', { beatId: detail.beat_id, label: detail.beat_id_label });
  }
  if (detail.transferred_to_ps_id) {
    const psRow = await trx('hierarchy_nodes as ps')
      .leftJoin('hierarchy_nodes as dist', 'ps.parent_id', 'dist.id')
      .where('ps.id', detail.transferred_to_ps_id)
      .select('ps.name', 'dist.name as district_name')
      .first();
    detail.transferred_to_ps_label = psRow ? (psRow.district_name ? `${psRow.name} (${psRow.district_name})` : psRow.name) : null;
  }
  if (detail.transferred_to_agency_id) {
    const agencyRow = await trx('ref.agencies').where({ id: detail.transferred_to_agency_id }).first();
    detail.transferred_to_agency_label = agencyRow?.name || null;
  }
  return detail;
}

/** Fetch a record's full typed state — spine, detail (+labels), persons (+subtypes),
 * properties, offences (+labels), and every referenced `locations` row — the shared read
 * used by both getRecordDetails (display) and updateRecord (diff + upsert baseline). */
export async function fetchRecordFull(trx, id) {
  log.debug('fetchRecordFull: enter', { recordId: id });
  const record = await trx('records').where({ id }).first();
  if (!record) {
    log.debug('fetchRecordFull: record not found', { recordId: id });
    return null;
  }

  const detailTable = mapper.DETAIL_TABLES[record.record_type];
  const detail = await trx(detailTable).where({ record_id: id }).first();
  if (detail) {
    detail.extra = typeof detail.extra === 'string' ? JSON.parse(detail.extra) : (detail.extra || {});
    await enrichDetailLabels(trx, detail);
  }

  const personRows = await trx('persons').where({ record_id: id }).orderBy('sort_order', 'asc');
  for (const p of personRows) {
    p.extra = typeof p.extra === 'string' ? JSON.parse(p.extra) : (p.extra || {});
    p.nick_names = typeof p.nick_names === 'string' ? JSON.parse(p.nick_names) : (p.nick_names || []);
    p.subtypes = {};
    for (const t of mapper.PERSON_SUBTYPE_TABLES) {
      const row = await trx(t).where({ person_id: p.id }).first();
      if (row) p.subtypes[t] = row;
    }
  }

  const propertyRows = await trx('record_properties').where({ record_id: id }).orderBy('sort_order', 'asc');
  for (const p of propertyRows) p.extra = typeof p.extra === 'string' ? JSON.parse(p.extra) : (p.extra || {});

  const offenceRowsRaw = await trx('record_offences').where({ record_id: id }).orderBy('sort_order', 'asc');
  const offenceRows = await enrichOffenceLabels(trx, offenceRowsRaw);

  const locationIds = new Set();
  if (detail) {
    for (const slotMap of Object.values(mapper.DETAIL_LOCATION_SLOTS)) {
      const c = slotMap[record.record_type];
      if (c && detail[c]) locationIds.add(detail[c]);
    }
  }
  for (const p of personRows) {
    if (p.present_location_id) locationIds.add(p.present_location_id);
    if (p.perm_location_id) locationIds.add(p.perm_location_id);
    for (const s of Object.values(p.subtypes)) {
      for (const col of ['arrest_location_id', 'missing_location_id', 'found_location_id']) {
        if (s[col]) locationIds.add(s[col]);
      }
    }
  }
  const locationRows = locationIds.size ? await trx('locations').whereIn('id', [...locationIds]) : [];
  const locationsById = Object.fromEntries(locationRows.map((l) => [l.id, l]));

  log.debug('fetchRecordFull: exit', {
    recordId: id, recordType: record.record_type,
    personCount: personRows.length, propertyCount: propertyRows.length,
    offenceCount: offenceRows.length, locationCount: locationRows.length,
  });
  return { record, detail, personRows, propertyRows, offenceRows, locationsById };
}

// ── requiredness (P2.4 — full validation at submit, drafts save partial) ────────────────

function isFieldVisible(f, flatData) {
  const sw = f.show_when;
  if (!sw || !sw.field) return true;
  const actual = flatData[sw.field];
  if (sw.operator === 'filled') return actual !== undefined && actual !== null && actual !== '';
  if (Array.isArray(sw.value)) return sw.value.includes(actual);
  return actual === sw.value;
}

export async function validateRequiredFields(trx, recordType, flatData, { persons = [] } = {}) {
  log.debug('validateRequiredFields: enter', { recordType, personsCount: persons.length });
  const registry = await mapper.loadRegistry(trx, recordType);
  const missing = [];

  // Repeater-role person fields (VICTIM/ARRESTEE/ACCUSED/WITNESS) never appear in flatData —
  // recomposeRecord routes them into persons[].data — so they must be validated per entry.
  // Checking them against flatData made every required repeater field (victim_first_name,
  // arrested_perm_same) report "missing" unconditionally, blocking every CASE/ARREST submit.
  const entriesByRole = new Map();
  for (const p of persons) {
    const role = mapper.roleForPersonType(p.person_type);
    if (!entriesByRole.has(role)) entriesByRole.set(role, []);
    entriesByRole.get(role).push(p.data || {});
  }

  const isEmpty = (val) => val === undefined || val === null || val === '';

  for (const f of registry) {
    if (f.storage === 'ui_only') continue;
    if (f.validation_rules?.required !== true) continue;

    const shape = mapper.resolveStorage(f.storage, recordType);
    const repeaterRole = (shape && typeof shape === 'object' && shape.role && mapper.REPEATER_ROLES.has(shape.role))
      ? shape.role : null;
    if (repeaterRole) {
      // Zero entries of the role = nothing to check: whether a victim/arrestee must exist at
      // all is workflow policy, not field requiredness (P2 — reject only the impossible).
      // show_when conditions on repeater fields reference sibling fields of the same entry,
      // so visibility is evaluated per entry (entry values shadow flat ones).
      for (const entryData of entriesByRole.get(repeaterRole) || []) {
        if (!isFieldVisible(f, { ...flatData, ...entryData })) continue;
        if (isEmpty(entryData[f.field_key])) {
          missing.push(f.labels?.en || f.field_key);
          log.debug('validateRequiredFields: missing required repeater field', { recordType, fieldKey: f.field_key, role: repeaterRole });
          break;
        }
      }
      continue;
    }

    if (!isFieldVisible(f, flatData)) continue;
    if (isEmpty(flatData[f.field_key])) {
      missing.push(f.labels?.en || f.field_key);
      log.debug('validateRequiredFields: missing required field', { recordType, fieldKey: f.field_key });
    }
  }
  if (missing.length) {
    log.warn('validateRequiredFields: rejected — missing required fields', { recordType, missingCount: missing.length, missing });
    const err = new Error(`Missing required fields before submit: ${missing.join(', ')}`);
    err.status = 422;
    throw err;
  }

  // Strict 14-Digit Statutory FIR validation on submission
  if (recordType === 'CASE') {
    const firNo = String(flatData.fir_no || '').trim();
    if (!firNo || !/^\d{14}$/.test(firNo)) {
      log.warn('validateRequiredFields: rejected — invalid/incomplete 14-digit FIR number', { recordType, firNo });
      const err = new Error('Cannot submit FIR record without a complete 14-digit unique statutory FIR number.');
      err.status = 422;
      throw err;
    }
  }

  if (recordType === 'ARREST' && flatData.is_dd_based !== true) {
    const firNo = String(flatData.fir_no || '').trim();
    if (!firNo || !/^\d{14}$/.test(firNo)) {
      log.warn('validateRequiredFields: rejected — arrest record against FIR missing 14-digit FIR number', { recordType, firNo });
      const err = new Error('Cannot submit Arrest record against FIR without a complete 14-digit unique statutory FIR number.');
      err.status = 422;
      throw err;
    }
  }

  log.debug('validateRequiredFields: passed', { recordType });
}

// ── list / detail reads ──────────────────────────────────────────────────────────────

function buildListSummary(r) {
  switch (r.record_type) {
    case 'CASE': return {
      fir_no: r.fir_no,
      case_status: r.case_status,
      local_head: r.case_local_head,
      is_worked_out: r.is_worked_out,
      io_name: r.io_name,
      transfer_to_type: r.transfer_to_type,
      transferred_to_ps_id: r.transferred_to_ps_id,
      transferred_to_ps_name: r.transferred_to_ps_name,
      transferred_to_ps_district_name: r.transferred_to_ps_district_name,
      transferred_to_agency_id: r.transferred_to_agency_id,
      transferred_to_agency_name: r.transferred_to_agency_name,
      transferred_to_agency_category: r.transferred_to_agency_category,
      date_of_transfer: r.date_of_transfer,
      origin_ps_name: r.ps_name,
      origin_district_name: r.district_name,
      sections: r.data?.sections || r.sections || null,
      act_name: r.data?.act_name || r.act_name || null
    };
    case 'ARREST': return { fir_no: r.arrest_fir_no, case_status: r.arrest_case_status, local_head: r.arrest_local_head, io_name: r.io_name, sections: r.data?.sections || null, act_name: r.data?.act_name || null };
    case 'PCR_CALL': return { final_call_status: r.final_call_status, call_head: r.call_head, io_name: r.io_name };
    case 'MISSING': return { missing_status: r.missing_status, fir_no: r.missing_fir_no, io_name: r.io_name };
    case 'UIDB': return { uidb_status: r.uidb_status, uidb_no: r.uidb_no, local_head: r.uidb_local_head, io_name: r.io_name };
    default: return {};
  }
}

function withListJoins(query) {
  return query
    .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .join('hierarchy_nodes as dist', 'records.district_id', 'dist.id')
    .join('users as u', 'records.created_by', 'u.id')
    .leftJoin('investigating_officers as io', 'records.io_id', 'io.id')
    .leftJoin('fir_details as fir', 'records.id', 'fir.record_id')
    .leftJoin('ref.local_heads as lh_fir', 'fir.local_head_id', 'lh_fir.local_head_cd')
    .leftJoin('hierarchy_nodes as trans_ps', 'fir.transferred_to_ps_id', 'trans_ps.id')
    .leftJoin('hierarchy_nodes as trans_ps_dist', 'trans_ps.parent_id', 'trans_ps_dist.id')
    .leftJoin('ref.agencies as trans_agency', 'fir.transferred_to_agency_id', 'trans_agency.id')
    .leftJoin('arrest_details as arr', 'records.id', 'arr.record_id')
    .leftJoin('ref.local_heads as lh_arr', 'arr.local_head_id', 'lh_arr.local_head_cd')
    .leftJoin('pcr_call_details as pcr', 'records.id', 'pcr.record_id')
    .leftJoin('missing_details as mis', 'records.id', 'mis.record_id')
    .leftJoin('uidb_details as uidb', 'records.id', 'uidb.record_id')
    .leftJoin('ref.local_heads as lh_uidb', 'uidb.local_head_id', 'lh_uidb.local_head_cd')
    .leftJoin('workflow_transitions as last_wt', function () {
      this.on('last_wt.id', '=', db.raw('(SELECT id FROM workflow_transitions WHERE record_id = records.id ORDER BY performed_at DESC LIMIT 1)'));
    })
    .leftJoin('users as last_wt_u', 'last_wt.performed_by', 'last_wt_u.id')
    .select(
      'records.*', 'ps.name as ps_name', 'dist.name as district_name', 'u.name as creator_name',
      'io.name as io_name',
      'fir.fir_no as fir_no', 'fir.case_status as case_status', 'fir.is_worked_out as is_worked_out',
      'fir.transfer_to_type as transfer_to_type',
      'fir.transferred_to_ps_id as transferred_to_ps_id',
      'trans_ps.name as transferred_to_ps_name',
      'trans_ps_dist.name as transferred_to_ps_district_name',
      'fir.transferred_to_agency_id as transferred_to_agency_id',
      'trans_agency.name as transferred_to_agency_name',
      'trans_agency.category as transferred_to_agency_category',
      'fir.date_of_transfer as date_of_transfer',
      'lh_fir.local_head as case_local_head',
      'arr.case_status as arrest_case_status', 'arr.fir_no as arrest_fir_no', 'lh_arr.local_head as arrest_local_head',
      'pcr.final_call_status as final_call_status', 'pcr.call_head as call_head',
      'mis.missing_status as missing_status', 'mis.fir_no as missing_fir_no',
      'uidb.uidb_status as uidb_status', 'uidb.uidb_no as uidb_no', 'lh_uidb.local_head as uidb_local_head',
      'last_wt.from_level as last_transition_from_level',
      'last_wt.to_level as last_transition_to_level',
      'last_wt.action as last_transition_action',
      'last_wt.comment as last_transition_comment',
      'last_wt.performed_at as last_transition_at',
      'last_wt_u.name as last_transition_by_name',
      'last_wt_u.role as last_transition_by_role'
    );
}

export const listRecords = async (recordType, filters, jurisdictionQuery = {}, user = null) => {
  log.debug('listRecords: enter', { recordType, filters: redact(filters), jurisdictionQuery, userRole: user?.role });
  let query = withListJoins(db('records'));

  if (jurisdictionQuery.ps_id) {
    query = query.where((b) => {
      b.where('records.ps_id', jurisdictionQuery.ps_id)
        .orWhere((tb) => {
          tb.where('fir.transfer_to_type', 'PS')
            .andWhere('fir.transferred_to_ps_id', jurisdictionQuery.ps_id);
        });
    });
    log.debug('listRecords: scoped by ps_id (including incoming PS transfers)', { psId: jurisdictionQuery.ps_id });
  }
  if (jurisdictionQuery.district_id) { query = query.where('records.district_id', jurisdictionQuery.district_id); log.debug('listRecords: scoped by district_id', { districtId: jurisdictionQuery.district_id }); }
  if (jurisdictionQuery.sub_div_id) { query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id); log.debug('listRecords: scoped by sub_div_id', { subDivId: jurisdictionQuery.sub_div_id }); }

  // HIERARCHY DRAFT ISOLATION:
  // DRAFT records are only visible to the creator/HC at the PS level until submitted.
  // SHO, District, ACP, JCP, SCP, and HQ hierarchies cannot see DRAFT records.
  if (user && user.role !== 'HC') {
    query = query.where('records.current_status', '<>', 'DRAFT');
  } else if (!jurisdictionQuery.ps_id && (!user || user.role !== 'HC')) {
    query = query.where('records.current_status', '<>', 'DRAFT');
  }

  if (recordType && recordType !== 'ALL') { query = query.where('records.record_type', recordType); log.debug('listRecords: filtered by record_type', { recordType }); }

  if (filters.status) {
    if (filters.status === 'FORWARDED' || filters.status === 'FORWARDED_DISTRICT') {
      query = query.whereIn('records.current_status', [
        'DISTRICT_REVIEW', 'JCP_REVIEW', 'SCP_REVIEW', 'HQ_RECEIVED', 'COMPILED', 'ARCHIVED', 'SUBMITTED', 'SHO_REVIEWED', 'ACP_REVIEW'
      ]);
    } else if (filters.status === 'RETURNED_DISTRICT' || filters.status === 'SENT_BACK_DISTRICT') {
      query = query.whereIn('records.current_status', ['SENT_BACK', 'SENT_BACK_HC'])
        .andWhere('last_wt.from_level', 'DISTRICT');
    } else if (filters.status === 'SENT_BACK_HC') {
      query = query.whereIn('records.current_status', ['SENT_BACK', 'SENT_BACK_HC'])
        .where((b) => {
          b.where('last_wt.from_level', 'PS')
            .orWhereNull('last_wt.from_level');
        });
    } else if (Array.isArray(filters.status)) {
      query = query.whereIn('records.current_status', filters.status);
    } else {
      query = query.where('records.current_status', filters.status);
    }
    log.debug('listRecords: filtered by status', { status: filters.status });
  }
  if (filters.dateFrom) query = query.where('records.record_date', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('records.record_date', '<=', filters.dateTo);

  if (filters.localHead) {
    query = query.where((b) => {
      b.whereRaw('lh_fir.local_head ILIKE ?', [filters.localHead])
        .orWhereRaw('lh_arr.local_head ILIKE ?', [filters.localHead])
        .orWhereRaw('lh_uidb.local_head ILIKE ?', [filters.localHead]);
    });
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.where((b) => {
      b.whereRaw('records.uid ILIKE ?', [term])
        .orWhereRaw('fir.fir_no ILIKE ?', [term])
        .orWhereRaw('arr.fir_no ILIKE ?', [term])
        .orWhereRaw('uidb.uidb_no ILIKE ?', [term])
        .orWhereExists(function () {
          this.select('*').from('persons').whereRaw('persons.record_id = records.id').andWhere('persons.name', 'ILIKE', term);
        });
    });
  }

  if (filters.linked_case_id) {
    query = query.whereExists(function () {
      this.select('*').from('record_links')
        .whereRaw('record_links.target_record_id = records.id')
        .where('record_links.source_record_id', filters.linked_case_id);
    });
  }

  if (filters.linked_fir_no) {
    query = query.whereExists(function () {
      this.select('*').from('record_links')
        .whereRaw('record_links.target_record_id = records.id')
        .join('fir_details as case_fir', 'case_fir.record_id', 'record_links.source_record_id')
        .where('case_fir.fir_no', filters.linked_fir_no);
    });
  }

  // Universal multi-factor field filters (allow filtering on any filled factor)
  if (filters.is_worked_out !== undefined && filters.is_worked_out !== null && filters.is_worked_out !== '') {
    const isW = filters.is_worked_out === true || filters.is_worked_out === 'true' || String(filters.is_worked_out).toUpperCase() === 'YES';
    query = query.where('fir.is_worked_out', isW);
  }

  if (filters.work_out !== undefined && filters.work_out !== null && filters.work_out !== '') {
    const isW = filters.work_out === true || filters.work_out === 'true' || String(filters.work_out).toUpperCase() === 'YES';
    query = query.where('fir.is_worked_out', isW);
  }

  if (filters.case_status) {
    query = query.where((b) => {
      b.where('fir.case_status', filters.case_status)
       .orWhere('arr.case_status', filters.case_status)
       .orWhere('mis.missing_status', filters.case_status)
       .orWhere('uidb.uidb_status', filters.case_status)
       .orWhere('pcr.final_call_status', filters.case_status);
    });
  }

  if (filters.disposal_type) {
    query = query.where('fir.disposal_type', filters.disposal_type);
  }

  if (filters.rc_no) {
    query = query.where('fir.rc_no', 'ILIKE', `%${filters.rc_no}%`);
  }

  if (filters.io_pis || filters.pis_no) {
    const pisVal = filters.io_pis || filters.pis_no;
    query = query.where((b) => {
      b.where('fir.io_pis', 'ILIKE', `%${pisVal}%`)
       .orWhere('io.pis_no', 'ILIKE', `%${pisVal}%`);
    });
  }

  if (filters.io_name) {
    query = query.where('io.name', 'ILIKE', `%${filters.io_name}%`);
  }

  if (filters.fir_no) {
    query = query.where((b) => {
      b.where('fir.fir_no', 'ILIKE', `%${filters.fir_no}%`)
       .orWhere('arr.fir_no', 'ILIKE', `%${filters.fir_no}%`)
       .orWhere('mis.fir_no', 'ILIKE', `%${filters.fir_no}%`);
    });
  }

  if (filters.fir_year) {
    query = query.where('fir.fir_year', filters.fir_year);
  }

  if (filters.act_name || filters.section_code) {
    query = query.whereExists(function () {
      let sub = this.select('*').from('record_acts_sections as ras')
        .whereRaw('ras.record_id = records.id');
      if (filters.act_name) sub = sub.where('ras.act_name', 'ILIKE', `%${filters.act_name}%`);
      if (filters.section_code) sub = sub.where('ras.section_code', 'ILIKE', `%${filters.section_code}%`);
    });
  }

  if (filters.person_name || filters.complainant_name || filters.victim_name || filters.accused_name) {
    query = query.whereExists(function () {
      let sub = this.select('*').from('persons')
        .whereRaw('persons.record_id = records.id');
      if (filters.person_name) sub = sub.where('persons.name', 'ILIKE', `%${filters.person_name}%`);
      if (filters.complainant_name) sub = sub.where('persons.name', 'ILIKE', `%${filters.complainant_name}%`).where('persons.role', 'COMPLAINANT');
      if (filters.victim_name) sub = sub.where('persons.name', 'ILIKE', `%${filters.victim_name}%`).where('persons.role', 'VICTIM');
      if (filters.accused_name) sub = sub.where('persons.name', 'ILIKE', `%${filters.accused_name}%`).where('persons.role', 'ACCUSED');
    });
  }


  // C12 (2026-07-26): derived Kalandra / Arrest-against-FIR filter — GET /api/records?
  // record_type=ARREST&arrest_kind=KALANDRA|AGAINST_FIR. Omitted or any other value behaves
  // exactly as before this change (no-op). Definition is the user's verbatim ruling (R3,
  // docs/bugfix-batch-2026-07-26/HANDOFF.md): Kalandra = `is_dd_based IS TRUE` OR no
  // `CASE_ARREST` link OR FIR number null/empty — deliberately OR'd, not AND'd, "coz there are
  // many dumb users" who fill the discriminator inconsistently. AGAINST_FIR is the exact
  // complement. This mirrors the LINK-EXISTENCE shape of analytics.controller.js's
  // `countStandaloneArrests` (~line 536) but is NOT a call into that module (P1.4 — no
  // cross-module service imports) and is NOT the same definition: that function only checks
  // "no CASE_ARREST link", one of the three OR legs the user's ruling actually asked for: it is
  // reproduced/extended here, not reused. `arr` (`arrest_details`) is already left-joined by
  // `withListJoins`, so no new join is needed. Always additionally constrains to
  // `record_type = 'ARREST'`, independent of the `type` param — a caller that sent `arrest_kind`
  // without `record_type=ARREST` could otherwise pull in non-ARREST rows: those have no
  // `arrest_details` row at all, so `arr.is_dd_based`/`arr.fir_no` are NULL and would
  // false-positive-match the Kalandra "no link + no FIR" legs.
  const VALID_ARREST_KINDS = new Set(['KALANDRA', 'AGAINST_FIR']);
  if (filters.arrestKind && VALID_ARREST_KINDS.has(filters.arrestKind)) {
    const hasCaseArrestLink = function () {
      this.select('*')
        .from('record_links as rl')
        .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
        .where('ltr.code', 'CASE_ARREST')
        .whereRaw('rl.target_record_id = records.id');
    };
    query = query.where('records.record_type', 'ARREST');
    if (filters.arrestKind === 'KALANDRA') {
      query = query.where((b) => {
        b.where('arr.is_dd_based', true)
          .orWhereNotExists(hasCaseArrestLink)
          .orWhereNull('arr.fir_no')
          .orWhere('arr.fir_no', '');
      });
    } else {
      query = query
        .where((b) => b.whereNot('arr.is_dd_based', true).orWhereNull('arr.is_dd_based'))
        .whereExists(hasCaseArrestLink)
        .whereNotNull('arr.fir_no')
        .whereNot('arr.fir_no', '');
    }
    log.debug('listRecords: filtered by arrest_kind', { arrestKind: filters.arrestKind });
  }

  if (filters.limit && (filters.limit === 'none' || filters.limit === 'all' || filters.limit === -1 || filters.limit === '-1')) {
    // Explicitly requested unlimited records
  } else {
    const lim = filters.limit ? parseInt(filters.limit, 10) : 200;
    if (!isNaN(lim) && lim > 0) query = query.limit(lim);
  }
  if (filters.offset) {
    const off = parseInt(filters.offset, 10);
    if (!isNaN(off) && off >= 0) query = query.offset(off);
  }

  const rawRecords = await query.orderBy('records.created_at', 'desc');
  log.info('listRecords: exit', { recordType, resultCount: rawRecords.length });
  return rawRecords.map((r) => ({ ...r, data: buildListSummary(r) }));
};

export const getRecordDetails = async (id) => {
  log.debug('getRecordDetails: enter', { recordId: id });
  return db.transaction(async (trx) => {
    const full = await fetchRecordFull(trx, id);
    if (!full) {
      log.info('getRecordDetails: not found', { recordId: id });
      return null;
    }
    const { record, detail, personRows, propertyRows, offenceRows, locationsById } = full;

    const [ps, dist] = await Promise.all([
      trx('hierarchy_nodes').where({ id: record.ps_id }).first(),
      trx('hierarchy_nodes').where({ id: record.district_id }).first(),
    ]);
    record.ps_name = ps?.name || null;
    record.district_name = dist?.name || null;

    const registry = await mapper.loadRegistry(trx, record.record_type);
    const { data, persons, properties } = await mapper.recomposeRecord(trx, registry, record.record_type, {
      spineRow: record, detailRow: detail, personRows, propertyRows, offenceRows, locationsById,
    });
    record.data = data;

    // B2 (2026-07-23 bugfix batch): transitions/status_events returned only `performed_by`/
    // `changed_by` UUIDs — the FE had no way to render a name (DCP + SHO views showed raw
    // UUIDs). Joined `users` for a readable name (+ role, trivially available on the same row)
    // on every history collection below, matching the pattern `revisions` already used
    // (`user_fullname`). The raw id column stays untouched (`performed_by`/`changed_by`) so
    // nothing already consuming it breaks — these are additive fields only.
    const revisions = await trx('record_revisions')
      .select('record_revisions.*', 'u.username', 'u.name as user_fullname', 'u.role as changed_by_role')
      .leftJoin('users as u', 'record_revisions.changed_by', 'u.id')
      .where('record_revisions.record_id', id)
      .orderBy('record_revisions.revision_number', 'asc');
    revisions.forEach((rev) => { rev.field_changes = typeof rev.field_changes === 'string' ? JSON.parse(rev.field_changes) : rev.field_changes; });

    const transitions = await trx('workflow_transitions')
      .select('workflow_transitions.*', 'u.username', 'u.name as performed_by_name', 'u.role as performed_by_role')
      .leftJoin('users as u', 'workflow_transitions.performed_by', 'u.id')
      .where('workflow_transitions.record_id', id)
      .orderBy('workflow_transitions.performed_at', 'asc');
    transitions.forEach((tr) => { tr.target_fields = typeof tr.target_fields === 'string' ? JSON.parse(tr.target_fields) : tr.target_fields; });

    const statusEvents = await trx('record_status_events')
      .select('record_status_events.*', 'u.username', 'u.name as changed_by_name', 'u.role as changed_by_role')
      .leftJoin('users as u', 'record_status_events.changed_by', 'u.id')
      .where('record_status_events.record_id', id)
      .orderBy('record_status_events.effective_date', 'desc');

    let linkedRecords = [];
    try { linkedRecords = await getLinksForRecord(id); } catch (err) {
      log.warn('getRecordDetails: getLinksForRecord failed, continuing with no linked records', { recordId: id, err });
      linkedRecords = [];
    }

    log.info('getRecordDetails: exit', {
      recordId: id, recordType: record.record_type,
      revisions: revisions.length, transitions: transitions.length,
      statusEvents: statusEvents.length, linkedRecords: linkedRecords.length,
    });
    return { record, revisions, transitions, status_events: statusEvents, linkedRecords, persons, properties, offences: offenceRows };
  });
};

// ── write path ────────────────────────────────────────────────────────────────────────

/**
 * Shared transaction body for every fresh-record insert. `createRecord` (interactive HTTP
 * create) and `createImportedRecord` (bulk import, Integration 3) are both thin wrappers
 * around this — P1.2's one write path stays one function, not one endpoint. `opts.scope`
 * defaults to the acting user's own jurisdiction (the interactive-create case); import is the
 * only caller that ever passes a different scope, and only with a batch-derived, pre-validated
 * value — never from request body / sheet content (P5.4).
 */
async function insertRecordCore(trx, user, recordType, recordDate, data, ipAddress, split, opts = {}) {
  const {
    scope = { ps_id: user.ps_id, district_id: user.district_id, sub_div_id: user.sub_div_id || null },
    status = 'DRAFT',
    level = 'PS',
    changeType = 'CREATE',
    importStamps = null, // { isLegacy, sourceSystem, legacyRef, batchId }
  } = opts;

  const id = uuidv4();
  const detailTable = mapper.DETAIL_TABLES[recordType];
  log.debug('insertRecordCore: enter', {
    recordId: id, recordType, status, level, changeType,
    scope, isImport: !!importStamps, createdBy: user.id,
  });

  // records.record_date is a DATE column. The interactive path sends ISO already, but bulk import
  // supplies the raw Excel value (often DD/MM/YYYY) — inserted verbatim, Postgres parses that with
  // its own datestyle (MM/DD), so any day > 12 became an invalid month → pg 22008 datetime overflow
  // and an opaque per-row "system error" (a large fraction of real import rows — #1 class,
  // 2026-07-20). Normalize to ISO here so EVERY write path is safe; normalizeDate is idempotent on
  // an already-ISO value, so the interactive path is unaffected. Fails CLOSED: an unparseable date
  // stays as-is only if normalizeDate returns null (import.validate.js's RECORD_DATE_INVALID check
  // already rejects those before write; this null-guard just avoids passing `null` to a NOT NULL
  // column, surfacing a clear not-null error rather than a datetime-format crash if one slips past).
  const normalizedRecordDate = normalizeDate(recordDate);
  log.debug('insertRecordCore: normalized record_date', { recordId: id, recordDate, normalizedRecordDate });

  const detailLocationIds = {};
  for (const [slot, cols] of Object.entries(split.detailLocationFields)) {
    detailLocationIds[slot] = await insertLocation(trx, cols);
  }
  for (const [slot, locId] of Object.entries(detailLocationIds)) {
    const col = mapper.DETAIL_LOCATION_SLOTS[slot]?.[recordType];
    if (col) split.detail[col] = locId;
  }

  const recordUid = await generateRecordUid(trx, recordType, normalizedRecordDate);

  await trx('records').insert({
    id, uid: recordUid, record_type: recordType, ps_id: scope.ps_id, district_id: scope.district_id, sub_div_id: scope.sub_div_id || null,
    io_id: split.spine.io_id || null, current_status: status, current_level: level, record_date: normalizedRecordDate,
    created_by: user.id, updated_by: user.id,
    ...(importStamps ? {
      is_legacy: !!importStamps.isLegacy,
      source_system: importStamps.sourceSystem,
      legacy_ref: importStamps.legacyRef,
      import_batch_id: importStamps.batchId,
      imported_at: trx.fn.now(),
      imported_by: user.id,
    } : {}),
  });
  log.info('insertRecordCore: wrote records row (spine)', { recordId: id, uid: recordUid, recordType, psId: scope.ps_id, districtId: scope.district_id, status });

  // C8 (2026-07-26, user ruling): stamp fir_details.fir_year on every CASE write, through this
  // one write path (both interactive create and import go through insertRecordCore) — see
  // deriveFirYear's doc comment for the year-source preference order. This is what makes the
  // schema's existing UNIQUE(ps_id, fir_year, fir_no) constraint actually fire; before this it
  // was always NULL and Postgres treats NULL as always-distinct, so the constraint never caught
  // a same-PS duplicate FIR.
  if (detailTable === 'fir_details') {
    if (split.detail.is_worked_out === undefined || split.detail.is_worked_out === null) {
      split.detail.is_worked_out = false;
    }
    const caseStatusUpper = String(split.detail.case_status || '').toUpperCase().trim();
    const PENDING_STATUSES = ['PENDING', 'PENDING_INVESTIGATION', 'UNDER_INVESTIGATION'];
    if (!split.detail.case_status || PENDING_STATUSES.includes(caseStatusUpper) || caseStatusUpper.includes('PENDING')) {
      split.detail.is_worked_out = false;
    }

    const regType = split.detail.registration_type || data?.registration_type || 'MANUAL_CCTNS';
    const statutoryRes = await generateAndValidateStatutoryFir(trx, {
      psId: scope.ps_id,
      registrationType: regType,
      recordDate: normalizedRecordDate,
      firDate: split.detail.fir_date,
      requestedFirNo: split.detail.fir_no || data?.fir_no,
      requestedSerial: data?.fir_seq || data?.serial,
      userOverride: data?.user_override === true || data?.year_override === true,
      isLegacy: !!importStamps?.isLegacy || opts.isLegacy === true,
    });

    split.detail.fir_no = statutoryRes.firNo;
    split.detail.registration_type = statutoryRes.registrationType;
    split.detail.fir_year = statutoryRes.firYear;
    split.detail.fir_seq = statutoryRes.firSeq;
    split.detail.fir_type_prefix = statutoryRes.firTypePrefix;
    split.detail.fir_ps_code = statutoryRes.firPsCode;
    split.detail.is_legacy_format = statutoryRes.isLegacyFormat;

    if (split.detail.date_of_chargesheet || split.detail.chargesheet_date) {
      split.detail.sent_to_court_date = split.detail.sent_to_court_date || split.detail.date_of_chargesheet || split.detail.chargesheet_date;
      split.detail.date_of_chargesheet = split.detail.date_of_chargesheet || split.detail.chargesheet_date || split.detail.sent_to_court_date;
      split.detail.chargesheet_date = split.detail.chargesheet_date || split.detail.date_of_chargesheet || split.detail.sent_to_court_date;
    } else if (split.detail.sent_to_court_date) {
      split.detail.date_of_chargesheet = split.detail.sent_to_court_date;
      split.detail.chargesheet_date = split.detail.sent_to_court_date;
    }

    log.debug('insertRecordCore: statutory FIR applied', { recordId: id, firNo: split.detail.fir_no, firYear: split.detail.fir_year, registrationType: split.detail.registration_type });
  }

  if (detailTable === 'fir_details' && split.detail.fir_no) {
    const cleanFirNo = String(split.detail.fir_no).trim();
    if (cleanFirNo.length > 0) {
      const existingDup = await trx('fir_details')
        .whereRaw('LOWER(TRIM(fir_no)) = LOWER(TRIM(?))', [cleanFirNo])
        .whereNot({ record_id: id })
        .first();
      if (existingDup) {
        log.warn('insertRecordCore: rejected — duplicate fir_no', { recordId: id, firNo: cleanFirNo, existingRecordId: existingDup.record_id });
        const err = new Error(`FIR Number "${cleanFirNo}" is already registered as an FIR record.`);
        err.status = 409;
        throw err;
      }
    }
  }

  await trx(detailTable).insert({ record_id: id, ...detailScopingColumns(recordType, scope.ps_id), ...split.detail, extra: JSON.stringify(split.detailExtra) });
  log.info('insertRecordCore: wrote detail row', { recordId: id, detailTable });

  const personIdBySourceIndex = {};
  for (const entry of split.personEntries) {
    const personId = await insertPersonEntry(trx, id, entry);
    if (entry.sourceKind === 'repeater') personIdBySourceIndex[entry.sourceIndex] = personId;
  }
  log.debug('insertRecordCore: wrote persons', { recordId: id, count: split.personEntries.length });

  for (const prop of split.propertyEntries) {
    const personId = prop.personIndex != null ? (personIdBySourceIndex[prop.personIndex] ?? null) : null;
    const propertyId = uuidv4();
    await trx('record_properties').insert({
      id: propertyId, record_id: id, person_id: personId, ...prop.columns,
      extra: JSON.stringify(prop.extra || {}), sort_order: 0,
    });
    log.debug('insertRecordCore: wrote record_properties row', { recordId: id, propertyId, personId });
  }

  await replaceOffenceRows(trx, id, split.offenceRows);

  if (recordType === 'ARREST' && split.detail.fir_no) {
    await autoLinkArrestToCase(trx, id, scope.ps_id, split.detail.fir_no, user);
  }

  await writeRevision(trx, {
    recordId: id, changeType, level, changedBy: user.id, ipAddress,
    fieldChanges: calculateDiff({}, data),
  });
  await writeAuditLog(trx, { recordId: id, action: changeType, user, newValue: data, ipAddress });

  log.info('insertRecordCore: exit', { recordId: id, recordType, psId: scope.ps_id, personCount: split.personEntries.length, propertyCount: split.propertyEntries.length, offenceCount: split.offenceRows.length });
  return { id, ps_id: scope.ps_id };
}

export const createRecord = async (user, recordType, recordDate, data, ipAddress, { persons = [], properties = [], offences = [] } = {}) => {
  log.debug('createRecord: enter', {
    recordType, userId: user.id, keys: Object.keys(data || {}),
    personsCount: persons.length, propertiesCount: properties.length, offencesCount: offences.length,
  });
  try {
    const dbRecord = await db.transaction(async (trx) => {
      const registry = await mapper.loadRegistry(trx, recordType);
      log.debug('createRecord: loaded field registry', { recordType, fieldCount: registry.length });
      const split = await mapper.splitPayload(trx, registry, recordType, { data, persons, properties, offences }, user.ps_id);
      log.debug('createRecord: split payload into typed shape', {
        recordType, personEntries: split.personEntries.length, propertyEntries: split.propertyEntries.length, offenceRows: split.offenceRows.length,
      });
      return insertRecordCore(trx, user, recordType, recordDate, data, ipAddress, split);
    });

    await eventBus.publish('record.created', {
      record_id: dbRecord.id, record_type: recordType, changed_by: user.id, ps_id: dbRecord.ps_id,
      counts: { persons: (persons || []).length, properties: (properties || []).length, offences: (offences || []).length },
    });
    log.debug('createRecord: published record.created', { recordId: dbRecord.id, recordType });

    log.info('createRecord: exit', { recordId: dbRecord.id, recordType, userId: user.id });
    return { id: dbRecord.id };
  } catch (err) {
    log.error('createRecord: failed', { recordType, userId: user.id, err });
    throw err;
  }
};

/**
 * Bulk-import create — same transaction core as createRecord, with import-specific scope/
 * status/provenance. Never reachable from the interactive HTTP create path (that foot-gun is
 * the whole reason this is a separate wrapper rather than an options bag on createRecord —
 * see docs/new-db-integration/03-import.md AD1). `scope` must be pre-validated by the caller
 * (the import batch's target PS/district, checked against the uploader's own jurisdiction at
 * batch-creation time — never taken from spreadsheet content, P5.4/P5.6).
 */
export const createImportedRecord = async (
  user, recordType, recordDate, data, ipAddress,
  { persons = [], properties = [], offences = [] } = {},
  { scope, isLegacy = false, status = 'DRAFT', batchId, sourceRef } = {}
) => {
  log.debug('createImportedRecord: enter', { recordType, userId: user.id, batchId, isLegacy, status, scope });
  if (!scope || !scope.ps_id || !scope.district_id) {
    log.error('createImportedRecord: rejected — scope not resolved', { recordType, batchId, scope });
    throw new Error('createImportedRecord requires a resolved scope { ps_id, district_id }');
  }

  try {
    const dbRecord = await db.transaction(async (trx) => {
      const registry = await mapper.loadRegistry(trx, recordType);
      const split = await mapper.splitPayload(trx, registry, recordType, { data, persons, properties, offences }, scope.ps_id);
      log.debug('createImportedRecord: split payload into typed shape', {
        recordType, batchId, personEntries: split.personEntries.length, propertyEntries: split.propertyEntries.length, offenceRows: split.offenceRows.length,
      });
      return insertRecordCore(trx, user, recordType, recordDate, data, ipAddress, split, {
        scope, status, level: 'PS', changeType: 'IMPORT',
        importStamps: { isLegacy, sourceSystem: 'BULK_IMPORT', legacyRef: sourceRef, batchId },
      });
    });

    // Same event as the interactive create path (record.created) — this is what makes
    // linkResolver.js resolve CASE_ARREST/CASE_MISSING links for imported records too;
    // notifyHandler.js doesn't subscribe to record.created, so no notification suppression
    // is needed for legacy imports (docs/new-db-integration/03-import.md C7).
    await eventBus.publish('record.created', {
      record_id: dbRecord.id, record_type: recordType, changed_by: user.id, ps_id: dbRecord.ps_id,
      counts: { persons: (persons || []).length, properties: (properties || []).length, offences: (offences || []).length },
    });
    log.debug('createImportedRecord: published record.created', { recordId: dbRecord.id, batchId });

    log.info('createImportedRecord: exit', { recordId: dbRecord.id, recordType, batchId, isLegacy });
    return { id: dbRecord.id };
  } catch (err) {
    log.error('createImportedRecord: failed', { recordType, batchId, userId: user.id, err });
    throw err;
  }
};

const EDITABLE_STATUSES = ['DRAFT', 'SENT_BACK'];

export const updateRecord = async (id, user, data, ipAddress, { persons, properties, offences } = {}) => {
  // [PHAROS-DEBUG] entry snapshot — `persons: undefined` means "don't touch"; `persons: []`
  // means "clear all". An unintended `[]` here (frontend sent an empty list) is what deletes
  // seeded victims/accused. `personRoles` shows what the client actually sent.
  log.info('updateRecord: entry snapshot', {
    recordId: id, by: user.id,
    personsProvided: persons !== undefined, personsCount: Array.isArray(persons) ? persons.length : null,
    personRoles: Array.isArray(persons) ? persons.map((p) => p.person_type || p.role) : null,
    propertiesProvided: properties !== undefined, propertiesCount: Array.isArray(properties) ? properties.length : null,
  });
  try {
  const dbRecord = await db.transaction(async (trx) => {
    // Lock the spine before reading its full graph: updateRecord rewrites persons/properties/
    // offences before writeRevision runs, so the entry lock (not just the one inside
    // writeRevision) is what serializes two concurrent edits to the same record. The lock is
    // taken here rather than in the shared fetchRecordFull, which read paths also use.
    const locked = await trx('records').where({ id }).forUpdate().first();
    if (!locked) { log.warn('updateRecord: rejected — record not found', { recordId: id }); throw new Error('Record not found'); }
    assertNotFrozen(locked);

    const full = await fetchRecordFull(trx, id);
    if (!full) { log.warn('updateRecord: rejected — record not found (post-lock)', { recordId: id }); throw new Error('Record not found'); }
    const { record, detail: oldDetail, personRows: oldPersonRows, propertyRows: oldPropertyRows } = full;

    const roleUpper = (user?.role || '').toUpperCase();
    const isDistrictRole = ['DISTRICT_OFFICER', 'DISTRICT'].includes(roleUpper);
    const isShoRole = roleUpper === 'SHO';

    const canEdit = EDITABLE_STATUSES.includes(record.current_status)
      || (isDistrictRole && record.current_status === 'DISTRICT_REVIEW')
      || (isShoRole && record.current_status === 'PENDING_SHO');

    if (!canEdit) {
      log.warn('updateRecord: rejected — record status not editable for role', { recordId: id, currentStatus: record.current_status, role: user.role });
      throw new Error(`This record is currently in ${record.current_status} status and cannot be edited by role ${user.role}.`);
    }

    const recordType = record.record_type;
    const detailTable = mapper.DETAIL_TABLES[recordType];
    const registry = await mapper.loadRegistry(trx, recordType);

    const { data: oldFlatData, persons: oldRecomposedPersons, properties: oldRecomposedProperties } = await mapper.recomposeRecord(trx, registry, recordType, {
      spineRow: record, detailRow: oldDetail, personRows: oldPersonRows, propertyRows: oldPropertyRows,
      offenceRows: full.offenceRows, locationsById: full.locationsById,
    });

    const split = await mapper.splitPayload(trx, registry, recordType, {
      data, persons: persons ?? [], properties: properties ?? [], offences: offences ?? [],
    }, record.ps_id);
    log.debug('updateRecord: split payload into typed shape', {
      recordId: id, recordType, personEntries: split.personEntries.length, propertyEntries: split.propertyEntries.length, offenceRows: split.offenceRows.length,
    });

    if (isDistrictRole && 'is_worked_out' in split.detail) {
      const oldVal = oldDetail?.is_worked_out;
      const newVal = split.detail.is_worked_out;
      if (newVal !== undefined && Boolean(newVal) !== Boolean(oldVal)) {
        log.warn('updateRecord: rejected — district users cannot update workout status directly', { recordId: id });
        throw Object.assign(new Error('District users cannot update workout status directly as evidence is required from the police station. Please send the record back to the station for workout status updates.'), { status: 403 });
      }
    }

    if (isDistrictRole && record.current_status === 'DISTRICT_REVIEW') {
      const disallowed = [];
      for (const f of registry) {
        if (!(f.field_key in data)) continue;
        const oldVal = oldFlatData[f.field_key];
        const newVal = data[f.field_key];
        const changed = JSON.stringify(oldVal ?? null) !== JSON.stringify(newVal ?? null);
        if (!changed) continue;
        const allowedLevels = Array.isArray(f.editable_by_levels) ? f.editable_by_levels : [];
        if (!allowedLevels.includes('DISTRICT')) {
          disallowed.push(f.labels?.en || f.field_key);
        }
      }

      let personsChanged = false;
      if (persons !== undefined) {
        if (persons.length !== (oldRecomposedPersons || []).length) {
          personsChanged = true;
        } else {
          for (const pNew of persons) {
            const pOld = (oldRecomposedPersons || []).find(p => p.id === pNew.id);
            if (!pOld || pOld.person_type !== pNew.person_type) { personsChanged = true; break; }
            for (const key of Object.keys(pNew.data || {})) {
              if (JSON.stringify(pNew.data[key] ?? null) !== JSON.stringify(pOld.data?.[key] ?? null)) {
                personsChanged = true; break;
              }
            }
            if (personsChanged) break;
          }
        }
      }

      let propertiesChanged = false;
      if (properties !== undefined) {
        if (properties.length !== (oldRecomposedProperties || []).length) {
          propertiesChanged = true;
        } else {
          for (const pNew of properties) {
            const pOld = (oldRecomposedProperties || []).find(p => p.id === pNew.id);
            if (!pOld) { propertiesChanged = true; break; }
            const keys = new Set([...Object.keys(pNew), ...Object.keys(pOld)]);
            for (const key of keys) {
              if (key === 'id') continue;
              if (JSON.stringify(pNew[key] ?? null) !== JSON.stringify(pOld[key] ?? null)) {
                propertiesChanged = true; break;
              }
            }
            if (propertiesChanged) break;
          }
        }
      }

      if (personsChanged) disallowed.push('Person / Arrestee / Victim / Accused details');
      if (propertiesChanged) disallowed.push('Property / Recovered Item details');

      if (disallowed.length > 0) {
        log.warn('updateRecord: rejected — district review may only edit Acts/Sections, Major/Minor/Local Head', { recordId: id, disallowedFields: disallowed });
        throw Object.assign(new Error(`During District review, you can only edit Acts & Sections, Major/Minor Head, and Local Head. The following change(s) are not allowed here — please Send Back for Correction instead: ${disallowed.join(', ')}.`), { status: 403 });
      }
    }

    const statusChanges = await detectDetailStatusChanges(oldDetail, split.detail, detailTable);

    const detailLocationIds = {};
    for (const [slot, cols] of Object.entries(split.detailLocationFields)) {
      const col = mapper.DETAIL_LOCATION_SLOTS[slot]?.[recordType];
      const existingLocId = col && oldDetail ? oldDetail[col] : null;
      detailLocationIds[slot] = await upsertLocation(trx, existingLocId, cols);
    }
    for (const [slot, locId] of Object.entries(detailLocationIds)) {
      const col = mapper.DETAIL_LOCATION_SLOTS[slot]?.[recordType];
      if (col) split.detail[col] = locId;
    }

    // C8 (2026-07-26, user ruling): recompute fir_year on every CASE update, not just create —
    // an edit can change fir_no or fir_date after the record already exists. Uses the MERGED
    // final values (this update's split.detail if it touched the field, else the existing
    // oldDetail row) so an edit to an unrelated field doesn't wrongly null out an already-correct
    // fir_year. Idempotent/deterministic (P2.2) — safe to recompute unconditionally every update.
    if (detailTable === 'fir_details') {
      const mergedFirNo = 'fir_no' in split.detail ? split.detail.fir_no : oldDetail?.fir_no;
      const mergedFirDate = 'fir_date' in split.detail ? split.detail.fir_date : oldDetail?.fir_date;
      const firYear = deriveFirYear(mergedFirNo, mergedFirDate, record.record_date);
      if (firYear != null) split.detail.fir_year = firYear;

      if (mergedFirNo && String(mergedFirNo).trim().length > 0) {
        const cleanFirNo = String(mergedFirNo).trim();
        const existingDup = await trx('fir_details')
          .whereRaw('LOWER(TRIM(fir_no)) = LOWER(TRIM(?))', [cleanFirNo])
          .whereNot({ record_id: id })
          .first();
        if (existingDup) {
          log.warn('updateRecord: rejected — duplicate fir_no', { recordId: id, firNo: cleanFirNo, existingRecordId: existingDup.record_id });
          const err = new Error(`FIR Number "${cleanFirNo}" is already registered on another FIR record.`);
          err.status = 409;
          throw err;
        }
      }

      const currentCaseStatus = 'case_status' in split.detail ? split.detail.case_status : oldDetail?.case_status;
      const currentCaseStatusUpper = String(currentCaseStatus || '').toUpperCase().trim();
      const PENDING_STATUSES = ['PENDING', 'PENDING_INVESTIGATION', 'UNDER_INVESTIGATION'];

      if (split.detail.is_worked_out === true || split.detail.is_worked_out === 'true') {
        if (!currentCaseStatus || PENDING_STATUSES.includes(currentCaseStatusUpper) || currentCaseStatusUpper.includes('PENDING')) {
          log.warn('updateRecord: rejected — cannot mark worked out when case status is pending or missing', { recordId: id, currentCaseStatus });
          throw Object.assign(new Error('A case cannot be marked as worked out if the case status is pending or missing.'), { status: 422 });
        }
      }

      if (!currentCaseStatus || PENDING_STATUSES.includes(currentCaseStatusUpper) || currentCaseStatusUpper.includes('PENDING')) {
        split.detail.is_worked_out = false;
      }

      const isChargesheetOrJclStatus = (statusVal) => {
        if (!statusVal) return false;
        const u = String(statusVal).toUpperCase().trim();
        return ['CHARGE SHEET', 'POLICE INVESTIGATION REPORT(PIR-JCL)', 'POLICE INVESTIGATION REPORT (PIR-JCL)', 'PIR-JCL', 'JCL', 'CHARGESHEETED', 'CHALLAN', 'SUPPLEMENTARY CHARGESHEET'].includes(u) || u.includes('CHARGE SHEET') || u.includes('JCL');
      };

      if (isChargesheetOrJclStatus(currentCaseStatus)) {
        if (!split.detail.sent_to_court_date && !oldDetail?.sent_to_court_date) {
          split.detail.sent_to_court_date = split.detail.date_of_chargesheet || split.detail.chargesheet_date || new Date().toISOString().slice(0, 10);
        }
      }
      if (split.detail.date_of_chargesheet || split.detail.chargesheet_date) {
        split.detail.sent_to_court_date = split.detail.sent_to_court_date || split.detail.date_of_chargesheet || split.detail.chargesheet_date;
        split.detail.date_of_chargesheet = split.detail.date_of_chargesheet || split.detail.chargesheet_date || split.detail.sent_to_court_date;
        split.detail.chargesheet_date = split.detail.chargesheet_date || split.detail.date_of_chargesheet || split.detail.sent_to_court_date;
      } else if (split.detail.sent_to_court_date) {
        split.detail.date_of_chargesheet = split.detail.sent_to_court_date;
        split.detail.chargesheet_date = split.detail.sent_to_court_date;
      }
      log.debug('updateRecord: derived fir_year', { recordId: id, firNo: mergedFirNo, firDate: mergedFirDate, firYear });
    }

    if (oldDetail) {
      await trx(detailTable).where({ record_id: id }).update({ ...split.detail, extra: JSON.stringify(split.detailExtra), updated_at: trx.fn.now() });
      log.debug('updateRecord: updated detail row', { recordId: id, detailTable });
    } else {
      await trx(detailTable).insert({ record_id: id, ...detailScopingColumns(recordType, record.ps_id), ...split.detail, extra: JSON.stringify(split.detailExtra) });
      log.debug('updateRecord: inserted detail row (was missing)', { recordId: id, detailTable });
    }

    // B3 fix (2026-07-23 bugfix batch): `split.personEntries` mixes TWO different kinds of
    // person rows — REPEATER roles (ARRESTEE/VICTIM/ACCUSED/WITNESS, sourced from the top-level
    // `persons[]` array param) and SINGLETON roles (COMPLAINANT/MISSING/DECEASED/INFORMANT/
    // CALLER, sourced from flat `data`, exactly like every other flat field). The `persons`
    // param existing as a gate ("only touch persons if the caller sent persons[]") is correct
    // for repeater roles — a caller that legitimately doesn't manage repeaters this round
    // shouldn't have them touched. It was WRONG applied to singleton roles: UIDB/MISSING (and
    // any record type's singleton-only roles) have NO repeater UI at all, so their edit
    // requests NEVER send a `persons` key — meaning `upsertPersons` never ran, so a
    // freshly-filled `deceased_name`/`mp_known`/etc never reached the DB, EVER, on any edit
    // after creation. `validateRequiredFields` then correctly saw the still-empty saved value
    // and rejected submit — a real, reproducible bug (verified live: creating a UIDB DRAFT with
    // `identified:false`, then calling `updateRecord` with `identified:true` + `deceased_name`
    // + `deceased_perm_same` set and NO `persons` key at all — matching what the UIDB edit form
    // actually sends — left `persons` in the DB empty and submit failed with "Missing required
    // fields before submit: Name of Deceased, Is Permanent Address same as Present Address?",
    // reproducing the exact tester-reported error). Fix: singleton-role entries are reconciled
    // UNCONDITIONALLY every update (same as createRecord's insertRecordCore always does) —
    // the `persons` gate now applies ONLY to the repeater subset, its original intent.
    const singletonEntries = split.personEntries.filter((e) => e.sourceKind !== 'repeater');
    const repeaterEntries = split.personEntries.filter((e) => e.sourceKind === 'repeater');
    const oldSingletonRows = oldPersonRows.filter((p) => !mapper.REPEATER_ROLES.has(p.role));
    const oldRepeaterRows = oldPersonRows.filter((p) => mapper.REPEATER_ROLES.has(p.role));

    await upsertPersons(trx, id, singletonEntries, oldSingletonRows);
    log.debug('updateRecord: reconciled singleton-role persons (always, regardless of persons[] param)', {
      recordId: id, singletonEntryCount: singletonEntries.length, oldSingletonCount: oldSingletonRows.length,
    });

    const personIdBySourceIndex = persons !== undefined
      ? await upsertPersons(trx, id, repeaterEntries, oldRepeaterRows)
      : {};
    if (persons === undefined) log.debug('updateRecord: persons[] not provided — repeater-role persons (ARRESTEE/VICTIM/ACCUSED/WITNESS) left untouched', { recordId: id });

    let propertyStatusChanges = [];
    if (properties !== undefined) {
      const result = await upsertProperties(trx, id, split.propertyEntries, oldPropertyRows, personIdBySourceIndex);
      propertyStatusChanges = result.statusChanges;
    } else {
      log.debug('updateRecord: properties not provided — left untouched', { recordId: id });
    }

    if (offences !== undefined || (data.act_name !== undefined || data.sections !== undefined)) {
      await replaceOffenceRows(trx, id, split.offenceRows);
    }

    if (recordType === 'ARREST') {
      const firNo = split.detail.fir_no || oldDetail?.fir_no;
      if (firNo) {
        await autoLinkArrestToCase(trx, id, record.ps_id, firNo, user);
      }
    }

    await trx('records').where({ id }).update({ updated_by: user.id, updated_at: trx.fn.now() });
    log.debug('updateRecord: updated records spine row', { recordId: id, updatedBy: user.id });

    const newFull = await fetchRecordFull(trx, id);
    const { data: newFlatData } = await mapper.recomposeRecord(trx, registry, recordType, {
      spineRow: newFull.record,
      detailRow: newFull.detail,
      personRows: newFull.personRows,
      propertyRows: newFull.propertyRows,
      offenceRows: newFull.offenceRows,
      locationsById: newFull.locationsById,
    });
    // Diff ONLY between the two registry-authoritative recomposed snapshots, NOT against the raw
    // client `data` payload. The client payload contains frontend-sync alias keys (e.g.
    // date_of_arrest, time_of_arrest, place_of_arrest, uid-as-UUID) that are not part of the
    // field_registry for the record's type. Merging them via { ...newFlatData, ...data } caused
    // those alias keys to appear in oldFlatData as absent (undefined → '') while the new side
    // had them as '' — producing empty→empty false-change rows in every revision log entry.
    // Using newFlatData alone (the post-save recomposed state) is correct: it is the canonical
    // shape recomposeRecord produces from the actual DB state after the writes committed.
    const diff = calculateDiff(oldFlatData, newFlatData);
    if (diff.length === 0 && statusChanges.length === 0 && propertyStatusChanges.length === 0) {
      log.info('updateRecord: no-op — nothing changed', { recordId: id });
      return { id, data: oldFlatData };
    }
    log.debug('updateRecord: computed diff', { recordId: id, changedFieldCount: diff.length, statusChanges: statusChanges.length, propertyStatusChanges: propertyStatusChanges.length });

    await writeRevision(trx, {
      recordId: id, changeType: 'UPDATE', level: record.current_level, changedBy: user.id, ipAddress, fieldChanges: diff,
    });
    for (const change of diff) {
      await writeAuditLog(trx, { recordId: id, action: 'UPDATE', user, fieldName: change.field_key, oldValue: change.old_value, newValue: change.new_value, ipAddress });
    }

    const effectiveDate = split.detail.worked_out_date || toISO(new Date().toISOString());
    await writeStatusEvents(trx, id, user, statusChanges, { effectiveDate });
    for (const c of propertyStatusChanges) {
      await writeStatusEvents(trx, id, user, [{ statusField: 'property_status', oldValue: c.oldValue, newValue: c.newValue }], {
        effectiveDate: toISO(new Date().toISOString()), propertyId: c.propertyId,
      });
    }

    return { id, data: { ...newFlatData, ...data } };
  });

  await eventBus.publish('record.updated', { record_id: id, changed_by: user.id });
  log.info('updateRecord: exit', { recordId: id, userId: user.id });
  return dbRecord;
  } catch (err) {
    log.error('updateRecord: failed', { recordId: id, userId: user.id, err });
    throw err;
  }
};

export const submitRecord = async (id, user, ipAddress) => {
  log.debug('submitRecord: enter', { recordId: id, userId: user.id });
  try {
    const record = await db('records').where({ id }).first();
    if (!record) { log.warn('submitRecord: rejected — record not found', { recordId: id }); throw new Error('Record not found'); }

    await db.transaction(async (trx) => {
      let full = await fetchRecordFull(trx, id);

      // Auto-complete 14-digit Statutory FIR Number if missing or non-14 digits before submission
      if (record.record_type === 'CASE' && full?.detail) {
        const currentFirNo = String(full.detail.fir_no || '').trim();
        if (!currentFirNo || !/^\d{14}$/.test(currentFirNo)) {
          const regType = full.detail.registration_type || 'MANUAL_CCTNS';
          const statutoryRes = await generateAndValidateStatutoryFir(trx, {
            psId: record.ps_id,
            registrationType: regType,
            recordDate: record.record_date,
            firDate: full.detail.fir_date,
            requestedFirNo: currentFirNo,
            requestedSerial: full.detail.fir_seq,
          });
          await trx('fir_details').where({ record_id: id }).update({
            fir_no: statutoryRes.firNo,
            registration_type: statutoryRes.registrationType,
            fir_year: statutoryRes.firYear,
            fir_seq: statutoryRes.firSeq,
            fir_type_prefix: statutoryRes.firTypePrefix,
            fir_ps_code: statutoryRes.firPsCode,
            is_legacy_format: false,
            updated_at: trx.fn.now(),
          });
          full = await fetchRecordFull(trx, id);
        }
      }

      const registry = await mapper.loadRegistry(trx, record.record_type);
      const { data: flatData, persons } = await mapper.recomposeRecord(trx, registry, record.record_type, {
        spineRow: record, detailRow: full.detail, personRows: full.personRows, propertyRows: full.propertyRows,
        offenceRows: full.offenceRows, locationsById: full.locationsById,
      });
      await validateRequiredFields(trx, record.record_type, flatData, { persons });
    });
    log.debug('submitRecord: full requiredness validation passed', { recordId: id, recordType: record.record_type });

    await transitionRecord(id, user, 'submit', null, null, ipAddress);
    log.info('submitRecord: exit', { recordId: id, userId: user.id });
  } catch (err) {
    log.error('submitRecord: failed', { recordId: id, userId: user.id, err });
    throw err;
  }
};

export const transitionRecord = async (id, user, action, comment, targetFields, ipAddress) => {
  log.debug('transitionRecord: enter', { recordId: id, action, userId: user.id });
  try {
    await db.transaction(async (trx) => {
      // SELECT ... FOR UPDATE serializes revision_number/prev_hash assignment for this record —
      // the single write path (ARCHITECTURE.md §4.2) now owns every change_type's revision write.
      const record = await trx('records').where({ id }).forUpdate().first();
      if (!record) { log.warn('transitionRecord: rejected — record not found', { recordId: id }); throw new Error('Record not found'); }
      assertNotFrozen(record);

      const fromStatus = record.current_status;
      const rule = await workflowEngine.getRule(trx, { fromStatus, action, recordType: record.record_type });
      workflowEngine.assertAllowed(rule, user);
      workflowEngine.assertComment(rule, comment);
      await workflowEngine.assertFieldsCorrected(trx, rule, record);
      const { toStatus: targetStatus, toLevel: targetLevel } = await workflowEngine.resolveTarget(trx, rule, record);
      log.debug('transitionRecord: workflow rule resolved', { recordId: id, action, fromStatus, targetStatus, targetLevel });

      await trx('records').where({ id }).update({
        current_status: targetStatus, current_level: targetLevel, updated_by: user.id, updated_at: trx.fn.now(),
      });
      log.info('transitionRecord: updated records spine (status/level)', { recordId: id, fromStatus, targetStatus, targetLevel });

      await trx('workflow_transitions').insert({
        id: uuidv4(), record_id: id, from_status: fromStatus, to_status: targetStatus,
        from_level: record.current_level, to_level: targetLevel, action: action.toUpperCase(),
        performed_by: user.id, performed_at: new Date().toISOString(), comment,
        target_fields: JSON.stringify(targetFields || []),
      });
      log.debug('transitionRecord: wrote workflow_transitions row', { recordId: id, action: action.toUpperCase() });

      await writeRevision(trx, {
        recordId: id, changeType: 'STATUS_CHANGE', level: targetLevel, changedBy: user.id, ipAddress,
        comment, fieldChanges: [{ field_key: 'current_status', old_value: fromStatus, new_value: targetStatus }],
      });

      await writeAuditLog(trx, { recordId: id, action: action.toUpperCase(), user, reason: comment, ipAddress });
    });

    // Named events for the three notifyHandler.js cares about (CLAUDE.md §8's "Active
    // events" list); everything else (compile, seal, jcp/scp-approve which are still
    // action='approve' and correctly hit the 'approved' branch, transfer_*, amendment_*)
    // falls through to the generic 'record.status_changed', matching the event catalog.
    const EVENT_NAME_BY_ACTION = { submit: 'submitted', approve: 'approved', send_back: 'sent_back' };
    const eventName = `record.${EVENT_NAME_BY_ACTION[action.toLowerCase()] || 'status_changed'}`;
    await eventBus.publish(eventName, { record_id: id, performed_by: user.id, comment });
    log.info('transitionRecord: exit', { recordId: id, action, eventName });
  } catch (err) {
    log.error('transitionRecord: failed', { recordId: id, action, userId: user.id, err });
    throw err;
  }
};

/**
 * District-level head override (item 4) — rewritten against `record_offences` (the old
 * implementation touched the dead `records.data` blob). Updates the record's single-head
 * classification: the `is_primary` `record_offences` row's major/minor head, and/or the
 * detail table's `local_head_id` (the PS-level classification, a separate fact — §2.7/§2.2).
 */
export const overrideCaseHead = async (id, user, newHead, reason, ipAddress) => {
  log.debug('overrideCaseHead: enter', { recordId: id, newHead, userId: user.id });
  if (!newHead) { log.warn('overrideCaseHead: rejected — missing newHead', { recordId: id }); throw new Error('New crime head classification is required'); }
  if (!reason || reason.trim().length < 10) { log.warn('overrideCaseHead: rejected — reason too short', { recordId: id, reasonLength: reason?.trim().length ?? 0 }); throw new Error('Justification reason must be at least 10 characters long'); }

  try {
    const result = await db.transaction(async (trx) => {
      const record = await trx('records').where({ id }).forUpdate().first();
      if (!record) { log.warn('overrideCaseHead: rejected — record not found', { recordId: id }); throw new Error('Record not found'); }
      assertNotFrozen(record);
      const detailTable = mapper.DETAIL_TABLES[record.record_type];

      const { id: newMajorHeadId } = await resolveMajorHead(trx, newHead);
      const { id: newLocalHeadId } = await resolveLocalHead(trx, newHead);
      log.debug('overrideCaseHead: resolved newHead against ref.*', { recordId: id, newHead, newMajorHeadId, newLocalHeadId });

      let oldValue = null;
      if (newMajorHeadId) {
        const primaryRow = await trx('record_offences').where({ record_id: id, is_primary: true }).first();
        if (primaryRow) {
          oldValue = primaryRow.major_head_id;
          await trx('record_offences').where({ id: primaryRow.id }).update({ major_head_id: newMajorHeadId, updated_at: trx.fn.now() });
          log.info('overrideCaseHead: updated primary record_offences row (major head)', { recordId: id, offenceId: primaryRow.id, oldValue, newMajorHeadId });
        } else {
          const offenceId = uuidv4();
          await trx('record_offences').insert({
            id: offenceId, record_id: id, major_head_id: newMajorHeadId, other_act_name: '(head override)', is_primary: true, sort_order: 0,
          });
          log.info('overrideCaseHead: inserted new primary record_offences row (major head)', { recordId: id, offenceId, newMajorHeadId });
        }
      } else if (newLocalHeadId) {
        const detailRow = await trx(detailTable).where({ record_id: id }).first();
        oldValue = detailRow?.local_head_id ?? null;
        await trx(detailTable).where({ record_id: id }).update({ local_head_id: newLocalHeadId, updated_at: trx.fn.now() });
        log.info('overrideCaseHead: updated detail row local_head_id', { recordId: id, detailTable, oldValue, newLocalHeadId });
      } else {
        log.warn('overrideCaseHead: rejected — newHead matched neither major nor local head', { recordId: id, newHead });
        throw new Error(`"${newHead}" did not match any known major head or local head classification`);
      }

      await writeRevision(trx, {
        recordId: id, changeType: 'HEAD_OVERRIDE', level: record.current_level, changedBy: user.id, ipAddress, reason,
        fieldChanges: [{ field_key: 'crime_head', old_value: oldValue ?? '', new_value: newHead }],
      });
      await writeAuditLog(trx, { recordId: id, action: 'OVERRIDE', user, fieldName: 'crime_head', oldValue, newValue: newHead, reason, ipAddress });

      return { id, newHead };
    });

    await eventBus.publish('record.overridden', { record_id: id, performed_by: user.id, reason });
    log.info('overrideCaseHead: exit', { recordId: id, newHead, userId: user.id });
    return result;
  } catch (err) {
    log.error('overrideCaseHead: failed', { recordId: id, newHead, userId: user.id, err });
    throw err;
  }
};

/**
 * Domain status update (item 9) — the officer-facing "update case/missing/uidb/PCR status,
 * or flip worked-out" action, distinct from workflow transitions. Writes the current-value
 * column AND a dated `record_status_events` row in one transaction (ruling 22).
 */
// property_status is per-property (not per-record-type — gated via propertyId below), so it
// lives outside STATUS_FIELD_DEFS but is still a legal statusField for this endpoint.
const VALID_FIELDS = [...STATUS_FIELD_DEFS.map((d) => d.statusField), 'property_status'];

export const updateDomainStatus = async (id, user, options = {}, ipAddress) => {
  const { statusField, newValue, effectiveDate, comment, propertyId } = options;
  const opts = options.opts || options;
  log.debug('updateDomainStatus: enter', { recordId: id, statusField, newValue, propertyId, userId: user?.id });
  if (statusField === 'is_worked_out' && ['DISTRICT_OFFICER', 'DISTRICT'].includes((user?.role || '').toUpperCase())) {
    log.warn('updateDomainStatus: rejected — district users cannot update workout status directly', { recordId: id });
    throw Object.assign(new Error('District users cannot update workout status directly as evidence is required from the police station. Please send the record back to the station for workout status updates.'), { status: 403 });
  }
  if (!VALID_FIELDS.includes(statusField)) { log.warn('updateDomainStatus: rejected — unknown status_field', { recordId: id, statusField }); throw Object.assign(new Error(`Unknown status_field "${statusField}"`), { status: 422 }); }
  if (!newValue) { log.warn('updateDomainStatus: rejected — missing new_value', { recordId: id, statusField }); throw Object.assign(new Error('new_value is required'), { status: 422 }); }
  const effDate = toISO(effectiveDate);
  if (!effDate) { log.warn('updateDomainStatus: rejected — invalid effective_date', { recordId: id, effectiveDate }); throw Object.assign(new Error('A valid effective_date is required'), { status: 422 }); }
  if (effDate > toISO(new Date().toISOString())) { log.warn('updateDomainStatus: rejected — effective_date in future', { recordId: id, effDate }); throw Object.assign(new Error('effective_date cannot be in the future'), { status: 422 }); }
  if (statusField === 'property_status' && !propertyId) { log.warn('updateDomainStatus: rejected — property_status needs property_id', { recordId: id }); throw Object.assign(new Error('property_id is required for property_status updates'), { status: 422 }); }

  try {
    const result = await db.transaction(async (trx) => {
      const record = await trx('records').where({ id }).forUpdate().first();
      if (!record) { log.warn('updateDomainStatus: rejected — record not found', { recordId: id }); throw new Error('Record not found'); }
      assertNotFrozen(record);
      const detailTable = mapper.DETAIL_TABLES[record.record_type];

      let oldValue = null;
      if (statusField === 'property_status') {
        const prop = await trx('record_properties').where({ id: propertyId, record_id: id }).first();
        if (!prop) { log.warn('updateDomainStatus: rejected — property not found on record', { recordId: id, propertyId }); throw Object.assign(new Error('Property not found on this record'), { status: 404 }); }
        oldValue = prop.status;
        await trx('record_properties').where({ id: propertyId }).update({ status: newValue, updated_at: trx.fn.now() });
        log.info('updateDomainStatus: updated record_properties.status', { recordId: id, propertyId, oldValue, newValue });
      } else {
        // Gate by recordType FIRST (not just column presence) — arrest_details and fir_details
        // both happen to have a column literally named case_status, so a presence-only check would
        // silently let 'case_status' apply to ARREST and vice versa (the leak ruling 26 closes).
        const def = STATUS_FIELD_DEFS.find((d) => d.statusField === statusField);
        if (record.record_type !== def.recordType) {
          log.warn('updateDomainStatus: rejected — status_field does not apply to record type', { recordId: id, statusField, recordType: record.record_type });
          throw Object.assign(new Error(`"${statusField}" does not apply to record type ${record.record_type}`), { status: 422 });
        }
        const column = def.column;
        const detailRow = await trx(detailTable).where({ record_id: id }).first();
        if (!detailRow || !(column in detailRow)) {
          log.warn('updateDomainStatus: rejected — target column absent on detail row', { recordId: id, statusField, detailTable, column });
          throw Object.assign(new Error(`"${statusField}" does not apply to record type ${record.record_type}`), { status: 422 });
        }

        const CHARGESHEET_STATUS_LIST = ['CHARGE SHEET', 'POLICE INVESTIGATION REPORT(PIR-JCL)', 'SUPPLEMENTARY CHARGESHEET'];
        const IS_COURT_FIELD = ['sent_to_court_date', 'court_case_no', 'court_name', 'court_disposal_type', 'court_disposal_date'].includes(statusField);
        if (IS_COURT_FIELD && record.record_type === 'CASE') {
          const currentCaseStatus = String(detailRow.case_status || '').toUpperCase();
          if (!CHARGESHEET_STATUS_LIST.includes(currentCaseStatus)) {
            log.warn('updateDomainStatus: rejected — court status requires chargesheet', { recordId: id, currentCaseStatus });
            throw Object.assign(new Error('Court & Judicial Status cannot be updated until a Chargesheet or Supplementary Chargesheet has been filed for this case.'), { status: 422 });
          }
        }

        if (statusField === 'is_worked_out') {
          const userRole = (user?.role || '').toUpperCase();
          const isDistrictRole = ['DISTRICT_OFFICER', 'DISTRICT', 'DISTRICT_ADMIN', 'DISTRICT_USER'].includes(userRole) || userRole.includes('DISTRICT');
          if (isDistrictRole) {
            log.warn('updateDomainStatus: rejected — district role cannot update workout status', { recordId: id, statusField, userRole });
            throw Object.assign(new Error('Workout status can only be updated by the Police Station with physical evidence. Send record back for update.'), { status: 403 });
          }

          const currentCaseStatus = String(detailRow?.case_status || '').toUpperCase().trim();
          const PENDING_STATUSES = ['PENDING', 'PENDING_INVESTIGATION', 'UNDER_INVESTIGATION'];
          if ((newValue === true || newValue === 'true') && (!detailRow?.case_status || PENDING_STATUSES.includes(currentCaseStatus) || currentCaseStatus.includes('PENDING'))) {
            log.warn('updateDomainStatus: rejected — cannot mark worked out when case status is pending or missing', { recordId: id, currentCaseStatus });
            throw Object.assign(new Error('A case cannot be marked as worked out if the case status is pending or missing.'), { status: 422 });
          }
        }
        oldValue = detailRow[column];
        const coerced = statusField === 'is_worked_out' ? (newValue === 'true' || newValue === true) : newValue;
        const updatePayload = { [column]: coerced, updated_at: trx.fn.now() };

        if (statusField === 'is_worked_out' && coerced === true) updatePayload.worked_out_date = effDate;

        const coercedUpper = String(coerced).toUpperCase().trim();
        if (statusField === 'case_status') {
          const PENDING_STATUSES = ['PENDING', 'PENDING_INVESTIGATION', 'UNDER_INVESTIGATION'];
          if (!coerced || PENDING_STATUSES.includes(coercedUpper) || coercedUpper.includes('PENDING')) {
            updatePayload.is_worked_out = false;
          }
        }

        if (statusField === 'case_status' && CHARGESHEET_STATUS_LIST.includes(coercedUpper)) {
          if (detailTable === 'fir_details' && !detailRow.sent_to_court_date) {
            updatePayload.sent_to_court_date = effDate || trx.fn.now();
          }
        }

        // Support additional court/supplementary/transfer fields if passed in options payload
        if (statusField === 'case_status' && coercedUpper === 'SUPPLEMENTARY CHARGESHEET') {
          const suppDetails = opts.supplementary_chargesheet_details || opts.supplementaryDetails;
          if (suppDetails) updatePayload.supplementary_chargesheet_details = suppDetails;
        }

        if (statusField === 'case_status' && (coercedUpper === 'TRANSFER' || coercedUpper === 'TRANSFERRED' || opts.transfer_to_type)) {
          const tType = opts.transfer_to_type || opts.transferToType || (opts.transferred_to_ps_id ? 'PS' : (opts.transferred_to_agency_id ? 'AGENCY' : null));
          if (tType) updatePayload.transfer_to_type = tType;
          if (opts.transferred_to_ps_id) updatePayload.transferred_to_ps_id = opts.transferred_to_ps_id;
          if (opts.transferred_to_agency_id) updatePayload.transferred_to_agency_id = opts.transferred_to_agency_id;
          updatePayload.date_of_transfer = opts.date_of_transfer || effDate;
        }

        if (opts.court_case_no) updatePayload.court_case_no = opts.court_case_no;
        if (opts.court_name) updatePayload.court_name = opts.court_name;
        if (opts.court_disposal_date) updatePayload.court_disposal_date = opts.court_disposal_date;
        if (opts.sent_to_court_date && !detailRow.sent_to_court_date) updatePayload.sent_to_court_date = opts.sent_to_court_date;

        await trx(detailTable).where({ record_id: id }).update(updatePayload);
        log.info('updateDomainStatus: updated detail row status column', { recordId: id, detailTable, column, oldValue, newValue: coerced });
      }

      const statusEventId = uuidv4();
      await trx('record_status_events').insert({
        id: statusEventId, record_id: id, property_id: statusField === 'property_status' ? propertyId : null,
        status_field: statusField, old_value: oldValue === null ? null : String(oldValue), new_value: String(newValue),
        effective_date: effDate, changed_by: user.id, changed_at: new Date().toISOString(), comment: comment || null,
      });
      log.debug('updateDomainStatus: wrote record_status_events row', { recordId: id, statusEventId, statusField });

      await writeRevision(trx, {
        recordId: id, changeType: 'STATUS_CHANGE', level: record.current_level, changedBy: user.id, ipAddress, comment,
        fieldChanges: [{ field_key: statusField, old_value: oldValue ?? '', new_value: newValue }],
      });
      await writeAuditLog(trx, { recordId: id, action: 'STATUS_UPDATE', user, fieldName: statusField, oldValue, newValue, reason: comment, ipAddress });

      return { id, statusField, newValue, effectiveDate: effDate };
    });

    await eventBus.publish('record.updated', { record_id: id, changed_by: user.id });
    log.info('updateDomainStatus: exit', { recordId: id, statusField, newValue, userId: user.id });
    return result;
  } catch (err) {
    log.error('updateDomainStatus: failed', { recordId: id, statusField, userId: user.id, err });
    throw err;
  }
};

/**
 * `GET /records/:id/status-options` (WS8) — tells the frontend modal which domain-status
 * field(s) this record's type can have updated via `updateDomainStatus`, and their option
 * lists, WITHOUT the frontend hardcoding either the field set or the vocabulary (baseline P4).
 * Field set + column resolution come from `STATUS_FIELD_DEFS`, the exact same source of truth
 * `updateDomainStatus` gates against — this endpoint can never drift out of sync with what the
 * PATCH actually accepts. `property_status` is per-property, not per-record, so it is
 * deliberately excluded here (v1 is record-level only; a future property-status affordance
 * would live on the property row, not this endpoint).
 *
 * Options come from ONE of two sources, never a locally-hardcoded copy:
 *   - CASE's `case_status` and `is_worked_out` are genuinely registry-sourced: read from
 *     `field_registry.options` for the registry field whose resolved storage shape matches the
 *     target {detailTable, column} (`config/fields/case.json` carries real `options` arrays for
 *     both).
 *   - ARREST/PCR_CALL/MISSING/UIDB's `status`-backed fields are NOT registry-sourced —
 *     `common.json`'s per_type `"status"` field carries no `options` array at all, because
 *     field_registry has no way to express "this one field_key has a different vocabulary per
 *     record_type, and for ARREST, per case-basis too". That vocabulary is (and always was) code,
 *     living in `fields.controller.js`'s `getFieldsForForm` (what the intake form offers at
 *     creation). `getStatusOptionsForType` (`modules/fields/statusOptions.config.js`) is that
 *     dispatch extracted into one shared module BOTH `getFieldsForForm` and this function import
 *     — never a second copy — so an officer can never be offered, on edit, a status value the
 *     intake form wouldn't have offered at creation, and vice versa.
 */
export const getStatusOptions = async (id, user = null) => {
  const record = await db('records').where({ id }).first();
  if (!record) { const err = new Error('Record not found'); err.status = 404; throw err; }

  const userRole = (user?.role || '').toUpperCase();
  const isDistrictRole = ['DISTRICT_OFFICER', 'DISTRICT', 'DISTRICT_ADMIN', 'DISTRICT_USER'].includes(userRole) || userRole.includes('DISTRICT');

  const detailTable = mapper.DETAIL_TABLES[record.record_type];
  const detailRow = await db(detailTable).where({ record_id: id }).first();
  const registry = await mapper.loadRegistry(db, record.record_type);

  const STATUS_UPDATE_FIELDS = ['case_status', 'is_worked_out', 'court_disposal_type', 'custody_status', 'missing_status', 'uidb_status', 'final_call_status'];
  const applicableDefs = STATUS_FIELD_DEFS.filter((d) => d.recordType === record.record_type && STATUS_UPDATE_FIELDS.includes(d.statusField));

  const fields = applicableDefs.map((def) => {
    const regField = registry.find((f) => {
      const shape = mapper.resolveStorage(f.storage, record.record_type);
      return shape && typeof shape === 'object' && shape.table === detailTable && shape.column === def.column;
    });

    const isBoolean = def.valueType === 'boolean';
    const rawCurrent = detailRow ? detailRow[def.column] : null;

    let options;
    if (isBoolean) {
      options = [{ value: true, label: 'Yes' }, { value: false, label: 'No' }];
    } else if (def.statusField === 'court_disposal_type') {
      options = [
        { value: 'PENDING_TRIAL', label: 'PENDING_TRIAL', label_en: 'Pending Trial', label_hi: 'मुकदमा लंबित (Pending Trial)' },
        { value: 'CONVICTED', label: 'CONVICTED', label_en: 'Convicted', label_hi: 'दोषसिद्ध (Convicted)' },
        { value: 'ACQUITTED', label: 'ACQUITTED', label_en: 'Acquitted', label_hi: 'दोषमुक्त (Acquitted)' },
        { value: 'COMPOUNDED', label: 'COMPOUNDED', label_en: 'Compounded', label_hi: 'राजीनामा (Compounded)' },
        { value: 'DISCHARGED', label: 'DISCHARGED', label_en: 'Discharged', label_hi: 'डिस्चार्ज (Discharged)' },
      ];
    } else if (record.record_type === 'CASE') {
      options = (regField?.options || []).map((o) => ({ value: o.value, label: o.label_en || o.value, label_hi: o.label_hi }));
      if (def.statusField === 'case_status') {
        const hasSupp = options.some((o) => String(o.value).toUpperCase() === 'SUPPLEMENTARY CHARGESHEET');
        if (!hasSupp) {
          options.push({
            value: 'SUPPLEMENTARY CHARGESHEET',
            label: 'SUPPLEMENTARY CHARGESHEET',
            label_en: 'SUPPLEMENTARY CHARGESHEET',
            label_hi: 'पूरक आरोप पत्र (Supplementary Chargesheet)'
          });
        }
      }
    } else {
      const isAgainstFir = record.record_type === 'ARREST' ? detailRow?.is_dd_based === false : undefined;
      const raw = getStatusOptionsForType(record.record_type, { isAgainstFir }) || [];
      options = raw.map((o) => ({ value: o.value, label: o.label_en, label_hi: o.label_hi }));
    }

    const fieldLabel = def.statusField === 'court_disposal_type'
      ? 'Court & Judicial Status'
      : def.statusField === 'is_worked_out'
        ? 'Workout Status'
        : regField?.labels?.en || def.statusField;

    const entry = {
      status_field: def.statusField,
      label: fieldLabel,
      current_value: isBoolean ? (rawCurrent === null || rawCurrent === undefined ? false : !!rawCurrent) : (rawCurrent ?? null),
      options,
      value_type: isBoolean ? 'boolean' : 'enum',
      requires_effective_date: true,
    };
    if (def.statusField === 'is_worked_out') {
      entry.notes = 'A Yes/true value requires effective_date — it is stamped as fir_details.worked_out_date in the same transaction (ruling 23a).';
      const currentCaseStatus = String(detailRow?.case_status || '').toUpperCase().trim();
      const PENDING_STATUSES = ['PENDING', 'PENDING_INVESTIGATION', 'UNDER_INVESTIGATION'];
      if (!detailRow?.case_status || PENDING_STATUSES.includes(currentCaseStatus) || currentCaseStatus.includes('PENDING')) {
        entry.disabled = true;
        entry.disabled_reason = 'A case cannot be marked as worked out if the case status is pending or missing.';
      } else if (isDistrictRole) {
        entry.disabled = true;
        entry.disabled_reason = 'Workout status can only be updated by the Police Station with physical evidence. Send record back for update.';
      }
    }
    if (def.statusField === 'custody_status') {
      entry.notes = 'Maps to arrest_details.case_status (the literal arrest_details.custody_status column is dead/unused — see docs/new-db-integration/03-import.md deferrals). Option list depends on is_dd_based (ruling 18): ' +
        (detailRow?.is_dd_based === false ? 'this arrest is under a case/FIR (against-FIR list).' : 'this arrest is a standalone Kalandra (or is_dd_based is unset — Kalandra list, same fallback as the intake form).');
    }
    return entry;
  });

  return { record_id: id, record_type: record.record_type, is_frozen: !!record.is_frozen, fields };
};

export const getRecordRevisions = async (record_id) => {
  return db('record_revisions').where({ record_id }).orderBy('revision_number', 'asc');
};

/**
 * The ONLY mutator of `records.is_frozen` — the freeze half of the hash-chain break procedure
 * (DB_SCHEMA.md §9.4). Freeze/unfreeze is an audit-integrity fact, NOT a domain change: it
 * writes a single `audit_logs` row and deliberately does NOT extend the hash chain (writing a
 * revision in response to a break would be self-defeating). Called by the verification job on a
 * detected break (system actor) and by the privileged unfreeze endpoint after review. Never
 * gated by `assertNotFrozen` — this is the mechanism that lifts the freeze.
 */
export const setRecordFrozen = async (id, frozen, { user = null, reason = null } = {}) => {
  return db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).forUpdate().first();
    if (!record) { const err = new Error('Record not found'); err.status = 404; throw err; }
    if (!!record.is_frozen === !!frozen) return { id, is_frozen: !!frozen, changed: false };

    await trx('records').where({ id }).update({ is_frozen: !!frozen, updated_at: trx.fn.now() });
    await trx('audit_logs').insert({
      id: uuidv4(), table_name: 'records', record_id: id,
      action: frozen ? 'FREEZE' : 'UNFREEZE',
      changed_by_id: user?.id ?? null, changed_by_role: user?.role ?? 'SYSTEM',
      changed_at: new Date().toISOString(), field_name: 'is_frozen',
      old_value: JSON.stringify(!!record.is_frozen), new_value: JSON.stringify(!!frozen),
      reason: reason || null, ip_address: null,
    });
    return { id, is_frozen: !!frozen, changed: true };
  });
};

export const checkDuplicateRecord = async (recordType, firNumber, accusedName, date) => {
  const detailTable = mapper.DETAIL_TABLES[recordType.toUpperCase()];
  if (firNumber && firNumber.trim().length > 0 && detailTable) {
    const existing = await db('records')
      .join(`${detailTable} as d`, 'records.id', 'd.record_id')
      .where('records.record_type', recordType.toUpperCase())
      .andWhere('d.fir_no', firNumber)
      .select('records.id')
      .first();
    if (existing) return { isDuplicate: true, existingId: existing.id };
  }

  if (accusedName && date) {
    const existing = await db('records')
      .join('persons', 'persons.record_id', 'records.id')
      .where('records.record_type', recordType.toUpperCase())
      .andWhere('records.record_date', toISO(date) || date)
      .andWhere('persons.role', 'ACCUSED')
      .andWhere('persons.name', 'ILIKE', accusedName)
      .select('records.id')
      .first();
    if (existing) return { isDuplicate: true, existingId: existing.id };
  }

  return { isDuplicate: false };
};

/** Ad-hoc filter-spec search (used by the /records/search endpoint). Only spine-level
 * (typed, non-repeater) fields are supported today — person/property-scoped filters need
 * the same registry-driven resolution the mapper does and are explicitly out of scope for
 * this integration (see docs/new-db-integration/02-records-write-path.md deferrals). */
export const searchRecordsWithSpec = async (recordType, filterSpec, jurisdictionQuery = {}) => {
  let query = withListJoins(db('records'));
  if (jurisdictionQuery.ps_id) {
    query = query.where((b) => {
      b.where('records.ps_id', jurisdictionQuery.ps_id)
        .orWhere((tb) => {
          tb.where('fir.transfer_to_type', 'PS')
            .andWhere('fir.transferred_to_ps_id', jurisdictionQuery.ps_id);
        });
    });
  }
  if (jurisdictionQuery.district_id) query = query.where('records.district_id', jurisdictionQuery.district_id);
  if (jurisdictionQuery.sub_div_id) query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id);
  if (recordType && recordType !== 'ALL') query = query.where('records.record_type', recordType);

  const conditions = filterSpec?.conditions || [];
  for (const cond of conditions) {
    if (cond.field === 'current_status') query = query.where('records.current_status', cond.value);
    else if (cond.field === 'record_date') query = query.where('records.record_date', cond.operator || '=', cond.value);
    else {
      const err = new Error(`Filter field "${cond.field}" is not supported yet — only current_status/record_date filters are typed-schema-ready in this integration.`);
      err.status = 400;
      throw err;
    }
  }

  const rawRecords = await query.orderBy('records.created_at', 'desc');
  return rawRecords.map((r) => ({ ...r, data: buildListSummary(r) }));
};

export const deleteRecord = async (id, user) => {
  await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).forUpdate().first();
    if (!record) { const err = new Error('Record not found'); err.status = 404; throw err; }
    assertNotFrozen(record);
    if (record.current_status !== 'DRAFT') { const err = new Error('Only DRAFT records can be deleted'); err.status = 400; throw err; }
    // Detail/persons/properties/offences/revisions/transitions cascade on record_id, but three
    // tables reference records(id) WITHOUT ON DELETE CASCADE (verified: record_links source/target,
    // record_transfers.record_id, record_amendments.record_id — all confdeltype='a'/NO ACTION). In
    // particular linkResolver links an against-FIR ARREST to its CASE on record.created — while the
    // arrest is still DRAFT — so an ordinary deletable DRAFT arrest usually HAS a record_links row.
    // Without this cleanup the `DELETE FROM records` below throws a raw FK violation surfaced as an
    // opaque 500 ("unable to delete arrest record", 2026-07-20). Remove those references first, in
    // the same transaction, so the delete succeeds atomically.
    await trx('record_links').where({ source_record_id: id }).orWhere({ target_record_id: id }).del();
    await trx('record_transfers').where({ record_id: id }).del();
    await trx('record_amendments').where({ record_id: id }).del();
    await trx('records').where({ id }).delete(); // cascades detail/persons/properties/offences/revisions/transitions
    await writeAuditLog(trx, { recordId: id, action: 'DELETE', user });
  });
  await eventBus.publish('record.deleted', { record_id: id, performed_by: user.id });
};

export const resolveStatutoryPrefix = async ({ psId, registrationType, recordDate }) => {
  const jur = await resolveJurisdictionPrefix(db, { psId, registrationType });
  if (!jur.isAllowed) {
    const err = new Error(jur.error);
    err.status = 422;
    throw err;
  }

  const dateObj = recordDate ? new Date(recordDate) : new Date();
  const year4 = isNaN(dateObj.getFullYear()) ? new Date().getFullYear() : dateObj.getFullYear();
  const year2 = String(year4).slice(-2);
  const nextSerial = await getNextFirSerial(db, { psId, registrationType, year4 });
  const sampleFirNo = `${jur.prefix8}${year2}${String(nextSerial).padStart(4, '0')}`;

  return {
    ...jur,
    year4,
    year2,
    nextSerial,
    sampleFirNo,
  };
};

export const getAllowedStatutoryTypes = async (psId) => {
  return getAllowedRegistrationTypes(db, psId);
};
