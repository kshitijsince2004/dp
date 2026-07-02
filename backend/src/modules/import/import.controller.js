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

  // Split by newline, comma, OR two or more spaces
  const parts = cleanStr.split(/[\n,]+|\s{2,}/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return result;

  let remainingParts = [...parts];

  // 1. Identify country
  const lastPart = remainingParts[remainingParts.length - 1];
  const countries = ['india', 'nepal', 'bhutan', 'bangladesh', 'pakistan', 'sri lanka', 'myanmar', 'tibetan', 'american', 'british', 'canadian'];
  if (countries.includes(lastPart.toLowerCase())) {
    result.country = lastPart;
    remainingParts.pop();
  } else {
    result.country = 'India';
  }

  // 2. Identify pincode if it is one of the parts
  if (remainingParts.length > 0) {
    const lastPart2 = remainingParts[remainingParts.length - 1];
    if (/^\d{6}$/.test(lastPart2)) {
      result.pincode = lastPart2;
      remainingParts.pop();
    }
  }

  // 3. Identify state using endsWith check
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

  // 4. House and City mapping
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

  // For arrested, make permanent address same as present address
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

  // Try to match a section pattern at the beginning
  const match = clean.match(/^([\d\w\(\)\/,\-\s]+?)\s+(THE\s+.*|IPC.*|BNS.*|ACT.*|INDIAN.*|BHARATIYA.*)/i);
  if (match) {
    return {
      section: match[1].trim(),
      act: match[2].trim()
    };
  }

  // Fallback: search for first occurrence of common act keywords
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

// Helper to determine the best record date for insertion
const getRecordDate = (recordType, rowData) => {
  if (recordType === 'CASE') {
    return rowData.fir_date || rowData.gd_date || rowData.occurrence_date;
  }
  if (recordType === 'ARREST') {
    return rowData.arrest_date || (rowData.date_and_time_of_arrest ? rowData.date_and_time_of_arrest.split(' ')[0] : null);
  }
  if (recordType === 'PCR_CALL') {
    return rowData.gd_date;
  }
  return null;
};

// Generate template hints row
const getHint = (field) => {
  const reqStr = isRequired(field) ? '[Required] ' : '';
  if (field.field_type === 'SELECT') {
    let options = [];
    try {
      options = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
    } catch (e) {}
    const optList = Array.isArray(options) ? options.map(o => (o && typeof o === 'object') ? o.value : o).join(', ') : '';
    return `${reqStr}select: ${optList}`;
  }
  if (field.field_type === 'DATE') {
    return `${reqStr}date (YYYY-MM-DD)`;
  }
  if (field.field_type === 'TIME') {
    return `${reqStr}time (HH:MM)`;
  }
  if (field.field_type === 'NUMBER') {
    return `${reqStr}number`;
  }
  return `${reqStr}${field.field_type.toLowerCase()}`;
};

const CASE_CUSTOM_MAPPINGS = {
  'local head': 'local_head',
  'local head (crime)': 'local_head',
  'fir no.': 'fir_no',
  'fir no': 'fir_no',
  'fir number': 'fir_no',
  'fir date': 'fir_date',
  'under section': 'sections',
  'sections': 'sections',
  'date of occurance': 'occurrence_date',
  'date of occurrence': 'occurrence_date',
  'place of occurance': 'occurrence_place',
  'place of occurrence': 'occurrence_place',
  'brief fact of the case': 'brief_facts',
  'brief facts of the case': 'brief_facts',
  'property (stolen)': 'stolen_property',
  'property description': 'stolen_property',
  'property (recovered)': 'recovered_property',
  'recovery property': 'recovered_property',
  'name of complainant': 'complainant_name',
  'complainant name': 'complainant_name',
  'present address of complainant': 'complainant_address',
  'complainant address': 'complainant_address',
  'name of io name': 'io_name',
  'name of io': 'io_name',
  'name of io rank': 'io_rank',
  'io rank': 'io_rank',
};

const ARREST_CUSTOM_MAPPINGS = {
  'local head': 'crime_head',
  'crime head': 'crime_head',
  'fir no. (legacy only)': 'linked_fir_dd_no',
  'linked fir / dd no.': 'linked_fir_dd_no',
  // On an arrest sheet the FIR number IS the linked case, so accept the plain headers too.
  'fir no.': 'linked_fir_dd_no',
  'fir no': 'linked_fir_dd_no',
  'fir number': 'linked_fir_dd_no',
  'fir date': 'fir_date',
  'under section': 'sections',
  'sections': 'sections',
  'date of arrest': 'arrest_date',
  'name of io name': 'io_name',
  'name of io': 'io_name',
  'property (recovered)': 'recovery',
  'recovery': 'recovery',
  'property (stolen)': 'stolen_property',
  'name of io rank': 'io_rank',
  'io rank': 'io_rank',
  'name of arrested person': 'arrested_name',
  'address of arrested': 'arrested_address',
  'name & address of accused': 'name_and_address_of_accused'
};

const buildColumnMap = (worksheet, recordType, registryFields) => {
  const row1Values = [];
  const row2Values = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
    row1Values.push(cell.value ? String(cell.value).trim() : '');
  });
  worksheet.getRow(2).eachCell({ includeEmpty: true }, (cell) => {
    row2Values.push(cell.value ? String(cell.value).trim() : '');
  });

  const registryKeysSet = new Set(registryFields.map(f => f.field_key));

  let hasHiddenKeys = false;
  let matchingKeysCount = 0;
  row1Values.forEach(val => {
    if (registryKeysSet.has(val)) matchingKeysCount++;
  });
  if (matchingKeysCount >= 3) {
    hasHiddenKeys = true;
  }

  const colMap = {};
  let dataStartRow = 4;

  if (hasHiddenKeys) {
    const mappings = recordType === 'CASE' ? CASE_CUSTOM_MAPPINGS : ARREST_CUSTOM_MAPPINGS;
    row1Values.forEach((val, idx) => {
      const colIdx = idx + 1;
      if (val) {
        const cleanVal = String(val).trim();
        const normVal = cleanVal.toLowerCase().replace(/\s+/g, ' ').trim();
        colMap[colIdx] = mappings[normVal] || cleanVal;
      }
    });
  } else {
    let headerRowIdx = 1;
    let headerValues = row1Values;

    let row1Matches = 0;
    let row2Matches = 0;

    const mappings = recordType === 'CASE' ? CASE_CUSTOM_MAPPINGS : ARREST_CUSTOM_MAPPINGS;

    // Normalise a header for matching: lowercase, collapse runs of whitespace to a single
    // space, and trim. Real sheets often have stray double spaces (e.g. "Name Of IO  Name")
    // that would otherwise silently fail to map and drop the whole column.
    const normHeader = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

    row1Values.forEach(val => {
      const normVal = normHeader(val);
      if (mappings[normVal] || registryKeysSet.has(normVal)) row1Matches++;
    });

    row2Values.forEach(val => {
      const normVal = normHeader(val);
      if (mappings[normVal] || registryKeysSet.has(normVal)) row2Matches++;
    });

    if (row2Matches > row1Matches) {
      headerRowIdx = 2;
      headerValues = row2Values;
      dataStartRow = 3;
    } else {
      dataStartRow = 2;
    }

    headerValues.forEach((val, idx) => {
      const colIdx = idx + 1;
      if (!val) return;
      const cleanVal = String(val).trim();
      const normVal = normHeader(cleanVal);

      if (mappings[normVal]) {
        colMap[colIdx] = mappings[normVal];
        return;
      }

      if (registryKeysSet.has(cleanVal)) {
        colMap[colIdx] = cleanVal;
        return;
      }

      const fieldByLabel = registryFields.find(f =>
        normHeader(f.label_en) === normVal ||
        normHeader(f.label_hi) === normVal
      );
      if (fieldByLabel) {
        colMap[colIdx] = fieldByLabel.field_key;
        return;
      }
      
      colMap[colIdx] = normVal;
    });
  }

  return { colMap, dataStartRow, hasHiddenKeys };
};

