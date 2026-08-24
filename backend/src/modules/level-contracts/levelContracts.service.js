import db from '../../config/db.js';
import { ROLE_LEVELS } from '../../utils/generateToken.js';
import { getLogger } from '../../utils/logger.js';

// Logging-instrumentation-2026-07-22 (B5): matches records.service.js style. HANDOFF §5 calls
// this module out specifically: "level-contracts: log ... masking decisions applied" — masking
// silently no-opped for a long time before Integration 5 (see the module header comment above),
// so every masking decision (contract resolved, fallback used, no-contract fail-open) is logged.
const log = getLogger('levelContracts.service');

// ── config-as-data: level_data_contracts rows are SYNCED from config/contracts/*.json
// (npm run sync-config, upsert key = `code`). This module is read-only over the API —
// createContract/updateContract were deleted (see levelContracts.controller.js): writing
// rows here would (a) violate the NOT NULL `code` sync key with no value ever supplied by
// the old API payload, and (b) be silently clobbered/deactivated by the next sync-config
// run anyway, since sync-config treats config/ as the sole source of truth (config/README.md).
// To change a contract: edit config/contracts/*.json and run `npm run sync-config`.

export const parseArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (typeof val === 'string') {
      if (val.startsWith('{') && val.endsWith('}')) {
        return val.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      }
      return val.split(',').map(s => s.trim());
    }
    return [];
  }
};

export const getContracts = async () => {
  log.debug('getContracts: enter');
  const list = await db('level_data_contracts').orderBy('updated_at', 'desc');
  const result = list.map(item => ({
    ...item,
    visible_field_keys: parseArray(item.visible_field_keys),
    aggregate_definitions: typeof item.aggregate_definitions === 'string'
      ? JSON.parse(item.aggregate_definitions || '[]')
      : item.aggregate_definitions
  }));
  log.debug('getContracts: exit', { count: result.length });
  return result;
};

let contractsCache = null;
let contractsCacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

async function getAllActiveContracts() {
  const now = Date.now();
  if (contractsCache && (now - contractsCacheTime < CACHE_TTL_MS)) {
    return contractsCache;
  }
  const list = await db('level_data_contracts').where({ is_active: true });
  contractsCache = list;
  contractsCacheTime = now;
  return contractsCache;
}

export function invalidateContractsCache() {
  contractsCache = null;
}

async function findActiveContract(recordType, toLevel) {
  const allContracts = await getAllActiveContracts();
  const contract = allContracts.find(c => 
    c.to_level === toLevel &&
    c.is_active &&
    (c.record_type === recordType || c.record_type === '*')
  );
  return contract;
}

// JCP/SCP sit between DISTRICT and HQ in the OPS_CHAIN (workflow: JCP_REVIEW ->
// SCP_REVIEW -> HQ_RECEIVED) but the only two synced contracts today target `to_level`
// DISTRICT and HQ (config/contracts/ops_chain.json) — neither is JCP nor SCP, so an exact
// `to_level` match resolves to nothing and masking silently no-ops for those two roles.
// Bridge them onto the HQ contract (the next real link past JCP/SCP in the chain) rather
// than leaving them unmasked. Scoped to JCP/SCP only — NOT a general "round up to the next
// higher contract" rule, so ACP/SUB_DIV's existing (unmasked, no contract authored for
// SUB_DIV) behavior is left exactly as it was; see the future-improvements note in the
// session report about generalizing this once JCP/SCP get their own contract rows.
const LEVEL_FALLBACK = { JCP: 'HQ', SCP: 'HQ' };

