// Workbook parsing for the bulk-import module (Integration 3, WP3). Mechanically extracted
// from import.controller.js — behavior-identical, no DB access, pure functions only. This is
// the layer that turns a frozen Excel file into raw per-sheet row objects; it knows nothing
// about field_registry storage mappings (that's import-key-bridge.config.js/import.compose.js)
// or validation error codes (that's import.validate.js). Shared by BOTH the validate endpoint
// and the async confirm handler via readWorkbook() at the bottom of this file, so what gets
// validated is exactly what gets written (docs/new-db-integration/03-import.md C3/AD7).
import ExcelJS from 'exceljs';
import { toISO, toDMY } from '../../utils/dateFormat.js';
import { expandFirYear } from '../records/records.normalize.js';
import {
  COUNTRY_OPTS, STATE_OPTS, DISTRICT_OPTS,
  caseGeneralFields, caseVictimFields, caseActSectionFields, caseAccusedFields, casePropertyFields,
  arrestGeneralFields, arrestActSectionFields, arrestPersonFields, arrestPropertyFields,
  kalandraGeneralFields, kalandraActSectionFields, kalandraPersonFields,
  uidbGeneralFields, uidbActSectionFields, missingGeneralFields,
  keystoneColumnsFor,
} from './import-fields.config.js';
import { autoIncludedRegistryFields } from './registry-sync.util.js';
import { getKnownLayouts } from './layout-manifests.js';
import { CASE_SECTION_MAP, ARREST_SECTION_MAP } from './template-builder.service.js';
import { getLogger } from '../../utils/logger.js';

// STYLE ANCHOR match (logging-instrumentation-2026-07-22): matches records.service.js exactly —
// getLogger('import.parse') bound once, log.debug/info/warn/error(event, data) from then on.
// This is the workbook->rows layer: every sheet resolution, every layout-fingerprint decision,
// every row parsed/ghost-skipped gets a debug line so a tester's uploaded file's exact parse
// path is reconstructable from the logs alone.
const log = getLogger('import.parse');

// Sentinel error_code used to persist invalid parent keys (FIR / linked_fir_dd_no) from
// validation to confirm. Never shown to users — filtered from all error-display paths.
export const INVALID_PARENT_CODE = '__INVALID_PARENT__';

// Synonyms map to handle template label variations and offsets
export const CASE_SYNONYMS = {
  "FIR Number": "fir_no",
  "Complainant No.": "fir_no",
  "Complainant No": "fir_no",
  "Complainant no.": "fir_no",
  "Complainant no": "fir_no",
  "FIR Date and time": "fir_date",
  "Disposal Type": "disposal_type",
  "District": "district",
  "Police Station": "police_station",
  "Local Head (Crime)": "local_head",
  "Case Registration Type": "case_type",
  "Beat Number": "beat_number",
  "Date of Occurrence": "occurrence_date",
  "Occurrence Time": "occurrence_time",
  "Brief Facts of the Case": "brief_facts",
  "Status ": "status",
  "Is Permanent Address same as Present Address?": "complainant_perm_same",
  "Place of Occurrence Landmark": "occurrence_landmark",
  "Place of Occurrence Address Nationality": "occurrence_country",
  "Place of Occurrence State": "occurrence_state",
  "Place of Occurrence District": "occurrence_district",
  "Place of Occurrence Police Station": "occurrence_police_station",
  "Place of Occurrence Pin Code": "occurrence_pincode",
  "IO / Officer Name": "io_name",
  "IO / Officer Name ": "io_name",
  "PIS No. of IO": "io_pis",
  "IO Mobile No.": "io_mobile",
  "Property Category": "property_major_category",
  "Property  Category": "property_major_category",
  "Property Major Category": "property_major_category",
  "Property Minor Category": "property_minor_category",
  "Property Description": "property_details",
  "Property Status (stolen/recovered/involved/seized)": "property_stolen_recovered",
  "Property Value in inr": "property_value",
  "Major Head": "major_head",
  "Minor Head": "minor_head"
};

export const ARREST_SYNONYMS = {
  "GD Number, Date & Time": "linked_fir_dd_no",
  "Linked GD Number": "linked_fir_dd_no",
  "Linked GD No.": "linked_fir_dd_no",
  "Linked FIR No.": "linked_fir_dd_no",
  "Linked FIR no.": "linked_fir_dd_no",
  "DD No.": "linked_fir_dd_no",
  "DD Number": "linked_fir_dd_no",
  "FIR Date": "fir_date",
  "District": "district",
  "Police Station": "police_station",
  "Date Of Arrest": "date_of_arrest",
  "Time Of Arrest": "time_of_arrest",
  "House No. of Arrest": "arrest_place",
  "House No. / Name of Arrest": "arrest_place",
  "Street of Arrest": "arrest_street",
  "Colony of Arrest": "arrest_colony",
  "District of Arrest": "arrest_district",
  "Landmark of Arrest": "arrest_landmark",
  "IO / Officer Name": "io_name",
  "PIS No. of IO": "io_pis",
  "IO Rank": "io_rank",
  "IO Mobile No.": "io_mobile",
  "Bad Character (BC)": "bad_character",
  "Proclaimed Offender (PO)": "proclaimed_offender",
  "Arresting Officer Name": "verifying_officer_name",
  "Arresting Officer Rank": "verifying_officer_rank",
  "Custody status": "status",
  "Scheme of arrest": "scheme_of_arrest",
  "Property Description": "property_details",
  "Property Status (stolen/recovered/involved/seized)": "property_stolen_recovered",
  "Property Value in inr": "property_value",
  "Previous involvement": "prev_involvement",
  "Major Head": "major_head",
  "Minor Head": "minor_head"
};

const evaluateShowWhen = (showWhen, rowData) => {
  if (!showWhen) return true;
  let parsed = showWhen;
  if (typeof showWhen === 'string') {
    try {
      parsed = JSON.parse(showWhen);
    } catch (e) {
      return true;
    }
  }
  if (!parsed || !parsed.field) return true;

  const triggerField = parsed.field;
  const triggerVal = rowData[triggerField];
  if (triggerVal === undefined || triggerVal === null || triggerVal === '') {
    return false;
  }

  const expectedVal = parsed.value;
  if (Array.isArray(expectedVal)) {
    return expectedVal.includes(triggerVal);
  }
  return expectedVal === triggerVal;
};

