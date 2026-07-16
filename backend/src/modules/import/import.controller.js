// Bulk-import HTTP layer (Integration 3). Thin by design (ENGINEERING_BASELINE.md P1.2) —
// every write, parse, and validation decision lives in import.service.js / import.validate.js /
// import.parse.js / import.compose.js; this file only translates HTTP <-> those modules and
// owns template generation (downloadImportTemplate + addSheetToWorkbook, WP7's territory for
// enforcement hardening, unchanged here).
import db from '../../config/db.js';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { publish } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';
import { TemplateBuilderService } from './template-builder.service.js';
import {
  COUNTRY_OPTS,
  STATE_OPTS,
  DISTRICT_OPTS,
  arrestGeneralFields,
  arrestActSectionFields,
  arrestPersonFields,
  arrestPropertyFields,
  kalandraGeneralFields,
  kalandraActSectionFields,
  kalandraPersonFields,
  uidbGeneralFields,
  uidbActSectionFields,
  missingGeneralFields
} from './import-fields.config.js';
import { autoIncludedRegistryFields, normalizeRegistryRow, isTemplateExcluded } from './registry-sync.util.js';
import { buildFieldMetaMap, applyFieldLevelHardening } from './template-builder.service.js';
import { isRequired } from './import.validate.js';
import {
  createBatch, claimBatch, cancelBatch, districtForPs,
  listBatches as listBatchesService, getBatchDetail as getBatchDetailService,
} from './import.service.js';