// ── masking ──────────────────────────────────────────────────────────────────────────
//
// Real shapes being masked (records.service.js `listRecords` / `getRecordDetails`,
// records.mapper.js `recomposeRecord` — records.data jsonb does NOT exist):
//
//  - listRecords() row: raw `records.*` spine columns spread flat onto the row, PLUS a
//    handful of joined display columns (ps_name/district_name/creator_name/io_name,
//    fir_no/case_status/is_worked_out/case_local_head, arrest_fir_no/arrest_case_status/
//    arrest_local_head, final_call_status/call_head, missing_fir_no/missing_status,
//    uidb_no/uidb_status/uidb_local_head), PLUS a small nested `data` object
//    (buildListSummary()) carrying a per-record-type SUBSET of those same values under
//    normalized keys (fir_no/case_status/local_head/is_worked_out/io_name/etc — "named
//    cases for UI compatibility").
//  - getRecordDetails() response: `{ record, revisions, transitions, status_events,
//    linkedRecords, persons, properties, offences }`. `record` is the spine row (+
//    ps_name/district_name) with a `data` object built by `recomposeRecord` — a FLAT
//    object keyed by `field_registry.field_key` (this is the one shape whose keys line
//    up 1:1 with a contract's `visible_field_keys`). `persons` is `[{id, person_type,
//    data: {field_key: value}}]` (repeater roles only — VICTIM/ARRESTEE/ACCUSED/WITNESS);
//    singleton person roles are already flattened into `record.data` by the mapper.
//    `properties` is `[{id, person_id, person_index, field_key: value, ...}]`.
//
// MASKING RULE (documented here, not scattered):
//  1. Structural keys (ids, record_type, workflow/queue status, scoping ids, dates,
//     provenance, audit/workflow arrays) are ALWAYS visible regardless of contract —
//     masking must never break list rendering, queue filtering, or the workflow/audit
//     trail. See STRUCTURAL_RECORD_KEYS / PERSON_STRUCTURAL_KEYS / PROPERTY_STRUCTURAL_KEYS
//     / OFFENCE_STRUCTURAL_KEYS below.
//  2. Every other key is a domain data key. It survives only if its NAME is present in
//     the contract's `visible_field_keys`. This applies uniformly to: `record.data`,
//     each `persons[i].data`, each `properties[i]` (minus its structural keys), and —
//     for listRecords rows only — the top-level joined display columns and the nested
//     `data` summary object (both use the same, mostly field_registry-aligned names).
//  3. Arrays are never dropped wholesale: an entity's structural identity (id/
//     person_type/person_id) always survives; only its non-structural content is
//     filtered. If a contract lists none of a person/property's field keys, that array
//     item degrades to `{id, person_type, data: {}}` / `{id, person_id, person_index}` —
//     present, but contentless. `offences[]` gets the same treatment keyed off the
//     `data.*` field it feeds (see OFFENCE_COLUMN_TO_DATA_KEY) since it has no
//     field_registry keys of its own. `revisions`/`transitions`/`status_events`/
//     `linkedRecords` are left untouched (append-only audit trail + cross-record
//     references, not field_registry data).
//  4. Unchanged defaults: PS-level roles (HC/SHO) and SYSTEM_ADMIN always see full
//     detail; if no active contract matches (to_level, record_type|'*'), no masking is
//     applied (fail open exactly as before — an admin who forgets to author a contract
//     for a new level doesn't accidentally lock everyone out).
//
// ⚠ SCOPE UPDATE (2026-07-26, bugfix C1) — READ BEFORE ACTING ON THE NOTES BELOW.
// Masking with a curated key list now applies to **HQ only**. DISTRICT / JCP / SCP each carry a
// `["*"]` wildcard contract (config/contracts/ops_chain.json) because they are *approval* steps —
// they cannot approve a record they cannot read. Before this change, DISTRICT's contract listed
// 23 keys and a DCP reviewing an approved record saw act/section, major/minor head, the whole
// occurrence block, and every complainant/victim/accused/property as EMPTY — reported as a bug,
// root-caused to exactly this contract (the tester's own logs show `visibleKeyCount:23`). The
// contracts were authored as stubs back when masking was a silent no-op, and Integration 5 turned
// masking on without revisiting them. ACP/SUB_DIV still has no contract at all (fail-open).
// Consequence: the three notes below now describe HQ_ANALYST/HQ_ADMIN behaviour only.
//
// KNOWN CONFIG MISMATCH (reported, not patched here per architect ruling — verified
// against config/fields/common.json + config/fields/case.json, not just guessed at):
//  - CASE has NO "status" field_key at all: common.json's "status" field_key's
//    `record_types` is only [ARREST, PCR_CALL, MISSING, UIDB] (per_type storage to
//    arrest_details.case_status / pcr_call_details.final_call_status / etc — this part
//    DOES round-trip correctly to `data.status` for those 4 types). CASE instead has its
//    OWN "case_status" field_key in case.json — a different name entirely. Since the
//    OPS_CHAIN contracts only ever list "status", CASE case_status is masked away for
//    DISTRICT/HQ/JCP/SCP on BOTH the list and detail read paths — a genuine
//    field_registry/contract naming gap, not a masking bug.
//  - Separately, on the LIST path only, `buildListSummary()` (records.service.js) never
//    reuses field_registry key names for status at all — it hardcodes `case_status`/
//    `arrest_case_status`/`final_call_status`/`missing_status`/`uidb_status` regardless of
//    type. So even ARREST/PCR_CALL/MISSING/UIDB — whose DETAIL view correctly exposes
//    `data.status` per the contract — still lose status visibility specifically on the
//    list view. `local_head` has no such problem (`buildListSummary` aliases it to
//    "local_head" consistently for CASE/ARREST/UIDB, matching field_registry).
//  - `visible_field_keys` also includes "arrested_name", which has never existed as a
//    field_registry key (the arrestee's name is split into arrested_first_name/middle/
//    last) — that contract entry is permanently inert.