const parseCombinedAddress = (addressStr) => {
  const result = {
    house_no: null,
    street: null,
    colony: null,
    city_town_village: null,
    state: null,
    country: null,
    pincode: null
  };

  if (!addressStr) return result;

  const cleanStr = String(addressStr).trim();
  const pinMatch = cleanStr.match(/\b\d{6}\b/);
  if (pinMatch) {
    result.pincode = pinMatch[0];
  }

  const parts = cleanStr.split(/[\n,]+|\s{2,}/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return result;

  let remainingParts = [...parts];

  const lastPart = remainingParts[remainingParts.length - 1];
  const countries = COUNTRY_OPTS.map(c => c.toLowerCase());
  if (countries.includes(lastPart.toLowerCase())) {
    result.country = lastPart;
    remainingParts.pop();
  } else {
    result.country = 'India';
  }

  if (remainingParts.length > 0) {
    const lastPart2 = remainingParts[remainingParts.length - 1];
    if (/^\d{6}$/.test(lastPart2)) {
      result.pincode = lastPart2;
      remainingParts.pop();
    }
  }

  if (remainingParts.length > 0) {
    const lastPart3 = remainingParts[remainingParts.length - 1];
    const states = ['delhi', 'haryana', 'uttar pradesh', 'up', 'punjab', 'rajasthan'];
    const matchedState = states.find(s => lastPart3.toLowerCase().endsWith(s));
    if (matchedState) {
      result.state = matchedState.charAt(0).toUpperCase() + matchedState.slice(1);
      const cleaned = lastPart3.substring(0, lastPart3.toLowerCase().lastIndexOf(matchedState)).trim();
      if (cleaned) {
        remainingParts[remainingParts.length - 1] = cleaned;
      } else {
        remainingParts.pop();
      }
    }
  }

  if (remainingParts.length === 1) {
    const singlePart = remainingParts[0];
    if (/\d|street|gali|road|house|building|plot|flat|ward/i.test(singlePart)) {
      result.house_no = singlePart;
    } else {
      result.city_town_village = singlePart;
    }
  } else if (remainingParts.length > 1) {
    result.city_town_village = remainingParts.pop();
    result.house_no = remainingParts[0];
    if (remainingParts.length > 1) {
      result.street = remainingParts[1];
    }
    if (remainingParts.length > 2) {
      result.colony = remainingParts.slice(2).join(', ');
    }
  }

  return result;
};

const fillAddressFields = (rowData, prefix) => {
  const combinedAddr = rowData[`${prefix}_present_address`] || rowData[`${prefix}_address`] || rowData[`name_and_address_of_${prefix}`] || rowData[`${prefix}_place` ];
  if (!combinedAddr) return;

  const parsed = parseCombinedAddress(combinedAddr);

  const houseKey = `${prefix}_house_no`;
  const streetKey = `${prefix}_street`;
  const colonyKey = `${prefix}_colony`;
  const cityKey = `${prefix}_city_town_village`;
  const stateKey = `${prefix}_state`;
  const countryKey = `${prefix}_country`;
  const pinKey = `${prefix}_pincode`;

  if (!rowData[houseKey] && parsed.house_no) rowData[houseKey] = parsed.house_no;
  if (!rowData[streetKey] && parsed.street) rowData[streetKey] = parsed.street;
  if (!rowData[colonyKey] && parsed.colony) rowData[colonyKey] = parsed.colony;
  if (!rowData[cityKey] && parsed.city_town_village) rowData[cityKey] = parsed.city_town_village;
  if (!rowData[stateKey] && parsed.state) rowData[stateKey] = parsed.state;
  if (!rowData[countryKey] && parsed.country) rowData[countryKey] = parsed.country;
  if (!rowData[pinKey] && parsed.pincode) rowData[pinKey] = parsed.pincode;

  if (prefix === 'arrested') {
    rowData.arrested_perm_same = true;
    rowData.arrested_perm_house_no = rowData.arrested_house_no;
    rowData.arrested_perm_street = rowData.arrested_street;
    rowData.arrested_perm_colony = rowData.arrested_colony;
    rowData.arrested_perm_city_town_village = rowData.arrested_city_town_village;
    rowData.arrested_perm_state = rowData.arrested_state;
    rowData.arrested_perm_country = rowData.arrested_country;
    rowData.arrested_perm_pincode = rowData.arrested_pincode;
  }
};

const syncPermanentAddress = (rowData, prefix) => {
  const isSame = rowData[`${prefix}_perm_same`] === 'Yes' || rowData[`${prefix}_perm_same`] === true;
  if (!isSame) return;

  const addrFields = [
    'house_no',
    'street',
    'colony',
    'city_town_village',
    'tehsil_block_mandal',
    'district',
    'police_station',
    'state',
    'pincode',
    'country'
  ];

  for (const field of addrFields) {
    const presentKey = `${prefix}_${field}`;
    const permKey = `${prefix}_perm_${field}`;
    if (rowData[presentKey] !== undefined && rowData[presentKey] !== null && rowData[presentKey] !== '') {
      if (rowData[permKey] === undefined || rowData[permKey] === null || rowData[permKey] === '') {
        rowData[permKey] = rowData[presentKey];
      }
    }
  }
};

const parseActAndSection = (raw) => {
  if (!raw) return { section: null, act: null };
  const clean = String(raw).trim();

  const match = clean.match(/^([\d\w\(\)\/,\-\s]+?)\s+(THE\s+.*|IPC.*|BNS.*|ACT.*|INDIAN.*|BHARATIYA.*)/i);
  if (match) {
    return {
      section: match[1].trim(),
      act: match[2].trim()
    };
  }

  const index = clean.search(/(THE\s+|BNS|IPC|ACT|INDIAN|BHARATIYA)/i);
  if (index > 0) {
    return {
      section: clean.substring(0, index).replace(/[^a-zA-Z0-9\(\)\/\-\s,]/g, '').trim(),
      act: clean.substring(index).trim()
    };
  }

  return {
    section: clean,
    act: null
  };
};

const splitName = (fullName) => {
  if (!fullName) return { first_name: null, last_name: null };
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: '' };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ')
  };
};

const getConditionalSectionKey = (actName) => {
  if (!actName) return 'other_sections';
  const clean = String(actName).trim().toLowerCase();
  if (clean.includes('ipc') || clean.includes('penal code')) return 'ipc_sections';
  if (clean.includes('arms')) return 'arms_sections';
  if (clean.includes('excise')) return 'excise_sections';
  if (clean.includes('gambling')) return 'gambling_sections';
  return 'other_sections';
};

export const getRecordDate = (recordType, rowData) => {
  let source = null;
  let value = null;
  if (recordType === 'CASE') {
    source = rowData.fir_date ? 'fir_date' : (rowData.occurrence_date ? 'occurrence_date' : null);
    value = rowData.fir_date || rowData.occurrence_date;
  } else if (recordType === 'ARREST' || recordType === 'KALANDRA') {
    source = rowData.date_of_arrest ? 'date_of_arrest' : (rowData.arrest_date ? 'arrest_date' : null);
    value = rowData.date_of_arrest || rowData.arrest_date;
  } else if (recordType === 'PCR_CALL') {
    source = rowData.gd_date ? 'gd_date' : null;
    value = rowData.gd_date;
  } else if (recordType === 'UIDB') {
    source = rowData.found_date ? 'found_date' : null;
    value = rowData.found_date;
  } else if (recordType === 'MISSING') {
    source = rowData.missing_date ? 'missing_date' : null;
    value = rowData.missing_date;
  }
  // Historically the #1 bug class for ARREST/KALANDRA (C3 in 03-import.md): this resolves
  // nothing when the date only lives on the arrestee's person-sheet row — composeRecordPayload
  // has its own fallback for that, logged separately there.
  log.debug('getRecordDate: resolved from flat row', { recordType, source, value: value || null });
  return value || null;
};

const normLabel = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Tolerant worksheet resolver: matches a sheet against candidate names case-insensitively,
// then by substring (either direction), so a file whose parent sheet is named e.g.
// "General Information" still resolves when the code expects "General Info" (and vice versa).
export const findWorksheet = (workbook, candidates) => {
  const normed = candidates.map(normLabel);
  for (const ws of workbook.worksheets) {
    if (normed.includes(normLabel(ws.name))) return ws;
  }
  for (const ws of workbook.worksheets) {
    const n = normLabel(ws.name);
    if (n && normed.some((c) => c && (n.includes(c) || c.includes(n)))) return ws;
  }
  return null;
};

