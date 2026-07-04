import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { publish } from '../../events/eventBus.js';
import { computeRowHash } from '../../utils/hash.js';
import { logger } from '../../utils/logger.js';
import { TYPE_CODES } from '../records/records.service.js';
import { createLink } from '../record-links/record-links.service.js';
import { TemplateBuilderService } from './template-builder.service.js';
import { toISO, toDMY } from '../../utils/dateFormat.js';
import {
  COUNTRY_OPTS,
  STATE_OPTS,
  DISTRICT_OPTS,
  caseGeneralFields,
  caseActSectionFields,
  caseVictimFields,
  caseAccusedFields,
  casePropertyFields,
  arrestGeneralFields,
  arrestActSectionFields,
  arrestPersonFields,
  arrestPropertyFields,
  uidbGeneralFields,
  uidbActSectionFields,
  missingGeneralFields
} from './import-fields.config.js';
import { autoIncludedRegistryFields, parseApplicableTypes } from './registry-sync.util.js';

// Synonyms map to handle template label variations and offsets
const CASE_SYNONYMS = {
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

const ARREST_SYNONYMS = {
  "Linked FIR No.": "linked_fir_dd_no",
  "Linked FIR no.": "linked_fir_dd_no",
  "FIR Date": "fir_date",
  "District": "district",
  "Police Station": "police_station",
  "Date Of Arrest": "date_of_arrest",
  "Time Of Arrest": "time_of_arrest",
  "Place Of Arrest": "place_of_arrest",
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

// Sentinel error_code used to persist invalid parent keys (FIR / linked_fir_dd_no) from
// validation to confirm. Never shown to users — filtered from all error-display paths.
const INVALID_PARENT_CODE = '__INVALID_PARENT__';

// Helper to check if a field is required
const isRequired = (field) => {
  if (!field.validation_rules) return false;
  try {
    const rules = typeof field.validation_rules === 'string'
      ? JSON.parse(field.validation_rules)
      : field.validation_rules;
    return !!rules.required;
  } catch (e) {
    return false;
  }
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
  const countries = ['india', 'nepal', 'bhutan', 'bangladesh', 'pakistan', 'sri lanka', 'myanmar', 'tibetan', 'american', 'british', 'canadian'];
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

const getRecordDate = (recordType, rowData) => {
  if (recordType === 'CASE') {
    return rowData.fir_date || rowData.occurrence_date;
  }
  if (recordType === 'ARREST') {
    return rowData.date_of_arrest || rowData.arrest_date;
  }
  if (recordType === 'PCR_CALL') {
    return rowData.gd_date;
  }
  if (recordType === 'UIDB') {
    return rowData.found_date;
  }
  if (recordType === 'MISSING') {
    return rowData.missing_date;
  }
  return null;
};

const normLabel = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Tolerant worksheet resolver: matches a sheet against candidate names case-insensitively,
// then by substring (either direction), so a file whose parent sheet is named e.g.
// "General Information" still resolves when the code expects "General Info" (and vice versa).
const findWorksheet = (workbook, candidates) => {
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
const SHEET_ALIASES = {
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
  UIDB: {
    parent: ['General Info', 'General Information', 'Import Template', 'General'],
    act: ['Act and Sections', 'Acts and Sections', 'Act & Sections']
  },
  MISSING: {
    parent: ['Import Template', 'General Info', 'General Information', 'General']
  }
};

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
const buildColumnMap = (worksheet, recordType, registryFields) => {
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
  const synonyms = recordType === 'CASE' ? CASE_SYNONYMS : ARREST_SYNONYMS;

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

  return { colMap, dataStartRow, hasHiddenKeys: !!keyRow };
};

// Helper to parse sheets. `coercionFieldsByKey` (field_key → registry row) supplies
// type-aware coercion (DATE/TIME/SELECT) for every column — including registry fields
// added after this code shipped, which appear in the template automatically and must
// import just as cleanly as curated ones.
const parseWorksheet = (worksheet, recordType, fieldsList, coercionFieldsByKey = null) => {
  const { colMap, dataStartRow } = buildColumnMap(worksheet, recordType, fieldsList);
  const registryFieldsMap = {};
  for (const f of fieldsList) {
    registryFieldsMap[f.field_key] = f;
  }

  const rows = [];
  worksheet.eachRow((row, rowIdx) => {
    if (rowIdx < dataStartRow) return;

    let isEmpty = true;
    row.eachCell({ includeEmpty: false }, () => {
      isEmpty = false;
    });
    if (isEmpty) return;

    const rowData = extractRowData(row, colMap, registryFieldsMap, recordType, coercionFieldsByKey);
    rows.push({ rowData, rowIdx });
  });

  return { rows };
};

// Helper to validate sheet rows. `parentIndex` is a buildParentKeyIndex() result —
// child rows are matched to parents canonically, not by raw string equality.
const validateSheetRows = (rows, fieldsList, sheetName, errors, parentIndex = null, parentKeyField = null) => {
  for (const { rowData, rowIdx } of rows) {
    if (parentIndex && parentKeyField) {
      const parentVal = rowData[parentKeyField];
      if (!parentVal || parentIndex.resolve(parentVal) === null) {
        errors.push({
          row: rowIdx,
          field_key: parentKeyField,
          code: 'PARENT_KEY_MISSING',
          message: `Reference '${parentVal || ''}' in sheet '${sheetName}' does not exist in the General Info sheet.`
        });
      }
    }

    for (const field of fieldsList) {
      const key = field.field_key;
      const val = rowData[key];

      if (field.show_when && !evaluateShowWhen(field.show_when, rowData)) {
        continue;
      }

      const required = field.required === true || isRequired(field);
      if (required && (val === null || val === undefined || val === '')) {
        errors.push({
          row: rowIdx,
          field_key: key,
          code: 'REQUIRED_MISSING',
          message: `"${field.label_en}" is required in sheet "${sheetName}".`
        });
      }
    }
  }
};

// Robustly extract the FIR sequence number and year
const parseFirAndYear = (str) => {
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
      if (nums[1].length === 2) y = 2000 + y;
      year = y;
    }
  }
  return { firNo: seqToken != null ? String(parseInt(seqToken, 10)) : '', year };
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
const canonKey = (val) => {
  const p = canonKeyParts(val);
  if (!p) return '';
  if (p.seq) return p.year ? `${p.seq}|${p.year}` : p.seq;
  return p.raw;
};

// Index over the parent sheet's keys supporting lenient child→parent resolution:
//   1. exact canonical match;
//   2. else match by FIR sequence alone when exactly one parent is compatible
//      (a year on both sides that differs is a conflict, a missing year is not).
const buildParentKeyIndex = (parentVals) => {
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
    if (byCanon.has(canon)) return canon;
    if (p.seq) {
      const compatible = (bySeq.get(p.seq) || []).filter(
        (e) => !p.year || !e.year || e.year === p.year
      );
      if (compatible.length === 1) return compatible[0].canon;
    }
    return null;
  };
  return { resolve };
};

// Groups child-sheet rows under their parent's canonical key. Rows whose key
// resolves to no parent are dropped here — validation has already reported them
// as PARENT_KEY_MISSING.
const groupRowsByParent = (rows, keyField, parentIndex) => {
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
const mergeNonEmpty = (target, source) => {
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && v !== undefined && v !== '') target[k] = v;
  }
  return target;
};

// One arrest cell sometimes lists several FIRs ("12/2025, 13/2025"). Split on
// separators that never appear inside a single FIR ('/' and '-' do).
const splitFirTokens = (raw) => {
  if (raw === null || raw === undefined) return [];
  return String(raw)
    .split(/\s*(?:[,;&\n]|\band\b)\s*/i)
    .map((t) => t.trim())
    .filter(Boolean);
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
const yearOf = (val) => {
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
      }
    } else {
      if (key.includes('date')) cellVal = coerceDate(cellVal);
      else if (key.includes('time')) cellVal = coerceTime(cellVal);
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
    
    if (!rowData.occurrence_from_date_time && rowData.occurrence_date) {
      rowData.occurrence_from_date_time = rowData.occurrence_date;
    }
  } else if (recordType === 'ARREST') {
    fillAddressFields(rowData, 'arrested');
  }

  if (rowData.sections) {
    const parsedActSection = parseActAndSection(rowData.sections);
    if (parsedActSection.act) {
      if (!rowData.act_name) {
        rowData.act_name = parsedActSection.act;
      }
      rowData.sections = parsedActSection.section;
    }
  }

  const hasStatusField = registryFieldsMap.status !== undefined;
  if (recordType === 'CASE' && hasStatusField && (rowData.status === null || rowData.status === undefined || rowData.status === '')) {
    rowData.status = 'Open';
  }

  return rowData;
};