const STRUCTURAL_RECORD_KEYS = new Set([
  'id', 'record_type', 'ps_id', 'district_id', 'sub_div_id', 'io_id', 'original_ps_id',
  'current_status', 'current_level', 'record_date',
  'is_frozen', 'is_legacy', 'source_system', 'legacy_ref',
  'imported_at', 'imported_by', 'import_batch_id',
  'created_by', 'updated_by', 'created_at', 'updated_at',
  'ps_name', 'district_name', 'creator_name',
  'fir_no', 'arrest_fir_no', 'missing_fir_no', 'uidb_no',
  'case_status', 'arrest_case_status', 'missing_status', 'uidb_status', 'final_call_status',
  'case_local_head', 'arrest_local_head', 'uidb_local_head', 'call_head',
  'data', // nested object — masked separately, never dropped wholesale
]);

const PERSON_STRUCTURAL_KEYS = new Set(['id', 'person_type', 'data']);
const PROPERTY_STRUCTURAL_KEYS = new Set(['id', 'person_id', 'person_index']);

// `offences` (record_offences rows + ref-joined labels, §2.7) is a SEPARATE array from
// `record.data` — but `recomposeRecord` folds the exact same citation content into
// `data.act_name`/`data.sections`/`data.major_heads`/`data.minor_heads` (and, for ARREST,
// `data.crime_head` off the primary row). Those `data.*` keys ARE masked; leaving the raw
// `offences[]` array untouched would let a JCP/SCP read the identical act/section/head
// detail straight past the mask on a parallel path. So each offence column is gated by
// whichever `data.*` key it feeds — never by an "offences" key of its own, since none
// exists in field_registry. `is_primary`/`sort_order`/ids stay structural (needed for the
// single-head-override UI regardless of contract).
const OFFENCE_STRUCTURAL_KEYS = new Set(['id', 'record_id', 'is_primary', 'sort_order', 'created_at', 'updated_at']);
const OFFENCE_COLUMN_TO_DATA_KEY = {
  act_id: 'act_name', other_act_name: 'act_name', act_label: 'act_name',
  section_id: 'sections', section_label: 'sections',
  major_head_id: 'major_heads', major_head_label: 'major_heads',
  minor_head_id: 'minor_heads', minor_head_label: 'minor_heads',
};

function maskOffenceRow(row, visibleKeys, recordType) {
  const out = {};
  for (const key of Object.keys(row)) {
    if (OFFENCE_STRUCTURAL_KEYS.has(key)) { out[key] = row[key]; continue; }
    const dataKey = OFFENCE_COLUMN_TO_DATA_KEY[key];
    if (!dataKey) continue; // unmapped/unknown column -> fail closed, drop it
    // ARREST's crime_head is literally the primary row's major_head_label (mapper.js) —
    // visibility via either key keeps that derivation from being a silent bypass either way.
    const grantedViaCrimeHead = dataKey === 'major_heads' && recordType === 'ARREST' && visibleKeys.includes('crime_head');
    if (visibleKeys.includes(dataKey) || grantedViaCrimeHead) out[key] = row[key];
  }
  return out;
}

function maskFlatBag(obj, visibleKeys) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    if (visibleKeys.includes(key)) out[key] = obj[key];
  }
  return out;
}

function maskRow(row, visibleKeys, structuralKeys) {
  const out = {};
  for (const key of Object.keys(row)) {
    if (key === 'data') continue; // handled below, once
    if (structuralKeys.has(key) || visibleKeys.includes(key)) out[key] = row[key];
  }
  if ('data' in row) out.data = maskFlatBag(row.data, visibleKeys);
  return out;
}