// Candidate sheet names per record type / role — kept liberal to tolerate renames.
export const SHEET_ALIASES = {
  CASE: {
    parent: ['General Information', 'General Info', 'General'],
    victim: ['Victim Information', 'Victim Detail', 'Victim Details'],
    act: ['Act and Sections', 'Acts and Sections', 'Act & Sections'],
    accused: ['Accused Detail', 'Accused Details', 'Accused Information'],
    property: ['Property Details', 'Property Detail']
  },
  ARREST: {
    parent: ['General Info', 'General Information', 'General', 'Arrest Details', 'Arrest Detail'],
    act: ['Act and Sections', 'Acts and Sections', 'Act & Sections'],
    person: ['Person Arrested Detail', 'Arrested Person Detail', 'Arrested Person', 'Person Detail', 'Person Arrested Details'],
    property: ['Property Details', 'Property Detail']
  },
  KALANDRA: {
    parent: ['General Info', 'General Information', 'General', 'Kalandra', 'Kalandra Details'],
    act: ['Act and Sections', 'Acts and Sections', 'Act & Sections'],
    person: ['Arrested Person', 'Person Arrested Detail', 'Arrested Person Detail', 'Person Detail'],
    property: ['Property Details', 'Property Detail']
  },
  UIDB: {
    parent: ['General Info', 'General Information', 'Import Template', 'General'],
    act: ['Act and Sections', 'Acts and Sections', 'Act & Sections']
  },
  MISSING: {
    parent: ['Import Template', 'General Info', 'General Information', 'General']
  }
};

// KALANDRA is the ARREST form's standalone (non-FIR) case type. Its batches parse
// with the kalandra sheet lists, but everything registry-driven (coercion, duplicate
// checks, stored record_type, UID codes) runs as ARREST.
export const effectiveRecordType = (t) => (t === 'KALANDRA' ? 'ARREST' : t);

