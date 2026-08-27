import { fileURLToPath } from 'url';
import db from '../../config/db.js';
import { generateMetadataReport } from './engine/templateRuntime.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer';
import ExcelJS from 'exceljs';
import { publish } from '../../events/eventBus.js';
import { getLogger } from '../../utils/logger.js';
import { toISO, toDMY } from '../../utils/dateFormat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../..');

import { traceRecordThroughReports } from '../report-engine/shared/trace-record.js';


const runPythonFallback = (jobId) => {
  const pythonPath = process.env.PYTHON_PATH || 'python';
  const pyDir = path.resolve(projectRoot, 'python_worker').replace(/\\/g, '/');
  const cmd = `"${pythonPath}" -c "import sys; sys.path.insert(0, '${pyDir}'); from generator import generate_report; generate_report('${jobId}')"`;
  exec(cmd, { cwd: projectRoot }, (err, stdout, stderr) => {
    if (err) {
      log.error('PythonFallback: Error generating report', { jobId, err: err.message });
    } else {
      log.info('PythonFallback: Direct Python execution completed', { jobId });
    }
  });
};

const parseJsonField = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return val; }
  }
  return val;
};

// Fallback in-memory templates
const templates = [
  { id: "arrest-summary",       name_en: "Arrest Summary Report",       name_hi: "गिरफ्तारी सारांश रिपोर्ट",       format: ["pdf","csv","excel"], applicable_record_types: ["ARREST"] },
  { id: "pcr-call-log",         name_en: "PCR Call Log",                name_hi: "पीसीआर कॉल लॉग",                format: ["pdf","csv","excel"], applicable_record_types: ["PCR_CALL"] },
  { id: "cases-register",       name_en: "Cases Register",              name_hi: "मामले रजिस्टर",              format: ["pdf","csv","excel"], applicable_record_types: ["CASE"] },
  { id: "daily-status",         name_en: "Daily Status Report",         name_hi: "दैनिक स्थिति रिपोर्ट",         format: ["pdf","excel"], applicable_record_types: ["ARREST", "PCR_CALL", "CASE"] },
  { id: "district-compilation", name_en: "District Compilation Report", name_hi: "जिला संकलन रिपोर्ट",         format: ["pdf","excel"], applicable_record_types: ["COMPILATION"] },
  { id: "io-performance",       name_en: "IO Investigation Performance", name_hi: "जांच अधिकारी जांच प्रदर्शन",  format: ["pdf","excel"], applicable_record_types: ["CASE"] },
  { id: "beat-incidents",       name_en: "Beat Incident Summary",       name_hi: "बीट घटना सारांश",               format: ["pdf","excel"], applicable_record_types: ["CASE", "PCR_CALL"] },
  { id: "legacy-summary",       name_en: "Legacy Data Summary",         name_hi: "विरासत डेटा सारांश",            format: ["pdf","excel"], applicable_record_types: ["CASE", "ARREST"] },
  { id: "sla-breaches",         name_en: "SLA Breaches Audit Log",      name_hi: "समय सीमा उल्लंघन ऑडिट लॉग",      format: ["pdf","csv","excel"], applicable_record_types: ["CASE", "ARREST", "PCR_CALL"] },
  { id: "ops-compilation",      name_en: "Ops Chain Compilation",       name_hi: "संचालन श्रृंखला संकलन",          format: ["pdf","excel"], applicable_record_types: ["COMPILATION"] },
  { id: "arrested-24hr-list",  name_en: "Arrested 24 Hour List",      name_hi: "पिछले 24 घंटों की गिरफ्तारी सूची", format: ["excel","pdf"], applicable_record_types: ["ARREST"],  template_type: "LINKED" },
  { id: "manual-fir",          name_en: "Manual FIR Register",        name_hi: "मैनुअल एफआईआर रजिस्टर",          format: ["excel","pdf"], applicable_record_types: ["CASE"],    template_type: "LINKED" },
  // Daily Diary Parallel Report templates (delegate to Node.js parallel engine)
  { id: "daily-diary",                    name_en: "Daily Diary Export (All Sheets)",         name_hi: "दैनिक डायरी निर्यात",                    format: ["excel"], applicable_record_types: ["ARREST","CASE","PCR_CALL","MISSING","UIDB"], template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-manual-fir",                  name_en: "Daily Diary: Manual FIR",                name_hi: "मैनुअल एफआईआर",                         format: ["excel"], applicable_record_types: ["CASE"],                               template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-eburglary-ehouse-theft-mvt",  name_en: "Daily Diary: E-Burglary, E-House Theft, MVT", name_hi: "ई-चोरी मामले",                    format: ["excel"], applicable_record_types: ["CASE"],                               template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-arrested-all-heads",          name_en: "Daily Diary: Persons Arrested All Heads", name_hi: "गिरफ्तार व्यक्ति सभी शीर्ष",            format: ["excel"], applicable_record_types: ["ARREST"],                            template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-arrested-east-district",      name_en: "Daily Diary: Arrested East District",    name_hi: "पूर्वी जिला गिरफ्तार",                  format: ["excel"], applicable_record_types: ["ARREST"],                            template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-arrested-kalandara",          name_en: "Daily Diary: Arrested Kalandara",        name_hi: "कलंदरा गिरफ्तार",                       format: ["excel"], applicable_record_types: ["ARREST"],                            template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-arrested-efir-theft",         name_en: "Daily Diary: Arrested E-FIR Theft",      name_hi: "ई-एफआईआर चोरी गिरफ्तार",               format: ["excel"], applicable_record_types: ["ARREST"],                            template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-arrested-efir-mv-theft",      name_en: "Daily Diary: Arrested E-FIR MV Theft",   name_hi: "ई-एफआईआर एमवीटी गिरफ्तार",             format: ["excel"], applicable_record_types: ["ARREST"],                            template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-proclaimed-offenders",        name_en: "Daily Diary: Proclaimed Offenders",      name_hi: "उद्घोषित अपराधी",                       format: ["excel"], applicable_record_types: ["ARREST"],                            template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-arrested-24hrs",              name_en: "Daily Diary: Arrested 24 Hours List",    name_hi: "24 घंटे गिरफ्तारी सूची",                format: ["excel"], applicable_record_types: ["ARREST"],                            template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-missing-uidb",               name_en: "Daily Diary: Missing, UIDB, Abandoned, Traced", name_hi: "लापता, यूआईडीबी",               format: ["excel"], applicable_record_types: ["MISSING","UIDB"],                     template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-women-children-missing",      name_en: "Daily Diary: Women & Children Missing",  name_hi: "महिला व बच्चे लापता",                    format: ["excel"], applicable_record_types: ["MISSING"],                           template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-preventive-action",           name_en: "Daily Diary: Preventive Action",         name_hi: "निवारक कार्रवाई",                        format: ["excel"], applicable_record_types: ["PCR_CALL"],                          template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-inquest-registered",          name_en: "Daily Diary: Inquest Registered",        name_hi: "जांच पंजीकृत",                          format: ["excel"], applicable_record_types: ["CASE"],                               template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-important-cases",             name_en: "Daily Diary: Important Cases",           name_hi: "महत्वपूर्ण मामले",                       format: ["excel"], applicable_record_types: ["CASE"],                               template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-fir-goswara-summary",         name_en: "Daily Diary: FIR Goswara Summary",      name_hi: "एफआईआर गोस्वारा सारांश",                format: ["excel"], applicable_record_types: ["CASE"],                               template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-financial-fraud-arrest",      name_en: "Daily Diary: Financial Fraud Arrest",    name_hi: "वित्तीय धोखाधड़ी गिरफ्तार",             format: ["excel"], applicable_record_types: ["ARREST","CASE"],                    template_type: "DAILY_DIARY_PARALLEL" },
  { id: "dd-ndps-action",                 name_en: "Daily Diary: NDPS Action",               name_hi: "एनडीपीएस कार्रवाई",                     format: ["excel"], applicable_record_types: ["CASE","ARREST"],                    template_type: "DAILY_DIARY_PARALLEL" },
  { id: "PHQ_DIARY",                      name_en: "PHQ Daily Crime Diary",                   name_hi: "मुख्यालय दैनिक अपराध डायरी",              format: ["excel"], applicable_record_types: ["CASE","ARREST"],                     template_type: "PHQ_DIARY" },
  { id: "DISTRICT_DIARY",                 name_en: "District Crime Diary (18 Sheets)",        name_hi: "जिला अपराध डायरी",                       format: ["excel"], applicable_record_types: ["CASE","ARREST","PCR_CALL"],          template_type: "DISTRICT_DIARY" },
  { id: "FN_DIARY",                       name_en: "Fortnightly Crime Diary (43 Sheets)",      name_hi: "पाक्षिक अपराध डायरी",                    format: ["excel"], applicable_record_types: ["CASE","ARREST","MISSING"],           template_type: "FN_DIARY" }
];

