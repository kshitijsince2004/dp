import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import db from '../../config/db.js';
import { logger } from '../../utils/logger.js';
import {
  CASE_SHEETS_CONFIG,
  ARREST_SHEETS_CONFIG,
  caseGeneralFields,
  caseVictimFields,
  caseActSectionFields,
  caseAccusedFields,
  casePropertyFields,
  arrestGeneralFields,
  arrestActSectionFields,
  arrestPersonFields,
  arrestPropertyFields,
  NAMED_RANGE_FIELD_KEYS,
  INDIRECT_CASCADE_FIELDS,
  NR_PREFIX,
} from './import-fields.config.js';
import * as fieldsService from '../fields/fields.service.js';
import { ACT_GROUP_CODES, MINOR_HEAD_MAJOR_CODES } from '../fields/classificationSources.config.js';

function slugify(text) {
  return text.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
}

function colLetterToNum(letter) {
  let num = 0;
  for (let i = 0; i < letter.length; i++) {
    num = num * 26 + (letter.charCodeAt(i) - 64);
  }
  return num;
}

function numToColLetter(num) {
  let letter = "";
  while (num > 0) {
    let temp = (num - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    num = (num - temp - 1) / 26;
  }
  return letter;
}

function parseRange(rangeStr) {
  const [start, end] = rangeStr.split(':');
  const startColLetter = start.match(/[A-Z]+/)[0];
  const startRow = parseInt(start.match(/\d+/)[0], 10);
  const endColLetter = end.match(/[A-Z]+/)[0];
  const endRow = parseInt(end.match(/\d+/)[0], 10);
  
  return {
    startCol: colLetterToNum(startColLetter),
    startRow,
    endCol: colLetterToNum(endColLetter),
    endRow
  };
}

// Maps backend field section to spreadsheet sheet and section label
const CASE_SECTION_MAP = {
  general_info: { sheet: 'General Information', label: 'General Information' },
  incident_details: { sheet: 'General Information', label: 'General Information' },
  investigation_officer: { sheet: 'General Information', label: 'IO Details' },
  occurrence_info: { sheet: 'General Information', label: 'Place of Occurrence Address' },
  occurrence_address: { sheet: 'General Information', label: 'Place of Occurrence Address' },
  complainant_personal_info: { sheet: 'General Information', label: 'Complainant Personal Details' },
  complainant_personal_details: { sheet: 'General Information', label: 'Complainant Personal Details' },
  complainant_address: { sheet: 'General Information', label: 'Complainant Present Address' },
  complainant_perm_address: { sheet: 'General Information', label: 'Complainant Permanent Address' },
  
  victim_personal_info: { sheet: 'Victim Information', label: 'Victim Personal Details' },
  victim_personal_details: { sheet: 'Victim Information', label: 'Victim Personal Details' },
  victim_address: { sheet: 'Victim Information', label: 'Victim Present Address' },
  victim_perm_address: { sheet: 'Victim Information', label: 'Victim Permanent Address' },
  
  act_section: { sheet: 'Act and Sections', label: 'Act and Sections' },
  offence_info: { sheet: 'Act and Sections', label: 'Act and Sections' },
  
  accused_personal_info: { sheet: 'Accused Detail', label: 'Accused Personal details' },
  accused_personal_details: { sheet: 'Accused Detail', label: 'Accused Personal details' },
  accused_address: { sheet: 'Accused Detail', label: 'Accused Present Address' },
  accused_perm_address: { sheet: 'Accused Detail', label: 'Accused Permanent Address' },
  
  property_details: { sheet: 'Property Details', label: 'Property Details' },
  stolen_property: { sheet: 'Property Details', label: 'Property Details' },
  recovered_property: { sheet: 'Property Details', label: 'Property Details' }
};

const ARREST_SECTION_MAP = {
  general_info: { sheet: 'General Info', label: 'General Information' },
  arrest_details: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  arrested_info: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  investigation_officer: { sheet: 'General Info', label: 'IO Details' },
  
  act_section: { sheet: 'Act and Sections', label: 'Act and Sections' },
  offence_info: { sheet: 'Act and Sections', label: 'Act and Sections' },
  
  arrested_personal_info: { sheet: 'Person Arrested Detail', label: 'Arrested Person Personal Details' },
  arrested_address: { sheet: 'Person Arrested Detail', label: 'Arrested Person Present Address' },
  arrested_perm_address: { sheet: 'Person Arrested Detail', label: 'Arrested Person Permanent Address' },
  custody_status: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  special_scheme: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  procedure_slips: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  verification_kin_details: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  
  property_details: { sheet: 'Property Details', label: 'Property Details' },
  stolen_property: { sheet: 'Property Details', label: 'Property Details' },
  recovered_property: { sheet: 'Property Details', label: 'Property Details' }
};

// Generates validation hints
const getHint = (field) => {
  const reqStr = field.validation_rules?.required ? '[Required] ' : '';
  if (field.field_type === 'SELECT') {
    let options = [];
    try {
      options = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
    } catch (e) {}
    const optList = Array.isArray(options) ? options.map(o => (o && typeof o === 'object') ? o.value : o).join(', ') : '';
    return `${reqStr}select: ${optList}`;
  }
  if (field.field_type === 'DATE') {
    return `${reqStr}date (DD/MM/YYYY)`;
  }
  if (field.field_type === 'TIME') {
    return `${reqStr}time (HH:MM)`;
  }
  if (field.field_type === 'NUMBER') {
    return `${reqStr}number`;
  }
  return `${reqStr}${field.field_type.toLowerCase()}`;
};

// Deterministic mapping of a hidden field-key (Row 1) to its section-header label.
// Used to rebuild the Row-2 section headers cleanly after all column insert/delete ops,
// because insert/delete corrupt the stored merge ranges (ExcelJS model.merges is unreliable).
// Returns null to mean "carry forward the previous column's section" (used for temporal
// fields, label-only columns, and anything that belongs with the block before it).
const ADDR_TOKENS = ['house_no', 'street', 'colony', 'city_town_village', 'tehsil_block_mandal', 'country', 'state', 'district', 'police_station', 'pincode', 'present_address'];
const PARTICULAR_KEYS = new Set(['nafis_prepared', 'dossier_prepared', 'prev_involvement', 'previous_involvement', 'bad_character', 'proclaimed_offender', 'verifying_officer_name', 'verifying_officer_rank', 'status', 'scheme_of_arrest', 'search_slip_prepared', 'address_verified', 'kin_name', 'kin_mobile', 'kin_relationship', 'photo_path']);

const sectionLabelForKey = (key, recordType, isParentSheet) => {
  if (!key) return null; // carry forward (label-only column)

  // "Is Permanent Address same as Present?" toggle is keyed complainant_perm_same on every
  // person sheet — carry forward so it doesn't leak a "Complainant" label onto victim/accused.
  if (key.endsWith('_perm_same')) return null;

  if (key === 'fir_no' || key === 'linked_fir_dd_no') {
    return isParentSheet ? 'General Information' : 'Case Reference';
  }

  if (key === 'act' || key === 'sections') return 'Act and Sections';
  if (key === 'crime_head') return 'Major / Minor Head';

  for (const [prefix, label] of [['complainant', 'Complainant'], ['victim', 'Victim'], ['accused', 'Accused'], ['arrested', 'Arrested Person']]) {
    if (key.startsWith(prefix + '_')) {
      if (key.startsWith(prefix + '_perm')) return `${label} Permanent Address`;
      const rest = key.slice(prefix.length + 1);
      if (ADDR_TOKENS.some(t => rest === t) || rest.includes('address')) return `${label} Present Address`;
      return `${label} Personal Details`;
    }
  }

  if (key.startsWith('occurrence_')) {
    const rest = key.slice('occurrence_'.length);
    if (ADDR_TOKENS.some(t => rest === t)) return 'Place of Occurrence Address';
    return null; // occurrence_date/time/place → stay in General Information
  }

  if (key.startsWith('io_')) return 'IO Details';

  if (['date_of_arrest', 'time_of_arrest', 'place_of_arrest', 'arrest_date', 'arrest_place'].includes(key)) {
    return (recordType === 'ARREST' && isParentSheet) ? 'Arrest Details' : null;
  }

  if (key.startsWith('property_') || key.startsWith('phone_')) return 'Property Details';

  if (!isParentSheet && PARTICULAR_KEYS.has(key)) return 'Particular Details';

  return null; // General Information fields (fir_date, district, status, etc.) carry forward
};

// ────────────────────────────────────────────────────────────────────────────────────────
// Live-lookup helpers — called by buildTemplate() to fetch all option lists from DB.
// Returns a map: fieldKey → [{value, label}] for every SELECT field that has DB-driven options.
// Also returns _propItemsByCategory (categoryLabel → [{value,label}]) and _propCategoryLabels.
// ────────────────────────────────────────────────────────────────────────────────────────
async function buildLiveLookups(recordType) {
  // Mirrors the option-precompute block in fields.controller.js/getFieldsForForm.
  // Using the same fieldsService.* calls ensures the Excel template shows
  // exactly the same options as the interactive form.
  const toOpt = (labelCol) => (r) => ({ value: r[labelCol], label: r[labelCol] });

  // Sections per act group
  const ipcSections       = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES.IPC)).map(toOpt('section'));
  const exciseSections    = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Delhi Excise Act'])).map(toOpt('section'));
  const armsSections      = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Arms Act'])).map(toOpt('section'));
  const gamblingSections  = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Gambling Act'])).map(toOpt('section'));
  const allGroupCodes     = Object.values(ACT_GROUP_CODES).flat();
  const allSections       = (await fieldsService.getSectionsForActs(allGroupCodes)).map(toOpt('section'));

  // Major heads per act group
  const ipcMajorHeads     = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES.IPC)).map(toOpt('major_head'));
  const exciseMajorHeads  = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Delhi Excise Act'])).map(toOpt('major_head'));
  const armsMajorHeads    = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Arms Act'])).map(toOpt('major_head'));
  const gamblingMajorHeads = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Gambling Act'])).map(toOpt('major_head'));

  // Minor heads per crime-specific field_key
  const minorHeadsByKey = {};
  for (const [fk, codes] of Object.entries(MINOR_HEAD_MAJOR_CODES)) {
    const rows = await fieldsService.getMinorHeadsForMajorHeads(codes);
    minorHeadsByKey[fk] = rows.map(toOpt('minor_head'));
  }

  // Beats and local heads
  const beats      = (await fieldsService.getBeats()).map(toOpt('beat_name'));
  const localHeads = (await fieldsService.getLocalHeads()).map(toOpt('local_head'));

  // Districts and Police Stations
  const districts = await db('ref_district').select('district_name').orderBy('district_name', 'asc');
  const psRows = await db('ref_police_station').select('ps_name').orderBy('ps_name', 'asc');
  const districtOpts = districts.map(d => ({ value: d.district_name, label: d.district_name }));
  const psOpts = psRows.map(p => ({ value: p.ps_name, label: p.ps_name }));

  // Property categories — use code_type as value/label (the human-readable category name)
  const propCategoryRows = await fieldsService.getPropertyCategories();
  const propCategories = propCategoryRows
    .map(c => ({ value: c.code_type, label: c.code_type, parent_cd: c.parent_cd }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Property items per category, for the INDIRECT cascade named ranges
  const propItemsByCategory = {};
  for (const cat of propCategories) {
    try {
      const raw = await fieldsService.getPropertyItemsForCategory(cat.parent_cd);
      let items = [];
      if (raw && raw.type === 'ARMS') {
        // Flatten arms: made names + all fire_arms names into one list
        items = [
          ...(raw.made || []).map(r => ({ value: r.arms_made, label: r.arms_made })),
          ...(raw.fireArms || []).map(r => ({ value: r.fire_arms, label: r.fire_arms })),
        ];
      } else if (Array.isArray(raw) && raw.length > 0 && 'property_cd' in raw[0]) {
        // Default branch (excel_other_property_items) — raw {property_cd, property}
        items = raw.map(r => ({ value: r.property, label: r.property }));
      } else if (Array.isArray(raw)) {
        // GENERIC branches already return {value, label}
        items = raw;
      }
      propItemsByCategory[cat.label] = items;
    } catch (err) {
      logger.error(`buildLiveLookups: failed to fetch items for category ${cat.label}`, { err });
      propItemsByCategory[cat.label] = [];
    }
  }

  // Status options — record-type-specific (each template covers only one record type)
  const statusOptionsByType = {
    CASE:  ['CHARGE SHEET', 'POLICE INVESTIGATION REPORT(PIR-JCL)', 'UNTRACED', 'PENDING',
             'CANCELLATION', 'QUASHED', 'CLOSURE REPORT', 'RELEASED U/S 189 BNSS', 'TRANSFER'],
    ARREST: ['police_custody', 'bail', 'judicial_custody', 'released', 'others'],
  };
  const statusOpts = (statusOptionsByType[recordType] || []).map(v => ({ value: v, label: v }));

  return {
    ipc_sections:                ipcSections,
    excise_sections:             exciseSections,
    arms_sections:               armsSections,
    gambling_sections:           gamblingSections,
    sections:                    allSections,
    ipc_major_head:              ipcMajorHeads,
    excise_major_head:           exciseMajorHeads,
    arms_major_head:             armsMajorHeads,
    gambling_major_head:         gamblingMajorHeads,
    ...minorHeadsByKey,
    beat_no:                     beats,
    local_head:                  localHeads,
    crime_head:                  localHeads, // same source as local_head
    property_major_category:     propCategories,
    property_minor_category:     [], // options are per-category; handled via INDIRECT cascade
    status:                      statusOpts,
    district:                    districtOpts,
    police_station:              psOpts,
    // Private fields consumed by createLookupsSheet
    _propItemsByCategory:        propItemsByCategory,
    _propCategoryLabels:         propCategories.map(c => c.label),
  };
}

// ────────────────────────────────────────────────────────────────────────────────────────
// Creates a veryHidden _Lookups worksheet and registers named ranges in the workbook
// for every option list that is too long for an inline formula.
// ExcelJS 3.10 API (verified): definedNames.add(rangeRef, namedRangeName) — range first.
// Returns: { namedRangeMap: {fieldKey → namedRangeName}, slugToNR: {categorySlug → namedRangeName} }
// ────────────────────────────────────────────────────────────────────────────────────────
function createLookupsSheet(workbook, liveLookups) {
  // Remove existing _Lookups sheet to make this idempotent
  const existing = workbook.getWorksheet('_Lookups');
  if (existing) workbook.removeWorksheet(existing.id);

  const ws = workbook.addWorksheet('_Lookups');
  try { ws.state = 'veryHidden'; } catch (_) { ws.state = 'hidden'; }

  const namedRangeMap = {};  // fieldKey → named range name
  const slugToNR = {};       // category label slug → named range name (for INDIRECT formula)
  let col = 1;

  // Writes one option list to the _Lookups sheet and registers a named range.
  // nrName: the exact name to register (must match what INDIRECT() will reference).
  function writeList(fieldKey, options, nrName) {
    if (!options || options.length === 0) return;
    const values = options.map(o => (o && typeof o === 'object' ? o.value : String(o)));
    // Row 1: header label (= named range name, for human readers viewing the sheet)
    ws.getCell(1, col).value = nrName;
    values.forEach((v, i) => { ws.getCell(i + 2, col).value = v; });
    const colLetter = numToColLetter(col);
    const rangeRef  = `'_Lookups'!$${colLetter}$2:$${colLetter}$${values.length + 1}`;
    try {
      workbook.definedNames.add(rangeRef, nrName);
    } catch (err) {
      logger.error(`createLookupsSheet: failed to register named range ${nrName}`, { err });
    }
    namedRangeMap[fieldKey] = nrName;
    col++;
  }

  // 1. Write named ranges for all NAMED_RANGE_FIELD_KEYS fields
  const FIELD_KEY_TO_LIVE = {
    ipc_sections:                liveLookups.ipc_sections,
    excise_sections:             liveLookups.excise_sections,
    arms_sections:               liveLookups.arms_sections,
    gambling_sections:           liveLookups.gambling_sections,
    sections:                    liveLookups.sections,
    ipc_major_head:              liveLookups.ipc_major_head,
    excise_major_head:           liveLookups.excise_major_head,
    arms_major_head:             liveLookups.arms_major_head,
    gambling_major_head:         liveLookups.gambling_major_head,
    local_head:                  liveLookups.local_head,
    crime_head:                  liveLookups.crime_head,
    beat_no:                     liveLookups.beat_no,
    property_major_category:     liveLookups.property_major_category,
    district:                    liveLookups.district,
    police_station:              liveLookups.police_station,
    // minor heads
    ...Object.fromEntries(
      Object.keys(MINOR_HEAD_MAJOR_CODES).map(k => [k, liveLookups[k] || []])
    ),
  };
  for (const [fk, opts] of Object.entries(FIELD_KEY_TO_LIVE)) {
    writeList(fk, opts, NR_PREFIX + fk.toUpperCase());
  }

  // 2. Write one named range per property category (for the INDIRECT cascade)
  // Named range name = OPT_ + slugified category label (upper-case, spaces→underscores)
  for (const catLabel of (liveLookups._propCategoryLabels || [])) {
    const items = (liveLookups._propItemsByCategory || {})[catLabel] || [];
    if (items.length === 0) continue;
    // slugify: upper-case, non-alphanumeric runs → single underscore, trim
    const slug = catLabel.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const nrName = NR_PREFIX + slug;
    const colKey = `__prop_${catLabel}`;
    writeList(colKey, items, nrName);
    slugToNR[slug] = nrName;
  }

  return { namedRangeMap, slugToNR };
}


export class TemplateBuilderService {
  static async buildTemplate(recordType, lang = 'en') {
    const filename = recordType === 'CASE'
      ? 'CASE_Import_Template_Final.xlsx'
      : 'ARREST_Import_Template_Final.xlsx';

    let templatePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(process.cwd(), '..', filename);
    }
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Base template file not found. Tried: ${path.join(process.cwd(), filename)} and ${path.join(process.cwd(), '..', filename)}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // ── Fetch live lookups from DB ────────────────────────────────────────────────
    let liveLookups = {};
    let namedRangeMap = {};
    let slugToNR = {};
    try {
      liveLookups = await buildLiveLookups(recordType);
      ({ namedRangeMap, slugToNR } = createLookupsSheet(workbook, liveLookups));
    } catch (err) {
      logger.error('buildTemplate: failed to build live lookups (dropdowns will be static)', { err: err.message });
    }

    const allowedKeys = new Set(
      recordType === 'CASE'
        ? Object.values(CASE_SHEETS_CONFIG).flat()
        : Object.values(ARREST_SHEETS_CONFIG).flat()
    );

    const activeRegistryFields = await db('field_registry')
      .where('is_active', true)
      .orWhereIn('field_key', Array.from(allowedKeys))
      .orderBy('sort_order', 'asc');

    const typeFields = activeRegistryFields.filter(f => {
      if (allowedKeys.has(f.field_key)) return true;
      try {
        const types = typeof f.applicable_record_types === 'string'
          ? JSON.parse(f.applicable_record_types)
          : f.applicable_record_types;
        return Array.isArray(types) && types.includes(recordType);
      } catch (e) {
        return false;
      }
    });

    typeFields.push(
      { field_key: 'act', field_type: 'SELECT', section: 'act_section', label_en: 'Act', label_hi: 'अधिनियम' },
      { field_key: 'minor_head', field_type: 'SELECT', section: 'act_section', label_en: 'Minor Head', label_hi: 'लघु शीर्ष' },
      { field_key: 'district', field_type: 'SELECT', section: 'general_info', label_en: 'District', label_hi: 'जिला' },
      { field_key: 'police_station', field_type: 'SELECT', section: 'general_info', label_en: 'Police Station', label_hi: 'थाना' }
    );

    // Clean up columns from the base workbook on the fly if they are not in allowedKeys
    workbook.worksheets.forEach(worksheet => {
      if (worksheet.name === '_Lookups') return; // Do not touch our hidden lookup sheet!
      let colIdxToDelete = -1;
      do {
        colIdxToDelete = -1;
        const row1 = worksheet.getRow(1);
        row1.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (cell.value && !allowedKeys.has(cell.value)) {
            colIdxToDelete = colNumber;
          }
        });
        if (colIdxToDelete !== -1) {
          TemplateBuilderService.deleteColumnAt(worksheet, colIdxToDelete);
        }
      } while (colIdxToDelete !== -1);
    });

    const excludedKeys = new Set();
    const filteredTypeFields = typeFields.filter(f => allowedKeys.has(f.field_key));
    const sectionMap = recordType === 'CASE' ? CASE_SECTION_MAP : ARREST_SECTION_MAP;

    for (const field of filteredTypeFields) {
      if (recordType === 'ARREST' && field.field_key === 'status') {
        field.section = 'custody_status';
      }
      const mapping = sectionMap[field.section];
      if (!mapping) continue;

      const worksheet = workbook.getWorksheet(mapping.sheet);
      if (!worksheet) continue;

      // 1. Check if column already exists by hidden Row 1 key or Row 3 label
      let exists = false;
      let targetColIndex = -1;
      const row1 = worksheet.getRow(1);
      const row3 = worksheet.getRow(3);
      row1.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (cell.value === field.field_key) {
          exists = true;
          targetColIndex = colNum;
        }
      });
      if (!exists) {
        row3.eachCell({ includeEmpty: true }, (cell, colNum) => {
          if (cell.value && (cell.value === field.label_en || cell.value === field.label_hi)) {
            exists = true;
            targetColIndex = colNum;
            row1.getCell(colNum).value = field.field_key;
          }
        });
      }

      const configField = recordType === 'CASE'
        ? caseGeneralFields.find(f => f.field_key === field.field_key) ||
          caseVictimFields.find(f => f.field_key === field.field_key) ||
          caseActSectionFields.find(f => f.field_key === field.field_key) ||
          caseAccusedFields.find(f => f.field_key === field.field_key) ||
          casePropertyFields.find(f => f.field_key === field.field_key)
        : arrestGeneralFields.find(f => f.field_key === field.field_key) ||
          arrestActSectionFields.find(f => f.field_key === field.field_key) ||
          arrestPersonFields.find(f => f.field_key === field.field_key) ||
          arrestPropertyFields.find(f => f.field_key === field.field_key);

      if (!exists) {
        // 2. Locate the end of the section by looking at merges or Row 2 labels
        let lastColOfSection = -1;

        // Scan Row 2 for matching section subheadings
        const row2 = worksheet.getRow(2);
        const row2Values = [];
        row2.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          row2Values[colNumber] = cell.value;
        });

        // Find the last column that matches the section label (or resides in its merge)
        if (worksheet.model.merges) {
          for (const mergeStr of worksheet.model.merges) {
            const { startCol, endCol, startRow } = parseRange(mergeStr);
            if (startRow === 2) {
              const val = row2.getCell(startCol).value;
              if (val && String(val).trim().toLowerCase() === mapping.label.toLowerCase()) {
                lastColOfSection = Math.max(lastColOfSection, endCol);
              }
            }
          }
        }

        // Fallback: search row2 values directly
        if (lastColOfSection === -1) {
          for (let c = 1; c <= row2Values.length; c++) {
            if (row2Values[c] && String(row2Values[c]).trim().toLowerCase() === mapping.label.toLowerCase()) {
              lastColOfSection = Math.max(lastColOfSection, c);
            }
          }
        }

        // If section was found, we insert right after its last column (making it part of the section)
        if (lastColOfSection !== -1) {
          targetColIndex = lastColOfSection + 1;
        } else {
          // Fallback: append at the end
          let maxCols = 0;
          worksheet.eachRow({ includeEmpty: true }, r => {
            maxCols = Math.max(maxCols, r.cellCount);
          });
          targetColIndex = maxCols + 1;
        }

        // 3. Insert the new column
        this.insertColumnAt(worksheet, targetColIndex);

        // 4. Fill values and copy styles from adjacent column (targetColIndex - 1)
        const refColIdx = targetColIndex - 1;
        
        const r1 = worksheet.getRow(1);
        const r2 = worksheet.getRow(2);
        const r3 = worksheet.getRow(3);

        const labelEn = configField ? configField.label_en : field.label_en;
        const labelHi = configField ? configField.label_hi : field.label_hi;

        r1.getCell(targetColIndex).value = field.field_key;
        r2.getCell(targetColIndex).value = mapping.label;
        r3.getCell(targetColIndex).value = lang === 'hi' ? (labelHi || labelEn) : labelEn;

        // Copy formatting from adjacent column
        for (let rIdx = 1; rIdx <= 4; rIdx++) {
          const row = worksheet.getRow(rIdx);
          row.getCell(targetColIndex).style = row.getCell(refColIdx).style;
        }
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          const row = worksheet.getRow(rIdx);
          row.getCell(targetColIndex).style = row.getCell(refColIdx).style;
        }
      }

      // Helper check for district/police station fields
      const isDistrictField = (key) => key === 'district' || key.endsWith('_district');
      const isPSField = (key) => key === 'police_station' || key.endsWith('_police_station');
      const isDist = isDistrictField(field.field_key);
      const isPS = isPSField(field.field_key);

      // ─ Determine option list for this field (live lookups take precedence over config stubs) ─
      let liveOpts = null;
      if (liveLookups[field.field_key] !== undefined) {
        liveOpts = liveLookups[field.field_key]; // [{value, label}] or []
      } else if (isDist) {
        liveOpts = liveLookups['district'];
      } else if (isPS) {
        liveOpts = liveLookups['police_station'];
      } else if (configField && Array.isArray(configField.options) && configField.options.length > 0) {
        // Fall back to static config options (e.g. gender, marital_status, country, state...)
        liveOpts = configField.options.map(o => (o && typeof o === 'object') ? o : { value: o, label: o });
      } else if (field.field_type === 'SELECT' || field.field_type === 'RADIO') {
        // Registry field might have static options in its own options column
        try {
          const raw = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
          if (Array.isArray(raw) && raw.length > 0) {
            liveOpts = raw.map(o => (o && typeof o === 'object') ? o : { value: o, label: o });
          }
        } catch (_) {}
      }

      // ─ Build hint string from the resolved options (or hint from config) ─
      let hintText = (configField && configField.hint) ? configField.hint : null;
      if (!hintText) {
        if (INDIRECT_CASCADE_FIELDS.has(field.field_key)) {
          hintText = 'Select from dropdown (depends on major category)';
        } else if (NAMED_RANGE_FIELD_KEYS.has(field.field_key) && namedRangeMap[field.field_key]) {
          hintText = 'See dropdown list';
        } else if (liveOpts && liveOpts.length > 0) {
          const vals = liveOpts.map(o => o.value);
          const joined = vals.join(', ');
          hintText = joined.length <= 200 ? `select: ${joined}` : `select (${vals.length} options): ${vals.slice(0, 5).join(', ')}...`;
        } else {
          hintText = getHint(field);
        }
      }
      worksheet.getRow(4).getCell(targetColIndex).value = hintText;

      // ─ Write data validation (dropdown) for this column ────────────────────────────────
      if (INDIRECT_CASCADE_FIELDS.has(field.field_key)) {
        // property_minor_category: cascade via INDIRECT() on the major category cell.
        // The major-category cell on the same sheet + same row drives which named range is used.
        // Named ranges are OPT_<SLUG>, where slug = UPPER(category).replace(non-alphanum, '_').
        // We defer this to a second pass (after all columns are placed) so we know the
        // major-category column letter — no-op here, handled in second pass below.
        // (Stored as a sentinel so the second pass can detect it.)
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          worksheet.getCell(rIdx, targetColIndex).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false,
            formulae: ['"__INDIRECT_PENDING__"'] // replaced in second pass
          };
        }
      } else if (isDist && namedRangeMap['district']) {
        const nrName = namedRangeMap['district'];
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          worksheet.getCell(rIdx, targetColIndex).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [nrName]
          };
        }
      } else if (isPS && namedRangeMap['police_station']) {
        const nrName = namedRangeMap['police_station'];
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          worksheet.getCell(rIdx, targetColIndex).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [nrName]
          };
        }
      } else if (NAMED_RANGE_FIELD_KEYS.has(field.field_key) && namedRangeMap[field.field_key]) {
        // Long list — reference the named range on _Lookups
        const nrName = namedRangeMap[field.field_key];
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          worksheet.getCell(rIdx, targetColIndex).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [nrName]
          };
        }
      } else if (liveOpts && liveOpts.length > 0) {
        // Short list — inline formula (values joined, max 255 chars)
        const vals = liveOpts.map(o => o.value);
        let joined = vals.join(',');
        if (joined.length > 240) {
          // Too long for inline: write to _Lookups dynamically and reference it
          // This handles edge cases (e.g. a SELECT field that ended up with many options)
          const tempNRName = `${NR_PREFIX}DYN_${field.field_key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
          const ws2 = workbook.getWorksheet('_Lookups');
          if (ws2) {
            let nextCol = 1;
            ws2.getRow(1).eachCell({ includeEmpty: true }, (_, c) => { nextCol = c + 1; });
            ws2.getCell(1, nextCol).value = tempNRName;
            vals.forEach((v, i) => { ws2.getCell(i + 2, nextCol).value = v; });
            const tLetter = numToColLetter(nextCol);
            try {
              workbook.definedNames.add(`'_Lookups'!$${tLetter}$2:$${tLetter}$${vals.length + 1}`, tempNRName);
            } catch (_) {}
          }
          for (let rIdx = 5; rIdx <= 500; rIdx++) {
            worksheet.getCell(rIdx, targetColIndex).dataValidation = {
              type: 'list', allowBlank: true,
              formulae: [tempNRName]
            };
          }
        } else {
          const formulaVal = `"${joined}"`;
          for (let rIdx = 5; rIdx <= 500; rIdx++) {
            worksheet.getCell(rIdx, targetColIndex).dataValidation = {
              type: 'list', allowBlank: true,
              formulae: [formulaVal]
            };
          }
        }
      }
      // (No validation for non-SELECT fields or SELECT fields with 0 options)
    }

    // ── Second pass: fix property_minor_category INDIRECT() formulas ────────────────────────
    // Now that all columns are placed, we can find property_major_category's column letter
    // on each sheet and write the correct INDIRECT() formula for property_minor_category.
    workbook.worksheets.forEach(ws => {
      if (ws.name === '_Lookups') return;
      const row1 = ws.getRow(1);

      let majorCatCol  = -1;
      let minorCatCol  = -1;
      row1.eachCell({ includeEmpty: true }, (cell, c) => {
        if (cell.value === 'property_major_category') majorCatCol = c;
        if (cell.value === 'property_minor_category') minorCatCol = c;
      });

      if (majorCatCol === -1 || minorCatCol === -1) return; // sheet doesn't have both

      const majorColLetter = numToColLetter(majorCatCol);
      // INDIRECT formula: looks up OPT_<SLUG_OF_SELECTED_CATEGORY>
      // The slug transform in Excel mirrors the JS slugify: UPPER + replace non-alphanum with _
      // Excel formula equivalent: SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(UPPER(X5), " ", "_"), "-", "_"), "&", "_")
      // Simplified: SUBSTITUTE(UPPER(X5),[non-alpha]->"_") is hard in a single Excel formula.
      // We use: INDIRECT(CONCATENATE("OPT_", SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(UPPER(<ref>)," ","_"),"-","_"),"&","_")))
      // This covers spaces, hyphens, ampersands (the 3 most common special chars in category names).
      for (let rIdx = 5; rIdx <= 500; rIdx++) {
        const cell = ws.getCell(rIdx, minorCatCol);
        if (cell.dataValidation && cell.dataValidation.formulae && cell.dataValidation.formulae[0] === '"__INDIRECT_PENDING__"') {
          const majorRef = `$${majorColLetter}${rIdx}`;
          const formula = `INDIRECT(CONCATENATE("${NR_PREFIX}",SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(UPPER(${majorRef})," ","_"),"-","_"),"&","_")))`;
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            showErrorMessage: false, // INDIRECT can be empty if no category is selected
            formulae: [formula]
          };
        }
      }
    });

    // ── Third pass: configure Act and Sections sheet dropdown cascades ─────────────────────
    const actSectionWS = workbook.getWorksheet('Act and Sections');
    if (actSectionWS) {
      let actCol = -1;
      let secCol = -1;
      let majCol = -1;
      let minCol = -1;
      actSectionWS.getRow(1).eachCell({ includeEmpty: true }, (cell, c) => {
        if (cell.value === 'act') actCol = c;
        if (cell.value === 'sections') secCol = c;
        if (cell.value === 'crime_head') majCol = c;
        if (cell.value === 'minor_head') minCol = c;
      });

      if (actCol !== -1 && secCol !== -1 && majCol !== -1 && minCol !== -1) {
        const actLetter = numToColLetter(actCol);
        const secLetter = numToColLetter(secCol);
        const majLetter = numToColLetter(majCol);
        const minLetter = numToColLetter(minCol);

        const actsList = ['IPC', 'Delhi Excise Act', 'Arms Act', 'Gambling Act', 'Other Act', 'CrPC', 'BNSS', 'BNS'];

        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          // 1. Act Column Validation (inline list)
          actSectionWS.getCell(rIdx, actCol).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${actsList.join(',')}"`]
          };

          // 2. Sections Column Validation (dependent on Act)
          const actRef = `$${actLetter}${rIdx}`;
          const secFormula = `IF(${actRef}="IPC",OPT_IPC_SECTIONS,IF(${actRef}="Delhi Excise Act",OPT_EXCISE_SECTIONS,IF(${actRef}="Arms Act",OPT_ARMS_SECTIONS,IF(${actRef}="Gambling Act",OPT_GAMBLING_SECTIONS,OPT_SECTIONS))))`;
          actSectionWS.getCell(rIdx, secCol).dataValidation = {
            type: 'list',
            allowBlank: true,
            showErrorMessage: false,
            formulae: [secFormula]
          };

          // 3. Major Head Column Validation (dependent on Act)
          const majFormula = `IF(${actRef}="IPC",OPT_IPC_MAJOR_HEAD,IF(${actRef}="Delhi Excise Act",OPT_EXCISE_MAJOR_HEAD,IF(${actRef}="Arms Act",OPT_ARMS_MAJOR_HEAD,IF(${actRef}="Gambling Act",OPT_GAMBLING_MAJOR_HEAD,OPT_CRIME_HEAD))))`;
          actSectionWS.getCell(rIdx, majCol).dataValidation = {
            type: 'list',
            allowBlank: true,
            showErrorMessage: false,
            formulae: [majFormula]
          };

          // 4. Minor Head Column Validation (dependent on Major Head)
          const majHeadRef = `$${majLetter}${rIdx}`;
          const minFormula = `IF(${majHeadRef}="THEFT",OPT_THEFT_MINOR_HEAD,IF(${majHeadRef}="MURDER (HOMICIDE)",OPT_MURDER_MINOR_HEAD,IF(${majHeadRef}="HURT",OPT_HURT_MINOR_HEAD,IF(${majHeadRef}="CHEATING",OPT_CHEATING_MINOR_HEAD,IF(${majHeadRef}="ROBBERY",OPT_ROBBERY_MINOR_HEAD,IF(${majHeadRef}="CUSTOMS (SMUGGLING)",OPT_EXCISE_SMUGGLING_MINOR_HEAD,""))))))`;
          actSectionWS.getCell(rIdx, minCol).dataValidation = {
            type: 'list',
            allowBlank: true,
            showErrorMessage: false,
            formulae: [minFormula]
          };
        }
      }
    }

    // Rebuild Row-2 section headers cleanly from each column's hidden key. The per-column
    // insert/delete above leaves the stored merges misaligned, so regenerate them here.
    const parentSheetName = recordType === 'CASE' ? 'General Information' : 'General Info';
    for (const worksheet of workbook.worksheets) {
      if (worksheet.name === '_Lookups') continue; // skip the lookup sheet
      TemplateBuilderService.rebuildSectionHeaders(worksheet, recordType, worksheet.name === parentSheetName);
    }

    // ── Hide internal metadata from users ─────────────────────────────────────────────────
    // Row 1 contains raw field_key names (used by the import parser to identify columns).
    // It must NOT be visible to the person filling the template.
    // Strategy: set row height to ~0 and font to white (invisible if accidentally revealed).
    for (const worksheet of workbook.worksheets) {
      if (worksheet.name === '_Lookups') continue;
      const keyRow = worksheet.getRow(1);
      keyRow.height = 0.1; // visually zero height in Excel/LibreOffice
      keyRow.hidden = true; // explicitly hide the row
      keyRow.eachCell({ includeEmpty: true }, (cell) => {
        try {
          const existingStyle = JSON.parse(JSON.stringify(cell.style || {}));
          existingStyle.font = { ...(existingStyle.font || {}), color: { argb: 'FFFFFFFF' }, size: 1 };
          cell.style = existingStyle;
        } catch (_) {}
      });
    }

    return workbook;

  }

  // Recomputes the merged Row-2 section-header banner from Row-1 keys. Idempotent and
  // robust to earlier merge corruption: unmerge everything on Row 2, derive each column's
  // label (carrying forward for label-only/temporal columns), then re-merge equal runs.
  static rebuildSectionHeaders(worksheet, recordType, isParentSheet) {
    const keys = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, c) => {
      keys[c] = cell.value ? String(cell.value).trim() : '';
    });
    const maxCol = worksheet.columnCount;
    if (maxCol < 1) return;

    // Preserve the header cell styling (blue fill / white bold) from the current Row-2 cell
    const refStyle = JSON.parse(JSON.stringify(worksheet.getCell(2, 1).style || {}));

    // Derive a label for every column, carrying the previous label forward when null
    const labels = [];
    let prev = isParentSheet ? 'General Information' : 'Case Reference';
    for (let c = 1; c <= maxCol; c++) {
      let label = sectionLabelForKey(keys[c] || '', recordType, isParentSheet);
      if (!label) label = prev;
      labels[c] = label;
      prev = label;
    }

    // Clear existing Row-2 merges
    for (const m of [...(worksheet.model.merges || [])]) {
      try { worksheet.unMergeCells(m); } catch (_) {}
    }

    // Write values + style for the whole row
    for (let c = 1; c <= maxCol; c++) {
      const cell = worksheet.getCell(2, c);
      cell.value = labels[c];
      cell.style = JSON.parse(JSON.stringify(refStyle));
    }

    // Merge consecutive equal-label runs (keep the label only on the run's first cell)
    let start = 1;
    for (let c = 2; c <= maxCol + 1; c++) {
      if (c > maxCol || labels[c] !== labels[start]) {
        if (c - 1 > start) {
          for (let k = start + 1; k <= c - 1; k++) worksheet.getCell(2, k).value = null;
          try { worksheet.mergeCells(2, start, 2, c - 1); } catch (_) {}
        }
        start = c;
      }
    }
    worksheet.getRow(2).height = 25;
  }

  static insertColumnAt(worksheet, colIndex) {
    const maxCols = worksheet.columnCount;

    // Shift cells backwards
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      for (let c = maxCols; c >= colIndex; c--) {
        const srcCell = row.getCell(c);
        const destCell = row.getCell(c + 1);
        
        destCell.value = srcCell.value;
        destCell.style = srcCell.style;
        if (srcCell.dataValidation) {
          destCell.dataValidation = srcCell.dataValidation;
        }
        
        srcCell.value = null;
        srcCell.style = {};
        srcCell.dataValidation = null;
      }
    });

    // Splice columns width configuration
    if (worksheet.columns) {
      const cols = [...worksheet.columns];
      cols.splice(colIndex - 1, 0, { width: 15 });
      worksheet.columns = cols;
    }

    // Shift and update merged ranges
    if (worksheet.model.merges) {
      const newMerges = worksheet.model.merges.map(mergeStr => {
        const { startCol, startRow, endCol, endRow } = parseRange(mergeStr);
        let newStartCol = startCol;
        let newEndCol = endCol;
        
        if (startCol >= colIndex) {
          newStartCol = startCol + 1;
          newEndCol = endCol + 1;
        } else if (endCol >= colIndex) {
          newEndCol = endCol + 1;
        }
        
        return `${numToColLetter(newStartCol)}${startRow}:${numToColLetter(newEndCol)}${endRow}`;
      });
      worksheet.model.merges = newMerges;
    }
  }

  static deleteColumnAt(worksheet, colIndex) {
    const maxCols = worksheet.columnCount;

    // Capture each merge's master (top-left) value BEFORE shifting. Shifting left can
    // clobber a master cell when the deleted column IS the master, which would drop the
    // section-header label (e.g. "Property Details") from the surviving merge.
    const mergeMasters = [];
    if (worksheet.model.merges) {
      for (const mergeStr of worksheet.model.merges) {
        const { startCol, startRow, endCol, endRow } = parseRange(mergeStr);
        mergeMasters.push({ startCol, startRow, endCol, endRow, value: worksheet.getCell(startRow, startCol).value });
      }
    }

    // Shift cells forwards (left)
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      for (let c = colIndex; c < maxCols; c++) {
        const srcCell = row.getCell(c + 1);
        const destCell = row.getCell(c);

        destCell.value = srcCell.value;
        destCell.style = srcCell.style;
        if (srcCell.dataValidation) {
          destCell.dataValidation = srcCell.dataValidation;
        } else {
          destCell.dataValidation = null;
        }
      }
      // Clear the last cell
      const lastCell = row.getCell(maxCols);
      lastCell.value = null;
      lastCell.style = {};
      lastCell.dataValidation = null;
    });

    // Shift and update merged ranges, then restore any lost master values
    const newMerges = [];
    const restores = [];
    for (const m of mergeMasters) {
      const { startCol, startRow, endCol, endRow, value } = m;

      if (startCol === colIndex && endCol === colIndex) {
        // Single-cell merge on the deleted column — discard completely
        continue;
      }

      let newStartCol = startCol;
      let newEndCol = endCol;
      if (startCol > colIndex) newStartCol = startCol - 1;
      if (endCol >= colIndex) newEndCol = endCol - 1;

      // Only keep if the merge is still valid (spans >1 cell)
      if (newStartCol < newEndCol || startRow < endRow) {
        newMerges.push(`${numToColLetter(newStartCol)}${startRow}:${numToColLetter(newEndCol)}${endRow}`);
        restores.push({ row: startRow, col: newStartCol, value });
      }
    }
    worksheet.model.merges = newMerges;

    // Restore master values that the shift may have blanked out
    for (const { row, col, value } of restores) {
      if (value === null || value === undefined || value === '') continue;
      const cell = worksheet.getCell(row, col);
      if (cell.value === null || cell.value === undefined || cell.value === '') {
        cell.value = value;
      }
    }

    // Splice columns width configuration
    if (worksheet.columns) {
      const cols = [...worksheet.columns];
      cols.splice(colIndex - 1, 1);
      worksheet.columns = cols;
    }
  }
}