const runAutoLinkageForArrests = async (trx, arrestRecords, psId, userId) => {
  const linkedDetails = [];
  const unmatchedDetails = [];

  if (!arrestRecords || arrestRecords.length === 0) {
    return { linkedCount: 0, unmatchedCount: 0, linkedDetails, unmatchedDetails };
  }

  const cases = await trx('records')
    .where({ record_type: 'CASE', ps_id: psId })
    .select('id', 'data');

  // Index every case by parsed FIR sequence once — O(cases + arrests) instead of
  // re-parsing every case for every arrest.
  const casesBySeq = new Map();
  for (const c of cases) {
    let dataObj = {};
    try {
      dataObj = typeof c.data === 'string' ? JSON.parse(c.data) : (c.data || {});
    } catch (e) {}
    const parsed = parseFirAndYear(dataObj.fir_no || '');
    if (!parsed.firNo) continue;
    const year = parsed.year || (dataObj.fir_date ? yearOf(dataObj.fir_date) : null);
    if (!casesBySeq.has(parsed.firNo)) casesBySeq.set(parsed.firNo, []);
    casesBySeq.get(parsed.firNo).push({ id: c.id, data: dataObj, year });
  }

  for (const arrest of arrestRecords) {
    const arrestData = arrest.data;
    const firTokens = splitFirTokens(arrestData.linked_fir_dd_no);

    if (firTokens.length === 0) {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: null,
        reason: 'No Linked FIR / DD No. provided in arrest record'
      });
      continue;
    }

    // Year hint when a FIR token has none: the arrest's own FIR date, else arrest date.
    const fallbackYear =
      (arrestData.fir_date ? yearOf(arrestData.fir_date) : null) ||
      (arrestData.date_of_arrest ? yearOf(arrestData.date_of_arrest) : null);

    // One arrest cell can reference several FIRs — link to every case that matches
    // (record_links is many-to-many).
    for (const token of firTokens) {
      const parsedArrest = parseFirAndYear(token);
      if (!parsedArrest.firNo) {
        unmatchedDetails.push({
          arrest_uid: arrestData.uid,
          linked_fir_dd_no: token,
          reason: 'FIR / DD number could not be parsed'
        });
        continue;
      }

      const candidates = casesBySeq.get(parsedArrest.firNo) || [];
      if (candidates.length === 0) {
        unmatchedDetails.push({
          arrest_uid: arrestData.uid,
          linked_fir_dd_no: token,
          reason: 'No matching CASE record found with this FIR number'
        });
        continue;
      }

      const wantYear = parsedArrest.year || fallbackYear;
      let yearFiltered = candidates;
      if (wantYear) {
        const strict = candidates.filter(c => c.year === wantYear);
        // Cases whose FIR carries no year at all stay eligible when nothing matches strictly.
        yearFiltered = strict.length > 0 ? strict : candidates.filter(c => !c.year);
      }

      if (yearFiltered.length === 0) {
        unmatchedDetails.push({
          arrest_uid: arrestData.uid,
          linked_fir_dd_no: token,
          reason: `Case found but year mismatch (Expected FIR year: ${wantYear})`
        });
        continue;
      }

      let bestCase = null;
      if (yearFiltered.length === 1) {
        bestCase = yearFiltered[0];
      } else {
        // Tie-break by crime head + sections; a wrong link is worse than no link,
        // so refuse to guess when the top score is shared.
        let bestScore = -1;
        let tiedAtBest = false;
        for (const candidate of yearFiltered) {
          let score = 0;
          const candidateData = candidate.data;
          if (candidateData.local_head && arrestData.crime_head && eqi(candidateData.local_head, arrestData.crime_head)) {
            score += 1;
          }
          if (candidateData.sections && arrestData.sections && eqi(candidateData.sections, arrestData.sections)) {
            score += 1;
          }
          if (score > bestScore) {
            bestScore = score;
            bestCase = candidate;
            tiedAtBest = false;
          } else if (score === bestScore) {
            tiedAtBest = true;
          }
        }
        if (tiedAtBest) {
          unmatchedDetails.push({
            arrest_uid: arrestData.uid,
            linked_fir_dd_no: token,
            reason: 'Multiple cases share this FIR number and could not be disambiguated — link manually'
          });
          continue;
        }
      }

      try {
        await createLink({
          sourceRecordId: bestCase.id,
          targetRecordId: arrest.id,
          linkTypeCode: 'CASE_ARREST',
          userId,
          metadata: { notes: 'Auto-linked during bulk import' }
        });

        linkedDetails.push({
          arrest_uid: arrestData.uid,
          case_uid: bestCase.data.uid,
          fir_no: bestCase.data.fir_no
        });
      } catch (err) {
        if (err.status === 409) {
          // Link already exists — that is the desired end state, count it as linked.
          linkedDetails.push({
            arrest_uid: arrestData.uid,
            case_uid: bestCase.data.uid,
            fir_no: bestCase.data.fir_no,
            note: 'Already linked'
          });
        } else {
          logger.error(`[AutoLinkage] Failed to create link: ${err.message}`);
          unmatchedDetails.push({
            arrest_uid: arrestData.uid,
            linked_fir_dd_no: token,
            reason: `Failed to link: ${err.message}`
          });
        }
      }
    }
  }

  return {
    linkedCount: linkedDetails.length,
    unmatchedCount: unmatchedDetails.length,
    linkedDetails,
    unmatchedDetails
  };
};

const generateImportUID = async (trx, recordType, psId, dateStr) => {
  const ps = await trx('hierarchy_nodes').where({ id: psId }).first();
  const psCode = ps?.code || 'PS';
  const cleanDate = (dateStr || new Date().toISOString().split('T')[0]).replace(/[^0-9]/g, '').slice(0, 8);
  const countRow = await trx('records')
    .where({ ps_id: psId, record_type: recordType })
    .count('* as count')
    .first();
  const seq = String((parseInt(countRow.count, 10) || 0) + 1).padStart(4, '0');
  return `${recordType}-${psCode}-${cleanDate}-${seq}`;
};

const getHint = (field) => {
  const reqStr = field.validation_rules?.required ? '[Required] ' : '';
  if (field.field_type === 'SELECT' || field.field_type === 'RADIO') {
    let options = [];
    try {
      options = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
    } catch (e) {}
    const optList = Array.isArray(options) ? options.map(o => (o && typeof o === 'object') ? o.value : o).join(', ') : '';
    return `${reqStr}select: ${optList}`;
  }
  if (field.field_type === 'DATE') return `${reqStr}date (DD/MM/YYYY)`;
  if (field.field_type === 'TIME') return `${reqStr}time (HH:MM)`;
  if (field.field_type === 'NUMBER') return `${reqStr}number`;
  return `${reqStr}${field.field_type.toLowerCase()}`;
};

const SECTION_SUBHEADING_MAP = {
  general_info: { en: 'General Information', hi: 'सामान्य जानकारी' },
  incident_details: { en: 'Incident Details', hi: 'घटना का विवरण' },
  person_details: { en: 'Physical Description', hi: 'शारीरिक हुलिया' },
  contacts_assigned: { en: 'Informant & Contact Details', hi: 'सूचना देने वाले का विवरण' },
  investigation_officer: { en: 'IO Details', hi: 'जांच अधिकारी का विवरण' },
  inquest_details: { en: 'Inquest Details', hi: 'पूछताछ का विवरण' },
  corpse_desc: { en: 'UIDB Details', hi: 'यूआईडीबी का विवरण' },
  informant_contact: { en: 'Informant Contact', hi: 'सूचना देने वाले का संपर्क' },
  complaint_details: { en: 'Complaint Details', hi: 'शिकायत का विवरण' }
};