export const getTemplates = async (req, res) => {
  const userId = req.user ? (req.user.userId || req.user.id) : null;
  const { record_type, template_type } = req.query;
  log.debug('getTemplates: enter', { userId, record_type, template_type });

  try {
    let query = db('report_templates')
      .where(function() {
        this.where('is_active', true)
            .orWhere('created_by', userId);
      });

    if (template_type) {
      query = query.andWhere('template_type', template_type.toUpperCase());
    }

    const dbTemplates = await query;
    const dbIds = new Set(dbTemplates.map(t => t.id));
    log.debug('getTemplates: fetched DB-synced report_templates', { userId, template_type, count: dbTemplates.length });

    let formatted = dbTemplates.map(t => {
      let formats = [];
      try {
        formats = typeof t.output_formats === 'string' ? JSON.parse(t.output_formats) : t.output_formats;
      } catch (e) {
        formats = ["PDF", "CSV", "EXCEL"];
      }

      let recTypes = [];
      try {
        recTypes = typeof t.applicable_record_types === 'string' ? JSON.parse(t.applicable_record_types) : t.applicable_record_types;
      } catch (e) {
        recTypes = ["CASE"];
      }

      return {
        id: t.id,
        name_en: t.name || t.name_en,
        name_hi: t.name_hi || t.name,
        template_type: t.template_type || 'PROFORMA',
        applicable_record_types: recTypes,
        output_formats: formats || ["PDF", "CSV", "EXCEL"],
        template_definition: parseJsonField(t.template_definition)
      };
    });

    // Merge in-memory fallback templates not already in DB
    const memFormatted = templates
      .filter(t => !dbIds.has(t.id))
      .map(t => ({
        id: t.id,
        name_en: t.name_en,
        name_hi: t.name_hi,
        template_type: t.template_type || 'PROFORMA',
        applicable_record_types: t.applicable_record_types,
        output_formats: t.format.map(f => f.toUpperCase()),
        template_definition: null
      }));

    formatted = [...formatted, ...memFormatted];
    log.debug('getTemplates: merged DB + in-memory fallback templates', { userId, dbCount: dbTemplates.length, memCount: memFormatted.length });

    if (record_type) {
      const filterTypes = record_type.split(',').map(s => s.trim().toUpperCase());
      formatted = formatted.filter(t =>
        t.applicable_record_types.some(rt => filterTypes.includes(rt.toUpperCase()))
      );
      log.debug('getTemplates: filtered by record_type', { filterTypes, remaining: formatted.length });
    }

    log.info('getTemplates: exit', { userId, count: formatted.length });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: { templates: formatted }
    });
  } catch (err) {
    log.error('getTemplates: failed', { userId, err });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: err.message
    });
  }
};

