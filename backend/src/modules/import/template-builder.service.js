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
  arrestPropertyFields
} from './import-fields.config.js';

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
  investigation_officer: { sheet: 'General Information', label: 'IO Details' },
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
  arrest_details: { sheet: 'General Info', label: 'Arrest Details' },
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

    // Fetch active registry fields for this record type
    const activeRegistryFields = await db('field_registry')
      .where('is_active', true)
      .orderBy('sort_order', 'asc');

    const typeFields = activeRegistryFields.filter(f => {
      try {
        const types = typeof f.applicable_record_types === 'string'
          ? JSON.parse(f.applicable_record_types)
          : f.applicable_record_types;
        return Array.isArray(types) && types.includes(recordType);
      } catch (e) {
        return false;
      }
    });

    const allowedKeys = new Set(
      recordType === 'CASE'
        ? Object.values(CASE_SHEETS_CONFIG).flat()
        : Object.values(ARREST_SHEETS_CONFIG).flat()
    );

    // Clean up columns from the base workbook on the fly if they are not in allowedKeys
    workbook.worksheets.forEach(worksheet => {
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
      const mapping = sectionMap[field.section];
      if (!mapping) continue;

      const worksheet = workbook.getWorksheet(mapping.sheet);
      if (!worksheet) continue;

      // 1. Check if column already exists by hidden Row 1 key
      let exists = false;
      const row1 = worksheet.getRow(1);
      row1.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.value === field.field_key) {
          exists = true;
        }
      });

      if (exists) continue;

      // 2. Locate the end of the section by looking at merges or Row 2 labels
      let targetColIndex = -1;
      let lastColOfSection = -1;

      // Scan Row 2 for matching section subheadings
      const row2 = worksheet.getRow(2);
      const row2Values = [];
      row2.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        row2Values[colNumber] = cell.value;
      });

      // Find the last column that matches the section label (or resides in its merge)
      // Check merges model first
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
      const r4 = worksheet.getRow(4);

      // Set values
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

      const labelEn = configField ? configField.label_en : field.label_en;
      const labelHi = configField ? configField.label_hi : field.label_hi;
      const hint = configField && configField.hint ? configField.hint : getHint(field);

      r1.getCell(targetColIndex).value = field.field_key;
      r2.getCell(targetColIndex).value = mapping.label;
      r3.getCell(targetColIndex).value = lang === 'hi' ? (labelHi || labelEn) : labelEn;
      r4.getCell(targetColIndex).value = hint;

      // Copy formatting from adjacent column
      for (let rIdx = 1; rIdx <= 4; rIdx++) {
        const row = worksheet.getRow(rIdx);
        row.getCell(targetColIndex).style = row.getCell(refColIdx).style;
      }

      // Set formatting for body rows (Row 5 to 500) and copy validations
      for (let rIdx = 5; rIdx <= 500; rIdx++) {
        const row = worksheet.getRow(rIdx);
        row.getCell(targetColIndex).style = row.getCell(refColIdx).style;
      }

      // Set dropdown data validations if field type is SELECT
      let options = [];
      if (field.field_type === 'SELECT') {
        try {
          options = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
        } catch (e) {}
      }
      
      if (Array.isArray(options) && options.length > 0) {
        const validValues = options.map(o => (o && typeof o === 'object') ? o.value : o);
        const formulaVal = `"${validValues.join(',')}"`;
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          const cell = worksheet.getCell(rIdx, targetColIndex);
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [formulaVal]
          };
        }
      }
    }

    // Rebuild Row-2 section headers cleanly from each column's hidden key. The per-column
    // insert/delete above leaves the stored merges misaligned, so regenerate them here.
    const parentSheetName = recordType === 'CASE' ? 'General Information' : 'General Info';
    for (const worksheet of workbook.worksheets) {
      TemplateBuilderService.rebuildSectionHeaders(worksheet, recordType, worksheet.name === parentSheetName);
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