async function resolveMasking(recordType, user) {
  log.debug('resolveMasking: enter', { recordType, userId: user?.id, role: user?.role });
  if (!user || user.role === 'SYSTEM_ADMIN') {
    log.debug('resolveMasking: fail-open — no user or SYSTEM_ADMIN, full detail', { recordType, role: user?.role });
    return null;
  }
  const userLevel = ROLE_LEVELS[user.role];
  if (!userLevel || userLevel === 'PS') {
    log.debug('resolveMasking: fail-open — PS-level role always sees full detail', { recordType, role: user.role, userLevel });
    return null; // PS-level roles always see full detail
  }

  let contract = await findActiveContract(recordType, userLevel);
  if (!contract && LEVEL_FALLBACK[userLevel]) {
    log.debug('resolveMasking: no direct contract, trying JCP/SCP fallback', { recordType, userLevel, fallbackLevel: LEVEL_FALLBACK[userLevel] });
    contract = await findActiveContract(recordType, LEVEL_FALLBACK[userLevel]);
  }
  if (!contract) {
    log.debug('resolveMasking: fail-open — no contract authored for this level, no masking applied', { recordType, userLevel });
    return null; // no contract authored for this level => no masking (default)
  }
  const visibleKeys = parseArray(contract.visible_field_keys);
  // `["*"]` = "this level sees the whole record" (bugfix 2026-07-26 / C1). Authored as a
  // contract row rather than by deleting the row so the row's `aggregate_definitions` (and
  // the workflow engine's DIRECT_HQ route lookup, which reads these same rows) survive.
  // Review levels (DISTRICT/JCP/SCP) approve records — they cannot approve what they can't
  // read — so they carry a wildcard contract; HQ keeps a curated summary list (user ruling).
  if (visibleKeys.includes('*')) {
    log.debug('resolveMasking: exit — wildcard contract, full record visible', { recordType, userLevel, contractCode: contract.code });
    return null;
  }
  log.debug('resolveMasking: exit — masking active', { recordType, userLevel, contractCode: contract.code, visibleKeyCount: visibleKeys.length });
  return visibleKeys;
}

/** Masks one listRecords()/searchRecordsWithSpec() row (flat spine + joined display columns
 * + nested `data` summary). Used by records.controller.js getRecords/getQueue/searchRecords. */
export const maskRecordData = async (record, user) => {
  if (!record) return record;
  const visibleKeys = await resolveMasking(record.record_type, user);
  if (!visibleKeys) {
    return record;
  }
  return maskRow(record, visibleKeys, STRUCTURAL_RECORD_KEYS);
};

/** Fast batch masking for list views — resolves contract once per distinct record_type in the batch */
export const maskRecordDataBatch = async (records, user) => {
  if (!records || !records.length) return records || [];
  if (!user || user.role === 'SYSTEM_ADMIN' || ROLE_LEVELS[user.role] === 'PS') {
    return records;
  }

  const distinctTypes = [...new Set(records.map(r => r?.record_type).filter(Boolean))];
  const keysByType = new Map();
  let hasAnyMasking = false;

  for (const rType of distinctTypes) {
    const keys = await resolveMasking(rType, user);
    keysByType.set(rType, keys);
    if (keys) hasAnyMasking = true;
  }

  if (!hasAnyMasking) return records;

  return records.map((record) => {
    if (!record) return record;
    const visibleKeys = keysByType.get(record.record_type);
    if (!visibleKeys) return record;
    return maskRow(record, visibleKeys, STRUCTURAL_RECORD_KEYS);
  });
};

/** Masks a getRecordDetails() response: the spine `record` (+ its recomposed `data`), plus
 * `persons[]`/`properties[]`/`offences[]` entries. `revisions`/`transitions`/
 * `status_events`/`linkedRecords` pass through untouched — audit trail and cross-record
 * references, not field_registry-driven data (see MASKING RULE §3 above). */
export const maskRecordDetails = async (details, user) => {
  if (!details || !details.record) return details;
  log.debug('maskRecordDetails: enter', { recordId: details.record.id, recordType: details.record.record_type, userId: user?.id, role: user?.role });
  const visibleKeys = await resolveMasking(details.record.record_type, user);
  if (!visibleKeys) {
    log.debug('maskRecordDetails: exit — no masking applied', { recordId: details.record.id });
    return details;
  }

  const record = maskRow(details.record, visibleKeys, STRUCTURAL_RECORD_KEYS);
  const persons = (details.persons || []).map((p) => maskRow(p, visibleKeys, PERSON_STRUCTURAL_KEYS));
  const properties = (details.properties || []).map((p) => maskRow(p, visibleKeys, PROPERTY_STRUCTURAL_KEYS));
  const offences = (details.offences || []).map((o) => maskOffenceRow(o, visibleKeys, details.record.record_type));

  log.info('maskRecordDetails: exit — masking applied', {
    recordId: details.record.id, recordType: details.record.record_type, visibleKeyCount: visibleKeys.length,
    personCount: persons.length, propertyCount: properties.length, offenceCount: offences.length,
  });
  return { ...details, record, persons, properties, offences };
};