const getRecordsForReport = async (templateId, filters) => {
  log.debug('getRecordsForReport: enter', { templateId, filters: Object.keys(filters || {}) });
  let recordType = null;
  if (templateId === 'arrest-summary') recordType = 'ARREST';
  else if (templateId === 'pcr-call-log') recordType = 'PCR_CALL';
  else if (templateId === 'cases-register') recordType = 'CASE';

  let query = db('records')
    .select('records.*', 'ps.name as ps_name', 'dist.name as district_name')
    .leftJoin('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .leftJoin('hierarchy_nodes as dist', 'records.district_id', 'dist.id');

  if (recordType) {
    query = query.where('records.record_type', recordType);
  }

  const psId = filters.psId || filters.station_id;
  const districtId = filters.districtId || filters.district_id;
  const from = toISO(filters.from || filters.dateFrom || filters.from_date || filters.date);
  const to = toISO(filters.to || filters.dateTo || filters.to_date || filters.date);

  if (psId) query = query.where('records.ps_id', psId);
  if (districtId) query = query.where('records.district_id', districtId);
  if (from) query = query.where('records.record_date', '>=', from);
  if (to) query = query.where('records.record_date', '<=', to);

  // Dynamic user data filters from request parameters
  const systemKeys = new Set([
    'psId', 'station_id', 'districtId', 'district_id',
    'from', 'dateFrom', 'from_date', 'date',
    'to', 'dateTo', 'to_date', 'date_to',
    'selected_sub_templates', 'page', 'limit', 'format', 'template_id',
    'scope_node_id', 'scopeNodeId', 'selected_sheets'
  ]);

  for (const [key, val] of Object.entries(filters)) {
    if (systemKeys.has(key) || val === undefined || val === null || val === '') {
      continue;
    }
    const coreColumns = ['id', 'current_status', 'current_level'];
    if (coreColumns.includes(key)) {
      query = query.where(`records.${key}`, val);
    } else {
      log.warn('getRecordsForReport: skipping dynamic filter for non-existent records.data column', { templateId, key });
    }
  }

  const results = await query.orderBy('records.record_date', 'desc');
  log.info('getRecordsForReport: exit', { templateId, recordType, count: results.length });
  return results.map(r => ({
    ...r,
    data: parseJsonField(r.data)
  }));
};

const getCompilationsForReport = async (filters) => {
  log.debug('getCompilationsForReport: enter', { filters: Object.keys(filters || {}) });
  let query = db('compilations')
    .select('compilations.*', 'dist.name as district_name')
    .leftJoin('hierarchy_nodes as dist', 'compilations.source_entity_id', 'dist.id');

  const districtId = filters.districtId || filters.district_id;
  if (districtId) query = query.where('compilations.source_entity_id', districtId);

  const results = await query.orderBy('compilations.period', 'desc');
  log.info('getCompilationsForReport: exit', { districtId: districtId || null, count: results.length });
  return results.map(c => ({
    ...c,
    compiled_summary: parseJsonField(c.compiled_summary)
  }));
};

async function generatePDF(htmlContent) {
  log.debug('generatePDF: enter', { htmlLength: htmlContent.length });
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  log.debug('generatePDF: puppeteer browser launched');
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  log.debug('generatePDF: page content set, rendering PDF');
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  log.info('generatePDF: exit', { pdfBytes: pdfBuffer.length });
  return pdfBuffer;
}

async function generateExcelFile(template_id, records, parsedFilters, psName, filePath) {
  log.debug('generateExcelFile: enter', { template_id, recordCount: records.length, filePath });
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  worksheet.addRow([`PHAROS REPORT: ${template_id.toUpperCase().replace(/-/g, ' ')}`]);
  worksheet.addRow([`Generated At: ${new Date().toLocaleString()}`]);
  worksheet.addRow([`Jurisdiction: ${psName}`]);
  worksheet.addRow([]);

  let headers = [];
  let rowKeys = [];

  if (template_id === 'district-compilation' || template_id === 'ops-compilation') {
    headers = ['Compilation ID', 'District', 'Period', 'Status'];
    rowKeys = ['id', 'district_name', 'period', 'status'];
  } else if (template_id === 'arrest-summary') {
    headers = ['UID', 'Date', 'Arrestee Name', 'Offence', 'Arresting Officer'];
    rowKeys = ['uid', 'record_date', 'arrestee_name', 'section_offence', 'arresting_officer'];
  } else if (template_id === 'pcr-call-log') {
    headers = ['UID', 'Date', 'Caller Number', 'Location', 'Call Type', 'Status'];
    rowKeys = ['uid', 'record_date', 'caller_phone', 'occurrence_place', 'call_type', 'current_status'];
  } else if (template_id === 'cases-register') {
    headers = ['UID', 'FIR No', 'FIR Date', 'Complainant Name', 'Crime Head', 'Brief Facts'];
    rowKeys = ['uid', 'fir_no', 'fir_date', 'complainant_name', 'case_head', 'brief_facts'];
  } else {
    headers = ['ID', 'Record Type', 'Record Date', 'Status', 'Level'];
    rowKeys = ['id', 'record_type', 'record_date', 'current_status', 'current_level'];
  }
  log.debug('generateExcelFile: resolved header layout for template', { template_id, headers });

  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
  });

  for (const r of records) {
    const d = r.data || r;
    const rowData = rowKeys.map(key => {
      if (key === 'record_date') return toDMY(r.record_date) || '';
      if (key === 'period') return toDMY(r.period) || '';
      if (key === 'record_type') return r.record_type || '';
      if (key === 'current_status') return r.current_status || '';
      if (key === 'current_level') return r.current_level || '';
      if (key === 'id') return r.id || '';
      if (d[key] !== undefined) return d[key];
      if (key === 'arrestee_name') return d.arrested_name || d.name || '';
      if (key === 'section_offence') return d.crime_head || d.section_offence || d.offence || '';
      if (key === 'caller_phone') return d.caller_phone || d.pcr_gd_no || '';
      return '';
    });
    worksheet.addRow(rowData);
  }

  worksheet.columns.forEach(column => {
    let maxLen = 10;
    column.eachCell({ includeEmpty: true }, cell => {
      const val = cell.value ? String(cell.value) : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    column.width = Math.min(maxLen + 2, 50);
  });

  await workbook.xlsx.writeFile(filePath);
  log.info('generateExcelFile: exit — workbook written', { template_id, filePath, rowCount: records.length });
}

const validateCustomDefinition = async (custom_definition) => {
  log.debug('validateCustomDefinition: enter', { sheetCount: custom_definition?.sheets?.length ?? null });
  if (!custom_definition || !Array.isArray(custom_definition.sheets)) {
    log.warn('validateCustomDefinition: rejected — sheets not an array');
    throw new Error('Invalid custom report definition: sheets must be an array');
  }
  for (const sheet of custom_definition.sheets) {
    const { record_type, field_keys } = sheet;
    if (!record_type || !Array.isArray(field_keys)) {
      log.warn('validateCustomDefinition: rejected — sheet missing record_type/field_keys', { record_type });
      throw new Error('Invalid sheet definition: record_type and field_keys (array) are required');
    }

    // Validate record_type enum
    const validTypes = ['ARREST', 'PCR_CALL', 'CASE'];
    if (!validTypes.includes(record_type)) {
      log.warn('validateCustomDefinition: rejected — invalid record_type', { record_type, validTypes });
      throw new Error(`Invalid record type '${record_type}'. Allowed types: ${validTypes.join(', ')}`);
    }

    const registered = await db('field_registry')
      .whereIn('field_key', field_keys)
      .andWhere('is_active', true);

    const registeredKeys = registered.map(r => r.field_key);
    for (const key of field_keys) {
      if (!registeredKeys.includes(key)) {
        log.warn('validateCustomDefinition: rejected — field key not in registry or inactive', { record_type, key });
        throw new Error(`Field key '${key}' does not exist or is inactive in the field registry`);
      }
    }
    log.debug('validateCustomDefinition: sheet passed', { record_type, fieldKeyCount: field_keys.length });
  }
  log.debug('validateCustomDefinition: exit — all sheets valid');
};

export const generateReport = async (req, res) => {
  const { template_id, custom_definition, filters, format, selected_sub_templates } = req.body;
  const userId = req.user ? (req.user.userId || req.user.id) : null;
  log.debug('generateReport: enter', {
    userId, role: req.user?.role, template_id, hasCustomDefinition: !!custom_definition, format,
  });

  if (!template_id && !custom_definition) {
    log.warn('generateReport: rejected — neither template_id nor custom_definition provided', { userId });
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'Either template_id or custom_definition is required'
    });
  }

  if (!format) {
    log.warn('generateReport: rejected — format missing', { userId, template_id });
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'format is required'
    });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let selectedTemplate = null;
  if (template_id) {
    selectedTemplate = await db('report_templates')
      .where({ is_active: true })
      .where(builder => {
        if (UUID_RE.test(template_id)) builder.where({ id: template_id });
        builder.orWhere({ code: template_id });
      })
      .first();
    if (!selectedTemplate) {
      log.debug('generateReport: template not in DB report_templates, checking in-memory fallback', { template_id });
      const memTemplate = templates.find(t => t.id === template_id);
      if (!memTemplate) {
        log.warn('generateReport: rejected — template not found', { userId, template_id });
        return res.status(404).json({
          status: 'error',
          success: false,
          code: 'NOT_FOUND',
          message: 'Template not found'
        });
      }
      selectedTemplate = {
        id: memTemplate.id,
        name_en: memTemplate.name_en,
        name_hi: memTemplate.name_hi,
        applicable_record_types: JSON.stringify(memTemplate.applicable_record_types),
        output_formats: JSON.stringify(memTemplate.format.map(f => f.toUpperCase())),
        template_definition: JSON.stringify({}),
        template_type: memTemplate.template_type
      };
    }
  }

  // Validate custom field_keys exist in field_registry
  if (!template_id && custom_definition) {
    try {
      await validateCustomDefinition(custom_definition);
      log.debug('generateReport: custom_definition validated', { userId });
    } catch (err) {
      log.warn('generateReport: rejected — custom_definition invalid', { userId, err });
      return res.status(400).json({
        status: 'error',
        success: false,
        code: 'BAD_REQUEST',
        message: err.message
      });
    }
  }

  const fmt = format.toUpperCase();
  const allowedFormats = selectedTemplate 
    ? (typeof selectedTemplate.output_formats === 'string' ? JSON.parse(selectedTemplate.output_formats) : selectedTemplate.output_formats).map(f => f.toUpperCase())
    : ['PDF', 'CSV', 'EXCEL', 'XLSX'];
  
  if (!allowedFormats.includes(fmt) && !(fmt === 'XLSX' && allowedFormats.includes('EXCEL'))) {
    log.warn('generateReport: rejected — unsupported output format', { userId, template_id, format, allowedFormats });
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: `Unsupported output format: ${format}`
    });
  }

  const ext = (fmt === 'EXCEL' || fmt === 'XLSX') ? 'xlsx' : fmt.toLowerCase();

  // RBAC scope checks
  const userPsId = req.user?.psId || req.user?.station_id;
  const userDistrictId = req.user?.districtId || req.user?.district_id;
  const filterPsId = filters?.ps_id || filters?.psId || filters?.station_id;
  const filterDistrictId = filters?.district_id || filters?.districtId;

  if (req.user?.role === 'HC' && filterPsId && filterPsId !== userPsId) {
    log.warn('generateReport: rejected — HC requested a PS outside own scope', { userId, userPsId, filterPsId });
    return res.status(403).json({
      status: 'error',
      success: false,
      code: 'FORBIDDEN',
      message: 'Cannot generate reports outside your PS'
    });
  }

  if (req.user?.role === 'DISTRICT_OFFICER' && filterDistrictId && filterDistrictId !== userDistrictId) {
    log.warn('generateReport: rejected — DISTRICT_OFFICER requested a district outside own scope', { userId, userDistrictId, filterDistrictId });
    return res.status(403).json({
      status: 'error',
      success: false,
      code: 'FORBIDDEN',
      message: 'Cannot generate reports outside your district'
    });
  }

  try {
    const jobId = uuidv4();
    const reportsDir = process.env.REPORTS_DIR || './generated-reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
      log.debug('generateReport: created reports directory', { reportsDir });
    }

    const filePath = path.join(reportsDir, `${jobId}.${ext}`);

    const dbTemplateId = (selectedTemplate && UUID_RE.test(selectedTemplate.id))
      ? selectedTemplate.id
      : (UUID_RE.test(template_id) ? template_id : null);

    const effectiveUserId = userId || req.user?.id || 'bf5af8de-2e04-40ed-928e-6a0b02916fc2';

    await db('report_jobs').insert({
      id: jobId,
      template_id: dbTemplateId,
      custom_definition: custom_definition
        ? JSON.stringify(custom_definition)
        : JSON.stringify({ type: 'DAILY_DIARY', template_id: template_id }),
      filters: JSON.stringify(filters || {}),
      format: fmt,
      status: 'PENDING',
      file_path: filePath,
      created_by: effectiveUserId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    log.info('generateReport: wrote report_jobs row (PENDING)', { jobId, userId, template_id, format: fmt, filePath });

    // Check if this is a PHQ / District template or metadata-driven template (Node.js engine)
    const tCode = (selectedTemplate?.code || (typeof template_id === 'string' && !UUID_RE.test(template_id) ? template_id : '')).toUpperCase();
    const isReportEngineTemplate = tCode.startsWith('PHQ') || tCode === 'PHQ_DIARY' || tCode.startsWith('DISTRICT') || tCode === 'DISTRICT_DIARY' || tCode === 'FN_DIARY' || selectedTemplate?.template_type === 'PHQ_DIARY' || selectedTemplate?.template_type === 'DISTRICT_DIARY' || selectedTemplate?.template_type === 'FN_DIARY';
    const isMetadataTemplate = isReportEngineTemplate || (selectedTemplate && selectedTemplate.template_definition && parseJsonField(selectedTemplate.template_definition) && Object.keys(parseJsonField(selectedTemplate.template_definition)).length > 0);

    if (isMetadataTemplate) {
      setImmediate(async () => {
        try {
          await generateReportInternal(jobId, selectedTemplate?.id || selectedTemplate?.code || template_id, filters || {}, fmt, filePath, userId);
        } catch (err) {
          log.error('generateReport: Metadata report generation failed', { jobId, err: err.message, stack: err.stack });
          await db('report_jobs').where({ id: jobId }).update({ status: 'FAILED', updated_at: new Date().toISOString() });
        }
      });
    } else {
      // Hand off to Python worker via RabbitMQ for single-sheet reports
      await publish('report.requested', {
        job_id: jobId,
        template_id: template_id || null,
        custom_definition: custom_definition || null,
        filters: filters || {},
        format: fmt,
        selected_sub_templates: selected_sub_templates || null,
        user_id: userId
      });
      log.debug('generateReport: published report.requested', { jobId, userId });
      setTimeout(() => runPythonFallback(jobId), 100);
    }

    log.info('generateReport: exit', { jobId, userId, template_id, format: fmt });
    return res.status(201).json({
      status: 'success',
      success: true,
      data: {
        job_id: jobId,
        job: { id: jobId, status: 'PENDING' },
        status: 'PENDING'
      }
    });

  } catch (error) {
    log.error('generateReport: failed', { userId, template_id, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const generateReportInternal = async (jobId, template_id, parsedFilters, format, filePath, userId) => {
  log.debug('generateReportInternal: enter', { jobId, template_id, format, userId });
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let template = null;
  if (template_id) {
    if (UUID_RE.test(template_id)) {
      template = await db('report_templates').where({ id: template_id }).first();
    }
    if (!template) {
      template = await db('report_templates').where({ code: template_id }).first();
    }
  }

  const templateCode = (template?.code || (typeof template_id === 'string' && !UUID_RE.test(template_id) ? template_id : '')).toUpperCase();
  const isPHQ = templateCode.startsWith('PHQ') || templateCode === 'PHQ_DIARY' || template?.template_type === 'PHQ_DIARY';
  const isDistrict = templateCode.startsWith('DISTRICT') || templateCode === 'DISTRICT_DIARY' || template?.template_type === 'DISTRICT_DIARY';
  const isFnDiary = templateCode === 'FN_DIARY' || template?.template_type === 'FN_DIARY';

  if (isPHQ || isDistrict || isFnDiary) {
    const { generateReport } = await import('../report-engine/report-engine.service.js');
    const rawDateStr = parsedFilters.date || parsedFilters.fn_end_date || parsedFilters.from_date || parsedFilters.from || new Date().toISOString().split('T')[0];
    let runDateStr = String(rawDateStr).trim();
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(runDateStr)) {
      const parts = runDateStr.split(/[\/-]/);
      runDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(runDateStr)) {
      throw new Error(`Invalid date format '${rawDateStr}'. Expected YYYY-MM-DD.`);
    }
    const scope = parsedFilters.scope_node_id || parsedFilters.ps_id || parsedFilters.station_id || parsedFilters.district_id || parsedFilters.scope || 'ALL_DELHI_TOTAL';
    const selectedSheets = parsedFilters.selected_sheets || [];
    const reportFamily = isFnDiary ? 'FN_DIARY' : isDistrict ? 'DISTRICT_DIARY' : 'PHQ_DIARY';

    const buffer = await generateReport({
      reportFamily,
      scopeNodeId: scope,
      cutoffDate: runDateStr,
      selectedSheets
    });
    fs.writeFileSync(filePath, buffer);
    await db('report_jobs').where({ id: jobId }).update({
      status: 'READY',
      file_path: filePath,
      updated_at: new Date().toISOString()
    });
    return;
  }

  const isDailyDiaryParallel = (
    templateCode === 'DAILY-DIARY' || templateCode === 'DAILY_DIARY' ||
    templateCode.startsWith('DD-') || templateCode.startsWith('DD_') ||
    template?.template_type === 'DAILY_DIARY_PARALLEL' ||
    (typeof template_id === 'string' && (template_id.startsWith('dd-') || template_id === 'daily-diary'))
  );

  if (isDailyDiaryParallel) {
    const { execSync } = await import('child_process');
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const pyDir = path.resolve(projectRoot, 'python_worker').replace(/\\/g, '/');
    const cmd = `"${pythonPath}" -c "import sys; sys.path.insert(0, '${pyDir}'); from generator import generate_report; generate_report('${jobId}')"`;
    log.info('generateReportInternal: executing Python daily-diary engine', { jobId, template_id });
    execSync(cmd, { cwd: projectRoot });
    await db('report_jobs').where({ id: jobId }).update({
      status: 'READY',
      file_path: filePath,
      updated_at: new Date().toISOString()
    });
    return;
  }

  if (template && template.template_definition) {
    await generateMetadataReport(jobId, template, parsedFilters, format, filePath, userId);
    await db('report_jobs').where({ id: jobId }).update({
      status: 'READY',
      file_path: filePath,
      updated_at: new Date().toISOString()
    });
    return;
  }


  let records = [];
  let psName = 'All jurisdictions';

  if (parsedFilters.psId || parsedFilters.station_id) {
    const psNode = await db('hierarchy_nodes').where({ id: parsedFilters.psId || parsedFilters.station_id }).first();
    if (psNode) psName = psNode.name;
  } else if (parsedFilters.districtId || parsedFilters.district_id) {
    const distNode = await db('hierarchy_nodes').where({ id: parsedFilters.districtId || parsedFilters.district_id }).first();
    if (distNode) psName = distNode.name;
  }
  log.debug('generateReportInternal: resolved jurisdiction label', { jobId, psName });

  const fmt = format.toUpperCase();
  log.debug('generateReportInternal: dispatching by format', { jobId, fmt });

  if (fmt === 'PDF') {
    log.debug('generateReportInternal: PDF branch', { jobId, template_id });
    const templatePath = path.resolve('src/modules/reports/templates', `${template_id}.html`);
    let html;
    if (fs.existsSync(templatePath)) {
      html = fs.readFileSync(templatePath, 'utf8');
      log.debug('generateReportInternal: loaded HTML template file', { jobId, template_id, templatePath });
    } else {
      log.debug('generateReportInternal: no template file on disk, using generic inline fallback HTML', { jobId, template_id, templatePath });
      html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>{{ps_name}} Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #1a365d; border-bottom: 2px solid #2b6cb0; padding-bottom: 10px; }
          .meta { margin-bottom: 20px; font-size: 14px; color: #4a5568; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #ebf8ff; border: 1px solid #cbd5e0; padding: 10px; text-align: left; }
          td { border: 1px solid #cbd5e0; padding: 10px; }
          tr:nth-child(even) { background-color: #f7fafc; }
        </style>
      </head>
      <body>
        <h1>PHAROS REPORT: ${template_id.toUpperCase().replace(/-/g, ' ')}</h1>
        <div class="meta">
          <p><strong>Jurisdiction:</strong> {{ps_name}}</p>
          <p><strong>Generated At:</strong> {{generated_at}}</p>
          <p><strong>Date Range:</strong> {{from_date}} to {{to_date}}</p>
          <p><strong>Total Records:</strong> {{records_count}}</p>
        </div>
        {{records_table}}
      </body>
      </html>`;
    }

    let tableHtml = '';
    if (template_id === 'district-compilation' || template_id === 'ops-compilation') {
      log.debug('generateReportInternal: PDF compilation-table branch', { jobId, template_id });
      const comps = await getCompilationsForReport(parsedFilters);
      records = comps;
      tableHtml = `<table style="width:100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="border: 1px solid #cbd5e0; padding: 8px;">ID</th>
            <th style="border: 1px solid #cbd5e0; padding: 8px;">District</th>
            <th style="border: 1px solid #cbd5e0; padding: 8px;">Period</th>
            <th style="border: 1px solid #cbd5e0; padding: 8px;">Status</th>
          </tr>
        </thead>
        <tbody>`;
      for (const c of comps) {
        tableHtml += `<tr>
          <td style="border: 1px solid #cbd5e0; padding: 8px;">${c.id}</td>
          <td style="border: 1px solid #cbd5e0; padding: 8px;">${c.district_name || ''}</td>
          <td style="border: 1px solid #cbd5e0; padding: 8px;">${c.period || ''}</td>
          <td style="border: 1px solid #cbd5e0; padding: 8px;">${c.status || ''}</td>
        </tr>`;
      }
      tableHtml += '</tbody></table>';
    } else {
      records = await getRecordsForReport(template_id, parsedFilters);
      log.debug('generateReportInternal: PDF records-table branch', { jobId, template_id, recordCount: records.length });

      if (template_id === 'arrest-summary') {
        tableHtml = `<table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">UID</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Date</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Arrestee Name</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Offence</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Arresting Officer</th>
            </tr>
          </thead>
          <tbody>`;
        for (const r of records) {
          const d = r.data || {};
          tableHtml += `<tr>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.uid || r.id}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${toDMY(r.record_date) || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.arrested_name || d.name || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.crime_head || d.section_offence || d.offence || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.arresting_officer || ''}</td>
          </tr>`;
        }
        tableHtml += '</tbody></table>';
      } else if (template_id === 'pcr-call-log') {
        tableHtml = `<table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">UID</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Date</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Caller Number</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Location</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Call Type</th>
            </tr>
          </thead>
          <tbody>`;
        for (const r of records) {
          const d = r.data || {};
          tableHtml += `<tr>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.uid || r.id}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${toDMY(r.record_date) || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.caller_phone || d.pcr_gd_no || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.occurrence_place || d.location || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.pcr_head || d.call_type || ''}</td>
          </tr>`;
        }
        tableHtml += '</tbody></table>';
      } else if (template_id === 'cases-register') {
        tableHtml = `<table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">UID</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">FIR No</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Complainant Name</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Crime Head</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Brief Facts</th>
            </tr>
          </thead>
          <tbody>`;
        for (const r of records) {
          const d = r.data || {};
          tableHtml += `<tr>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.uid || r.id}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.fir_no || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.complainant_name || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.case_head || d.crime_head || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.brief_facts || ''}</td>
          </tr>`;
        }
        tableHtml += '</tbody></table>';
      } else {
        tableHtml = `<table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">UID</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Type</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Date</th>
              <th style="border: 1px solid #cbd5e0; padding: 8px;">Status</th>
            </tr>
          </thead>
          <tbody>`;
        for (const r of records) {
          const d = r.data || {};
          tableHtml += `<tr>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${d.uid || r.id}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${r.record_type || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${toDMY(r.record_date) || ''}</td>
            <td style="border: 1px solid #cbd5e0; padding: 8px;">${r.current_status || ''}</td>
          </tr>`;
        }
        tableHtml += '</tbody></table>';
      }
    }

    html = html
      .replace(/{{generated_at}}/g, new Date().toLocaleString())
      .replace(/{{job_id}}/g, jobId)
      .replace(/{{from_date}}/g, parsedFilters.from || parsedFilters.dateFrom || 'N/A')
      .replace(/{{to_date}}/g, parsedFilters.to || parsedFilters.dateTo || 'N/A')
      .replace(/{{ps_name}}/g, psName)
      .replace(/{{records_count}}/g, records.length)
      .replace(/{{records_table}}/g, tableHtml);

    if (template_id === 'daily-status') {
      const arrestsCount = records.filter(r => r.record_type === 'ARREST').length;
      const pcrCount = records.filter(r => r.record_type === 'PCR_CALL').length;
      const casesCount = records.filter(r => r.record_type === 'CASE').length;

      html = html
        .replace(/{{arrests_count}}/g, arrestsCount)
        .replace(/{{pcr_count}}/g, pcrCount)
        .replace(/{{cases_count}}/g, casesCount);
    }

    const pdfBuffer = await generatePDF(html);
    fs.writeFileSync(filePath, pdfBuffer);
    log.info('generateReportInternal: PDF written to disk', { jobId, template_id, filePath, recordCount: records.length });

  } else if (fmt === 'CSV') {
    log.debug('generateReportInternal: CSV branch', { jobId, template_id });
    records = await getRecordsForReport(template_id, parsedFilters);
    let csvString = '';

    if (template_id === 'arrest-summary') {
      csvString = 'UID,Record Date,Arrestee Name,Section/Offence,Arresting Officer\n';
      for (const r of records) {
        const d = r.data || {};
        csvString += `"${d.uid || r.id}","${toDMY(r.record_date) || ''}","${d.arrested_name || d.name || ''}","${d.crime_head || d.section_offence || d.offence || ''}","${d.arresting_officer || ''}"\n`;
      }
    } else if (template_id === 'pcr-call-log') {
      csvString = 'UID,Record Date,Caller Number,Location,Call Type,Status\n';
      for (const r of records) {
        const d = r.data || {};
        csvString += `"${d.uid || r.id}","${toDMY(r.record_date) || ''}","${d.caller_phone || d.pcr_gd_no || ''}","${d.occurrence_place || d.location || ''}","${d.pcr_head || d.call_type || ''}","${r.current_status || ''}"\n`;
      }
    } else if (template_id === 'cases-register') {
      csvString = 'UID,FIR No,FIR Date,Complainant Name,Crime Head,Brief Facts\n';
      for (const r of records) {
        const d = r.data || {};
        csvString += `"${d.uid || r.id}","${d.fir_no || ''}","${d.fir_date || toDMY(r.record_date) || ''}","${d.complainant_name || ''}","${d.case_head || d.crime_head || ''}","${(d.brief_facts || '').replace(/"/g, '""')}"\n`;
      }
    } else {
      csvString = 'ID,Record Type,Record Date,Status,Level\n';
      for (const r of records) {
        csvString += `"${r.id}","${r.record_type}","${toDMY(r.record_date) || ''}","${r.current_status}","${r.current_level}"\n`;
      }
    }

    fs.writeFileSync(filePath, csvString);
    log.info('generateReportInternal: CSV written to disk', { jobId, template_id, filePath, recordCount: records.length });

  } else if (fmt === 'EXCEL' || fmt === 'XLSX') {
    log.debug('generateReportInternal: EXCEL branch', { jobId, template_id });
    if (template_id === 'daily-status') {
      log.debug('generateReportInternal: daily-status delegates to external Python export script', { jobId, template_id });
      const date = toISO(parsedFilters.from || parsedFilters.dateFrom || parsedFilters.date) || new Date().toISOString().split('T')[0];
      const templatePath = path.resolve(projectRoot, 'Master/Daily_Diary_ProperHeaders.xlsx');
      const scriptPath = path.resolve(projectRoot, 'Master/files/export_daily_report.py');

      if (fs.existsSync(scriptPath) && fs.existsSync(templatePath)) {
        let dbHost = 'localhost';
        let dbPort = '5435';
        let dbUser = 'postgres';
        let dbPass = 'postgres';
        let dbName = 'pharos_db';

        if (process.env.DATABASE_URL) {
          try {
            const url = new URL(process.env.DATABASE_URL);
            dbHost = url.hostname || dbHost;
            dbPort = url.port || dbPort;
            dbUser = url.username || dbUser;
            dbPass = url.password || dbPass;
            dbName = url.pathname.replace(/^\//, '') || dbName;
          } catch (e) {
            // ignore
          }
        }

        const cmd = `python "${scriptPath}" --date "${date}" --template "${templatePath}" --out "${filePath}" --host "${dbHost}" --port "${dbPort}" --dbname "${dbName}" --user "${dbUser}" --password "${dbPass}"`;

        log.debug('generateReportInternal: executing daily-status export script', {
          jobId, template_id, scriptPath, templatePath, date, outPath: filePath, dbHost, dbPort, dbName, dbUser, hasDbPass: !!dbPass,
        });
        const { execSync } = await import('child_process');
        execSync(cmd);
        log.info('generateReportInternal: daily-status export script completed', { jobId, filePath });
      } else {
        log.info('generateReportInternal: Master script not present, using ExcelJS fallback for daily-status', { jobId });
        records = await getRecordsForReport(template_id, parsedFilters);
        await generateExcelFile(template_id, records, parsedFilters, psName, filePath);
      }
    } else {
      if (template_id === 'district-compilation' || template_id === 'ops-compilation') {
        records = await getCompilationsForReport(parsedFilters);
      } else {
        records = await getRecordsForReport(template_id, parsedFilters);
      }
      await generateExcelFile(template_id, records, parsedFilters, psName, filePath);
    }
  }

  await db('report_jobs').where({ id: jobId }).update({
    status: 'READY',
    updated_at: new Date().toISOString()
  });
  log.info('generateReportInternal: report_jobs status -> READY', { jobId, template_id, filePath });

  const { publish } = await import('../../events/eventBus.js');
  const fileSizeBytes = fs.statSync(filePath).size;
  await publish('report.generated', {
    job_id: jobId,
    template_id,
    requested_by: userId,
    file_path: filePath,
    format,
    file_size_bytes: fileSizeBytes
  });
  log.info('generateReportInternal: exit — published report.generated', { jobId, template_id, format, fileSizeBytes });
};

export const getJobStatus = async (req, res) => {
  const { id } = req.params;
  log.debug('getJobStatus: enter', { jobId: id });

  try {
    const job = await db('report_jobs').where({ id }).first();
    if (!job) {
      log.debug('getJobStatus: not found', { jobId: id });
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'Report job not found'
      });
    }

    log.debug('getJobStatus: exit', { jobId: id, status: job.status });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: {
        job: {
          id: job.id,
          status: job.status,
          template_id: job.template_id,
          format: job.format,
          created_at: job.created_at
        },
        job_id: job.id,
        status: job.status,
        template_id: job.template_id,
        format: job.format,
        created_at: job.created_at
      }
    });
  } catch (error) {
    log.error('getJobStatus: failed', { jobId: id, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const downloadReport = async (req, res) => {
  const { id } = req.params;
  log.debug('downloadReport: enter', { jobId: id });

  try {
    const job = await db('report_jobs').where({ id }).first();
    if (!job) {
      log.warn('downloadReport: rejected — job not found', { jobId: id });
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'Report file is not ready or does not exist'
      });
    }

    const statusUpper = (job.status || '').toUpperCase();
    if (statusUpper !== 'READY' && statusUpper !== 'COMPLETED') {
      log.warn('downloadReport: rejected — job not READY', { jobId: id, status: job.status });
      return res.status(400).json({
        status: 'error',
        success: false,
        code: 'BAD_REQUEST',
        message: 'Report file is not ready'
      });
    }

    if (!fs.existsSync(job.file_path)) {
      log.error('downloadReport: rejected — READY job has no file on disk', { jobId: id, filePath: job.file_path });
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'Physical report file not found on disk'
      });
    }

    const filename = req.params.filename;
    const ext = job.format.toLowerCase();
    const finalExt = ext === 'excel' ? 'xlsx' : ext;

    let filterObj = {};
    try {
      filterObj = JSON.parse(job.filters || '{}');
    } catch (e) {}

    // Strip any date separator (dd/mm/yyyy or legacy yyyy-mm-dd) for filename safety.
    const stripSep = (s) => String(s).replace(/[/\-.]/g, '');
    let dateStr = '';
    if (filterObj.date) {
      dateStr = `_${stripSep(filterObj.date)}`;
    } else if (filterObj.dateFrom) {
      const from = stripSep(filterObj.dateFrom);
      const to = filterObj.dateTo ? `_to_${stripSep(filterObj.dateTo)}` : '';
      dateStr = `_${from}${to}`;
    } else if (filterObj.fromDate) {
      const from = stripSep(filterObj.fromDate);
      const to = filterObj.toDate ? `_to_${stripSep(filterObj.toDate)}` : '';
      dateStr = `_${from}${to}`;
    }

    let downloadFilename = filename || `Pharos_Report${dateStr}_${job.id}.${finalExt}`;
    // Ensure extension is correctly set
    if (!downloadFilename.endsWith(`.${finalExt}`)) {
      downloadFilename = `${downloadFilename}.${finalExt}`;
    }

    let contentType = 'text/csv';
    if (ext === 'pdf') {
      contentType = 'application/pdf';
    } else if (ext === 'excel' || ext === 'xlsx') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    log.info('downloadReport: exit — streaming file', { jobId: id, filePath: job.file_path, downloadFilename, contentType });
    return res.download(job.file_path, downloadFilename);
  } catch (error) {
    log.error('downloadReport: failed', { jobId: id, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const getReportsHistory = async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;
  const userId = req.user ? (req.user.userId || req.user.id) : null;
  log.debug('getReportsHistory: enter', { userId, page, limit });

  try {
    const countQuery = db('report_jobs').where({ created_by: userId });
    const totalRes = await countQuery.count('* as count').first();
    const total = parseInt(totalRes.count || 0, 10);

    const list = await db('report_jobs')
      .where({ created_by: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const formatted = list.map(j => ({
      id: j.id,
      job_id: j.id,
      template_id: j.template_id,
      format: j.format,
      status: j.status,
      created_at: j.created_at,
      completed_at: j.updated_at,
      filters: parseJsonField(j.filters)
    }));

    log.info('getReportsHistory: exit', { userId, page, limit, total, returned: formatted.length });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted,
      meta: { page, limit, total }
    });
  } catch (error) {
    log.error('getReportsHistory: failed', { userId, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const listSchedules = async (req, res) => {
  log.debug('listSchedules: enter');
  try {
    const list = await db('scheduled_reports').orderBy('created_at', 'desc');
    log.info('listSchedules: exit', { count: list.length });
    return res.status(200).json({
      status: 'success',
      data: list.map(item => ({
        ...item,
        filter_spec: typeof item.filter_spec === 'string' ? JSON.parse(item.filter_spec || '{}') : item.filter_spec,
        recipients: typeof item.recipients === 'string' ? JSON.parse(item.recipients || '[]') : item.recipients
      }))
    });
  } catch (error) {
    log.error('listSchedules: failed', { err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const createSchedule = async (req, res) => {
  const { template_id, cron_expr, filter_spec, format, scope_ps_id, scope_district_id, recipients, is_active } = req.body;
  log.debug('createSchedule: enter', { template_id, cron_expr, format, scope_ps_id, scope_district_id });

  if (!template_id || !cron_expr) {
    log.warn('createSchedule: rejected — template_id or cron_expr missing');
    return res.status(400).json({ status: 'error', message: 'template_id and cron_expr are required' });
  }

  try {
    const id = uuidv4();
    const row = {
      id,
      template_id,
      cron_expr,
      filter_spec: typeof filter_spec === 'string' ? filter_spec : JSON.stringify(filter_spec || {}),
      format: format || 'PDF',
      scope_ps_id: scope_ps_id || null,
      scope_district_id: scope_district_id || null,
      recipients: Array.isArray(recipients) ? JSON.stringify(recipients) : recipients || '[]',
      created_by: req.user ? (req.user.id || req.user.userId) : null,
      is_active: is_active !== undefined ? is_active : true,
      created_at: new Date().toISOString()
    };

    await db('scheduled_reports').insert(row);
    log.info('createSchedule: wrote scheduled_reports row', { scheduleId: id, template_id, cron_expr });

    // Reload job in scheduler
    const { reloadScheduledJob } = await import('./scheduler.js');
    await reloadScheduledJob(id);
    log.info('createSchedule: exit — reloaded scheduler job', { scheduleId: id, template_id });

    return res.status(201).json({
      status: 'success',
      data: {
        ...row,
        filter_spec: JSON.parse(row.filter_spec),
        recipients: JSON.parse(row.recipients)
      }
    });
  } catch (error) {
    log.error('createSchedule: failed', { template_id, err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const updateSchedule = async (req, res) => {
  const { id } = req.params;
  log.debug('updateSchedule: enter', { scheduleId: id });

  try {
    const updateData = {};
    if (req.body.template_id !== undefined) updateData.template_id = req.body.template_id;
    if (req.body.cron_expr !== undefined) updateData.cron_expr = req.body.cron_expr;
    if (req.body.format !== undefined) updateData.format = req.body.format;
    if (req.body.scope_ps_id !== undefined) updateData.scope_ps_id = req.body.scope_ps_id || null;
    if (req.body.scope_district_id !== undefined) updateData.scope_district_id = req.body.scope_district_id || null;
    if (req.body.is_active !== undefined) updateData.is_active = req.body.is_active;

    if (req.body.filter_spec !== undefined) {
      updateData.filter_spec = typeof req.body.filter_spec === 'string'
        ? req.body.filter_spec
        : JSON.stringify(req.body.filter_spec);
    }
    if (req.body.recipients !== undefined) {
      updateData.recipients = Array.isArray(req.body.recipients)
        ? JSON.stringify(req.body.recipients)
        : req.body.recipients;
    }

    await db('scheduled_reports').where({ id }).update(updateData);
    log.info('updateSchedule: wrote scheduled_reports row', { scheduleId: id, updatedFields: Object.keys(updateData) });

    const updated = await db('scheduled_reports').where({ id }).first();
    if (!updated) {
      log.warn('updateSchedule: rejected — schedule not found after update', { scheduleId: id });
      return res.status(404).json({ status: 'error', message: 'Scheduled report not found' });
    }

    // Reload job in scheduler
    const { reloadScheduledJob } = await import('./scheduler.js');
    await reloadScheduledJob(id);
    log.info('updateSchedule: exit — reloaded scheduler job', { scheduleId: id });

    return res.status(200).json({
      status: 'success',
      data: {
        ...updated,
        filter_spec: typeof updated.filter_spec === 'string' ? JSON.parse(updated.filter_spec || '{}') : updated.filter_spec,
        recipients: typeof updated.recipients === 'string' ? JSON.parse(updated.recipients || '[]') : updated.recipients
      }
    });
  } catch (error) {
    log.error('updateSchedule: failed', { scheduleId: id, err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const deleteSchedule = async (req, res) => {
  const { id } = req.params;
  log.debug('deleteSchedule: enter', { scheduleId: id });

  try {
    const existing = await db('scheduled_reports').where({ id }).first();
    if (!existing) {
      log.warn('deleteSchedule: rejected — schedule not found', { scheduleId: id });
      return res.status(404).json({ status: 'error', message: 'Scheduled report not found' });
    }

    await db('scheduled_reports').where({ id }).del();
    log.info('deleteSchedule: deleted scheduled_reports row', { scheduleId: id });

    // Stop job in scheduler
    const { stopScheduledJob } = await import('./scheduler.js');
    stopScheduledJob(id);
    log.info('deleteSchedule: exit — stopped scheduler job', { scheduleId: id });

    return res.status(200).json({ status: 'success', message: 'Scheduled report deleted successfully' });
  } catch (error) {
    log.error('deleteSchedule: failed', { scheduleId: id, err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const runScheduleNow = async (req, res) => {
  const { id } = req.params;
  log.debug('runScheduleNow: enter', { scheduleId: id });

  try {
    const schedule = await db('scheduled_reports').where({ id }).first();
    if (!schedule) {
      log.warn('runScheduleNow: rejected — schedule not found', { scheduleId: id });
      return res.status(404).json({ status: 'error', message: 'Scheduled report not found' });
    }

    const jobId = uuidv4();
    const reportsDir = process.env.REPORTS_DIR || './generated-reports';
    const fileName = `${jobId}.${schedule.format.toLowerCase() === 'excel' ? 'xlsx' : schedule.format.toLowerCase()}`;
    const filePath = path.join(reportsDir, fileName);

    await db('report_jobs').insert({
      id: jobId,
      template_id: schedule.template_id,
      filters: schedule.filter_spec,
      format: schedule.format.toUpperCase(),
      status: 'pending',
      file_path: filePath,
      created_by: req.user ? (req.user.id || req.user.userId) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    log.info('runScheduleNow: wrote report_jobs row (pending), triggering immediate run', { scheduleId: id, jobId });

    const parsedFilters = typeof schedule.filter_spec === 'string' ? JSON.parse(schedule.filter_spec) : schedule.filter_spec || {};
    if (schedule.scope_ps_id) parsedFilters.psId = schedule.scope_ps_id;
    if (schedule.scope_district_id) parsedFilters.districtId = schedule.scope_district_id;

    setImmediate(async () => {
      try {
        await generateReportInternal(jobId, schedule.template_id, parsedFilters, schedule.format.toUpperCase(), filePath, schedule.created_by);
        await db('scheduled_reports').where({ id }).update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'SUCCESS'
        });
        log.info('runScheduleNow: immediate execution succeeded', { scheduleId: id, jobId });
      } catch (err) {
        log.error('runScheduleNow: immediate execution failed', { scheduleId: id, jobId, err });
        await db('scheduled_reports').where({ id }).update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'FAILED'
        });
      }
    });

    log.debug('runScheduleNow: exit — triggered async', { scheduleId: id, jobId });
    return res.status(200).json({ status: 'success', data: { job_id: jobId, message: 'Scheduled report triggered successfully' } });
  } catch (error) {
    log.error('runScheduleNow: failed', { scheduleId: id, err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getAdminStats = async (req, res) => {
  log.debug('getAdminStats: enter');
  try {
    const todayStr = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

    const usersCount = await db('users').where({ is_active: true }).count('* as count').first();
    const psCount = await db('hierarchy_nodes').where({ node_type: 'PS', is_active: true }).count('* as count').first();
    const recordsCount = await db('records').where('created_at', '>=', todayStr).count('* as count').first();
    const reportsCount = await db('report_jobs').where({ status: 'PENDING' }).orWhere({ status: 'pending' }).count('* as count').first();

    const stats = {
      total_users: parseInt(usersCount.count || 0, 10),
      total_ps: parseInt(psCount.count || 0, 10),
      records_today: parseInt(recordsCount.count || 0, 10),
      pending_reports: parseInt(reportsCount.count || 0, 10),
      system_status: "ok"
    };

    log.info('getAdminStats: exit', { stats });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: stats
    });
  } catch (error) {
    log.error('getAdminStats: failed', { err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const getFields = async (req, res) => {
  const { record_type } = req.query;
  log.debug('getFields: enter', { record_type });

  if (!record_type) {
    log.warn('getFields: rejected — record_type query param missing');
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'record_type query parameter is required'
    });
  }

  try {
    const filterTypes = record_type.split(',').map(s => s.trim().toUpperCase());

    const allFields = await db('field_registry')
      .where('is_active', true)
      .orderBy('sort_order', 'asc');

    const filtered = allFields.filter(f => {
      let types = [];
      try {
        types = typeof f.applicable_record_types === 'string'
          ? JSON.parse(f.applicable_record_types)
          : f.applicable_record_types;
      } catch (e) {
        types = [f.applicable_record_types];
      }
      return Array.isArray(types) && types.some(t => filterTypes.includes(t.toUpperCase()));
    }).map(f => {
      let recTypes = [];
      try {
        recTypes = typeof f.applicable_record_types === 'string' 
          ? JSON.parse(f.applicable_record_types) 
          : f.applicable_record_types;
      } catch (e) {
        recTypes = [f.applicable_record_types];
      }
      
      return {
        field_key: f.field_key,
        label_en: f.label_en,
        label_hi: f.label_hi,
        field_type: f.field_type,
        section: f.section || 'General Details',
        applicable_record_types: recTypes
      };
    });

    log.info('getFields: exit', { record_type, count: filtered.length });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: {
        fields: filtered
      }
    });
  } catch (error) {
    log.error('getFields: failed', { record_type, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};


export const traceRecord = async (req, res) => {
  try {
    const { recordId } = req.params;
    const result = await traceRecordThroughReports(recordId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    log.error('traceRecord failed', { err: error.message });
    return res.status(400).json({ success: false, message: error.message });
  }
};