const addSheetToWorkbook = (workbook, sheetName, fieldsList, allFields, lang, recordType) => {
  const worksheet = workbook.addWorksheet(sheetName);

  const row1 = fieldsList.map(f => f.field_key);
  worksheet.addRow(row1);
  worksheet.getRow(1).hidden = true;

  const subheadings = fieldsList.map(f => {
    const key = f.field_key;
    if (recordType === 'MISSING' || recordType === 'UIDB' || recordType === 'PCR_CALL') {
      const sectionInfo = SECTION_SUBHEADING_MAP[f.section];
      if (sectionInfo) {
        if (recordType === 'MISSING' && f.section === 'person_details') {
          return lang === 'hi' ? 'पता विवरण' : 'Address Details';
        }
        return lang === 'hi' ? sectionInfo.hi : sectionInfo.en;
      }
    }
    if (key.startsWith('complainant_perm_')) return lang === 'hi' ? 'शिकायतकर्ता का स्थायी पता' : 'Complainant Permanent Address';
    if (key.startsWith('complainant_')) {
      if (key.includes('house_no') || key.includes('street') || key.includes('colony') || key.includes('city') || key.includes('village') || key.includes('tehsil') || key.includes('state') || key.includes('district') || key.includes('pincode') || key.includes('address') || key.includes('police_station') || key.includes('country')) {
        return lang === 'hi' ? 'शिकायतकर्ता का वर्तमान पता' : 'Complainant Present Address';
      }
      return lang === 'hi' ? 'शिकायतकर्ता का व्यक्तिगत विवरण' : 'Complainant Personal Details';
    }
    if (key.startsWith('occurrence_')) return lang === 'hi' ? 'घटनास्थल का पता विवरण' : 'Place of Occurrence Address';
    if (key.startsWith('victim_perm_')) return lang === 'hi' ? 'पीड़ित का स्थायी पता' : 'Victim Permanent Address';
    if (key.startsWith('victim_')) {
      if (key.includes('house_no') || key.includes('street') || key.includes('colony') || key.includes('city') || key.includes('village') || key.includes('tehsil') || key.includes('state') || key.includes('district') || key.includes('pincode') || key.includes('address') || key.includes('police_station') || key.includes('country')) {
        return lang === 'hi' ? 'पीड़ित का वर्तमान पता' : 'Victim Present Address';
      }
      return lang === 'hi' ? 'पीड़ित का व्यक्तिगत विवरण' : 'Victim Personal Details';
    }
    if (key.startsWith('accused_perm_')) return lang === 'hi' ? 'अभियुक्त का स्थायी पता' : 'Accused Permanent Address';
    if (key.startsWith('accused_')) {
      if (key.includes('house_no') || key.includes('street') || key.includes('colony') || key.includes('city') || key.includes('village') || key.includes('tehsil') || key.includes('state') || key.includes('district') || key.includes('pincode') || key.includes('address') || key.includes('police_station') || key.includes('country')) {
        return lang === 'hi' ? 'अभियुक्त का वर्तमान पता' : 'Accused Present Address';
      }
      return lang === 'hi' ? 'अभियुक्त का व्यक्तिगत विवरण' : 'Accused Personal Details';
    }
    if (key.startsWith('arrested_perm_')) return lang === 'hi' ? 'गिरफ्तार व्यक्ति का स्थायी पता' : 'Arrested Person Permanent Address';
    if (key.startsWith('arrested_')) {
      if (key.includes('house_no') || key.includes('street') || key.includes('colony') || key.includes('city') || key.includes('village') || key.includes('tehsil') || key.includes('state') || key.includes('district') || key.includes('pincode') || key.includes('address') || key.includes('police_station') || key.includes('country')) {
        return lang === 'hi' ? 'गिरफ्तार व्यक्ति का वर्तमान पता' : 'Arrested Person Present Address';
      }
      return lang === 'hi' ? 'गिरफ्तार व्यक्ति का व्यक्तिगत विवरण' : 'Arrested Person Personal Details';
    }
    if (key.startsWith('property_') || key.startsWith('phone_')) return lang === 'hi' ? 'संपत्ति विवरण' : 'Property Details';
    if (['act', 'act_name', 'sections', 'crime_head', 'major_head', 'minor_head'].includes(key)) return lang === 'hi' ? 'अधिनियम और धाराएं' : 'Act and Sections';
    if (key === 'io_name' || key === 'io_pis' || key === 'io_mobile' || key === 'date_of_arrest') return lang === 'hi' ? 'जांच अधिकारी और गिरफ्तारी विवरण' : 'IO and Arrest Details';
    if (['nafis_prepared', 'dossier_prepared', 'search_slip_prepared', 'address_verified', 'verifying_officer_name', 'verifying_officer_rank', 'kin_name', 'kin_mobile', 'kin_relationship', 'photo_path'].includes(key)) {
      return lang === 'hi' ? 'सत्यापन और रिश्तेदार विवरण' : 'Verification and Kin Details';
    }
    return lang === 'hi' ? 'सामान्य जानकारी' : 'General Information';
  });

  const subheadingRow = worksheet.addRow(subheadings);
  subheadingRow.height = 25;
  subheadingRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  subheadingRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  let startCol = 1;
  for (let colIdx = 2; colIdx <= subheadings.length; colIdx++) {
    if (subheadings[colIdx - 1] !== subheadings[colIdx - 2]) {
      if (colIdx - 1 > startCol) {
        worksheet.mergeCells(2, startCol, 2, colIdx - 1);
      }
      startCol = colIdx;
    }
  }
  if (subheadings.length > startCol) {
    worksheet.mergeCells(2, startCol, 2, subheadings.length);
  }

  const row3 = fieldsList.map(f => {
    if (recordType === 'MISSING' && f.field_key === 'informant_relation') {
      return lang === 'hi' ? 'लापता व्यक्ति से संबंध' : 'Relation with Missing Person';
    }
    const matched = allFields.find(dbF => dbF.field_key === f.field_key);
    if (matched) {
      return lang === 'hi' ? matched.label_hi : matched.label_en;
    }
    return lang === 'hi' ? f.label_hi : f.label_en;
  });
  const headerRow = worksheet.addRow(row3);
  headerRow.height = 25;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const row4 = fieldsList.map(f => {
    const matched = allFields.find(dbF => dbF.field_key === f.field_key);
    return f.hint || (matched ? getHint(matched) : '');
  });
  const hintRow = worksheet.addRow(row4);
  hintRow.height = 20;
  hintRow.font = { italic: true, color: { argb: 'FF6B7280' } };
  hintRow.eachCell(cell => {
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  for (let colIdx = 0; colIdx < fieldsList.length; colIdx++) {
    const f = fieldsList[colIdx];
    const matched = allFields.find(dbF => dbF.field_key === f.field_key);
    
    let options = [];
    if (f.options) {
      try {
        options = typeof f.options === 'string' ? JSON.parse(f.options) : f.options;
      } catch (e) {
        options = Array.isArray(f.options) ? f.options : [];
      }
    } else if (matched && (matched.field_type === 'SELECT' || matched.field_type === 'RADIO')) {
      try {
        options = typeof matched.options === 'string' ? JSON.parse(matched.options) : matched.options;
      } catch (e) {}
    } else if (f.field_key.endsWith('_prepared') || f.field_key.endsWith('_verified') || f.field_key.endsWith('_same')) {
      options = ['Yes', 'No'];
    } else if (f.field_key.includes('gender')) {
      options = ['Male', 'Female', 'Transgender', 'Unknown'];
    }

    if ((!options || options.length === 0) && matched) {
      if (matched.field_key === 'state' || matched.field_key.endsWith('_state')) {
        options = STATE_OPTS;
      } else if (matched.field_key === 'district' || matched.field_key.endsWith('_district')) {
        options = DISTRICT_OPTS;
      } else if (matched.field_key === 'country' || matched.field_key.endsWith('_country')) {
        options = COUNTRY_OPTS;
      } else if (matched.field_key === 'status') {
        if (recordType === 'MISSING') {
          options = ['Un-traced', 'Traced', 'Referred', 'Closed'];
        } else if (recordType === 'UIDB') {
          options = ['Referred to district hospital', 'Identified', 'Body Claimed', 'Unidentified', 'Held in Mortuary'];
        } else if (recordType === 'PCR_CALL') {
          options = ['Action Taken', 'Pending', 'Referred', 'Closed'];
        }
      }
    }

    if (Array.isArray(options) && options.length > 0) {
      const validValues = options.map(o => {
        if (o && typeof o === 'object') {
          return lang === 'hi' ? (o.label_hi || o.label || o.value) : (o.label_en || o.label || o.value);
        }
        return o;
      });
      const joinedOpts = validValues.join(',');
      if (joinedOpts.length <= 250) {
        const formulaVal = `"${joinedOpts}"`;
        for (let rIdx = 5; rIdx <= 1000; rIdx++) {
          const cell = worksheet.getCell(rIdx, colIdx + 1);
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [formulaVal]
          };
        }
      } else {
        let lookupsSheet = workbook.getWorksheet('_Lookups');
        if (!lookupsSheet) {
          lookupsSheet = workbook.addWorksheet('_Lookups');
          try { lookupsSheet.state = 'veryHidden'; } catch (_) { lookupsSheet.state = 'hidden'; }
        }
        
        let nextLookupCol = 1;
        while (lookupsSheet.getRow(1).getCell(nextLookupCol).value) {
          nextLookupCol++;
        }
        
        lookupsSheet.getCell(1, nextLookupCol).value = f.field_key;
        validValues.forEach((v, idx) => {
          lookupsSheet.getCell(idx + 2, nextLookupCol).value = v;
        });
        
        const numToColLetter = (num) => {
          let letter = '';
          while (num > 0) {
            let temp = (num - 1) % 26;
            letter = String.fromCharCode(65 + temp) + letter;
            num = (num - temp - 1) / 26;
          }
          return letter;
        };
        
        const colLetter = numToColLetter(nextLookupCol);
        const formulaVal = `'_Lookups'!$${colLetter}$2:$${colLetter}$${validValues.length + 1}`;
        for (let rIdx = 5; rIdx <= 1000; rIdx++) {
          const cell = worksheet.getCell(rIdx, colIdx + 1);
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [formulaVal]
          };
        }
      }
    }
  }

  worksheet.columns.forEach(column => {
    let maxLen = 15;
    column.eachCell({ includeEmpty: true }, (cell, rowIdx) => {
      if (rowIdx === 1) return;
      const val = cell.value ? String(cell.value) : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    column.width = Math.min(maxLen + 4, 45);
  });
};

export const downloadImportTemplate = async (req, res) => {
  let recordType = req.params.record_type.toUpperCase();
  if (recordType === 'MISSINGPERSON' || recordType === 'MISSING_PERSON') {
    recordType = 'MISSING';
  }
  const lang = req.query.lang || 'en';

  const validTypes = ['ARREST', 'PCR_CALL', 'CASE', 'MISSING', 'UIDB'];
  if (!validTypes.includes(recordType)) {
    return res.status(400).json({ success: false, message: `Invalid record type '${recordType}'` });
  }

  try {
    if (recordType === 'CASE' || recordType === 'ARREST') {
      const workbook = await TemplateBuilderService.buildTemplate(recordType, lang);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${recordType}_Import_Template.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    const allFields = await db('field_registry')
      .where('is_active', true)
      .orderBy('sort_order', 'asc');

    const workbook = new ExcelJS.Workbook();

    if (recordType === 'UIDB') {
      // Registry-driven auto-inclusion: any active UIDB field the curated lists don't
      // mention (and that isn't excluded in import-fields.config.js) is appended at the
      // end of the General Info sheet, so new form fields flow into the template
      // automatically without shifting the curated columns.
      const uidbConfigKeys = new Set([
        ...uidbGeneralFields.map(f => f.field_key),
        ...uidbActSectionFields.map(f => f.field_key),
      ]);
      const uidbAutoFields = autoIncludedRegistryFields('UIDB', allFields, uidbConfigKeys);
      addSheetToWorkbook(workbook, 'General Info', [...uidbGeneralFields, ...uidbAutoFields], allFields, lang, recordType);
      addSheetToWorkbook(workbook, 'Act and Sections', uidbActSectionFields, allFields, lang);
      await TemplateBuilderService.wireActSectionCascade(
        workbook,
        workbook.getWorksheet('Act and Sections'),
        'UIDB',
        { act: 'act_name', sections: 'sections', major: 'major_head', minor: 'minor_head' }
      );
    } else if (recordType === 'MISSING') {
      const missingConfigKeys = new Set(missingGeneralFields.map(f => f.field_key));
      const missingAutoFields = autoIncludedRegistryFields('MISSING', allFields, missingConfigKeys);
      addSheetToWorkbook(workbook, 'Import Template', [...missingGeneralFields, ...missingAutoFields], allFields, lang, recordType);
    } else {
      let fields = allFields.filter(f => {
        try {
          const types = typeof f.applicable_record_types === 'string'
            ? JSON.parse(f.applicable_record_types)
            : f.applicable_record_types;
          return Array.isArray(types) && types.map(t => t.toUpperCase()).includes(recordType);
        } catch (e) {
          return false;
        }
      });

      fields.sort((a, b) => {
        const reqA = isRequired(a) ? 1 : 0;
        const reqB = isRequired(b) ? 1 : 0;
        if (reqA !== reqB) {
          return reqB - reqA;
        }
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      addSheetToWorkbook(workbook, 'Import Template', fields, allFields, lang, recordType);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${recordType}_Import_Template.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('[TemplateExport] Error generating template: ' + error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const validateImportBatch = async (req, res) => {
  const { record_type, is_legacy, ps_id } = req.body;
  const isLegacy = is_legacy === 'true' || is_legacy === true;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.xlsx') {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({
      success: false,
      message: 'Invalid file format. Only modern Excel spreadsheets (.xlsx) are supported. Please convert your file to .xlsx and try again.'
    });
  }

  const recordType = record_type ? record_type.toUpperCase() : null;
  const validTypes = ['ARREST', 'PCR_CALL', 'CASE', 'UIDB', 'MISSING'];
  if (!recordType || !validTypes.includes(recordType)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ success: false, message: 'Invalid or missing record_type. Must be CASE, ARREST, PCR_CALL, UIDB or MISSING.' });
  }

  if (req.user.role === 'HC' && isLegacy) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(403).json({ success: false, message: 'Operators (HC) cannot import legacy data' });
  }

  let finalPsId = null;
  let finalDistrictId = null;

  if (req.user.role === 'HC') {
    finalPsId = req.user.ps_id || req.user.station_id;
    finalDistrictId = req.user.district_id;
    if (ps_id && ps_id !== finalPsId) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(403).json({ success: false, message: 'Operators are restricted to importing for their assigned Station only' });
    }
  } else {
    finalPsId = ps_id || null;
    if (finalPsId) {
      const node = await db('hierarchy_nodes').where({ id: finalPsId }).first();
      if (node) {
        let currentNode = node;
        while (currentNode && currentNode.node_type !== 'DISTRICT') {
          if (!currentNode.parent_id) break;
          currentNode = await db('hierarchy_nodes').where({ id: currentNode.parent_id }).first();
        }
        if (currentNode && currentNode.node_type === 'DISTRICT') {
          finalDistrictId = currentNode.id;
        }
      }
    } else {
      if (req.user.role === 'DISTRICT_OFFICER') {
        finalDistrictId = req.user.district_id;
      }
    }
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);

    let parentWorksheet = null;
    let victimWorksheet = null;
    let accusedWorksheet = null;
    let propertyWorksheet = null;
    let actSectionWorksheet = null;
    let personWorksheet = null;

    if (recordType === 'CASE') {
      const a = SHEET_ALIASES.CASE;
      parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      victimWorksheet = findWorksheet(workbook, a.victim);
      actSectionWorksheet = findWorksheet(workbook, a.act);
      accusedWorksheet = findWorksheet(workbook, a.accused);
      propertyWorksheet = findWorksheet(workbook, a.property);
    } else if (recordType === 'ARREST') {
      const a = SHEET_ALIASES.ARREST;
      parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      actSectionWorksheet = findWorksheet(workbook, a.act);
      personWorksheet = findWorksheet(workbook, a.person);
      propertyWorksheet = findWorksheet(workbook, a.property);
    } else if (recordType === 'UIDB') {
      const a = SHEET_ALIASES.UIDB;
      parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      actSectionWorksheet = findWorksheet(workbook, a.act);
    } else if (recordType === 'MISSING') {
      const a = SHEET_ALIASES.MISSING;
      parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
    } else {
      parentWorksheet = workbook.worksheets[0] || workbook.getWorksheet(1);
    }

    if (!parentWorksheet) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, message: 'Invalid template: main worksheet not found' });
    }

    const allFields = await db('field_registry').where('is_active', true);
    // Tolerant type parse (JSON array, PG array literal, single value) so fields
    // created via the admin/district UI are recognised too.
    const registryFields = allFields.filter(f => parseApplicableTypes(f.applicable_record_types).includes(recordType));

    const registryFieldsMap = {};
    for (const f of registryFields) {
      registryFieldsMap[f.field_key] = f;
    }

    const errors = [];
    let totalRows = 0;
    let validRowsCount = 0;
    let invalidRowsCount = 0;
    // Authoritative set of parent keys (FIR / linked_fir_dd_no) deemed invalid; persisted
    // so confirm can skip by parent key rather than by ambiguous cross-sheet row numbers.
    let invalidParentKeys = new Set();

    if (recordType === 'CASE') {
      const { rows: parentRows } = parseWorksheet(parentWorksheet, recordType, caseGeneralFields, registryFieldsMap);
      const parentIndex = buildParentKeyIndex(parentRows.map(r => r.rowData.fir_no));
      totalRows = parentRows.length;

      invalidParentKeys = new Set();
      // Attributes a child-sheet error to its parent FIR so the whole FIR is skipped on confirm.
      const invalidateParentOf = (val) => {
        if (!val) return;
        invalidParentKeys.add(parentIndex.resolve(val) || canonKey(val));
      };

      // Validate General Information
      validateSheetRows(parentRows, caseGeneralFields, 'General Information', errors);

      // In-sheet duplicate FIR check — canonical, so "123/2025" also collides with
      // "0123/2025" or a numeric 123 cell.
      const sheetFirs = new Set();
      for (const pr of parentRows) {
        const fir = pr.rowData.fir_no;
        if (fir) {
          const cKey = canonKey(fir);
          if (sheetFirs.has(cKey)) {
            errors.push({
              row: pr.rowIdx,
              field_key: 'fir_no',
              code: 'DUPLICATE_IN_SHEET',
              message: `Duplicate FIR number "${fir}" found in General Information sheet.`
            });
            invalidParentKeys.add(cKey);
          } else {
            sheetFirs.add(cKey);
          }
        }
      }

      // Database Uniqueness Check by Police Station
      if (parentRows.length > 0) {
        const existingCases = await db('records')
          .where({ record_type: 'CASE', ps_id: finalPsId })
          .select('data');
        const existingFirs = new Set();
        for (const ec of existingCases) {
          let data = null;
          try { data = typeof ec.data === 'string' ? JSON.parse(ec.data) : ec.data; } catch (_) {}
          if (data && data.fir_no) {
            existingFirs.add(canonKey(data.fir_no));
          }
        }

        for (const pr of parentRows) {
          const fir = pr.rowData.fir_no;
          if (fir && existingFirs.has(canonKey(fir))) {
            errors.push({
              row: pr.rowIdx,
              field_key: 'fir_no',
              code: 'DUPLICATE_IN_DATABASE',
              message: `FIR number "${fir}" already exists in the database for this Police Station.`
            });
            invalidParentKeys.add(canonKey(fir));
          }
        }
      }

      for (const pr of parentRows) {
        const hasErr = errors.some(e => e.row === pr.rowIdx);
        if (hasErr && pr.rowData.fir_no) {
          invalidParentKeys.add(canonKey(pr.rowData.fir_no));
        }
      }

      // Only parent-sheet errors exist so far; snapshot their rows before child-sheet
      // errors (whose row numbers can collide with parent rows) get merged in.
      const parentErrorRows = new Set(errors.map(e => e.row));

      // Validate Victims
      if (victimWorksheet) {
        const { rows: victimRows } = parseWorksheet(victimWorksheet, recordType, caseVictimFields, registryFieldsMap);
        const childErrors = [];
        validateSheetRows(victimRows, caseVictimFields, 'Victim Information', childErrors, parentIndex, 'fir_no');

        // Check duplicate victims under same FIR (grouped by canonical parent key)
        const victimKeySet = new Set();
        for (const vr of victimRows) {
          const fir = vr.rowData.fir_no;
          const name = `${vr.rowData.victim_first_name || ''} ${vr.rowData.victim_last_name || ''}`.trim().toLowerCase();
          const relName = (vr.rowData.victim_relative_name || '').trim().toLowerCase();
          if (fir && name) {
            const vKey = `${parentIndex.resolve(fir) || canonKey(fir)}|${name}|${relName}`;
            if (victimKeySet.has(vKey)) {
              childErrors.push({
                row: vr.rowIdx,
                field_key: 'victim_first_name',
                code: 'DUPLICATE_VICTIM',
                message: `Duplicate victim "${vr.rowData.victim_first_name || ''}" listed under FIR "${fir}".`
              });
            } else {
              victimKeySet.add(vKey);
            }
          }
        }

        for (const err of childErrors) {
          errors.push(err);
          const errRow = victimRows.find(vr => vr.rowIdx === err.row);
          if (errRow) invalidateParentOf(errRow.rowData.fir_no);
        }
      }

      // Validate Act and Sections
      if (actSectionWorksheet) {
        const { rows: actSectionRows } = parseWorksheet(actSectionWorksheet, recordType, caseActSectionFields, registryFieldsMap);
        const childErrors = [];
        validateSheetRows(actSectionRows, caseActSectionFields, 'Act and Sections', childErrors, parentIndex, 'fir_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = actSectionRows.find(ar => ar.rowIdx === err.row);
          if (errRow) invalidateParentOf(errRow.rowData.fir_no);
        }
      }

      // Validate Accused Detail
      if (accusedWorksheet) {
        const { rows: accusedRows } = parseWorksheet(accusedWorksheet, recordType, caseAccusedFields, registryFieldsMap);
        const childErrors = [];
        validateSheetRows(accusedRows, caseAccusedFields, 'Accused Detail', childErrors, parentIndex, 'fir_no');

        // Check duplicate accused under same FIR
        const accusedKeySet = new Set();
        for (const ar of accusedRows) {
          const fir = ar.rowData.fir_no;
          const name = `${ar.rowData.accused_first_name || ''} ${ar.rowData.accused_last_name || ''}`.trim().toLowerCase();
          const relName = (ar.rowData.accused_relative_name || '').trim().toLowerCase();
          if (fir && name) {
            const aKey = `${parentIndex.resolve(fir) || canonKey(fir)}|${name}|${relName}`;
            if (accusedKeySet.has(aKey)) {
              childErrors.push({
                row: ar.rowIdx,
                field_key: 'accused_first_name',
                code: 'DUPLICATE_ACCUSED',
                message: `Duplicate accused "${ar.rowData.accused_first_name || ''}" listed under FIR "${fir}".`
              });
            } else {
              accusedKeySet.add(aKey);
            }
          }
        }

        for (const err of childErrors) {
          errors.push(err);
          const errRow = accusedRows.find(ar => ar.rowIdx === err.row);
          if (errRow) invalidateParentOf(errRow.rowData.fir_no);
        }
      }

      // Validate Property Details
      if (propertyWorksheet) {
        const { rows: propertyRows } = parseWorksheet(propertyWorksheet, recordType, casePropertyFields, registryFieldsMap);
        const childErrors = [];
        validateSheetRows(propertyRows, casePropertyFields, 'Property Details', childErrors, parentIndex, 'fir_no');

        // Check duplicate properties under same FIR
        const propertyKeySet = new Set();
        for (const pr of propertyRows) {
          const fir = pr.rowData.fir_no;
          const cat = (pr.rowData.property_major_category || '').trim().toLowerCase();
          const det = (pr.rowData.property_details || '').trim().toLowerCase();
          if (fir && (cat || det)) {
            const pKey = `${parentIndex.resolve(fir) || canonKey(fir)}|${cat}|${det}`;
            if (propertyKeySet.has(pKey)) {
              childErrors.push({
                row: pr.rowIdx,
                field_key: 'property_major_category',
                code: 'DUPLICATE_PROPERTY',
                message: `Duplicate property of category "${pr.rowData.property_major_category || ''}" listed under FIR "${fir}".`
              });
            } else {
              propertyKeySet.add(pKey);
            }
          }
        }

        for (const err of childErrors) {
          errors.push(err);
          const errRow = propertyRows.find(pr => pr.rowIdx === err.row);
          if (errRow) invalidateParentOf(errRow.rowData.fir_no);
        }
      }

      for (const pr of parentRows) {
        if (invalidParentKeys.has(canonKey(pr.rowData.fir_no)) || parentErrorRows.has(pr.rowIdx)) {
          invalidRowsCount++;
        } else {
          validRowsCount++;
        }
      }

    } else if (recordType === 'ARREST') {
      const { rows: parentRows } = parseWorksheet(parentWorksheet, recordType, arrestGeneralFields, registryFieldsMap);
      const parentIndex = buildParentKeyIndex(parentRows.map(r => r.rowData.linked_fir_dd_no));
      totalRows = parentRows.length;

      invalidParentKeys = new Set();
      const invalidateParentOf = (val) => {
        if (!val) return;
        invalidParentKeys.add(parentIndex.resolve(val) || canonKey(val));
      };

      // Validate General Info
      validateSheetRows(parentRows, arrestGeneralFields, 'General Info', errors);

      // Check duplicate arrests in excel sheet (canonical FIR keys)
      const sheetArrests = new Set();
      let tempPersonRows = [];
      if (personWorksheet) {
        tempPersonRows = parseWorksheet(personWorksheet, recordType, arrestPersonFields, registryFieldsMap).rows.map(r => r.rowData);
      }
      const personsByParent = groupRowsByParent(tempPersonRows, 'linked_fir_dd_no', parentIndex);

      for (const pr of parentRows) {
        const fir = pr.rowData.linked_fir_dd_no;
        if (fir) {
          const parentCanon = parentIndex.resolve(fir) || canonKey(fir);
          const matchingPs = personsByParent.get(parentCanon) || [];
          if (matchingPs.length > 0) {
            for (const pData of matchingPs) {
              const name = `${pData.arrested_first_name || ''} ${pData.arrested_last_name || ''}`.trim().toLowerCase();
              const aKey = `${parentCanon}|${name}`;
              if (sheetArrests.has(aKey)) {
                errors.push({
                  row: pr.rowIdx,
                  field_key: 'linked_fir_dd_no',
                  code: 'DUPLICATE_IN_SHEET',
                  message: `Duplicate Arrest row for "${pData.arrested_first_name || ''}" under FIR "${fir}" found in sheet.`
                });
                invalidParentKeys.add(parentCanon);
              } else {
                sheetArrests.add(aKey);
              }
            }
          } else {
            if (sheetArrests.has(parentCanon)) {
              errors.push({
                row: pr.rowIdx,
                field_key: 'linked_fir_dd_no',
                code: 'DUPLICATE_IN_SHEET',
                message: `Duplicate Arrest general info row for FIR "${fir}" found in sheet.`
              });
              invalidParentKeys.add(parentCanon);
            } else {
              sheetArrests.add(parentCanon);
            }
          }
        }
      }

      // Check database duplicates by Police Station
      if (parentRows.length > 0) {
        const existingArrests = await db('records')
          .where({ record_type: 'ARREST', ps_id: finalPsId })
          .select('data');
        const existingArrestKeys = new Set();
        for (const ea of existingArrests) {
          let data = null;
          try { data = typeof ea.data === 'string' ? JSON.parse(ea.data) : ea.data; } catch (_) {}
          if (data && data.linked_fir_dd_no) {
            const arrName = `${data.arrested_first_name || data.fullName || ''} ${data.arrested_last_name || ''}`.trim().toLowerCase();
            existingArrestKeys.add(`${canonKey(data.linked_fir_dd_no)}|${arrName}`);
          }
        }

        for (const pr of parentRows) {
          const fir = pr.rowData.linked_fir_dd_no;
          if (fir) {
            const parentCanon = parentIndex.resolve(fir) || canonKey(fir);
            const matchingPs = personsByParent.get(parentCanon) || [];
            for (const pData of matchingPs) {
              const name = `${pData.arrested_first_name || ''} ${pData.arrested_last_name || ''}`.trim().toLowerCase();
              const aKey = `${parentCanon}|${name}`;
              if (existingArrestKeys.has(aKey)) {
                errors.push({
                  row: pr.rowIdx,
                  field_key: 'linked_fir_dd_no',
                  code: 'DUPLICATE_IN_DATABASE',
                  message: `Arrest record for "${pData.arrested_first_name || ''}" under FIR "${fir}" already exists for this Police Station.`
                });
                invalidParentKeys.add(parentCanon);
              }
            }
          }
        }
      }

      for (const pr of parentRows) {
        const hasErr = errors.some(e => e.row === pr.rowIdx);
        if (hasErr && pr.rowData.linked_fir_dd_no) {
          invalidParentKeys.add(canonKey(pr.rowData.linked_fir_dd_no));
        }
      }

      // Snapshot parent-sheet error rows before child-sheet errors are merged in
      // (their row numbers can collide with parent rows).
      const parentErrorRows = new Set(errors.map(e => e.row));

      // Validate Act and Sections
      if (actSectionWorksheet) {
        const { rows: actSectionRows } = parseWorksheet(actSectionWorksheet, recordType, arrestActSectionFields, registryFieldsMap);
        const childErrors = [];
        validateSheetRows(actSectionRows, arrestActSectionFields, 'Act and Sections', childErrors, parentIndex, 'linked_fir_dd_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = actSectionRows.find(ar => ar.rowIdx === err.row);
          if (errRow) invalidateParentOf(errRow.rowData.linked_fir_dd_no);
        }
      }

      // Validate Person Arrested Detail
      if (personWorksheet) {
        const { rows: personRows } = parseWorksheet(personWorksheet, recordType, arrestPersonFields, registryFieldsMap);
        const childErrors = [];
        validateSheetRows(personRows, arrestPersonFields, 'Person Arrested Detail', childErrors, parentIndex, 'linked_fir_dd_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = personRows.find(pr => pr.rowIdx === err.row);
          if (errRow) invalidateParentOf(errRow.rowData.linked_fir_dd_no);
        }
      }

      // Validate Property Details
      if (propertyWorksheet) {
        const { rows: propertyRows } = parseWorksheet(propertyWorksheet, recordType, arrestPropertyFields, registryFieldsMap);
        const childErrors = [];
        validateSheetRows(propertyRows, arrestPropertyFields, 'Property Details', childErrors, parentIndex, 'linked_fir_dd_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = propertyRows.find(pr => pr.rowIdx === err.row);
          if (errRow) invalidateParentOf(errRow.rowData.linked_fir_dd_no);
        }
      }

      for (const pr of parentRows) {
        if (invalidParentKeys.has(canonKey(pr.rowData.linked_fir_dd_no)) || parentErrorRows.has(pr.rowIdx)) {
          invalidRowsCount++;
        } else {
          validRowsCount++;
        }
      }

    } else if (recordType === 'UIDB') {
      const { rows: parentRows } = parseWorksheet(parentWorksheet, recordType, uidbGeneralFields, registryFieldsMap);
      const parentIndex = buildParentKeyIndex(parentRows.map(r => r.rowData.gd_no));
      totalRows = parentRows.length;

      invalidParentKeys = new Set();

      // Validate General Info
      validateSheetRows(parentRows, uidbGeneralFields, 'General Info', errors);

      // Only parent-sheet errors exist so far — attribute them by canonical GD key,
      // and snapshot the rows (child-sheet row numbers can collide with these).
      const parentErrorRows = new Set(errors.map(e => e.row));
      for (const pr of parentRows) {
        if (parentErrorRows.has(pr.rowIdx) && pr.rowData.gd_no) {
          invalidParentKeys.add(canonKey(pr.rowData.gd_no));
        }
      }

      // Validate Act and Sections (canonical parent matching replaces the old
      // exact-string orphan check)
      if (actSectionWorksheet) {
        const { rows: actRows } = parseWorksheet(actSectionWorksheet, recordType, uidbActSectionFields, registryFieldsMap);
        const childErrors = [];
        validateSheetRows(actRows, uidbActSectionFields, 'Act and Sections', childErrors, parentIndex, 'gd_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = actRows.find(ar => ar.rowIdx === err.row);
          if (errRow && errRow.rowData.gd_no) {
            invalidParentKeys.add(parentIndex.resolve(errRow.rowData.gd_no) || canonKey(errRow.rowData.gd_no));
          }
        }
      }

      for (const pr of parentRows) {
        if (invalidParentKeys.has(canonKey(pr.rowData.gd_no)) || parentErrorRows.has(pr.rowIdx)) {
          invalidRowsCount++;
        } else {
          validRowsCount++;
        }
      }

    } else if (recordType === 'MISSING') {
      const { rows: parentRows } = parseWorksheet(parentWorksheet, recordType, missingGeneralFields, registryFieldsMap);
      totalRows = parentRows.length;

      validateSheetRows(parentRows, missingGeneralFields, 'Import Template', errors);

      const errorRowSet = new Set(errors.map(e => e.row));
      for (const pr of parentRows) {
        if (errorRowSet.has(pr.rowIdx)) {
          invalidRowsCount++;
        } else {
          validRowsCount++;
        }
      }

    } else {
      const { colMap, dataStartRow } = buildColumnMap(parentWorksheet, recordType, registryFields);
      if (Object.keys(colMap).length === 0) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ success: false, message: 'Invalid template or column headers could not be mapped.' });
      }

      const rowsToProcess = [];
      parentWorksheet.eachRow((row, rowIdx) => {
        if (rowIdx < dataStartRow) return;
        let isEmpty = true;
        row.eachCell({ includeEmpty: false }, () => {
          isEmpty = false;
        });
        if (isEmpty) return;

        totalRows++;
        rowsToProcess.push({ row, rowIdx });
      });

      const mappedKeys = new Set(Object.values(colMap));

      for (const { row, rowIdx } of rowsToProcess) {
        let rowHasErrors = false;
        const rowData = extractRowData(row, colMap, registryFieldsMap, recordType);

        for (const field of registryFields) {
          const key = field.field_key;
          const val = rowData[key];

          if (field.show_when && !evaluateShowWhen(field.show_when, rowData)) {
            continue;
          }

          if (isRequired(field) && mappedKeys.has(key) && (val === null || val === undefined || val === '')) {
            errors.push({
              row: rowIdx,
              field_key: key,
              code: 'REQUIRED_MISSING',
              message: `${field.label_en} is required`
            });
            rowHasErrors = true;
          }
        }

        if (rowHasErrors) {
          invalidRowsCount++;
        } else {
          validRowsCount++;
        }
      }
    }

    const batchId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    const userId = req.user.id || req.user.userId;

    await db('import_batches').insert({
      id: batchId,
      record_type: recordType,
      is_legacy: isLegacy ? 1 : 0,
      uploaded_by: userId,
      ps_id: finalPsId,
      district_id: finalDistrictId,
      file_path: req.file.path,
      total_rows: totalRows,
      valid_rows: validRowsCount,
      invalid_rows: invalidRowsCount,
      status: 'VALIDATION_DONE',
      created_at: new Date().toISOString()
    });

    if (errors.length > 0) {
      const errorPayloads = errors.map(err => ({
        id: uuidv4(),
        batch_id: batchId,
        row_number: err.row,
        field_key: err.field_key,
        error_code: err.code,
        error_message: err.message
      }));
      
      for (let i = 0; i < errorPayloads.length; i += 500) {
        await db('import_batch_errors').insert(errorPayloads.slice(i, i + 500));
      }
    }

    // Persist the authoritative invalid-parent-key set as sentinel rows so confirm can
    // skip exactly these FIRs (avoids the cross-sheet row-number collision). These are
    // filtered out of every error-display path.
    if (invalidParentKeys.size > 0) {
      const keyPayloads = [...invalidParentKeys].filter(Boolean).map(key => ({
        id: uuidv4(),
        batch_id: batchId,
        row_number: 0,
        field_key: null,
        error_code: INVALID_PARENT_CODE,
        error_message: String(key)
      }));
      for (let i = 0; i < keyPayloads.length; i += 500) {
        await db('import_batch_errors').insert(keyPayloads.slice(i, i + 500));
      }
    }

    const MAX_INLINE_ERRORS = 500;
    return res.status(200).json({
      success: true,
      data: {
        batch_id: batchId,
        total_rows: totalRows,
        valid_rows: validRowsCount,
        invalid_rows: invalidRowsCount,
        expires_at: expiresAt.toISOString(),
        errors: errors.slice(0, MAX_INLINE_ERRORS),
        errors_truncated: errors.length > MAX_INLINE_ERRORS,
        total_errors: errors.length
      }
    });
  } catch (error) {
    logger.error('[ValidateImport] Parsing/processing file error:', error.message);
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const confirmImportBatch = async (req, res) => {
  const { batchId } = req.params;

  try {
    const batch = await db('import_batches').where({ id: batchId }).first();
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const userId = req.user.id || req.user.userId;
    if (batch.uploaded_by !== userId) {
      return res.status(403).json({ success: false, message: 'Only the user who uploaded the batch can confirm it' });
    }

    if (batch.status === 'COMPLETED') {
      return res.status(409).json({ success: false, message: 'This batch has already been imported.' });
    }
    if (batch.status === 'PROCESSING') {
      return res.status(409).json({ success: false, message: 'This batch is already being imported. Please wait for it to finish.' });
    }

    if (!fs.existsSync(batch.file_path)) {
      return res.status(410).json({ success: false, message: 'Physical temp file has expired or was removed' });
    }

    const claimed = await db('import_batches')
      .where({ id: batchId, status: 'VALIDATION_DONE' })
      .update({ status: 'PROCESSING' });

    if (claimed === 0) {
      const current = await db('import_batches').where({ id: batchId }).first();
      if (current?.status === 'COMPLETED') {
        return res.status(409).json({ success: false, message: 'This batch has already been imported.' });
      }
      if (current?.status === 'PROCESSING') {
        return res.status(409).json({ success: false, message: 'This batch is already being imported. Please wait for it to finish.' });
      }
      return res.status(400).json({ success: false, message: 'Batch is not ready for confirmation (status must be VALIDATION_DONE)' });
    }

    const errorRows = await db('import_batch_errors')
      .where({ batch_id: batchId })
      .whereNot('error_code', INVALID_PARENT_CODE)
      .pluck('row_number');
    const errorRowsSet = new Set(errorRows);

    // Authoritative invalid parent keys (FIR / linked_fir_dd_no) from validation. Used to
    // skip whole invalid FIRs in CASE/ARREST imports without cross-sheet row-number ambiguity.
    const invalidParentKeys = new Set(
      await db('import_batch_errors')
        .where({ batch_id: batchId, error_code: INVALID_PARENT_CODE })
        .pluck('error_message')
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(batch.file_path);

    const allFields = await db('field_registry').where('is_active', true);
    // Registry rows applicable to this record type, keyed by field_key — the same
    // coercion source validate used, so confirm stores exactly what was validated
    // (and future registry fields coerce correctly with zero code change).
    const typeRegistryMap = {};
    for (const f of allFields) {
      if (parseApplicableTypes(f.applicable_record_types).includes(batch.record_type)) {
        typeRegistryMap[f.field_key] = f;
      }
    }

    const rowsToInsert = [];

    if (batch.record_type === 'CASE') {
      const a = SHEET_ALIASES.CASE;
      const parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      const victimWorksheet = findWorksheet(workbook, a.victim);
      const actSectionWorksheet = findWorksheet(workbook, a.act);
      const accusedWorksheet = findWorksheet(workbook, a.accused);
      const propertyWorksheet = findWorksheet(workbook, a.property);

      // Parse with the exact same field lists validation used (parity), plus the
      // registry map for type-aware coercion.
      const { rows: parentRows } = parseWorksheet(parentWorksheet, batch.record_type, caseGeneralFields, typeRegistryMap);
      const parentIndex = buildParentKeyIndex(parentRows.map(r => r.rowData.fir_no));

      let victimRows = [];
      if (victimWorksheet) {
        victimRows = parseWorksheet(victimWorksheet, batch.record_type, caseVictimFields, typeRegistryMap).rows.map(r => r.rowData);
      }

      let actSectionRows = [];
      if (actSectionWorksheet) {
        actSectionRows = parseWorksheet(actSectionWorksheet, batch.record_type, caseActSectionFields, typeRegistryMap).rows.map(r => r.rowData);
      }

      let accusedRows = [];
      if (accusedWorksheet) {
        accusedRows = parseWorksheet(accusedWorksheet, batch.record_type, caseAccusedFields, typeRegistryMap).rows.map(r => r.rowData);
      }

      let propertyRows = [];
      if (propertyWorksheet) {
        propertyRows = parseWorksheet(propertyWorksheet, batch.record_type, casePropertyFields, typeRegistryMap).rows.map(r => r.rowData);
      }

      // Children grouped once by canonical parent key — no silent detachment on
      // "123/2025" vs 123 vs "0123/2025" formatting differences.
      const victimsByParent = groupRowsByParent(victimRows, 'fir_no', parentIndex);
      const actsByParent = groupRowsByParent(actSectionRows, 'fir_no', parentIndex);
      const accusedByParent = groupRowsByParent(accusedRows, 'fir_no', parentIndex);
      const propertiesByParent = groupRowsByParent(propertyRows, 'fir_no', parentIndex);

      for (const { rowData } of parentRows) {
        const firNo = rowData.fir_no;
        if (!firNo) continue;
        const parentCanon = parentIndex.resolve(firNo) || canonKey(firNo);
        if (invalidParentKeys.has(parentCanon)) continue;

        const acts = actsByParent.get(parentCanon) || [];
        const victims = victimsByParent.get(parentCanon) || [];
        const accused = accusedByParent.get(parentCanon) || [];
        const properties = propertiesByParent.get(parentCanon) || [];

        if (acts.length > 0) {
          const actVal = [...new Set(acts.map(a => a.act).filter(Boolean))].join(', ');
          const secVal = [...new Set(acts.map(a => a.sections).filter(Boolean))].join(', ');
          const majorHeads = acts.map(a => a.major_head || a.crime_head).filter(Boolean);
          const minorHeads = acts.map(a => a.minor_head).filter(Boolean);
          
          rowData.act = actVal;
          rowData.act_name = actVal;
          rowData.sections = secVal;
          rowData.major_heads = [...new Set(majorHeads)].join(', ');
          rowData.minor_heads = [...new Set(minorHeads)].join(', ');
          rowData.major_head = rowData.major_heads;
          rowData.minor_head = rowData.minor_heads;
          
          rowData.crime_head = rowData.major_head;
          rowData.under_section = rowData.sections;
          if (!rowData.local_head) {
            const actLocalHeads = acts.map(a => a.local_head).filter(Boolean);
            if (actLocalHeads.length > 0) {
              rowData.local_head = [...new Set(actLocalHeads)].join(', ');
            } else {
              rowData.local_head = rowData.crime_head;
            }
          }
          rowData.complaint_no = rowData.fir_no;
          
          // Map to conditional section keys for the form UI
          for (const act of acts) {
            if (act.act && act.sections) {
              const condKey = getConditionalSectionKey(act.act);
              if (rowData[condKey]) {
                const existing = String(rowData[condKey]).split(',').map(s => s.trim());
                const incoming = String(act.sections).split(',').map(s => s.trim());
                rowData[condKey] = [...new Set([...existing, ...incoming])].join(', ');
              } else {
                rowData[condKey] = act.sections;
              }
            }
          }

          // Sync structured acts list from main
          rowData.acts = acts.map(a => ({
            act_name: a.act || '',
            sections: a.sections || '',
            major_head: a.major_head || a.crime_head || '',
            minor_head: a.minor_head || '',
            local_head: a.local_head || ''
          }));

        }

        rowsToInsert.push({ rowData, victims, accused, properties, acts });
      }

    } else if (batch.record_type === 'ARREST') {
      const a = SHEET_ALIASES.ARREST;
      const parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      const actSectionWorksheet = findWorksheet(workbook, a.act);
      const personWorksheet = findWorksheet(workbook, a.person);
      const propertyWorksheet = findWorksheet(workbook, a.property);

      const { rows: parentRows } = parseWorksheet(parentWorksheet, batch.record_type, arrestGeneralFields, typeRegistryMap);
      const parentIndex = buildParentKeyIndex(parentRows.map(r => r.rowData.linked_fir_dd_no));

      let actSectionRows = [];
      if (actSectionWorksheet) {
        actSectionRows = parseWorksheet(actSectionWorksheet, batch.record_type, arrestActSectionFields, typeRegistryMap).rows.map(r => r.rowData);
      }

      let personRows = [];
      if (personWorksheet) {
        personRows = parseWorksheet(personWorksheet, batch.record_type, arrestPersonFields, typeRegistryMap).rows.map(r => r.rowData);
      }

      let propertyRows = [];
      if (propertyWorksheet) {
        propertyRows = parseWorksheet(propertyWorksheet, batch.record_type, arrestPropertyFields, typeRegistryMap).rows.map(r => r.rowData);
      }

      const actsByParent = groupRowsByParent(actSectionRows, 'linked_fir_dd_no', parentIndex);
      const personsByParent = groupRowsByParent(personRows, 'linked_fir_dd_no', parentIndex);
      const propertiesByParent = groupRowsByParent(propertyRows, 'linked_fir_dd_no', parentIndex);

      for (const { rowData } of parentRows) {
        const linkedFirDdNo = rowData.linked_fir_dd_no;
        if (!linkedFirDdNo) continue;
        const parentCanon = parentIndex.resolve(linkedFirDdNo) || canonKey(linkedFirDdNo);
        if (invalidParentKeys.has(parentCanon)) continue;

        const acts = actsByParent.get(parentCanon) || [];
        const matchingPersons = personsByParent.get(parentCanon) || [];
        const properties = propertiesByParent.get(parentCanon) || [];

        const isYes = (val) => {
          if (!val) return false;
          const s = String(val).trim().toLowerCase();
          return s === 'yes' || s === 'true' || s === '1' || s === 'हाँ';
        };

        const itemRowData = { ...rowData };

        if (acts.length > 0) {
          const actVal = [...new Set(acts.map(a => a.act).filter(Boolean))].join(', ');
          const secVal = [...new Set(acts.map(a => a.sections).filter(Boolean))].join(', ');
          const majorHeads = acts.map(a => a.major_head || a.crime_head).filter(Boolean);
          const minorHeads = acts.map(a => a.minor_head).filter(Boolean);

          itemRowData.act = actVal;
          itemRowData.act_name = actVal;
          itemRowData.sections = secVal;
          itemRowData.major_heads = [...new Set(majorHeads)].join(', ');
          itemRowData.minor_heads = [...new Set(minorHeads)].join(', ');
          itemRowData.major_head = itemRowData.major_heads;
          itemRowData.minor_head = itemRowData.minor_heads;

          itemRowData.crime_head = [...new Set(acts.map(a => a.crime_head || a.major_head).filter(Boolean))].join(', ');
          itemRowData.crimeHead = itemRowData.crime_head;
          
          const actLocalHeads = acts.map(a => a.local_head).filter(Boolean);
          if (actLocalHeads.length > 0) {
            itemRowData.local_head = [...new Set(actLocalHeads)].join(', ');
          } else {
            itemRowData.local_head = itemRowData.crime_head;
          }

          // Map to conditional section keys for the form UI
          for (const act of acts) {
            if (act.act && act.sections) {
              const condKey = getConditionalSectionKey(act.act);
              if (itemRowData[condKey]) {
                const existing = String(itemRowData[condKey]).split(',').map(s => s.trim());
                const incoming = String(act.sections).split(',').map(s => s.trim());
                itemRowData[condKey] = [...new Set([...existing, ...incoming])].join(', ');
              } else {
                itemRowData[condKey] = act.sections;
              }
            }
          }

          // Sync structured acts list from main mapped to itemRowData
          itemRowData.acts = acts.map(a => ({
            act_name: a.act || '',
            sections: a.sections || '',
            major_head: a.major_head || a.crime_head || '',
            minor_head: a.minor_head || '',
            local_head: a.local_head || ''
          }));

        }

        if (matchingPersons.length > 0) {
          const person = matchingPersons[0];
          // Person rows carry null for every blank column — copy only filled values
          // so General Info data isn't wiped by empty person cells.
          mergeNonEmpty(itemRowData, person);

          itemRowData.fullName = person.arrested_first_name || person.full_name;
          itemRowData.full_name = person.arrested_first_name || person.full_name;
          itemRowData.arrested_name = person.arrested_first_name || person.full_name;
          itemRowData.fatherName = person.arrested_relative_name || person.father_name;
          itemRowData.father_name = person.arrested_relative_name || person.father_name;
          itemRowData.age = person.arrested_age_year || person.age;
          itemRowData.gender = person.arrested_gender || person.gender;
          itemRowData.address = person.arrested_present_address || person.address;
          itemRowData.arrested_address = person.arrested_present_address || person.address;
          itemRowData.nafisPrepared = isYes(person.nafis_prepared);
          itemRowData.nafis_prepared = person.nafis_prepared;
          itemRowData.dossierPrepared = isYes(person.dossier_prepared);
          itemRowData.dossier_prepared = person.dossier_prepared;
          itemRowData.searchSlipPrepared = isYes(person.search_slip_prepared);
          itemRowData.search_slip_prepared = person.search_slip_prepared;
          itemRowData.addressVerified = isYes(person.address_verified);
          itemRowData.address_verified = person.address_verified;
          itemRowData.verifyingOfficerName = person.verifying_officer_name;
          itemRowData.verifyingOfficerRank = person.verifying_officer_rank;
          itemRowData.kinName = person.kin_name;
          itemRowData.kinMobile = person.kin_mobile;
          itemRowData.kinRelationship = person.kin_relationship;
          itemRowData.photoPath = person.photo_path;
        }

        if (properties.length > 0) {
          mergeNonEmpty(itemRowData, {
            property_major_category: properties[0].property_major_category,
            property_minor_category: properties[0].property_minor_category,
            property_stolen_recovered: properties[0].property_stolen_recovered,
            property_details: properties.map(p => p.property_details).filter(Boolean).join(', ')
          });
        }

        itemRowData.firDdNumber = itemRowData.linked_fir_dd_no;
        itemRowData.firDate = itemRowData.fir_date;
        itemRowData.dateOfArrest = itemRowData.date_of_arrest;
        itemRowData.timeOfArrest = itemRowData.time_of_arrest;
        itemRowData.placeOfArrest = itemRowData.place_of_arrest;

        rowsToInsert.push({ rowData: itemRowData, persons: matchingPersons, properties, acts });
      }

    } else if (batch.record_type === 'UIDB') {
      const a = SHEET_ALIASES.UIDB;
      const parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      const actSectionWorksheet = findWorksheet(workbook, a.act);

      const { rows: parentRows } = parseWorksheet(parentWorksheet, batch.record_type, uidbGeneralFields, typeRegistryMap);
      const parentIndex = buildParentKeyIndex(parentRows.map(r => r.rowData.gd_no));

      let actSectionRows = [];
      if (actSectionWorksheet) {
        actSectionRows = parseWorksheet(actSectionWorksheet, batch.record_type, uidbActSectionFields, typeRegistryMap).rows.map(r => r.rowData);
      }

      const actsByParent = groupRowsByParent(actSectionRows, 'gd_no', parentIndex);

      for (const { rowData } of parentRows) {
        const gdNo = rowData.gd_no;
        if (!gdNo) continue;
        // Skip by canonical GD key only — validation attributed every error (its own
        // sheet's and the act sheet's) to this key, so row numbers never collide.
        const parentCanon = parentIndex.resolve(gdNo) || canonKey(gdNo);
        if (invalidParentKeys.has(parentCanon)) continue;

        const acts = actsByParent.get(parentCanon) || [];

        const itemRowData = { ...rowData };

        if (acts.length > 0) {
          const actVal = [...new Set(acts.map(a => a.act_name).filter(Boolean))].join(', ');
          const secVal = [...new Set(acts.map(a => a.sections).filter(Boolean))].join(', ');
          const majorHeads = acts.map(a => a.major_head).filter(Boolean);
          const minorHeads = acts.map(a => a.minor_head).filter(Boolean);

          itemRowData.act = actVal;
          itemRowData.act_name = actVal;
          itemRowData.sections = secVal;
          itemRowData.major_heads = [...new Set(majorHeads)].join(', ');
          itemRowData.minor_heads = [...new Set(minorHeads)].join(', ');
          itemRowData.major_head = itemRowData.major_heads;
          itemRowData.minor_head = itemRowData.minor_heads;
          itemRowData.crime_head = itemRowData.major_head;
          itemRowData.local_head = itemRowData.major_head;
          itemRowData.under_section = itemRowData.sections;

          // Map to conditional section keys for the form UI
          for (const act of acts) {
            if (act.act_name && act.sections) {
              const condKey = getConditionalSectionKey(act.act_name);
              if (itemRowData[condKey]) {
                const existing = String(itemRowData[condKey]).split(',').map(s => s.trim());
                const incoming = String(act.sections).split(',').map(s => s.trim());
                itemRowData[condKey] = [...new Set([...existing, ...incoming])].join(', ');
              } else {
                itemRowData[condKey] = act.sections;
              }
            }
          }

          // Sync structured acts list from main mapped to itemRowData
          itemRowData.acts = acts.map(a => ({
            act_name: a.act_name || '',
            sections: a.sections || '',
            major_head: a.major_head || '',
            minor_head: a.minor_head || '',
            local_head: a.major_head || ''
          }));
        }

        rowsToInsert.push(itemRowData);
      }

    } else if (batch.record_type === 'MISSING') {
      const a = SHEET_ALIASES.MISSING;
      const parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      const { rows: parentRows } = parseWorksheet(parentWorksheet, batch.record_type, missingGeneralFields, typeRegistryMap);

      for (const { rowData, rowIdx } of parentRows) {
        if (errorRowsSet.has(rowIdx)) continue;
        rowsToInsert.push(rowData);
      }

    } else {
      const worksheet = workbook.worksheets[0] || workbook.getWorksheet(1);
      const registryFields = Object.values(typeRegistryMap);
      const registryFieldsMap = typeRegistryMap;

      const { colMap, dataStartRow } = buildColumnMap(worksheet, batch.record_type, registryFields);

      worksheet.eachRow((row, rowIdx) => {
        if (rowIdx < dataStartRow) return;
        if (errorRowsSet.has(rowIdx)) return;

        let isEmpty = true;
        row.eachCell({ includeEmpty: false }, () => {
          isEmpty = false;
        });
        if (isEmpty) return;

        rowsToInsert.push(extractRowData(row, colMap, registryFieldsMap, batch.record_type));
      });
    }

    let sub_div_id = null;
    if (batch.ps_id) {
      const psNode = await db('hierarchy_nodes').where({ id: batch.ps_id }).first();
      if (psNode && psNode.parent_id) {
        const parentNode = await db('hierarchy_nodes').where({ id: psNode.parent_id }).first();
        if (parentNode && parentNode.node_type === 'SUB_DIVISION') {
          sub_div_id = parentNode.id;
        }
      }
    }

    let importedRowsCount = 0;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const newlyInsertedRecords = [];

    const psNode = await db('hierarchy_nodes').where({ id: batch.ps_id }).first();
    const psCode = psNode?.code || 'PS000';
    const typeCode = TYPE_CODES[batch.record_type] || batch.record_type.substring(0, 3).toUpperCase();
    const seqByYear = {};
    const existingCounts = await db('records')
      .where({ ps_id: batch.ps_id, record_type: batch.record_type })
      .select(db.raw('EXTRACT(YEAR FROM record_date::date) as yr'))
      .count('* as c')
      .groupBy('yr');
    for (const rc of existingCounts) {
      seqByYear[parseInt(rc.yr, 10)] = parseInt(rc.c, 10);
    }
    const nextUid = (recordDateISO) => {
      const yr = yearOf(recordDateISO);
      seqByYear[yr] = (seqByYear[yr] || 0) + 1;
      const seq = String(seqByYear[yr]).padStart(6, '0');
      return `${typeCode}/${yr}/${psCode}/${seq}`;
    };

    const status = batch.is_legacy ? 'LEGACY_IMPORTED' : 'DRAFT';
    const level = batch.is_legacy ? 'HQ' : 'PS';

    const truncate = (val, maxLen) => {
      if (val === null || val === undefined) return null;
      const str = String(val);
      if (str.length <= maxLen) return str;
      return str.substring(0, maxLen);
    };

    // Scoped transactions per FIR for CASE and ARREST
    for (const item of rowsToInsert) {
      const isCaseOrArrest = (batch.record_type === 'CASE' || batch.record_type === 'ARREST');
      const rowData = isCaseOrArrest ? item.rowData : item;

      // rowData's own date fields (fir_date, occurrence_date, etc.) are
      // already dd/mm/yyyy via coerceDate; record_date is a native Postgres
      // DATE column and always needs the ISO form.
      const recordDate = toISO(getRecordDate(batch.record_type, rowData)) || new Date().toISOString().split('T')[0];

      const recordId = uuidv4();
      const uid = nextUid(recordDate);
      const finalData = { ...rowData, uid };
      delete finalData.name_and_address_of_accused;

      const now = new Date().toISOString();

      try {
        await db.transaction(async (trx) => {
          // 1. Insert records table
          await trx('records').insert({
            id: recordId,
            record_type: batch.record_type,
            ps_id: batch.ps_id,
            district_id: batch.district_id,
            sub_div_id: sub_div_id,
            data: JSON.stringify(finalData),
            current_status: status,
            current_level: level,
            record_date: recordDate,
            created_by: batch.uploaded_by,
            updated_by: batch.uploaded_by,
            created_at: now,
            updated_at: now,
            is_legacy: !!batch.is_legacy,
            source_system: batch.is_legacy ? 'EXCEL_IMPORT' : null,
            imported_at: batch.is_legacy ? now : null,
            imported_by: batch.is_legacy ? batch.uploaded_by : null,
            legacy_ref: batch.is_legacy ? (rowData.fir_no || rowData.linked_fir_dd_no || rowData.pcr_gd_no || null) : null
          });

          // 2. Insert record_revisions
          const fieldChanges = Object.keys(finalData).map(key => ({
            field_key: key,
            old_value: '',
            new_value: finalData[key] ?? ''
          }));

          const revisionPayload = {
            id: uuidv4(),
            record_id: recordId,
            revision_number: 1,
            changed_by: batch.uploaded_by,
            changed_at: now,
            level: level,
            change_type: 'CREATE',
            field_changes: JSON.stringify(fieldChanges),
            ip_address: ipAddress
          };

          revisionPayload.prev_hash = null;
          revisionPayload.row_hash = computeRowHash({
            record_id: recordId,
            revision_number: 1,
            changed_by: batch.uploaded_by,
            changed_at: revisionPayload.changed_at,
            field_changes: revisionPayload.field_changes
          }, null);
          await trx('record_revisions').insert(revisionPayload);

          // 3. Insert audit_logs
          await trx('audit_logs').insert({
            id: uuidv4(),
            table_name: 'records',
            record_id: recordId,
            action: 'CREATE',
            changed_by_id: batch.uploaded_by,
            changed_by_role: req.user.role,
            changed_at: now,
            new_value: JSON.stringify(finalData),
            ip_address: ipAddress
          });

          // 4. Case child tables
          if (batch.record_type === 'CASE') {
            const personsBatch = [];
            if (rowData.complainant_first_name || rowData.complainant_name) {
              const complainantFirstName = rowData.complainant_first_name || rowData.complainant_name;
              const compData = {};
              for (const key of Object.keys(rowData)) {
                if (key.startsWith('complainant_')) compData[key] = rowData[key];
              }
              personsBatch.push({
                id: uuidv4(),
                record_id: recordId,
                person_type: 'COMPLAINANT',
                first_name: truncate(complainantFirstName, 100),
                last_name: truncate(rowData.complainant_last_name, 100) || null,
                mobile: truncate(rowData.complainant_mobile, 20) || null,
                city: truncate(rowData.complainant_city_town_village || rowData.complainant_address, 100) || null,
                district: truncate(rowData.complainant_district, 100) || null,
                data: JSON.stringify(compData),
                sort_order: 0,
                created_at: now
              });
            }

            for (const vic of item.victims) {
              personsBatch.push({
                id: uuidv4(),
                record_id: recordId,
                person_type: 'VICTIM',
                first_name: truncate(vic.victim_first_name, 100),
                last_name: truncate(vic.victim_last_name, 100) || null,
                mobile: truncate(vic.victim_mobile, 20) || null,
                city: truncate(vic.victim_city_town_village, 100) || null,
                district: truncate(vic.victim_district, 100) || null,
                data: JSON.stringify(vic),
                sort_order: personsBatch.length,
                created_at: now
              });
            }

            for (const acc of item.accused) {
              personsBatch.push({
                id: uuidv4(),
                record_id: recordId,
                person_type: 'ACCUSED',
                first_name: truncate(acc.accused_first_name, 100),
                last_name: truncate(acc.accused_last_name, 100) || null,
                mobile: truncate(acc.accused_mobile, 20) || null,
                city: truncate(acc.accused_city_town_village, 100) || null,
                district: truncate(acc.accused_district, 100) || null,
                data: JSON.stringify(acc),
                sort_order: personsBatch.length,
                created_at: now
              });
            }

            if (personsBatch.length > 0) {
              await trx('record_persons').insert(personsBatch);
            }

            const propertiesBatch = [];
            for (let idx = 0; idx < item.properties.length; idx++) {
              const prop = item.properties[idx];
              const mappedKeys = new Set(['property_major_category', 'property_minor_category', 'property_stolen_recovered', 'property_details', 'fir_no']);
              const extraData = {};
              for (const [k, v] of Object.entries(prop)) {
                if (!mappedKeys.has(k) && v !== null && v !== undefined && v !== '') {
                  extraData[k] = v;
                }
              }
              propertiesBatch.push({
                id: uuidv4(),
                record_id: recordId,
                major_category: truncate(prop.property_major_category, 50) || null,
                minor_category: truncate(prop.property_minor_category, 100) || null,
                status: truncate(prop.property_stolen_recovered || 'Stolen', 20),
                details: prop.property_details || null,
                extra_data: Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
                sort_order: idx,
                created_at: now
              });
            }
            if (propertiesBatch.length > 0) {
              await trx('record_properties').insert(propertiesBatch);
            }

          // 5. Arrest child tables
          } else if (batch.record_type === 'ARREST') {
            const personsBatch = [];
            for (let idx = 0; idx < item.persons.length; idx++) {
              const pRow = item.persons[idx];
              
              // Map arresting officer from parent row if empty
              if (!pRow.arresting_officer && rowData.io_name) {
                pRow.arresting_officer = rowData.io_name;
              }
              if (!pRow.arresting_officer_mobile && rowData.io_mobile) {
                pRow.arresting_officer_mobile = rowData.io_mobile;
              }

              // Fallback parent date/time of arrest from the first arrested person row
              if (idx === 0) {
                if (!rowData.date_of_arrest && pRow.date_of_arrest) {
                  rowData.date_of_arrest = pRow.date_of_arrest;
                  finalData.date_of_arrest = pRow.date_of_arrest;
                }
                if (!rowData.time_of_arrest && pRow.time_of_arrest) {
                  rowData.time_of_arrest = pRow.time_of_arrest;
                  finalData.time_of_arrest = pRow.time_of_arrest;
                }
              }

              personsBatch.push({
                id: uuidv4(),
                record_id: recordId,
                person_type: 'ARRESTED',
                first_name: truncate(pRow.arrested_first_name || pRow.full_name, 100),
                last_name: truncate(pRow.arrested_last_name || pRow.last_name, 100) || null,
                mobile: truncate(pRow.arrested_mobile || pRow.kin_mobile, 20) || null,
                city: truncate(pRow.arrested_city_town_village || pRow.address, 100) || null,
                district: truncate(pRow.arrested_district || pRow.district, 100) || null,
                data: JSON.stringify(pRow),
                sort_order: idx,
                created_at: now
              });
            }
            if (personsBatch.length > 0) {
              await trx('record_persons').insert(personsBatch);
            }

            const propertiesBatch = [];
            for (let idx = 0; idx < item.properties.length; idx++) {
              const prop = item.properties[idx];
              const mappedKeys = new Set(['property_major_category', 'property_minor_category', 'property_stolen_recovered', 'property_details', 'linked_fir_dd_no']);
              const extraData = {};
              for (const [k, v] of Object.entries(prop)) {
                if (!mappedKeys.has(k) && v !== null && v !== undefined && v !== '') {
                  extraData[k] = v;
                }
              }
              propertiesBatch.push({
                id: uuidv4(),
                record_id: recordId,
                major_category: truncate(prop.property_major_category, 50) || null,
                minor_category: truncate(prop.property_minor_category, 100) || null,
                status: truncate(prop.property_stolen_recovered || 'Recovered', 20),
                details: prop.property_details || null,
                extra_data: Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
                sort_order: idx,
                created_at: now
              });
            }
            if (propertiesBatch.length > 0) {
              await trx('record_properties').insert(propertiesBatch);
            }
          }
        });

        newlyInsertedRecords.push({ id: recordId, data: finalData });
        importedRowsCount++;
      } catch (err) {
        logger.error(`[ConfirmImport] Scoped transaction write failed for FIR row ${rowData.fir_no || rowData.linked_fir_dd_no}: ${err.message}`);
        // Count it as invalid/failed
        batch.invalid_rows++;
      }
    }

    // Auto-Linkage runner
    let autoLinkageResult = {
      linkedCount: 0,
      unmatchedCount: 0,
      linkedDetails: [],
      unmatchedDetails: []
    };

    await db.transaction(async (trx) => {
      let arrestsToLink = [];
      if (batch.record_type === 'ARREST') {
        arrestsToLink = newlyInsertedRecords;
      } else if (batch.record_type === 'CASE') {
        // Re-link every arrest in this PS that has no CASE link yet (an arrest linked
        // to something else — e.g. a missing-person record — must still get its case).
        const unmatchedArrests = await trx('records')
          .where({ record_type: 'ARREST', ps_id: batch.ps_id })
          .whereNotExists(function() {
            this.select('*')
              .from('record_links')
              .join('link_type_registry', 'record_links.link_type_id', 'link_type_registry.id')
              .whereRaw('record_links.target_record_id = records.id')
              .where('link_type_registry.code', 'CASE_ARREST');
          })
          .select('id', 'data');
        
        arrestsToLink = unmatchedArrests.map(a => ({
          id: a.id,
          data: typeof a.data === 'string' ? JSON.parse(a.data) : a.data
        }));
      }

      autoLinkageResult = await runAutoLinkageForArrests(trx, arrestsToLink, batch.ps_id, batch.uploaded_by);
    });

    try {
      if (fs.existsSync(batch.file_path)) {
        fs.unlinkSync(batch.file_path);
      }
    } catch (e) {
      logger.warn('[ConfirmImport] Temp file deletion failed:', e.message);
    }

    await db('import_batches')
      .where({ id: batchId })
      .update({
        status: 'COMPLETED',
        imported_rows: importedRowsCount,
        invalid_rows: batch.invalid_rows,
        confirmed_at: new Date().toISOString()
      });

    await publish('record.batch_imported', {
      batch_id: batchId,
      count: importedRowsCount,
      is_legacy: !!batch.is_legacy,
      record_type: batch.record_type
    });

    const failedRows = await db('import_batch_errors')
      .where({ batch_id: batchId })
      .whereNot('error_code', INVALID_PARENT_CODE)
      .orderBy('row_number', 'asc');
    
    const failedDetails = failedRows.map(e => ({
      row: e.row_number,
      field_key: e.field_key,
      code: e.error_code,
      message: e.error_message
    }));

    const report = {
      total_processed: batch.total_rows,
      imported_count: importedRowsCount,
      linked_count: autoLinkageResult.linkedCount,
      unmatched_arrests_count: autoLinkageResult.unmatchedCount,
      failed_count: batch.invalid_rows,
      linked_details: autoLinkageResult.linkedDetails,
      unmatched_arrest_details: autoLinkageResult.unmatchedDetails,
      failed_details: failedDetails
    };

    return res.status(200).json({
      success: true,
      data: {
        batch_id: batchId,
        imported_rows: importedRowsCount,
        skipped_rows: batch.invalid_rows,
        status: 'COMPLETED',
        linked_count: autoLinkageResult.linkedCount,
        unmatched_arrests_count: autoLinkageResult.unmatchedCount,
        report
      }
    });
  } catch (error) {
    logger.error('[ConfirmImport] Database confirm error: ' + error.message + '\n' + error.stack);
    try {
      await db('import_batches')
        .where({ id: batchId, status: 'PROCESSING' })
        .update({ status: 'VALIDATION_DONE' });
    } catch (_) {}
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listBatches = async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;

  try {
    const userId = req.user.id || req.user.userId;
    const countRes = await db('import_batches').where({ uploaded_by: userId }).count('* as count').first();
    const total = parseInt(countRes.count || 0, 10);

    const list = await db('import_batches')
      .where({ uploaded_by: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const data = list.map(b => ({
      id: b.id,
      record_type: b.record_type,
      is_legacy: !!b.is_legacy,
      total_rows: b.total_rows,
      valid_rows: b.valid_rows,
      invalid_rows: b.invalid_rows,
      status: b.status,
      created_at: b.created_at
    }));

    return res.status(200).json({
      success: true,
      data,
      meta: { page, limit, total }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getBatchDetail = async (req, res) => {
  const { batchId } = req.params;

  try {
    const userId = req.user.id || req.user.userId;
    const batch = await db('import_batches')
      .where({ id: batchId, uploaded_by: userId })
      .first();

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const errors = await db('import_batch_errors')
      .where({ batch_id: batchId })
      .whereNot('error_code', INVALID_PARENT_CODE)
      .orderBy('row_number', 'asc');

    const formattedErrors = errors.map(e => ({
      row: e.row_number,
      field_key: e.field_key,
      code: e.error_code,
      message: e.error_message
    }));

    return res.status(200).json({
      success: true,
      data: {
        id: batch.id,
        record_type: batch.record_type,
        is_legacy: !!batch.is_legacy,
        total_rows: batch.total_rows,
        valid_rows: batch.valid_rows,
        invalid_rows: batch.invalid_rows,
        status: batch.status,
        created_at: batch.created_at,
        errors: formattedErrors
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
