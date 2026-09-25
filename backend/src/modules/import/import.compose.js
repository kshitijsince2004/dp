// Payload composer for the bulk-import module (Integration 3, WP3). Pure functions: takes
// the raw parent + child rows a readWorkbook() call already parsed, applies the frozen-
// template key bridge, and builds the exact C1 write-payload shape
// records.service.js's createRecord/createImportedRecord expect —
// { data, persons[], properties[], offences[], recordDate, sourceRef }. No DB access here;
// validation (WP4) and the actual write (WP5) both consume this shape, never re-derive it —
// this is the ONE place a frozen-template column's value gets routed to its final home.
import { getRecordDate, canonKey, mergeNonEmpty } from './import.parse.js';
import { getBridge, ARREST_PERSON_SHEET_RECORD_LEVEL_KEYS } from './import-key-bridge.config.js';
import { normalizeFirNo } from '../records/records.normalize.js';
import { getLogger } from '../../utils/logger.js';

// STYLE ANCHOR match — see import.parse.js's header comment. This is the "every column
// bridged, every compose" layer: applyBridge logs each rename/compose/drop decision,
// composeRecordPayload logs the assembled shape per parent row.
const log = getLogger('import.compose');

// Per-type act-sheet column names feeding the offences[] row builder — see
// docs/new-db-integration/03-import.md and COMPOSER_ONLY_KEYS in
// scripts/import-bridge-parity.js. CASE/ARREST/KALANDRA share one naming; UIDB differs
// (act_name/major_head are themselves live field_registry keys there, used per-row).
const OFFENCE_ROW_KEYS = {
  CASE: { act: 'act', section: 'sections', major: 'crime_head', minor: 'minor_head' },
  ARREST: { act: 'act', section: 'sections', major: 'crime_head', minor: 'minor_head' },
  KALANDRA: { act: 'act', section: 'sections', major: 'crime_head', minor: 'minor_head' },
  UIDB: { act: 'act_name', section: 'sections', major: 'major_head', minor: 'minor_head' },
};

// Applies the key bridge to one raw rowData object: renames, composes (N cells -> 1 key),
// and drops per import-key-bridge.config.js. validateOnly-marked keys are also dropped from
// the returned object here (they never reach `data` — WP4's validation reads them from the
// RAW row before this function runs, not from the bridged output). Returns a new object;
// never mutates the input (callers may still need the raw row for validation/error messages).
export function applyBridge(rowData, bridge) {
  const out = { ...rowData };
  for (const [key, entry] of Object.entries(bridge)) {
    if (!(key in out)) continue;
    if (entry.to) {
      const val = out[key];
      delete out[key];
      if (out[entry.to] === undefined || out[entry.to] === null || out[entry.to] === '') {
        out[entry.to] = val;
        log.debug('applyBridge: renamed key', { from: key, to: entry.to, hasValue: val !== null && val !== undefined && val !== '' });
      } else {
        log.debug('applyBridge: rename target already set — value dropped', { from: key, to: entry.to });
      }
    } else if (entry.drop) {
      log.debug('applyBridge: dropped key', { key, hadValue: out[key] !== null && out[key] !== undefined && out[key] !== '' });
      delete out[key];
    } else if (entry.validateOnly) {
      log.debug('applyBridge: validateOnly key consumed then dropped', { key });
      delete out[key];
    }
    // { compose } entries are handled by composeFields below, once, after every rename —
    // composition reads from `from` keys which may themselves be rename targets.
  }
  for (const [key, entry] of Object.entries(bridge)) {
    if (!entry.compose) continue;
    const { targetKey, from, joiner } = entry.compose;
    if (out[targetKey] !== undefined && out[targetKey] !== null && out[targetKey] !== '') {
      log.debug('applyBridge: compose target already set — skipping composition', { targetKey, from });
      continue; // already set — don't clobber
    }
    const parts = from.map((k) => rowData[k]).filter((v) => v !== null && v !== undefined && v !== '');
    if (parts.length) {
      out[targetKey] = parts.join(joiner ?? ' ');
      log.debug('applyBridge: composed field from N cells', { targetKey, from, partsUsed: parts.length });
    }
    for (const k of from) delete out[k];
  }
  return out;
}