// Robustly extract the FIR sequence number and year from a free-form reference.
// Handles "FIR/2026/1013", "0001/2025", "FIR-104/2026", "201/26", "FIR No. 55/2025", "201".
// The 4-digit token in a plausible year range is treated as the year; the other numeric
// token is the sequence number (returned normalised, leading zeros stripped) so that
// "0001" and "1" compare equal during linkage.
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

// Coerce a wide variety of legacy date representations into a clean YYYY-MM-DD string.
// Accepts JS Date objects, ISO datetimes, DD/MM/YYYY (and . or - separators), 2-digit years,
// and date ranges like "04/01/2025 TO 04/01/2025" (takes the first date). Indian police
// legacy sheets are day-first, so DD/MM/YYYY is assumed. Returns null when uncoercible.
const coerceDate = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0];
  }
  let s = String(val).trim();
  if (!s) return null;

  // Date range "X TO Y" → keep the start date
  const range = s.split(/\s+TO\s+/i);
  if (range.length > 1) s = range[0].trim();

  // ISO date / datetime
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD/MM/YYYY (day-first), separators / - .
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let d = m[1], mo = m[2], y = m[3];
    if (y.length === 2) y = '20' + y;
    d = d.padStart(2, '0');
    mo = mo.padStart(2, '0');
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${mo}-${d}`;
  }

  // Last resort: let the engine try
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  return null;
};

// Coerce a value into HH:MM. Keeps the raw trimmed string if it can't be parsed
// (legacy data is imported as-is rather than rejected).
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

// Split the combined "Name & Address Of Accused" column into name + address.
// Prefers a newline boundary, falls back to the first comma.
const splitAccused = (raw) => {
  const splitVal = String(raw || '').trim();
  
  // Try split by Present/Permanent add:
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

// Read a worksheet row into a normalised { field_key: value } object using the column map.
// Dates/times are coerced; the combined accused column is split. Shared by validate + confirm
// so the data that is validated is exactly the data that gets stored.
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

  // Name split mapping
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

  // Address parsing
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

  // Act and Section parsing
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


// Generate transaction-safe import UIDs
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

// 1. GET /api/import/template/:record_type
export const downloadImportTemplate = async (req, res) => {
  const recordType = req.params.record_type.toUpperCase();
  const lang = req.query.lang || 'en';

  const validTypes = ['ARREST', 'PCR_CALL', 'CASE'];
  if (!validTypes.includes(recordType)) {
    return res.status(400).json({ success: false, message: `Invalid record type '${recordType}'` });
  }

  try {
    const allFields = await db('field_registry')
      .where('is_active', true)
      .orderBy('sort_order', 'asc');

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

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Import Template');

    // Row 1: field_keys (hidden)
    const row1 = fields.map(f => f.field_key);
    worksheet.addRow(row1);
    worksheet.getRow(1).hidden = true;

    // Row 2: English or Hindi labels
    const row2 = fields.map(f => lang === 'hi' ? f.label_hi : f.label_en);
    const headerRow = worksheet.addRow(row2);
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

    // Row 3: hint descriptors
    const row3 = fields.map(f => getHint(f));
    const hintRow = worksheet.addRow(row3);
    hintRow.height = 20;
    hintRow.font = { italic: true, color: { argb: 'FF6B7280' } };
    hintRow.eachCell(cell => {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Data validations for drop-downs
    for (let colIdx = 0; colIdx < fields.length; colIdx++) {
      const field = fields[colIdx];
      if (field.field_type === 'SELECT') {
        let options = [];
        try {
          options = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
        } catch (e) {}
        if (Array.isArray(options) && options.length > 0) {
          const validValues = options.map(o => (o && typeof o === 'object') ? o.value : o);
          const formulaVal = `"${validValues.join(',')}"`;
          
          for (let rIdx = 4; rIdx <= 1000; rIdx++) {
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

    // Auto-fit column widths
    worksheet.columns.forEach(column => {
      let maxLen = 15;
      column.eachCell({ includeEmpty: true }, (cell, rowIdx) => {
        if (rowIdx === 1) return;
        const val = cell.value ? String(cell.value) : '';
        if (val.length > maxLen) maxLen = val.length;
      });
      column.width = Math.min(maxLen + 4, 45);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${recordType}_Import_Template.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('[TemplateExport] Error generating template:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. POST /api/import/validate
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
    // Clean up uploaded file immediately if basic input is invalid
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
    const worksheet = workbook.worksheets[0] || workbook.getWorksheet(1);

    if (!worksheet) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, message: 'Invalid template: first worksheet not found' });
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

    const { colMap, dataStartRow } = buildColumnMap(worksheet, recordType, registryFields);

    if (Object.keys(colMap).length === 0) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, message: 'Invalid template or column headers could not be mapped.' });
    }

    const errors = [];
    let totalRows = 0;
    let validRowsCount = 0;
    let invalidRowsCount = 0;

    const rowsToProcess = [];
    worksheet.eachRow((row, rowIdx) => {
      if (rowIdx < dataStartRow) return;
      let isEmpty = true;
      row.eachCell({ includeEmpty: false }, () => {
        isEmpty = false;
      });
      if (isEmpty) return; // skip entirely empty rows

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

    // Cap inline errors so the response stays small even for very large sheets.
    // The full set is persisted to import_batch_errors and available via GET /batches/:id.
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

// 3. POST /api/import/confirm/:batchId
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

    // Clear, early messages for the common double-submit cases (a completed import has
    // already deleted its temp file, so these must come before the file-existence check).
    if (batch.status === 'COMPLETED') {
      return res.status(409).json({ success: false, message: 'This batch has already been imported.' });
    }
    if (batch.status === 'PROCESSING') {
      return res.status(409).json({ success: false, message: 'This batch is already being imported. Please wait for it to finish.' });
    }

    if (!fs.existsSync(batch.file_path)) {
      return res.status(410).json({ success: false, message: 'Physical temp file has expired or was removed' });
    }

    // Atomically claim the batch so concurrent requests can never import twice.
    // A large import can run longer than the client's HTTP timeout; if the browser
    // aborts and the user clicks again, the second request is rejected here instead
    // of inserting duplicate records.
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
      .pluck('row_number');
    const errorRowsSet = new Set(errorRows);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(batch.file_path);
    const worksheet = workbook.worksheets[0] || workbook.getWorksheet(1);

    const allFields = await db('field_registry').where('is_active', true);
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

    const rowsToInsert = [];
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

    // Pre-compute UID sequence counters once instead of running a COUNT query per row.
    // At 30k+ rows the per-row COUNT was the main bottleneck that made confirm hang.
    // Sequences are tracked per calendar year (UIDs are year-scoped) and incremented in
    // memory; this batch is the only writer for this PS during the import.
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

    // Insert in chunks of 500 using array inserts (1 query per table per chunk) rather
    // than 3 queries per row — keeps 30k+ row imports within request timeout.
    const INSERT_CHUNK = 500;
    for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK) {
      const chunk = rowsToInsert.slice(i, i + INSERT_CHUNK);
      const recordsBatch = [];
      const revisionsBatch = [];
      const auditBatch = [];
      const personsBatch = [];
      const propertiesBatch = [];

      for (const rowData of chunk) {
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

        recordsBatch.push({
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
          legacy_ref: batch.is_legacy ? (rowData.fir_no || rowData.pcr_gd_no || null) : null
        });

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

        const prev_hash = null;
        revisionPayload.prev_hash = prev_hash;
        revisionPayload.row_hash = computeRowHash({
          record_id: recordId,
          revision_number: 1,
          changed_by: batch.uploaded_by,
          changed_at: revisionPayload.changed_at,
          field_changes: revisionPayload.field_changes
        }, prev_hash);
        revisionsBatch.push(revisionPayload);

        auditBatch.push({
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

        const truncate = (val, maxLen) => {
          if (val === null || val === undefined) return null;
          const str = String(val);
          if (str.length <= maxLen) return str;
          return str.substring(0, maxLen);
        };

        // Extract and structure Child Records (PERSONS & PROPERTIES)
        if (batch.record_type === 'CASE') {
          // Complainant
          if (rowData.complainant_first_name) {
            const compData = {};
            for (const key of Object.keys(rowData)) {
              if (key.startsWith('complainant_')) {
                compData[key] = rowData[key];
              }
            }
            personsBatch.push({
              id: uuidv4(),
              record_id: recordId,
              person_type: 'COMPLAINANT',
              first_name: truncate(rowData.complainant_first_name, 100),
              last_name: truncate(rowData.complainant_last_name, 100) || null,
              mobile: truncate(rowData.complainant_mobile, 20) || null,
              city: truncate(rowData.complainant_city_town_village, 100) || null,
              district: truncate(rowData.complainant_district, 100) || null,
              data: JSON.stringify(compData),
              sort_order: personsBatch.filter(p => p.record_id === recordId).length,
              created_at: now
            });
          }

          // Accused
          if (rowData.accused_first_name) {
            const accData = {};
            for (const key of Object.keys(rowData)) {
              if (key.startsWith('accused_')) {
                accData[key] = rowData[key];
              }
            }
            personsBatch.push({
              id: uuidv4(),
              record_id: recordId,
              person_type: 'ACCUSED',
              first_name: truncate(rowData.accused_first_name, 100),
              last_name: truncate(rowData.accused_last_name, 100) || null,
              mobile: truncate(rowData.accused_mobile, 20) || null,
              city: truncate(rowData.accused_city_town_village, 100) || null,
              district: truncate(rowData.accused_district, 100) || null,
              data: JSON.stringify(accData),
              sort_order: personsBatch.filter(p => p.record_id === recordId).length,
              created_at: now
            });
          }

          // Victim
          if (rowData.victim_first_name) {
            const vicData = {};
            for (const key of Object.keys(rowData)) {
              if (key.startsWith('victim_')) {
                vicData[key] = rowData[key];
              }
            }
            personsBatch.push({
              id: uuidv4(),
              record_id: recordId,
              person_type: 'VICTIM',
              first_name: truncate(rowData.victim_first_name, 100),
              last_name: truncate(rowData.victim_last_name, 100) || null,
              mobile: truncate(rowData.victim_mobile, 20) || null,
              city: truncate(rowData.victim_city_town_village, 100) || null,
              district: truncate(rowData.victim_district, 100) || null,
              data: JSON.stringify(vicData),
              sort_order: personsBatch.filter(p => p.record_id === recordId).length,
              created_at: now
            });
          }

          // Properties
          // 1. General Property
          if (rowData.property_major_category || rowData.property_details) {
            let details = rowData.property_details || '';
            if (rowData.property_major_category === 'Mobile Phone') {
              const phoneParts = [];
              if (rowData.phone_make) phoneParts.push(`Make: ${rowData.phone_make}`);
              if (rowData.phone_model) phoneParts.push(`Model: ${rowData.phone_model}`);
              if (rowData.phone_imei) phoneParts.push(`IMEI: ${rowData.phone_imei}`);
              if (rowData.phone_color) phoneParts.push(`Color: ${rowData.phone_color}`);
              if (rowData.property_phone_number) phoneParts.push(`Phone No: ${rowData.property_phone_number}`);
              if (phoneParts.length > 0) {
                if (details) details += '\n';
                details += phoneParts.join(', ');
              }
            }
            propertiesBatch.push({
              id: uuidv4(),
              record_id: recordId,
              major_category: truncate(rowData.property_major_category, 50) || null,
              minor_category: truncate(rowData.property_minor_category, 100) || null,
              status: truncate(rowData.property_status || rowData.property_stolen_recovered || 'Stolen', 20),
              details: details || null,
              sort_order: propertiesBatch.filter(p => p.record_id === recordId).length,
              created_at: now
            });
          }

          // 2. Stolen Property Description (flat column)
          if (rowData.property_description && !rowData.property_details) {
            propertiesBatch.push({
              id: uuidv4(),
              record_id: recordId,
              major_category: null,
              minor_category: null,
              status: 'Stolen',
              details: rowData.property_description,
              sort_order: propertiesBatch.filter(p => p.record_id === recordId).length,
              created_at: now
            });
          }

          // 3. Recovered Property (flat column)
          if (rowData.recovered_property) {
            propertiesBatch.push({
              id: uuidv4(),
              record_id: recordId,
              major_category: null,
              minor_category: null,
              status: truncate(rowData.recovered_property_status || 'Recovered', 20),
              details: rowData.recovered_property,
              sort_order: propertiesBatch.filter(p => p.record_id === recordId).length,
              created_at: now
            });
          }

        } else if (batch.record_type === 'ARREST') {
          // Arrested Person
          const arrestedFirstName = rowData.arrested_first_name || rowData.arrested_name;
          if (arrestedFirstName) {
            const arrData = {};
            for (const key of Object.keys(rowData)) {
              if (key.startsWith('arrested_') || ['parents_name', 'nick_name', 'prev_involvement', 'age_gender', 'bc_or_not', 'bad_character', 'proclaimed_offender', 'listed_criminal', 'is_po'].includes(key)) {
                arrData[key] = rowData[key];
              }
            }
            personsBatch.push({
              id: uuidv4(),
              record_id: recordId,
              person_type: 'ARRESTED',
              first_name: truncate(arrestedFirstName, 100),
              last_name: truncate(rowData.arrested_last_name, 100) || null,
              mobile: truncate(rowData.arrested_mobile, 20) || null,
              city: truncate(rowData.arrested_city_town_village, 100) || null,
              district: truncate(rowData.arrested_district, 100) || null,
              data: JSON.stringify(arrData),
              sort_order: personsBatch.filter(p => p.record_id === recordId).length,
              created_at: now
            });
          }

          // Property
          if (rowData.recovery || rowData.property_major_category || rowData.property_details) {
            propertiesBatch.push({
              id: uuidv4(),
              record_id: recordId,
              major_category: truncate(rowData.property_major_category, 50) || null,
              minor_category: truncate(rowData.property_minor_category, 100) || null,
              status: truncate(rowData.property_stolen_recovered || 'Recovered', 20),
              details: rowData.property_details || rowData.recovery || null,
              sort_order: propertiesBatch.filter(p => p.record_id === recordId).length,
              created_at: now
            });
          }
        }

        newlyInsertedRecords.push({ id: recordId, data: finalData });
        importedRowsCount++;
      }

      await db.transaction(async (trx) => {
        await trx('records').insert(recordsBatch);
        await trx('record_revisions').insert(revisionsBatch);
        await trx('audit_logs').insert(auditBatch);
        if (personsBatch.length > 0) {
          await trx('record_persons').insert(personsBatch);
        }
        if (propertiesBatch.length > 0) {
          await trx('record_properties').insert(propertiesBatch);
        }
      });
    }

      // Auto-Linkage runner after all insertions are committed
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

    // Clean up temp file
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
    logger.error('[ConfirmImport] Database transaction confirm error: ' + error.message + '\n' + error.stack);
    // Release the PROCESSING claim so the batch isn't left stuck and can be retried.
    try {
      await db('import_batches')
        .where({ id: batchId, status: 'PROCESSING' })
        .update({ status: 'VALIDATION_DONE' });
    } catch (_) {}
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. GET /api/import/batches
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

// 5. GET /api/import/batches/:batchId
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