// Patterns that identify an instruction/hint row (Row 4 of the official template)
// so we never mistake it for a data row.
const HINT_ROW_PATTERNS = /^(\[required\]|select:|date \(|time \(|number$|boolean$|text$|textarea$|file$|checkbox$|e\.g\.|must match|yyyy|hh:mm|\d+-digit|first name$|middle name$|last name$|nickname|age in years|min age$|max age$|full residential|house number$|street name$|colony name$|village\/city$|tehsil$|police station$|incident narrative|npr number$|father's or)/i;

const looksLikeHintRow = (values) => {
  const nonEmpty = values.filter((v) => v && String(v).trim());
  if (nonEmpty.length === 0) return false;
  const hintCount = nonEmpty.filter((v) => HINT_ROW_PATTERNS.test(String(v).trim())).length;
  return hintCount >= Math.max(2, Math.ceil(nonEmpty.length * 0.4));
};

// Auto-detects the header layout so the parser works whether the file has the
// full official layout (Row1 hidden keys / Row2 sections / Row3 labels / Row4 hints /
// data @ Row5) OR a flattened export (Row1 sections / Row2 labels / data @ Row3).
export const buildColumnMap = (worksheet, recordType, registryFields) => {
  log.debug('buildColumnMap: enter', { sheet: worksheet.name, recordType, registryFieldCount: registryFields.length });
  const readRow = (n) => {
    const vals = [];
    worksheet.getRow(n).eachCell({ includeEmpty: true }, (cell) => {
      let v = cell.value;
      if (v && typeof v === 'object' && Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join('');
      if (v && typeof v === 'object' && 'text' in v) v = v.text;
      vals.push(v !== null && v !== undefined ? String(v).trim() : '');
    });
    return vals;
  };

  const SCAN_ROWS = 6;
  const rowsVals = {};
  for (let r = 1; r <= SCAN_ROWS; r++) rowsVals[r] = readRow(r);

  const registryKeysSet = new Set(registryFields.map((f) => f.field_key));
  const synonyms = recordType === 'CASE'
    ? CASE_SYNONYMS
    : (['ARREST', 'KALANDRA'].includes(recordType)
        ? { ...ARREST_SYNONYMS, "GD Number": "linked_fir_dd_no", "GD No.": "linked_fir_dd_no", "GD No": "linked_fir_dd_no" }
        : { ...ARREST_SYNONYMS, "GD Number": "gd_no", "GD No.": "gd_no", "GD No": "gd_no" });

  // Normalized lookup tables for label / synonym matching
  const synByNorm = {};
  for (const [label, key] of Object.entries(synonyms)) synByNorm[normLabel(label)] = key;
  const labelToKey = {};
  for (const f of registryFields) {
    if (f.label_en) labelToKey[normLabel(f.label_en)] = f.field_key;
    if (f.label_hi) labelToKey[normLabel(f.label_hi)] = f.field_key;
  }

  // Score each of the first rows: how many cells look like field keys vs. labels
  let keyRow = null, keyRowHits = 0;
  let labelRow = null, labelRowHits = 0;
  for (let r = 1; r <= SCAN_ROWS; r++) {
    const vals = rowsVals[r];
    let keyHits = 0, labelHits = 0;
    for (const v of vals) {
      if (!v) continue;
      if (registryKeysSet.has(v)) keyHits++;
      const n = normLabel(v);
      if (synByNorm[n] || labelToKey[n]) labelHits++;
    }
    if (keyHits > keyRowHits) { keyRowHits = keyHits; keyRow = r; }
    if (labelHits > labelRowHits) { labelRowHits = labelHits; labelRow = r; }
  }
  if (keyRowHits < 2) keyRow = null;
  if (labelRowHits < 2) labelRow = null;
  // Guard: the label row can equal the key row only if nothing else matched labels
  if (keyRow && labelRow === keyRow) labelRow = null;
  log.debug('buildColumnMap: header row detection', { sheet: worksheet.name, keyRow, keyRowHits, labelRow, labelRowHits });

  const keyVals = keyRow ? rowsVals[keyRow] : [];
  const labelVals = labelRow ? rowsVals[labelRow] : [];

  const colMap = {};
  const maxCol = Math.max(keyVals.length, labelVals.length);
  for (let c = 1; c <= maxCol; c++) {
    const keyCell = keyVals[c - 1] || '';
    const labelCell = labelVals[c - 1] || '';
    let matchedKey = null;

    // 1. Hidden key row cell is a known registry key
    if (keyCell && registryKeysSet.has(keyCell)) matchedKey = keyCell;
    // 2. Label matches a synonym
    if (!matchedKey && labelCell && synByNorm[normLabel(labelCell)]) matchedKey = synByNorm[normLabel(labelCell)];
    // 3. Label matches a registry display label (en/hi)
    if (!matchedKey && labelCell && labelToKey[normLabel(labelCell)]) matchedKey = labelToKey[normLabel(labelCell)];
    // 4. Fallback: raw key cell (covers custom keys not in this sheet's field list)
    if (!matchedKey && keyCell) matchedKey = keyCell;

    if (matchedKey) colMap[c] = matchedKey;
  }

  // Data starts after the lowest detected header row; skip a trailing hint row if present.
  const headerBottom = Math.max(keyRow || 0, labelRow || 0, 1);
  let dataStartRow = headerBottom + 1;
  if (looksLikeHintRow(rowsVals[dataStartRow] || readRow(dataStartRow))) dataStartRow++;

  log.debug('buildColumnMap: exit', {
    sheet: worksheet.name, recordType, mappedColumns: Object.keys(colMap).length, dataStartRow, hasHiddenKeys: !!keyRow,
  });
  return { colMap, dataStartRow, hasHiddenKeys: !!keyRow };
};

// Robustly extract the FIR sequence number and year
export const parseFirAndYear = (str) => {
  if (!str) return { firNo: '', year: null };
  const clean = String(str).trim();
  const nums = clean.match(/\d+/g);
  if (!nums || nums.length === 0) return { firNo: clean, year: null };
  if (nums.length === 1) return { firNo: String(parseInt(nums[0], 10)), year: null };

  let yearIdx = -1;
  for (let i = 0; i < nums.length; i++) {
    const n = parseInt(nums[i], 10);
    if (nums[i].length === 4 && n >= 1900 && n <= 2200) { yearIdx = i; break; }
  }

  let year = null;
  let seqToken = null;
  if (yearIdx >= 0) {
    year = parseInt(nums[yearIdx], 10);
    seqToken = nums.find((_, i) => i !== yearIdx);
  } else {
    seqToken = nums[0];
    if (nums[1]) {
      let y = parseInt(nums[1], 10);
      // Century expansion shares one brain with records.normalize.js's normalizeFirNo —
      // legacy imports carry 1990s FIRs, so "45/98" must become 1998, never 2098.
      if (nums[1].length === 2) y = expandFirYear(y);
      year = y;
    }
  }
  return { firNo: seqToken != null ? String(parseInt(seqToken, 10)) : '', year };
};

// One arrest cell sometimes lists several FIRs ("12/2025, 13/2025"). Split on
// separators that never appear inside a single FIR ('/' and '-' do).
export const splitFirTokens = (raw) => {
  if (raw === null || raw === undefined) return [];
  return String(raw)
    .split(/\s*(?:[,;&\n]|\band\b)\s*/i)
    .map((t) => t.trim())
    .filter(Boolean);
};

// ── Canonical parent-key matching ───────────────────────────────────────────────
// Child sheets reference their parent row by FIR / GD number, but the same key
// arrives in many shapes: text "123/2025" vs numeric 123, zero-padded "0123/2025",
// "FIR-123/2025", stray spaces, different case. Raw === comparison silently
// detaches children (victims, accused, acts, properties, persons) from their
// parent, so every parent↔child comparison goes through one canonical form.

const canonKeyParts = (val) => {
  const s = String(val ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  // A cell listing several FIRs ("12/2025, 13/2025") matches as literal text —
  // collapsing it to its first FIR would collide with a plain "12/2025" parent.
  if (splitFirTokens(s).length > 1) return { raw: s, seq: '', year: null };
  const { firNo, year } = parseFirAndYear(s);
  return { raw: s, seq: firNo || '', year: year || null };
};

// Canonical string for a parent key: "seq|year" when both parse, else "seq",
// else the normalized raw text. Used for duplicate checks and the persisted
// invalid-parent-key sentinels.
export const canonKey = (val) => {
  const p = canonKeyParts(val);
  if (!p) return '';
  if (p.seq) return p.year ? `${p.seq}|${p.year}` : p.seq;
  return p.raw;
};

// Index over the parent sheet's keys supporting lenient child→parent resolution:
//   1. exact canonical match;
//   2. else match by FIR sequence alone when exactly one parent is compatible
//      (a year on both sides that differs is a conflict, a missing year is not).
export const buildParentKeyIndex = (parentVals) => {
  const byCanon = new Set();
  const bySeq = new Map(); // seq → [{ canon, year }]
  for (const v of parentVals) {
    const p = canonKeyParts(v);
    if (!p) continue;
    const canon = p.seq ? (p.year ? `${p.seq}|${p.year}` : p.seq) : p.raw;
    if (byCanon.has(canon)) continue;
    byCanon.add(canon);
    if (p.seq) {
      if (!bySeq.has(p.seq)) bySeq.set(p.seq, []);
      bySeq.get(p.seq).push({ canon, year: p.year });
    }
  }
  // Returns the parent's canonical key, or null when no unambiguous parent exists.
  const resolve = (val) => {
    const p = canonKeyParts(val);
    if (!p) return null;
    const canon = p.seq ? (p.year ? `${p.seq}|${p.year}` : p.seq) : p.raw;
    if (byCanon.has(canon)) { log.debug('buildParentKeyIndex.resolve: exact canonical match', { val, canon }); return canon; }
    if (p.seq) {
      const compatible = (bySeq.get(p.seq) || []).filter(
        (e) => !p.year || !e.year || e.year === p.year
      );
      if (compatible.length === 1) {
        log.debug('buildParentKeyIndex.resolve: resolved by sequence-only (single compatible parent)', { val, canon: compatible[0].canon });
        return compatible[0].canon;
      }
    }
    log.debug('buildParentKeyIndex.resolve: no unambiguous parent found', { val });
    return null;
  };
  return { resolve };
};

// Groups child-sheet rows under their parent's canonical key. Rows whose key
// resolves to no parent are dropped here — validation has already reported them
// as PARENT_KEY_MISSING.
export const groupRowsByParent = (rows, keyField, parentIndex) => {
  const map = new Map();
  for (const r of rows) {
    const canon = parentIndex.resolve(r[keyField]);
    if (!canon) continue;
    if (!map.has(canon)) map.set(canon, []);
    map.get(canon).push(r);
  }
  return map;
};

// Copies only filled values — child-sheet rows carry null for every column the
// typist left blank, and a blind Object.assign would wipe good parent values.
export const mergeNonEmpty = (target, source) => {
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && v !== undefined && v !== '') target[k] = v;
  }
  return target;
};

const eqi = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Normalizes any incoming Excel cell value to dd/mm/yyyy — the format
// records.data stores date fields in going forward. Delegates the actual
// parsing to the shared backend dateFormat util so import, legacy import,
// and everything else agree on what formats are accepted.
const coerceDate = (val) => {
  if (val === null || val === undefined || val === '') return null;
  let s = val;
  if (typeof val === 'string') {
    s = val.trim();
    const range = s.split(/\s+TO\s+/i);
    if (range.length > 1) s = range[0].trim();
  }
  return toDMY(s);
};

// Extracts the calendar year from any supported date input (dd/mm/yyyy,
// yyyy-mm-dd, Date object) — used for UID year-bucketing.
export const yearOf = (val) => {
  const iso = toISO(val);
  return iso ? parseInt(iso.slice(0, 4), 10) : null;
};

const coerceTime = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return `${String(val.getUTCHours()).padStart(2, '0')}:${String(val.getUTCMinutes()).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m && +m[1] <= 23 && +m[2] <= 59) {
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  return s;
};

const splitAccused = (raw) => {
  const splitVal = String(raw || '').trim();

  const match = splitVal.match(/(.*?)\s+Present\/Permanent\s+add\s*:\s*(.*)/i);
  if (match) {
    return {
      arrested_name: match[1].trim(),
      arrested_address: match[2].trim()
    };
  }

  const lines = splitVal.split('\n');
  if (lines.length > 1) {
    return { arrested_name: lines[0].trim(), arrested_address: lines.slice(1).join('\n').trim() };
  }

  const commas = splitVal.split(',');
  if (commas.length > 1) {
    return { arrested_name: commas[0].trim(), arrested_address: commas.slice(1).join(',').trim() };
  }

  return { arrested_name: splitVal.trim(), arrested_address: '' };
};

const extractRowData = (row, colMap, registryFieldsMap, recordType, coercionFieldsByKey = null) => {
  const rowData = {};
  for (const colIdx of Object.keys(colMap)) {
    const key = colMap[colIdx];
    if (key) rowData[key] = null;
  }
  for (const key of Object.keys(registryFieldsMap)) {
    if (rowData[key] === undefined) {
      rowData[key] = null;
    }
  }

  row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
    const key = colMap[colIdx];
    if (!key) return;

    let cellVal = cell.value;
    if (cellVal && typeof cellVal === 'object' && 'result' in cellVal) cellVal = cellVal.result;
    if (cellVal && typeof cellVal === 'object' && 'text' in cellVal) cellVal = cellVal.text;
    if (cellVal && typeof cellVal === 'object' && Array.isArray(cellVal.richText)) {
      cellVal = cellVal.richText.map(rt => rt.text).join('');
    }
    if (typeof cellVal === 'string') cellVal = cellVal.trim();

    if (key === 'name_and_address_of_accused') {
      const { arrested_name, arrested_address } = splitAccused(cellVal);
      rowData.arrested_name = arrested_name;
      rowData.arrested_address = arrested_address;
      return;
    }

    if (key.endsWith('_date') || key === 'fir_date') {
      const timeKey = key.replace('_date', '_time');
      let dateVal = null;
      let timeVal = null;

      if (cellVal instanceof Date) {
        if (!isNaN(cellVal.getTime())) {
          dateVal = cellVal.toISOString().split('T')[0];
          const hours = cellVal.getUTCHours();
          const minutes = cellVal.getUTCMinutes();
          timeVal = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
      } else if (cellVal) {
        const s = String(cellVal).trim();
        const parts = s.split(/\s+/);
        dateVal = coerceDate(parts[0]);
        if (parts[1]) {
          timeVal = coerceTime(parts[1]);
        }
      }

      rowData[key] = dateVal;
      if (timeVal && (!rowData[timeKey] || rowData[timeKey] === '')) {
        rowData[timeKey] = timeVal;
      }

      // Special case: if key is fir_date, also set gd_date and gd_time for database / validation consistency if empty
      if (key === 'fir_date') {
        if (!rowData.gd_date) rowData.gd_date = dateVal;
        if (timeVal && !rowData.gd_time) rowData.gd_time = timeVal;
      }
      return;
    }

    // Prefer the registry row for coercion — it carries field_type + canonical
    // options; curated config entries only carry labels/required. This keeps
    // validate and confirm coercing identically, and covers registry fields
    // added in the future that no curated list mentions.
    const field = (coercionFieldsByKey && coercionFieldsByKey[key]) || registryFieldsMap[key];
    if (field && field.field_type) {
      if (field.field_type === 'DATE') {
        cellVal = coerceDate(cellVal);
      } else if (field.field_type === 'TIME') {
        cellVal = coerceTime(cellVal);
      } else if (field.field_type === 'SELECT' || field.field_type === 'RADIO') {
        if (cellVal !== null && cellVal !== undefined && cellVal !== '') {
          let options = [];
          try {
            options = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
          } catch (e) {}

          if (!options || options.length === 0) {
            if (key === 'state' || key.endsWith('_state')) {
              options = STATE_OPTS;
            } else if (key === 'district' || key.endsWith('_district')) {
              options = DISTRICT_OPTS;
            } else if (key === 'country' || key.endsWith('_country')) {
              options = COUNTRY_OPTS;
            } else if (key === 'status') {
              if (recordType === 'MISSING') {
                options = ['Un-traced', 'Traced', 'Referred', 'Closed'];
              } else if (recordType === 'UIDB') {
                options = ['Referred to district hospital', 'Identified', 'Body Claimed', 'Unidentified', 'Held in Mortuary'];
              } else if (recordType === 'PCR_CALL') {
                options = ['Action Taken', 'Pending', 'Referred', 'Closed'];
              }
            } else if (key.endsWith('_prepared') || key.endsWith('_verified') || key.endsWith('_same')) {
              options = ['Yes', 'No'];
            } else if (key.includes('gender')) {
              options = ['Male', 'Female', 'Transgender', 'Unknown'];
            }
          }

          if (Array.isArray(options) && options.length > 0) {
            const matchedOpt = options.find(o => {
              if (!o) return false;
              const oVal = String(o.value || o).trim().toLowerCase();
              const oLabelEn = String(o.label_en || o.label || o.value || o).trim().toLowerCase();
              const oLabelHi = String(o.label_hi || o.label || o.value || o).trim().toLowerCase();
              const inputVal = String(cellVal).trim().toLowerCase();
              return oVal === inputVal || oLabelEn === inputVal || oLabelHi === inputVal;
            });
            if (matchedOpt) {
              cellVal = matchedOpt.value || matchedOpt;
            }
          }
        }
      } else if (['TEXT', 'TEXTAREA'].includes(field.field_type)) {
        if (cellVal !== null && cellVal !== undefined) {
          cellVal = String(cellVal).trim();
        }
      }
    } else {
      if (key.includes('date')) cellVal = coerceDate(cellVal);
      else if (key.includes('time')) cellVal = coerceTime(cellVal);
      else if (cellVal !== null && cellVal !== undefined) {
        cellVal = String(cellVal).trim();
      }
    }
    rowData[key] = cellVal;
  });

  if (rowData.complainant_name && !rowData.complainant_first_name) {
    const { first_name, last_name } = splitName(rowData.complainant_name);
    rowData.complainant_first_name = first_name;
    rowData.complainant_last_name = last_name;
  }
  if (rowData.accused_name && !rowData.accused_first_name) {
    const { first_name, last_name } = splitName(rowData.accused_name);
    rowData.accused_first_name = first_name;
    rowData.accused_last_name = last_name;
  }
  if (rowData.victim_name && !rowData.victim_first_name) {
    const { first_name, last_name } = splitName(rowData.victim_name);
    rowData.victim_first_name = first_name;
    rowData.victim_last_name = last_name;
  }
  if (rowData.arrested_name && !rowData.arrested_first_name) {
    const { first_name, last_name } = splitName(rowData.arrested_name);
    rowData.arrested_first_name = first_name;
    rowData.arrested_last_name = last_name;
  }

  if (recordType === 'CASE') {
    fillAddressFields(rowData, 'occurrence');
    fillAddressFields(rowData, 'complainant');
    fillAddressFields(rowData, 'accused');
    fillAddressFields(rowData, 'victim');

    syncPermanentAddress(rowData, 'complainant');
    syncPermanentAddress(rowData, 'accused');
    syncPermanentAddress(rowData, 'victim');

    if (!rowData.occurrence_from_date_time && rowData.occurrence_date) {
      rowData.occurrence_from_date_time = rowData.occurrence_date;
    }
  } else if (recordType === 'ARREST' || recordType === 'KALANDRA') {
    fillAddressFields(rowData, 'arrested');
    syncPermanentAddress(rowData, 'arrested');
  }

  if (rowData.sections) {
    const parsedActSection = parseActAndSection(rowData.sections);
    if (parsedActSection.act) {
      if (!rowData.act_name) {
        rowData.act_name = parsedActSection.act;
      }
      rowData.sections = parsedActSection.section;
    }

    // Normalize sections string to be comma-separated
    if (rowData.sections) {
      const sectionsArray = String(rowData.sections)
        .split(/[\/,]/)
        .map(s => s.trim())
        .filter(Boolean);
      rowData.sections = sectionsArray.join(', ');

      // Repeat the act name to match the number of sections
      if (rowData.act_name && sectionsArray.length > 1) {
        const actsArray = String(rowData.act_name).split(',').map(a => a.trim()).filter(Boolean);
        if (actsArray.length === 1) {
          rowData.act_name = Array(sectionsArray.length).fill(actsArray[0]).join(', ');
        }
      }
    }
  }

  const hasStatusField = registryFieldsMap.status !== undefined;
  if (recordType === 'CASE' && hasStatusField && (rowData.status === null || rowData.status === undefined || rowData.status === '')) {
    rowData.status = 'Open';
  }

  return rowData;
};

// T6 (03-TRIAGE-MATRIX.md/F2/E4) — ghost/trailing-row skip. A row with <=2 non-empty cells is
// almost always a stray copy-paste artifact/trailing formatting rather than real data, UNLESS
// one of those 1-2 filled cells is a keystone column for this record type — a keystone value
// present is a strong enough signal that the row is really data (a genuinely too-sparse real
// row still gets caught downstream by the normal required-field/keystone ERRORs, which is the
// correct outcome for that case, not a silent skip). The keystone set itself now lives in
// import-fields.config.js (FIX 2a, 2026-07) as the SAME map import.validate.js's row-level
// required-field check uses (`keystoneColumnsFor` = KEYSTONE_FIELDS ∪ every OR-group field) —
// previously this file kept its own hand-copy (GHOST_ROW_KEYSTONE_COLUMNS) which had already
// drifted from import.validate.js's KEYSTONE_FIELDS for MISSING.
//
// FIX 2b (2026-07): the <=2-non-empty-cell skip is now restricted to the PARENT sheet only
// (`isParentSheet`). A child/role sheet (Victim/Accused/Property/Person Arrested/Act & Sections)
// keeps ONLY the always-applied zero-non-empty-cell skip — a sparse-but-real child row (e.g.
// a bare parent-key reference plus one filled field) must reach validation and fail loudly
// (PARENT_KEY_BLANK / REQUIRED_MISSING) rather than vanish silently. Ghost/trailing-artifact
// rows are overwhelmingly a parent-sheet phenomenon (a stray copy-pasted FIR row); child sheets
// don't get the same benefit of the doubt.
export const parseWorksheet = (worksheet, recordType, fieldsList, coercionFieldsByKey = null, isParentSheet = true) => {
  log.debug('parseWorksheet: enter', { sheet: worksheet.name, recordType, isParentSheet, fieldCount: fieldsList.length });
  const { colMap, dataStartRow } = buildColumnMap(worksheet, recordType, fieldsList);
  const registryFieldsMap = {};
  for (const f of fieldsList) {
    registryFieldsMap[f.field_key] = f;
  }
  const keystoneCols = keystoneColumnsFor(recordType);

  const rows = [];
  const skippedGhostRows = [];
  worksheet.eachRow((row, rowIdx) => {
    if (rowIdx < dataStartRow) return;

    let nonEmptyCount = 0;
    let hasKeystoneValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colIdx) => {
      nonEmptyCount++;
      const key = colMap[colIdx];
      if (key && keystoneCols.has(key)) hasKeystoneValue = true;
    });
    if (nonEmptyCount === 0) return; // fully blank rows were always silently skipped

    if (isParentSheet && nonEmptyCount <= 2 && !hasKeystoneValue) {
      log.warn('parseWorksheet: skipped ghost/trailing row', { sheet: worksheet.name, recordType, rowIdx, nonEmptyCount });
      skippedGhostRows.push(rowIdx);
      return;
    }

    const rowData = extractRowData(row, colMap, registryFieldsMap, recordType, coercionFieldsByKey);
    // Per-row trace (HANDOFF §3 "every Excel row parsed") — key business fields + a populated
    // count, never the full rowData (may carry PII: names/addresses/mobiles).
    log.debug('parseWorksheet: row parsed', {
      sheet: worksheet.name, recordType, rowIdx,
      populatedFields: Object.values(rowData).filter((v) => v !== null && v !== undefined && v !== '').length,
    });
    rows.push({ rowData, rowIdx });
  });

  log.debug('parseWorksheet: exit', { sheet: worksheet.name, recordType, rowsParsed: rows.length, ghostRowsSkipped: skippedGhostRows.length });
  return { rows, skippedGhostRows };
};

// ── Shared workbook reader (NEW this integration) ────────────────────────────────────────
// The one place that resolves a record type's worksheets and parses EVERY sheet into rows.
// Both the validate endpoint and the async confirm handler (WP4/WP5) call this on the same
// file, so what gets validated is exactly what gets composed and written (C3/AD7) — the old
// controller had this ~200-line resolve+parse dance duplicated (and free to drift) between
// validateImportBatch and confirmImportBatch; this function is the single source now.

// Per-record-type sheet-role → curated field list. PCR_CALL/other generic types have no
// curated lists (they parse straight off field_registry, matching the old generic branch at
// import.controller.js's confirm/validate 'else' arms) and are handled separately below.
const SHEET_FIELD_LISTS = {
  CASE: { parent: caseGeneralFields, victim: caseVictimFields, act: caseActSectionFields, accused: caseAccusedFields, property: casePropertyFields },
  ARREST: { parent: arrestGeneralFields, act: arrestActSectionFields, person: arrestPersonFields, property: arrestPropertyFields },
  KALANDRA: { parent: kalandraGeneralFields, act: kalandraActSectionFields, person: kalandraPersonFields, property: arrestPropertyFields },
  UIDB: { parent: uidbGeneralFields, act: uidbActSectionFields },
  MISSING: { parent: missingGeneralFields },
};

// The parent sheet's own natural-key column per type — null where there is none (MISSING has
// no child sheets to key against; PCR_CALL is single-sheet-only).
const PARENT_KEY_FIELD = { CASE: 'fir_no', ARREST: 'linked_fir_dd_no', KALANDRA: 'linked_fir_dd_no', UIDB: 'gd_no' };

// ── T9 (03-TRIAGE-MATRIX.md) — parse-time layout version detection ─────────────────────────
// Shown to the operator when NO known layout (layout-manifests.js) fingerprints well enough to
// trust per-column parsing — replaces what would otherwise be a per-row cascade of
// REQUIRED_MISSING findings against columns that were never really there.
export const UNKNOWN_LAYOUT_MESSAGE = "This file doesn't match any known PHAROS import template. Download the current template from this page and copy your data into it.";

// A layout must score at least this well (mean Jaccard similarity across every sheet role both
// it and the workbook actually have) to be trusted at all — below this, the file is rejected
// as unknown rather than parsed against a poor-fit guess. Chosen with wide margin: real
// current/old-template files score >=0.65 even against the WRONG one of the two candidates
// (they share most columns), while a genuinely unrelated/garbage header set scores ~0 against
// both (buildColumnMap's own key-resolution finds nothing in common) — see the Wave B report
// for the worked numbers.
const LAYOUT_REJECT_THRESHOLD = 0.35;

function jaccardSimilarity(a, b) {
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const k of a) if (b.has(k)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Fingerprints this workbook's ALREADY-detected header columns (buildColumnMap's own
 * key-resolution — the exact same one real parsing uses, so a "known" verdict here is exactly
 * what will actually get parsed) against every layout layout-manifests.js registers for this
 * record type, and picks the single best match: the mean Jaccard similarity across every sheet
 * role BOTH the candidate layout defines AND this workbook actually has a resolved worksheet
 * for (a batch missing an optional child sheet — e.g. no accused rows at all — never counts
 * against either candidate, since neither gets a score contribution from an absent sheet).
 *
 * Returns `{ unknown: true }` when even the best-scoring layout falls below
 * LAYOUT_REJECT_THRESHOLD — this file doesn't resemble ANY known template closely enough to
 * trust. Otherwise `{ unknown: false, layoutId }`; `layoutId === 'current'` means nothing to
 * report, any other id is a known OLDER layout (still parsed normally — bridging only the
 * columns that exist — plus one batch-level WARNING import.validate.js emits).
 *
 * `roleWorksheets` = { [role]: Worksheet | null } for every role `fieldLists` defines (parent
 * always present; a child role may be null when that sheet simply wasn't found — normal and
 * harmless, matches readWorkbook's own `childSheets[role] = []` fallback).
 */
function classifyLayout(roleWorksheets, recordType, fieldLists) {
  const knownLayouts = getKnownLayouts(recordType);
  // No manifest coverage at all for this type (PCR_CALL) — never fingerprinted, never
  // rejected/warned; readWorkbook's generic branch doesn't even call this function, but a type
  // present in SHEET_FIELD_LISTS with zero layout-manifests.js coverage degrades the same way.
  if (!knownLayouts.length) {
    log.debug('classifyLayout: no layout manifest coverage for this type — skipping fingerprint', { recordType });
    return { unknown: false, layoutId: 'current' };
  }

  const detectedByRole = {};
  for (const [role, ws] of Object.entries(roleWorksheets)) {
    if (!ws) continue;
    const { colMap } = buildColumnMap(ws, recordType, fieldLists[role] || []);
    detectedByRole[role] = new Set(Object.values(colMap).filter(Boolean));
  }

  let best = null;
  const scores = [];
  for (const layout of knownLayouts) {
    let sum = 0;
    let count = 0;
    for (const [role, detected] of Object.entries(detectedByRole)) {
      const expected = layout.sheets[role];
      if (!expected) continue; // this layout doesn't define this role — skip, not a mismatch
      sum += jaccardSimilarity(detected, expected);
      count++;
    }
    const score = count ? sum / count : 0;
    scores.push({ layoutId: layout.id, score });
    if (!best || score > best.score) best = { layoutId: layout.id, score };
  }
  log.debug('classifyLayout: candidate scores', { recordType, scores, threshold: LAYOUT_REJECT_THRESHOLD });

  if (!best || best.score < LAYOUT_REJECT_THRESHOLD) {
    log.warn('classifyLayout: no known layout scored above threshold — rejecting as unknown', { recordType, best });
    return { unknown: true };
  }
  log.info('classifyLayout: matched layout', { recordType, layoutId: best.layoutId, score: best.score });
  return { unknown: false, layoutId: best.layoutId };
}

// T1/F1 gap #2 (03-TRIAGE-MATRIX.md): registry auto-included fields (registry-sync.util.js's
// autoIncludedRegistryFields — the same set template-builder.service.js appends to the actual
// Excel template) never appeared in ANY curated sheetFieldLists role, so they were parsed
// (buildColumnMap's raw-key fallback finds them fine) but NEVER required-checked, no matter
// what field_registry says. This heuristic buckets each auto-included field to the sheet ROLE
// it most likely landed on, by its field_registry `section` string, so the required-check can
// actually reach it.
//
// FIX 7 (2026-07): template-builder.service.js now exports its actual, authoritative
// section->{sheet,label} maps (CASE_SECTION_MAP / ARREST_SECTION_MAP — the exact map that
// decides where a field really lands in the emitted Excel template; exporting them changed no
// template bytes, proven by template-regression.js's byte-parity gate re-run after this
// change). Consulted FIRST below; the heuristic beneath it is now only a fallback for a
// `section` string absent from the authoritative map (still possible — the map is keyed by a
// curated set of section names, not guaranteed to cover every registry row's `section`).
const SHEET_NAME_TO_ROLE = {
  CASE: {
    'General Information': 'parent',
    'Victim Information': 'victim',
    'Act and Sections': 'act',
    'Accused Detail': 'accused',
    'Property Details': 'property',
  },
  // ARREST and KALANDRA (which imports/parses via the ARREST sheet structure) share one
  // sheet->role table — template-builder.service.js itself resolves KALANDRA's template off
  // ARREST_SECTION_MAP (recordType === 'CASE' ? CASE_SECTION_MAP : ARREST_SECTION_MAP).
  ARREST: {
    'General Info': 'parent',
    'Person Arrested Detail': 'person',
    'Act and Sections': 'act',
    'Property Details': 'property',
  },
};

function authoritativeRoleForAutoField(recordType, field) {
  const sectionMap = recordType === 'CASE' ? CASE_SECTION_MAP
    : (recordType === 'ARREST' || recordType === 'KALANDRA') ? ARREST_SECTION_MAP
    : null;
  if (!sectionMap) return null;
  const entry = sectionMap[field.section];
  if (!entry) return null;
  const sheetToRole = recordType === 'CASE' ? SHEET_NAME_TO_ROLE.CASE : SHEET_NAME_TO_ROLE.ARREST;
  return sheetToRole[entry.sheet] || null;
}

// Best-effort APPROXIMATION, used only when authoritativeRoleForAutoField above returns null
// (the field's `section` string isn't a key in template-builder.service.js's own map at all).
// Known residual gap: an auto-included field this heuristic guesses wrong for is
// required-checked against the wrong role's rows (a false negative — it silently isn't
// checked — not a false positive), flagged in the Wave A report.
function heuristicRoleForAutoField(recordType, field) {
  const section = String(field.section || '').toLowerCase();
  if (recordType === 'CASE') {
    if (section.startsWith('victim')) return 'victim';
    if (section.startsWith('accused')) return 'accused';
    if (section.includes('property')) return 'property';
    if (section.includes('act_section') || section.includes('offence')) return 'act';
    return 'parent';
  }
  if (recordType === 'ARREST' || recordType === 'KALANDRA') {
    if (section.includes('arrest') || section.includes('arrestee')) return 'person';
    if (section.includes('property')) return 'property';
    if (section.includes('act_section') || section.includes('offence')) return 'act';
    return 'parent';
  }
  if (recordType === 'UIDB' && (section.includes('act_section') || section.includes('offence'))) return 'act';
  return 'parent'; // UIDB (non-act) / MISSING have one effective data sheet besides act_section
}

function roleForAutoField(recordType, field) {
  return authoritativeRoleForAutoField(recordType, field) || heuristicRoleForAutoField(recordType, field);
}

/** Appends registry auto-included fields (not already covered by ANY curated role's keys) to
 * their heuristically-routed role's required-check list. Returns a NEW sheetFieldLists object
 * — never mutates the curated arrays (import-fields.config.js's exports are shared/reused). */
function withAutoIncludedFields(recordType, curatedFieldLists, registryFieldsList) {
  const allCuratedKeys = new Set(Object.values(curatedFieldLists).flat().map((f) => f.field_key));
  const autoFields = autoIncludedRegistryFields(recordType, registryFieldsList, allCuratedKeys);
  const augmented = {};
  for (const [role, list] of Object.entries(curatedFieldLists)) augmented[role] = [...list];
  for (const f of autoFields) {
    const role = roleForAutoField(recordType, f);
    if (!augmented[role]) augmented[role] = [];
    augmented[role].push(f);
  }
  log.debug('withAutoIncludedFields: augmented required-check field lists', {
    recordType, autoFieldCount: autoFields.length, autoFieldKeys: autoFields.map((f) => f.field_key),
  });
  return augmented;
}

/**
 * `registryMap` = field_key → normalized field_registry row (already shimmed via
 * registry-sync.util.js's normalizeRegistryRow) for every ACTIVE field applicable to
 * `recordType` — the same map validate/confirm build today, threaded through as
 * `coercionFieldsByKey` so every column (curated or auto-appended) coerces by its real DB
 * field_type, matching what the interactive form and the mapper would do with the same value.
 *
 * Returns `null` if the file has no usable parent worksheet for this type. Otherwise:
 *   { parentRows: [{rowData, rowIdx}], childSheets: { <role>: [{rowData, rowIdx}] },
 *     parentIndex: buildParentKeyIndex(...) | null, parentKeyField: string | null }
 */
export const readWorkbook = async (recordType, filePath, registryMap) => {
  log.debug('readWorkbook: enter', { recordType, filePath });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  log.debug('readWorkbook: workbook loaded', { recordType, sheetCount: workbook.worksheets.length, sheetNames: workbook.worksheets.map((w) => w.name) });

  const fieldLists = SHEET_FIELD_LISTS[recordType];
  const registryFieldsList = Object.values(registryMap || {});

  if (!fieldLists) {
    // PCR_CALL / any other generic type: single worksheet, no curated list, no children —
    // matches the old confirm/validate 'else' branch exactly (findWorksheet is skipped
    // entirely there too; worksheets[0] is authoritative). Already 100% registry-driven
    // (sheetFieldLists.parent IS registryFieldsList), so T1's gap #2 never applied here.
    log.debug('readWorkbook: generic (no curated sheetFieldLists) branch', { recordType });
    const ws = workbook.worksheets[0] || workbook.getWorksheet(1);
    if (!ws) { log.warn('readWorkbook: no worksheet found at all', { recordType, filePath }); return null; }
    const { rows, skippedGhostRows } = parseWorksheet(ws, recordType, registryFieldsList, registryMap);
    log.info('readWorkbook: exit (generic)', { recordType, parentRows: rows.length, ghostRowsSkipped: skippedGhostRows.length });
    return {
      parentRows: rows, childSheets: {}, parentIndex: null, parentKeyField: null,
      sheetFieldLists: { parent: registryFieldsList },
      ghostRowsSkipped: skippedGhostRows.length ? [{ sheet: 'parent', rows: skippedGhostRows }] : [],
      layoutVersion: 'current', // PCR_CALL has no layout-manifests.js coverage — never fingerprinted
    };
  }

  const aliases = SHEET_ALIASES[recordType] || {};
  const parentWorksheet = findWorksheet(workbook, aliases.parent || []) || workbook.worksheets[0];
  if (!parentWorksheet) { log.warn('readWorkbook: no parent worksheet resolved', { recordType, filePath, candidates: aliases.parent }); return null; }
  log.debug('readWorkbook: resolved parent worksheet', { recordType, sheetName: parentWorksheet.name });

  // Resolve every child sheet ONCE — reused for both T9's fingerprint check (immediately below)
  // and the real per-role parse loop further down, instead of two separate findWorksheet passes.
  const roleWorksheets = { parent: parentWorksheet };
  for (const role of Object.keys(fieldLists)) {
    if (role === 'parent') continue;
    roleWorksheets[role] = findWorksheet(workbook, aliases[role] || []);
    log.debug('readWorkbook: resolved child worksheet', { recordType, role, sheetName: roleWorksheets[role]?.name || null, found: !!roleWorksheets[role] });
  }

  // T9 (03-TRIAGE-MATRIX.md) — must run before any real per-row parsing: an unrecognized
  // layout fails fast with ONE friendly message, never a per-row required-field cascade against
  // columns that were never really there (see classifyLayout's doc comment).
  const layout = classifyLayout(roleWorksheets, recordType, fieldLists);
  if (layout.unknown) {
    log.warn('readWorkbook: rejecting file — layout did not fingerprint-match any known template', { recordType, filePath });
    return { unknownLayout: true };
  }

  const ghostRowsSkipped = [];
  const parentKeyField = PARENT_KEY_FIELD[recordType] || null;
  const { rows: parentRows, skippedGhostRows: parentGhosts } = parseWorksheet(parentWorksheet, recordType, fieldLists.parent, registryMap);
  if (parentGhosts.length) ghostRowsSkipped.push({ sheet: 'parent', rows: parentGhosts });
  const parentIndex = parentKeyField ? buildParentKeyIndex(parentRows.map((r) => r.rowData[parentKeyField])) : null;
  log.debug('readWorkbook: parent sheet parsed', { recordType, parentKeyField, parentRowCount: parentRows.length, ghostRowsSkipped: parentGhosts.length });

  const childSheets = {};
  for (const role of Object.keys(fieldLists)) {
    if (role === 'parent') continue;
    const ws = roleWorksheets[role];
    if (!ws) { childSheets[role] = []; log.debug('readWorkbook: child sheet absent, treating as empty', { recordType, role }); continue; }
    // FIX 2b — child/role sheets are never parent sheets: only the zero-non-empty-cell skip
    // applies (isParentSheet=false), so a sparse-but-real child row reaches validation instead
    // of being silently dropped by the <=2-cell ghost-row heuristic.
    const { rows, skippedGhostRows } = parseWorksheet(ws, recordType, fieldLists[role], registryMap, false);
    if (skippedGhostRows.length) ghostRowsSkipped.push({ sheet: role, rows: skippedGhostRows });
    childSheets[role] = rows;
    log.debug('readWorkbook: child sheet parsed', { recordType, role, rowCount: rows.length, ghostRowsSkipped: skippedGhostRows.length });
  }

  // sheetFieldLists is exposed so import.validate.js's row-level required-field checks reuse
  // the SAME per-role curated list this function itself parsed with — no second copy of the
  // CASE/ARREST/KALANDRA/UIDB/MISSING sheet-role wiring anywhere else in the module. T1 gap #2:
  // augmented with registry auto-included fields, heuristically routed to a role (see
  // withAutoIncludedFields) — parsing itself (above) is untouched, only what gets
  // required-checked changes.
  const sheetFieldLists = withAutoIncludedFields(recordType, fieldLists, registryFieldsList);
  log.info('readWorkbook: exit', {
    recordType, layoutVersion: layout.layoutId, parentRows: parentRows.length,
    childSheetCounts: Object.fromEntries(Object.entries(childSheets).map(([role, rows]) => [role, rows.length])),
    ghostRowsSkippedTotal: ghostRowsSkipped.reduce((sum, g) => sum + g.rows.length, 0),
  });
  return { parentRows, childSheets, parentIndex, parentKeyField, sheetFieldLists, ghostRowsSkipped, layoutVersion: layout.layoutId };
};