/** First-non-empty merge (distinct from import.parse.js's mergeNonEmpty, which is
 * last-non-empty-wins): only sets target[k] when it isn't already set. Used for the G6
 * record-level-fields-collected-on-the-person-sheet merge, where the FIRST arrestee row's
 * answer should win over a later, possibly-blank or disagreeing row — documented judgment
 * call, the schema doesn't prescribe which arrestee "owns" a record-level fact. */
function mergeFirstNonEmpty(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v === null || v === undefined || v === '') continue;
    if (target[k] !== undefined && target[k] !== null && target[k] !== '') continue;
    target[k] = v;
  }
  return target;
}

function buildOffenceEntries(recordType, actRows) {
  const keys = OFFENCE_ROW_KEYS[recordType];
  if (!keys || !actRows) return [];
  return actRows
    .map((r) => ({
      act: r.rowData[keys.act] ?? null,
      section: r.rowData[keys.section] ?? null,
      major_head: r.rowData[keys.major] ?? null,
      minor_head: r.rowData[keys.minor] ?? null,
    }))
    .filter((o) => o.act || o.section);
}

/**
 * Compose one parent record's full write payload from its parsed parent row + grouped
 * children (already bridge-un-applied raw rows — this function owns applying the bridge).
 *
 * @param recordType   'CASE' | 'ARREST' | 'KALANDRA' | 'UIDB' | 'MISSING' | 'PCR_CALL'
 * @param parentRow    { rowData, rowIdx } — the parent-sheet row (readWorkbook's parentRows entry)
 * @param children     { <role>: [{rowData, rowIdx}, ...] } — already grouped to this parent
 *                     (groupRowsByParent output), or {} for single-sheet types
 * @param sourceRef    canonical parent key (canonKey output) or 'row:<n>' — becomes
 *                     records.legacy_ref (docs/new-db-integration/03-import.md C4)
 */