// ── template generation (unchanged this integration — WP7 hardens dataValidation/numFmt
// without touching this structure) ──────────────────────────────────────────────────────

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
  if (field.field_type === 'DATE') return `${reqStr}date (dd-mm-yyyy)`;
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
    if (['date_of_arrest', 'time_of_arrest', 'place_of_arrest', 'arrest_date', 'arrest_place', 'arrest_street', 'arrest_colony', 'arrest_district', 'arrest_landmark'].includes(key)) {
      return lang === 'hi' ? 'गिरफ्तारी का विवरण' : 'Arrest Detail';
    }
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
    if (['io_name', 'io_pis', 'io_rank', 'io_mobile'].includes(key)) {
      return lang === 'hi' ? 'जांच अधिकारी विवरण' : 'Investigating Officer Details';
    }
    if (['nafis_prepared', 'dossier_prepared', 'search_slip_prepared', 'address_verified', 'verifying_officer_name', 'verifying_officer_rank', 'prev_involvement', 'bad_character', 'proclaimed_offender', 'status', 'scheme_of_arrest'].includes(key)) {
      return lang === 'hi' ? 'सत्यापन और पुलिस रिकॉर्ड' : 'Verification & Police Record';
    }
    if (['kin_name', 'kin_mobile', 'kin_relationship', 'photo_path'].includes(key)) {
      return lang === 'hi' ? 'रिश्तेदार और फोटो विवरण' : 'Kin & Photo Details';
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
    if (f.field_key === 'gd_no') {
      return lang === 'hi' ? 'जीडी संख्या' : 'GD Number';
    }
    if (recordType === 'KALANDRA' && f.field_key === 'linked_fir_dd_no') {
      if (sheetName === 'General Info') {
        return lang === 'hi' ? 'जीडी संख्या' : 'GD Number';
      }
      if (sheetName === 'Act and Sections') {
        return lang === 'hi' ? 'लिंक्ड जीडी संख्या' : 'Linked GD Number';
      }
      if (sheetName === 'Arrested Person') {
        return lang === 'hi' ? 'लिंक्ड जीडी संख्या' : 'Linked GD No.';
      }
    }
    const matched = allFields.find(dbF => dbF.field_key === f.field_key);
    if (matched) {
      return lang === 'hi' ? matched.label_hi : matched.label_en;
    }
    return lang === 'hi' ? f.label_hi : f.label_en;
  });
  const headerRow = worksheet.addRow(row3);
  headerRow.height = 25;
  // Apply per-cell font: required fields get RED, others get white (on dark-blue background)
  headerRow.eachCell((cell, colNumber) => {
    const f = fieldsList[colNumber - 1];
    const isReq = f && f.required === true;
    cell.font = { bold: true, color: { argb: isReq ? 'FFFF0000' : 'FFFFFFFF' } };
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

    if (!options || options.length === 0) {
      if (f.field_key === 'police_station' || f.field_key.endsWith('_police_station')) {
        if (allFields.policeStationOptions) {
          options = allFields.policeStationOptions;
        }
      } else if (f.field_key === 'state' || f.field_key.endsWith('_state')) {
        options = STATE_OPTS;
      } else if (f.field_key === 'district' || f.field_key.endsWith('_district')) {
        options = DISTRICT_OPTS;
      } else if (f.field_key === 'country' || f.field_key.endsWith('_country')) {
        options = COUNTRY_OPTS;
      } else if (matched) {
        if (matched.field_key === 'status') {
          if (recordType === 'MISSING') {
            options = ['Un-traced', 'Traced', 'Referred', 'Closed'];
          } else if (recordType === 'UIDB') {
            options = ['Referred to district hospital', 'Identified', 'Body Claimed', 'Unidentified', 'Held in Mortuary'];
          } else if (recordType === 'PCR_CALL') {
            options = ['Action Taken', 'Pending', 'Referred', 'Closed'];
          }
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

  const validTypes = ['ARREST', 'PCR_CALL', 'CASE', 'MISSING', 'UIDB', 'KALANDRA'];
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

    const allFields = (await db('field_registry')
      .where('is_active', true)
      .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'field_key', order: 'asc' }])).map(normalizeRegistryRow);

    const psRows = await db('hierarchy_nodes')
      .where({ node_type: 'PS', is_active: true })
      .select('name as ps_name')
      .orderBy('name', 'asc');
    const psOptions = psRows.map(r => r.ps_name);
    allFields.policeStationOptions = psOptions;

    const workbook = new ExcelJS.Workbook();
    let fieldsUsedForHardening = [];

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
      // Wire state→district cascade for all district fields in UIDB sheets
      await TemplateBuilderService.wireStateDistrictCascade(workbook);
      fieldsUsedForHardening = [...uidbGeneralFields, ...uidbAutoFields, ...uidbActSectionFields];
    } else if (recordType === 'MISSING') {
      const missingConfigKeys = new Set(missingGeneralFields.map(f => f.field_key));
      const missingAutoFields = autoIncludedRegistryFields('MISSING', allFields, missingConfigKeys);
      addSheetToWorkbook(workbook, 'Import Template', [...missingGeneralFields, ...missingAutoFields], allFields, lang, recordType);
      // Wire state→district cascade for all district fields in MISSING sheet
      await TemplateBuilderService.wireStateDistrictCascade(workbook);
      fieldsUsedForHardening = [...missingGeneralFields, ...missingAutoFields];
    } else if (recordType === 'KALANDRA') {
      // Kalandra = standalone (non-FIR) arrest. Three sheets, same structures as the
      // ARREST template's act-section and person sheets, keyed by DD No. Registry
      // auto-inclusion runs against ARREST (the type its fields belong to); the full
      // arrest curated lists count as "covered" so deliberately dropped columns
      // (fir_date) don't sneak back in as auto-appends.
      const kalandraConfigKeys = new Set([
        ...arrestGeneralFields.map(f => f.field_key),
        ...arrestActSectionFields.map(f => f.field_key),
        ...arrestPersonFields.map(f => f.field_key),
        ...arrestPropertyFields.map(f => f.field_key),
      ]);
      const kalandraAutoFields = autoIncludedRegistryFields('ARREST', allFields, kalandraConfigKeys);
      addSheetToWorkbook(workbook, 'General Info', [...kalandraGeneralFields, ...kalandraAutoFields], allFields, lang, 'KALANDRA');
      addSheetToWorkbook(workbook, 'Act and Sections', kalandraActSectionFields, allFields, lang, 'KALANDRA');
      addSheetToWorkbook(workbook, 'Arrested Person', kalandraPersonFields, allFields, lang, 'KALANDRA');
      await TemplateBuilderService.wireActSectionCascade(
        workbook,
        workbook.getWorksheet('Act and Sections'),
        'ARREST',
        { act: 'act', sections: 'sections', major: 'crime_head', minor: 'minor_head' }
      );
      // Wire state→district cascade for all district fields in Kalandra sheets
      await TemplateBuilderService.wireStateDistrictCascade(workbook);
      fieldsUsedForHardening = [...kalandraGeneralFields, ...kalandraAutoFields, ...kalandraActSectionFields, ...kalandraPersonFields];
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
      // WP10 (2026-07-16): the generic registry-driven branch (PCR_CALL and any future
      // uncurated type) now honors TEMPLATE_EXCLUDE_KEYS like every curated path does —
      // without this, exclusion decisions (io detail columns, raw io_id FK) silently never
      // applied to this branch.
      fields = fields.filter(f => !isTemplateExcluded(recordType, f.field_key));

      fields.sort((a, b) => {
        const reqA = isRequired(a) ? 1 : 0;
        const reqB = isRequired(b) ? 1 : 0;
        if (reqA !== reqB) {
          return reqB - reqA;
        }
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      addSheetToWorkbook(workbook, 'Import Template', fields, allFields, lang, recordType);
      fieldsUsedForHardening = fields;
    }

    // WP7 hardening — same post-processing pass as the CASE/ARREST base-workbook path
    // (template-builder.service.js's buildTemplate); see that function's header comment for
    // the full design rationale.
    const fieldMetaByKey = buildFieldMetaMap(fieldsUsedForHardening, allFields);
    applyFieldLevelHardening(workbook, fieldMetaByKey);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${recordType}_Import_Template.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('[TemplateExport] Error generating template: ' + error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── batch endpoints (Integration 3, WP4/WP6) — role/mode enforcement lives here (P5.6: import
// rows for another PS/district are rejected, never silently trusted from the body); everything
// else delegates to import.service.js ───────────────────────────────────────────────────────

const VALID_RECORD_TYPES = ['ARREST', 'PCR_CALL', 'CASE', 'UIDB', 'MISSING', 'KALANDRA'];

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
  if (!recordType || !VALID_RECORD_TYPES.includes(recordType)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ success: false, message: 'Invalid or missing record_type. Must be CASE, ARREST, KALANDRA, PCR_CALL, UIDB or MISSING.' });
  }

  // D1/D2 mode rules (router's allow() already restricts this endpoint to HC/DISTRICT_OFFICER
  // — WP6). HC: never legacy, always own PS (ps_id in the body is ignored/rejected, never
  // trusted — P5.4). DISTRICT_OFFICER: always legacy, exactly one target PS, and that PS MUST
  // resolve to the caller's own district — the actual district-membership enforcement the
  // plan flagged as missing pre-Integration-3.
  let targetPsId;
  if (req.user.role === 'HC') {
    if (isLegacy) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(403).json({ success: false, message: 'Operators (HC) cannot import legacy data' });
    }
    if (ps_id && ps_id !== req.user.ps_id) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(403).json({ success: false, message: 'Operators are restricted to importing for their assigned Station only' });
    }
    targetPsId = req.user.ps_id;
  } else if (req.user.role === 'DISTRICT_OFFICER') {
    if (!isLegacy) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(403).json({ success: false, message: 'District officers may only import legacy (historical) data' });
    }
    if (!ps_id) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, message: 'ps_id (the target police station) is required for a legacy import' });
    }
    const psDistrict = await districtForPs(ps_id);
    if (!psDistrict || psDistrict.id !== req.user.district_id) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(403).json({ success: false, message: 'You can only import legacy data for a police station within your own district' });
    }
    targetPsId = ps_id;
  } else {
    // Router's allow() should already have rejected any other role — default-deny here too
    // (P5.5), never fall through to treating an unrecognized role as authorized.
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(403).json({ success: false, message: 'Your role is not permitted to import data' });
  }

  try {
    const result = await createBatch({ user: req.user, recordType, isLegacy, targetPsId, filePath: req.file.path });
    return res.status(200).json({
      success: true,
      data: {
        batch_id: result.batch.id,
        status: result.batch.status,
        total_rows: result.counts.total,
        valid_rows: result.counts.valid,
        invalid_rows: result.counts.invalid,
        errors: result.errors,
        errors_truncated: result.errorsTruncated,
      },
    });
  } catch (error) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    logger.error(`[ImportValidate] ${error.message}`);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const confirmImportBatch = async (req, res) => {
  const { batchId } = req.params;
  try {
    const userId = req.user.id || req.user.userId;
    const batch = await claimBatch(batchId, userId);
    // Hand off to the async worker (WP5's importConfirmHandler) — this endpoint's job ends
    // at the claim; it never writes a record itself.
    await publish('import.confirm.requested', { batch_id: batchId });
    return res.status(202).json({ success: true, data: { batch_id: batchId, status: batch.status } });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const cancelImportBatch = async (req, res) => {
  const { batchId } = req.params;
  try {
    const userId = req.user.id || req.user.userId;
    const result = await cancelBatch(batchId, userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const listBatches = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const result = await listBatchesService(req.jurisdictionQuery || {}, { page, limit });
    return res.status(200).json({
      success: true, data: result.rows,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

export const getBatchDetail = async (req, res) => {
  try {
    const detail = await getBatchDetailService(req.params.batchId, req.jurisdictionQuery || {});
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    return res.status(200).json({ success: true, data: detail });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
