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
  CASE_SHEETS_CONFIG,
  ARREST_SHEETS_CONFIG
} from './import-fields.config.js';

// Synonyms map to handle template label variations and offsets
const CASE_SYNONYMS = {
  "FIR Number": "fir_no",
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
  "Property Value in inr": "property_value"
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
  "Previous involvement": "prev_involvement"
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
  }
};

// Patterns that identify an instruction/hint row (Row 4 of the official template)
// so we never mistake it for a data row.
const HINT_ROW_PATTERNS = /^(\[required\]|select:|date \(|time \(|number$|boolean$|textarea$|e\.g\.|must match|yyyy|hh:mm|\d+-digit|first name$|middle name$|last name$|nickname|age in years|min age$|max age$|full residential|house number$|street name$|colony name$|village\/city$|tehsil$|police station$|incident narrative|npr number$|father's or)/i;

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

// Helper to parse sheets
const parseWorksheet = (worksheet, recordType, fieldsList) => {
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

    const rowData = extractRowData(row, colMap, registryFieldsMap, recordType);
    rows.push({ rowData, rowIdx });
  });

  return { rows };
};

// Helper to validate sheet rows
const validateSheetRows = (rows, fieldsList, sheetName, errors, parentKeysSet = null, parentKeyField = null) => {
  for (const { rowData, rowIdx } of rows) {
    if (parentKeysSet && parentKeyField) {
      const parentVal = rowData[parentKeyField];
      if (!parentVal || !parentKeysSet.has(parentVal)) {
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

const coerceDate = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0];
  }
  let s = String(val).trim();
  if (!s) return null;

  const range = s.split(/\s+TO\s+/i);
  if (range.length > 1) s = range[0].trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let d = m[1], mo = m[2], y = m[3];
    if (y.length === 2) y = '20' + y;
    d = d.padStart(2, '0');
    mo = mo.padStart(2, '0');
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${mo}-${d}`;
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  return null;
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

const extractRowData = (row, colMap, registryFieldsMap, recordType) => {
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

    const field = registryFieldsMap[key];
    if (field) {
      if (field.field_type === 'DATE') cellVal = coerceDate(cellVal);
      else if (field.field_type === 'TIME') cellVal = coerceTime(cellVal);
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

  if (recordType === 'CASE' && (rowData.status === null || rowData.status === undefined || rowData.status === '')) {
    rowData.status = 'Open';
  }

  return rowData;
};

const runAutoLinkageForArrests = async (trx, arrestRecords, psId, userId) => {
  const linkedDetails = [];
  const unmatchedDetails = [];

  const cases = await trx('records')
    .where({ record_type: 'CASE', ps_id: psId })
    .select('id', 'data');

  const parsedCases = cases.map(c => {
    let dataObj = {};
    try {
      dataObj = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
    } catch(e) {}
    const firNo = dataObj.fir_no || '';
    const firDate = dataObj.fir_date || '';
    const firYear = firDate ? new Date(firDate).getFullYear() : null;
    return {
      id: c.id,
      data: dataObj,
      firNo,
      firYear
    };
  });

  for (const arrest of arrestRecords) {
    const arrestData = arrest.data;
    const linkedFirDdNo = arrestData.linked_fir_dd_no;

    if (!linkedFirDdNo) {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: null,
        reason: 'No Linked FIR / DD No. provided in arrest record'
      });
      continue;
    }

    const parsedArrest = parseFirAndYear(linkedFirDdNo);

    const candidates = parsedCases.filter(c => {
      const parsedCaseFir = parseFirAndYear(c.firNo);
      return parsedCaseFir.firNo === parsedArrest.firNo && parsedCaseFir.firNo !== '';
    });

    if (candidates.length === 0) {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: linkedFirDdNo,
        reason: 'No matching CASE record found with this FIR number'
      });
      continue;
    }

    let yearFiltered = candidates;
    if (parsedArrest.year) {
      yearFiltered = candidates.filter(c => {
        const parsedCaseFir = parseFirAndYear(c.firNo);
        const caseYear = parsedCaseFir.year || c.firYear;
        return caseYear === parsedArrest.year;
      });
    }

    if (yearFiltered.length === 0) {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: linkedFirDdNo,
        reason: `Case found but year mismatch (Expected FIR year: ${parsedArrest.year})`
      });
      continue;
    }

    let bestCase = null;
    if (yearFiltered.length === 1) {
      bestCase = yearFiltered[0];
    } else {
      let bestScore = -1;
      for (const candidate of yearFiltered) {
        let score = 0;
        const candidateData = candidate.data;

        if (candidateData.local_head && arrestData.crime_head) {
          if (String(candidateData.local_head).trim().toLowerCase() === String(arrestData.crime_head).trim().toLowerCase()) {
            score += 1;
          }
        }

        if (candidateData.sections && arrestData.sections) {
          if (String(candidateData.sections).trim().toLowerCase() === String(arrestData.sections).trim().toLowerCase()) {
            score += 1;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestCase = candidate;
        }
      }
    }

    if (bestCase) {
      try {
        await createLink({
          sourceRecordId: bestCase.id,
          targetRecordId: arrest.id,
          linkTypeCode: 'CASE_ARREST',
          userId,
          metadata: { notes: 'Auto-linked during bulk import' }
        });

        const caseData = bestCase.data;
        linkedDetails.push({
          arrest_uid: arrestData.uid,
          case_uid: caseData.uid,
          fir_no: caseData.fir_no
        });
      } catch (err) {
        logger.error(`[AutoLinkage] Failed to create link: ${err.message}`);
        unmatchedDetails.push({
          arrest_uid: arrestData.uid,
          linked_fir_dd_no: linkedFirDdNo,
          reason: `Failed to link: ${err.message}`
        });
      }
    } else {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: linkedFirDdNo,
        reason: 'Multiple matching cases found but secondary validation failed'
      });
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


const addSheetToWorkbook = (workbook, sheetName, fieldsList, allFields, lang) => {
  const worksheet = workbook.addWorksheet(sheetName);

  const row1 = fieldsList.map(f => f.field_key);
  worksheet.addRow(row1);
  worksheet.getRow(1).hidden = true;

  const subheadings = fieldsList.map(f => {
    const key = f.field_key;
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
    if (key === 'act' || key === 'sections' || key === 'crime_head') return lang === 'hi' ? 'अधिनियम और धाराएं' : 'Act and Sections';
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
    if (matched && matched.field_type === 'SELECT') {
      try {
        options = typeof matched.options === 'string' ? JSON.parse(matched.options) : matched.options;
      } catch (e) {}
    } else if (f.options) {
      options = f.options;
    } else if (f.field_key.endsWith('_prepared') || f.field_key.endsWith('_verified') || f.field_key.endsWith('_same')) {
      options = ['Yes', 'No'];
    } else if (f.field_key.includes('gender')) {
      options = ['Male', 'Female', 'Transgender', 'Unknown'];
    }

    if (Array.isArray(options) && options.length > 0) {
      const validValues = options.map(o => (o && typeof o === 'object') ? o.value : o);
      const formulaVal = `"${validValues.join(',')}"`;
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

    const fields = allFields.filter(f => {
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

    addSheetToWorkbook(workbook, 'Import Template', fields, allFields, lang);

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
  const validTypes = ['ARREST', 'PCR_CALL', 'CASE'];
  if (!recordType || !validTypes.includes(recordType)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ success: false, message: 'Invalid or missing record_type. Must be CASE, ARREST or PCR_CALL.' });
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
    } else {
      parentWorksheet = workbook.worksheets[0] || workbook.getWorksheet(1);
    }

    if (!parentWorksheet) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, message: 'Invalid template: main worksheet not found' });
    }

    const allFields = await db('field_registry').where('is_active', true);
    const registryFields = allFields.filter(f => {
      try {
        const types = typeof f.applicable_record_types === 'string'
          ? JSON.parse(f.applicable_record_types)
          : f.applicable_record_types;
        return Array.isArray(types) && types.map(t => t.toUpperCase()).includes(recordType);
      } catch (e) {
        return false;
      }
    });

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
      const { rows: parentRows } = parseWorksheet(parentWorksheet, recordType, caseGeneralFields);
      const parentKeysSet = new Set(parentRows.map(r => r.rowData.fir_no).filter(Boolean));
      totalRows = parentRows.length;

      invalidParentKeys = new Set();

      // Validate General Information
      validateSheetRows(parentRows, caseGeneralFields, 'General Information', errors);

      // In-Memory Duplicate Check for FIR
      const sheetFirs = new Set();
      for (const pr of parentRows) {
        const fir = pr.rowData.fir_no;
        if (fir) {
          if (sheetFirs.has(fir)) {
            errors.push({
              row: pr.rowIdx,
              field_key: 'fir_no',
              code: 'DUPLICATE_IN_SHEET',
              message: `Duplicate FIR number "${fir}" found in General Information sheet.`
            });
            invalidParentKeys.add(fir);
          } else {
            sheetFirs.add(fir);
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
          const data = typeof ec.data === 'string' ? JSON.parse(ec.data) : ec.data;
          if (data && data.fir_no) {
            existingFirs.add(data.fir_no.trim().toLowerCase());
          }
        }

        for (const pr of parentRows) {
          const fir = pr.rowData.fir_no;
          if (fir && existingFirs.has(fir.trim().toLowerCase())) {
            errors.push({
              row: pr.rowIdx,
              field_key: 'fir_no',
              code: 'DUPLICATE_IN_DATABASE',
              message: `FIR number "${fir}" already exists in the database for this Police Station.`
            });
            invalidParentKeys.add(fir);
          }
        }
      }

      for (const pr of parentRows) {
        const hasErr = errors.some(e => e.row === pr.rowIdx);
        if (hasErr && pr.rowData.fir_no) {
          invalidParentKeys.add(pr.rowData.fir_no);
        }
      }

      // Validate Victims
      if (victimWorksheet) {
        const { rows: victimRows } = parseWorksheet(victimWorksheet, recordType, caseVictimFields);
        const childErrors = [];
        validateSheetRows(victimRows, caseVictimFields, 'Victim Information', childErrors, parentKeysSet, 'fir_no');

        // Check duplicate victims under same FIR
        const victimKeySet = new Set();
        for (const vr of victimRows) {
          const fir = vr.rowData.fir_no;
          const name = `${vr.rowData.victim_first_name || ''} ${vr.rowData.victim_last_name || ''}`.trim().toLowerCase();
          const relName = (vr.rowData.victim_relative_name || '').trim().toLowerCase();
          if (fir && name) {
            const vKey = `${fir}|${name}|${relName}`;
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
          if (errRow && errRow.rowData.fir_no) {
            invalidParentKeys.add(errRow.rowData.fir_no);
          }
        }
      }

      // Validate Act and Sections
      if (actSectionWorksheet) {
        const { rows: actSectionRows } = parseWorksheet(actSectionWorksheet, recordType, caseActSectionFields);
        const childErrors = [];
        validateSheetRows(actSectionRows, caseActSectionFields, 'Act and Sections', childErrors, parentKeysSet, 'fir_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = actSectionRows.find(ar => ar.rowIdx === err.row);
          if (errRow && errRow.rowData.fir_no) {
            invalidParentKeys.add(errRow.rowData.fir_no);
          }
        }
      }

      // Validate Accused Detail
      if (accusedWorksheet) {
        const { rows: accusedRows } = parseWorksheet(accusedWorksheet, recordType, caseAccusedFields);
        const childErrors = [];
        validateSheetRows(accusedRows, caseAccusedFields, 'Accused Detail', childErrors, parentKeysSet, 'fir_no');

        // Check duplicate accused under same FIR
        const accusedKeySet = new Set();
        for (const ar of accusedRows) {
          const fir = ar.rowData.fir_no;
          const name = `${ar.rowData.accused_first_name || ''} ${ar.rowData.accused_last_name || ''}`.trim().toLowerCase();
          const relName = (ar.rowData.accused_relative_name || '').trim().toLowerCase();
          if (fir && name) {
            const aKey = `${fir}|${name}|${relName}`;
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
          if (errRow && errRow.rowData.fir_no) {
            invalidParentKeys.add(errRow.rowData.fir_no);
          }
        }
      }

      // Validate Property Details
      if (propertyWorksheet) {
        const { rows: propertyRows } = parseWorksheet(propertyWorksheet, recordType, casePropertyFields);
        const childErrors = [];
        validateSheetRows(propertyRows, casePropertyFields, 'Property Details', childErrors, parentKeysSet, 'fir_no');

        // Check duplicate properties under same FIR
        const propertyKeySet = new Set();
        for (const pr of propertyRows) {
          const fir = pr.rowData.fir_no;
          const cat = (pr.rowData.property_major_category || '').trim().toLowerCase();
          const det = (pr.rowData.property_details || '').trim().toLowerCase();
          if (fir && (cat || det)) {
            const pKey = `${fir}|${cat}|${det}`;
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
          if (errRow && errRow.rowData.fir_no) {
            invalidParentKeys.add(errRow.rowData.fir_no);
          }
        }
      }

      for (const pr of parentRows) {
        if (invalidParentKeys.has(pr.rowData.fir_no) || errors.some(e => e.row === pr.rowIdx)) {
          invalidRowsCount++;
        } else {
          validRowsCount++;
        }
      }

    } else if (recordType === 'ARREST') {
      const { rows: parentRows } = parseWorksheet(parentWorksheet, recordType, arrestGeneralFields);
      const parentKeysSet = new Set(parentRows.map(r => r.rowData.linked_fir_dd_no).filter(Boolean));
      totalRows = parentRows.length;

      invalidParentKeys = new Set();

      // Validate General Info
      validateSheetRows(parentRows, arrestGeneralFields, 'General Info', errors);

      // Check duplicate arrests in excel sheet
      const sheetArrests = new Set();
      for (const pr of parentRows) {
        const fir = pr.rowData.linked_fir_dd_no;
        if (fir) {
          if (sheetArrests.has(fir)) {
            errors.push({
              row: pr.rowIdx,
              field_key: 'linked_fir_dd_no',
              code: 'DUPLICATE_IN_SHEET',
              message: `Duplicate Arrest general info row for FIR "${fir}" found in General Info sheet.`
            });
            invalidParentKeys.add(fir);
          } else {
            sheetArrests.add(fir);
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
          const data = typeof ea.data === 'string' ? JSON.parse(ea.data) : ea.data;
          if (data && data.linked_fir_dd_no) {
            const arrName = `${data.arrested_first_name || data.fullName || ''} ${data.arrested_last_name || ''}`.trim().toLowerCase();
            existingArrestKeys.add(`${data.linked_fir_dd_no.trim().toLowerCase()}|${arrName}`);
          }
        }

        let tempPersonRows = [];
        if (personWorksheet) {
          tempPersonRows = parseWorksheet(personWorksheet, recordType, arrestPersonFields).rows.map(r => r.rowData);
        }

        for (const pr of parentRows) {
          const fir = pr.rowData.linked_fir_dd_no;
          if (fir) {
            const pData = tempPersonRows.find(p => p.linked_fir_dd_no === fir);
            if (pData) {
              const name = `${pData.arrested_first_name || ''} ${pData.arrested_last_name || ''}`.trim().toLowerCase();
              const aKey = `${fir.trim().toLowerCase()}|${name}`;
              if (existingArrestKeys.has(aKey)) {
                errors.push({
                  row: pr.rowIdx,
                  field_key: 'linked_fir_dd_no',
                  code: 'DUPLICATE_IN_DATABASE',
                  message: `Arrest record for "${pData.arrested_first_name || ''}" under FIR "${fir}" already exists for this Police Station.`
                });
                invalidParentKeys.add(fir);
              }
            }
          }
        }
      }

      for (const pr of parentRows) {
        const hasErr = errors.some(e => e.row === pr.rowIdx);
        if (hasErr && pr.rowData.linked_fir_dd_no) {
          invalidParentKeys.add(pr.rowData.linked_fir_dd_no);
        }
      }

      // Validate Act and Sections
      if (actSectionWorksheet) {
        const { rows: actSectionRows } = parseWorksheet(actSectionWorksheet, recordType, arrestActSectionFields);
        const childErrors = [];
        validateSheetRows(actSectionRows, arrestActSectionFields, 'Act and Sections', childErrors, parentKeysSet, 'linked_fir_dd_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = actSectionRows.find(ar => ar.rowIdx === err.row);
          if (errRow && errRow.rowData.linked_fir_dd_no) {
            invalidParentKeys.add(errRow.rowData.linked_fir_dd_no);
          }
        }
      }

      // Validate Person Arrested Detail
      if (personWorksheet) {
        const { rows: personRows } = parseWorksheet(personWorksheet, recordType, arrestPersonFields);
        const childErrors = [];
        validateSheetRows(personRows, arrestPersonFields, 'Person Arrested Detail', childErrors, parentKeysSet, 'linked_fir_dd_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = personRows.find(pr => pr.rowIdx === err.row);
          if (errRow && errRow.rowData.linked_fir_dd_no) {
            invalidParentKeys.add(errRow.rowData.linked_fir_dd_no);
          }
        }
      }

      // Validate Property Details
      if (propertyWorksheet) {
        const { rows: propertyRows } = parseWorksheet(propertyWorksheet, recordType, arrestPropertyFields);
        const childErrors = [];
        validateSheetRows(propertyRows, arrestPropertyFields, 'Property Details', childErrors, parentKeysSet, 'linked_fir_dd_no');
        for (const err of childErrors) {
          errors.push(err);
          const errRow = propertyRows.find(pr => pr.rowIdx === err.row);
          if (errRow && errRow.rowData.linked_fir_dd_no) {
            invalidParentKeys.add(errRow.rowData.linked_fir_dd_no);
          }
        }
      }

      for (const pr of parentRows) {
        if (invalidParentKeys.has(pr.rowData.linked_fir_dd_no) || errors.some(e => e.row === pr.rowIdx)) {
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

    const rowsToInsert = [];

    if (batch.record_type === 'CASE') {
      const a = SHEET_ALIASES.CASE;
      const parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      const victimWorksheet = findWorksheet(workbook, a.victim);
      const actSectionWorksheet = findWorksheet(workbook, a.act);
      const accusedWorksheet = findWorksheet(workbook, a.accused);
      const propertyWorksheet = findWorksheet(workbook, a.property);

      const parentFields = allFields.filter(f => CASE_SHEETS_CONFIG.general.includes(f.field_key));
      const { rows: parentRows } = parseWorksheet(parentWorksheet, batch.record_type, parentFields);

      let victimRows = [];
      if (victimWorksheet) {
        victimRows = parseWorksheet(victimWorksheet, batch.record_type, caseVictimFields).rows.map(r => r.rowData);
      }

      let actSectionRows = [];
      if (actSectionWorksheet) {
        actSectionRows = parseWorksheet(actSectionWorksheet, batch.record_type, caseActSectionFields).rows.map(r => r.rowData);
      }

      let accusedRows = [];
      if (accusedWorksheet) {
        accusedRows = parseWorksheet(accusedWorksheet, batch.record_type, caseAccusedFields).rows.map(r => r.rowData);
      }

      let propertyRows = [];
      if (propertyWorksheet) {
        propertyRows = parseWorksheet(propertyWorksheet, batch.record_type, casePropertyFields).rows.map(r => r.rowData);
      }

      for (const { rowData } of parentRows) {
        const firNo = rowData.fir_no;
        if (!firNo) continue;
        if (invalidParentKeys.has(String(firNo))) continue;

        const acts = actSectionRows.filter(a => a.fir_no === firNo);
        const victims = victimRows.filter(v => v.fir_no === firNo);
        const accused = accusedRows.filter(a => a.fir_no === firNo);
        const properties = propertyRows.filter(p => p.fir_no === firNo);

        if (acts.length > 0) {
          rowData.act = [...new Set(acts.map(a => a.act).filter(Boolean))].join(', ');
          rowData.sections = [...new Set(acts.map(a => a.sections).filter(Boolean))].join(', ');
          rowData.crime_head = [...new Set(acts.map(a => a.crime_head).filter(Boolean))].join(', ');
          rowData.under_section = rowData.sections;
          rowData.local_head = rowData.crime_head;
        }

        rowsToInsert.push({ rowData, victims, accused, properties, acts });
      }

    } else if (batch.record_type === 'ARREST') {
      const a = SHEET_ALIASES.ARREST;
      const parentWorksheet = findWorksheet(workbook, a.parent) || workbook.worksheets[0];
      const actSectionWorksheet = findWorksheet(workbook, a.act);
      const personWorksheet = findWorksheet(workbook, a.person);
      const propertyWorksheet = findWorksheet(workbook, a.property);

      const parentFields = allFields.filter(f => ARREST_SHEETS_CONFIG.general.includes(f.field_key));
      const { rows: parentRows } = parseWorksheet(parentWorksheet, batch.record_type, parentFields);

      let actSectionRows = [];
      if (actSectionWorksheet) {
        actSectionRows = parseWorksheet(actSectionWorksheet, batch.record_type, arrestActSectionFields).rows.map(r => r.rowData);
      }

      let personRows = [];
      if (personWorksheet) {
        personRows = parseWorksheet(personWorksheet, batch.record_type, arrestPersonFields).rows.map(r => r.rowData);
      }

      let propertyRows = [];
      if (propertyWorksheet) {
        propertyRows = parseWorksheet(propertyWorksheet, batch.record_type, arrestPropertyFields).rows.map(r => r.rowData);
      }

      for (const { rowData } of parentRows) {
        const linkedFirDdNo = rowData.linked_fir_dd_no;
        if (!linkedFirDdNo) continue;
        if (invalidParentKeys.has(String(linkedFirDdNo))) continue;

        const acts = actSectionRows.filter(a => a.linked_fir_dd_no === linkedFirDdNo);
        const person = personRows.find(p => p.linked_fir_dd_no === linkedFirDdNo);
        const properties = propertyRows.filter(p => p.linked_fir_dd_no === linkedFirDdNo);

        const isYes = (val) => {
          if (!val) return false;
          const s = String(val).trim().toLowerCase();
          return s === 'yes' || s === 'true' || s === '1' || s === 'हाँ';
        };

        if (acts.length > 0) {
          rowData.act = [...new Set(acts.map(a => a.act).filter(Boolean))].join(', ');
          rowData.sections = [...new Set(acts.map(a => a.sections).filter(Boolean))].join(', ');
          rowData.crime_head = [...new Set(acts.map(a => a.crime_head).filter(Boolean))].join(', ');
          rowData.crimeHead = rowData.crime_head;
        }

        if (person) {
          Object.assign(rowData, person);

          rowData.fullName = person.arrested_first_name || person.full_name;
          rowData.full_name = person.arrested_first_name || person.full_name;
          rowData.arrested_name = person.arrested_first_name || person.full_name;
          rowData.fatherName = person.arrested_relative_name || person.father_name;
          rowData.father_name = person.arrested_relative_name || person.father_name;
          rowData.age = person.arrested_age_year || person.age;
          rowData.gender = person.arrested_gender || person.gender;
          rowData.address = person.arrested_present_address || person.address;
          rowData.arrested_address = person.arrested_present_address || person.address;
          rowData.nafisPrepared = isYes(person.nafis_prepared);
          rowData.nafis_prepared = person.nafis_prepared;
          rowData.dossierPrepared = isYes(person.dossier_prepared);
          rowData.dossier_prepared = person.dossier_prepared;
          rowData.searchSlipPrepared = isYes(person.search_slip_prepared);
          rowData.search_slip_prepared = person.search_slip_prepared;
          rowData.addressVerified = isYes(person.address_verified);
          rowData.address_verified = person.address_verified;
          rowData.verifyingOfficerName = person.verifying_officer_name;
          rowData.verifyingOfficerRank = person.verifying_officer_rank;
          rowData.kinName = person.kin_name;
          rowData.kinMobile = person.kin_mobile;
          rowData.kinRelationship = person.kin_relationship;
          rowData.photoPath = person.photo_path;
        }

        if (properties.length > 0) {
          rowData.property_major_category = properties[0].property_major_category;
          rowData.property_minor_category = properties[0].property_minor_category;
          rowData.property_stolen_recovered = properties[0].property_stolen_recovered;
          rowData.property_details = properties.map(p => p.property_details).filter(Boolean).join(', ');
        }

        rowData.firDdNumber = rowData.linked_fir_dd_no;
        rowData.firDate = rowData.fir_date;
        rowData.dateOfArrest = rowData.date_of_arrest;
        rowData.timeOfArrest = rowData.time_of_arrest;
        rowData.placeOfArrest = rowData.place_of_arrest;

        rowsToInsert.push({ rowData, person, properties, acts });
      }

    } else {
      const worksheet = workbook.worksheets[0] || workbook.getWorksheet(1);
      const registryFields = allFields.filter(f => {
        try {
          const types = typeof f.applicable_record_types === 'string'
            ? JSON.parse(f.applicable_record_types)
            : f.applicable_record_types;
          return Array.isArray(types) && types.map(t => t.toUpperCase()).includes(batch.record_type);
        } catch (e) {
          return false;
        }
      });
      const registryFieldsMap = {};
      for (const f of registryFields) {
        registryFieldsMap[f.field_key] = f;
      }

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
    const nextUid = (recordDate) => {
      const yr = parseInt(String(recordDate).slice(0, 4), 10);
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

      let recordDate = getRecordDate(batch.record_type, rowData) || new Date().toISOString().split('T')[0];
      if (recordDate instanceof Date) {
        recordDate = recordDate.toISOString().split('T')[0];
      } else if (typeof recordDate === 'string' && recordDate.includes('T')) {
        recordDate = recordDate.split('T')[0];
      }

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
              propertiesBatch.push({
                id: uuidv4(),
                record_id: recordId,
                major_category: truncate(prop.property_major_category, 50) || null,
                minor_category: truncate(prop.property_minor_category, 100) || null,
                status: truncate(prop.property_stolen_recovered || 'Stolen', 20),
                details: prop.property_details || null,
                sort_order: idx,
                created_at: now
              });
            }
            if (propertiesBatch.length > 0) {
              await trx('record_properties').insert(propertiesBatch);
            }

          // 5. Arrest child tables
          } else if (batch.record_type === 'ARREST') {
            const pRow = item.person;
            if (pRow) {
              await trx('record_persons').insert({
                id: uuidv4(),
                record_id: recordId,
                person_type: 'ARRESTED',
                first_name: truncate(pRow.arrested_first_name || pRow.full_name, 100),
                last_name: truncate(pRow.arrested_last_name || pRow.last_name, 100) || null,
                mobile: truncate(pRow.arrested_mobile || pRow.kin_mobile, 20) || null,
                city: truncate(pRow.arrested_city_town_village || pRow.address, 100) || null,
                district: truncate(pRow.arrested_district || pRow.district, 100) || null,
                data: JSON.stringify(pRow),
                sort_order: 0,
                created_at: now
              });
            }

            const propertiesBatch = [];
            for (let idx = 0; idx < item.properties.length; idx++) {
              const prop = item.properties[idx];
              propertiesBatch.push({
                id: uuidv4(),
                record_id: recordId,
                major_category: truncate(prop.property_major_category, 50) || null,
                minor_category: truncate(prop.property_minor_category, 100) || null,
                status: truncate(prop.property_stolen_recovered || 'Recovered', 20),
                details: prop.property_details || null,
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
        const unmatchedArrests = await trx('records')
          .where({ record_type: 'ARREST', ps_id: batch.ps_id })
          .whereNotExists(function() {
            this.select('*').from('record_links')
              .whereRaw('record_links.target_record_id = records.id');
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