export function composeRecordPayload(recordType, parentRow, children, sourceRef) {
  log.debug('composeRecordPayload: enter', {
    recordType, sourceRef, parentRowIdx: parentRow.rowIdx,
    childCounts: Object.fromEntries(Object.entries(children).map(([role, rows]) => [role, (rows || []).length])),
  });
  const bridge = getBridge(recordType);
  const data = applyBridge(parentRow.rowData, bridge);

  if (recordType === 'CASE' || recordType === 'ARREST') {
    // Linkage depends on exact string match against fir_details.fir_no (G3) — canonicalize
    // whatever format the sheet used ("FIR-104/2026", "0104/26", "104 / 2026" ...) to the
    // same "<seq>/<4-digit-year>" form the interactive form and linkResolver.js expect.
    // normalizeFirNo is the ONE shared brain (records.normalize.js) — the write path applies
    // it again via the mapper, this early pass keeps validate-time dup/linkage checks on the
    // exact value that will be written.
    if (data.fir_no) {
      const before = data.fir_no;
      data.fir_no = normalizeFirNo(data.fir_no);
      log.debug('composeRecordPayload: canonicalized fir_no', { recordType, sourceRef, before, after: data.fir_no });
    }
  } else if (recordType === 'KALANDRA') {
    // Never fir_no — a DD/GD number routed to arrest_details.fir_no would make
    // linkResolver.js try to auto-link it to a CASE as though it were a real FIR (G2).
    delete data.fir_no;
    data.is_dd_based = true;
    log.debug('composeRecordPayload: KALANDRA stamped is_dd_based, fir_no stripped (G2 safety)', { sourceRef });
  } else if (recordType === 'MISSING') {
    // missing_details.fir_no is the CASE_MISSING linkage key — same exact-string matching,
    // same canonical form as CASE's fir_no.
    if (data.missing_fir_no) {
      const before = data.missing_fir_no;
      data.missing_fir_no = normalizeFirNo(data.missing_fir_no);
      log.debug('composeRecordPayload: canonicalized missing_fir_no', { sourceRef, before, after: data.missing_fir_no });
    }
    // case_registered is deliberately NOT a template column (redundant): whether a case is
    // registered for this missing person IS whether an FIR number was entered — derive it.
    data.case_registered = Boolean(data.missing_fir_no);
    log.debug('composeRecordPayload: derived case_registered from missing_fir_no presence', { sourceRef, caseRegistered: data.case_registered });
  }

  const persons = [];
  if (recordType === 'CASE') {
    for (const c of children.victim || []) persons.push({ person_type: 'VICTIM', data: applyBridge(c.rowData, bridge) });
    for (const c of children.accused || []) persons.push({ person_type: 'ACCUSED', data: applyBridge(c.rowData, bridge) });
    log.debug('composeRecordPayload: built CASE persons[]', { sourceRef, victims: (children.victim || []).length, accused: (children.accused || []).length });
  } else if (recordType === 'ARREST' || recordType === 'KALANDRA') {
    const personRows = (children.person || []).map((c) => applyBridge(c.rowData, bridge));
    for (const p of personRows) persons.push({ person_type: 'ARRESTED', data: p });
    // G6: several ARREST/KALANDRA person-sheet columns are actually record-level
    // (arrest_details), not per-arrestee — merge them into flat `data`, first-non-empty
    // across every arrestee row, then strip from the individual person entries so the same
    // value isn't ALSO submitted as a (harmless but redundant) person-level field.
    for (const p of personRows) {
      const recordLevel = {};
      for (const k of ARREST_PERSON_SHEET_RECORD_LEVEL_KEYS) {
        if (k in p) { recordLevel[k] = p[k]; delete p[k]; }
      }
      mergeFirstNonEmpty(data, recordLevel);
    }
    log.debug('composeRecordPayload: built ARRESTED persons[] + merged G6 record-level fields', {
      recordType, sourceRef, arrestees: personRows.length, recordLevelKeys: ARREST_PERSON_SHEET_RECORD_LEVEL_KEYS.filter((k) => k in data),
    });
  }
  // MISSING/UIDB/PCR_CALL singleton roles (MISSING, DECEASED) arrive as flat parent-row keys
  // already — the mapper reads them straight from `data`, no persons[] entries needed.

  const properties = [];
  for (const c of children.property || []) {
    properties.push({ ...applyBridge(c.rowData, bridge), person_index: null });
  }
  if (properties.length) log.debug('composeRecordPayload: built properties[]', { recordType, sourceRef, count: properties.length });

  const offences = buildOffenceEntries(recordType, children.act);
  log.debug('composeRecordPayload: built offences[]', { recordType, sourceRef, count: offences.length });

  // getRecordDate('ARREST'|'KALANDRA', ...) reads date_of_arrest/arrest_date off the FLAT
  // row — but the bridge (date_of_arrest -> arrest_date) moves that value onto the arrestee's
  // OWN persons[] entry, since arrest_date is a person-role field, not a detail-table one.
  // Without this fallback every ARREST/KALANDRA import would fail records.record_date's
  // NOT NULL constraint whenever the date was only entered on the Person sheet (the common
  // case — arrestGeneralFields doesn't even offer a general-sheet arrest-date column).
  // Mirrors the pre-Integration-3 controller's own explicit "fallback date_of_arrest ... from
  // first person row" comment — same intent, ported forward. Harmless for the mapper: a stray
  // flat `arrest_date` key is a person-entity field, so splitFlatFields skips it outright.
  const flatDate = getRecordDate(recordType, data);
  const fallbackDate = !flatDate && (recordType === 'ARREST' || recordType === 'KALANDRA') ? persons[0]?.data?.arrest_date : null;
  const recordDate = flatDate || fallbackDate || null;
  if (!flatDate && fallbackDate) {
    log.warn('composeRecordPayload: record_date fell back to first arrestee\'s arrest_date (flat row had none)', { recordType, sourceRef, recordDate });
  } else if (!recordDate) {
    log.warn('composeRecordPayload: no usable record_date resolved anywhere', { recordType, sourceRef });
  }

  log.info('composeRecordPayload: exit', {
    recordType, sourceRef, recordDate, personsCount: persons.length, propertiesCount: properties.length, offencesCount: offences.length,
  });
  return { data, persons, properties, offences, recordDate, sourceRef };
}

/** sourceRef for types with a natural parent key (CASE/ARREST/KALANDRA/UIDB): the row's
 * canonical parent key. Falls back to 'row:<n>' for single-sheet types (MISSING, PCR_CALL)
 * with no natural key — deterministic across re-reads of the same file (needed for the
 * import_batch_id + legacy_ref idempotency pair, C4). */
export function sourceRefFor(parentKeyField, rowData, rowIdx) {
  const ref = (parentKeyField && rowData[parentKeyField]) ? canonKey(rowData[parentKeyField]) : `row:${rowIdx}`;
  log.debug('sourceRefFor: resolved', { parentKeyField, rowIdx, ref });
  return ref;
}
