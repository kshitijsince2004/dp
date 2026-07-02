import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer';
import ExcelJS from 'exceljs';
import { publish } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';
import { toISO, toDMY } from '../../utils/dateFormat.js';

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
  { id: "dd-ndps-action",                 name_en: "Daily Diary: NDPS Action",               name_hi: "एनडीपीएस कार्रवाई",                     format: ["excel"], applicable_record_types: ["CASE","ARREST"],                    template_type: "DAILY_DIARY_PARALLEL" }
];

export const getTemplates = async (req, res) => {
  const userId = req.user ? (req.user.userId || req.user.id) : null;
  const { record_type, template_type } = req.query;

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
        name_en: t.name_en,
        name_hi: t.name_hi,
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

    if (record_type) {
      const filterTypes = record_type.split(',').map(s => s.trim().toUpperCase());
      formatted = formatted.filter(t =>
        t.applicable_record_types.some(rt => filterTypes.includes(rt.toUpperCase()))
      );
    }

    return res.status(200).json({
      status: 'success',
      success: true,
      data: { templates: formatted }
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: err.message
    });
  }
};

const getRecordsForReport = async (templateId, filters) => {
  let recordType = null;
  if (templateId === 'arrest-summary') recordType = 'ARREST';
  else if (templateId === 'pcr-call-log') recordType = 'PCR_CALL';
  else if (templateId === 'cases-register') recordType = 'CASE';

  let query = db('records')
    .select('records.*', 'ps.name_en as ps_name', 'dist.name_en as district_name')
    .leftJoin('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .leftJoin('hierarchy_nodes as dist', 'records.district_id', 'dist.id');

  if (recordType) {
    query = query.where('records.record_type', recordType);
  }

  const psId = filters.psId || filters.station_id;
  const districtId = filters.districtId || filters.district_id;
  const from = toISO(filters.from || filters.dateFrom || filters.from_date);
  const to = toISO(filters.to || filters.dateTo || filters.to_date);

  if (psId) query = query.where('records.ps_id', psId);
  if (districtId) query = query.where('records.district_id', districtId);
  if (from) query = query.where('records.record_date', '>=', from);
  if (to) query = query.where('records.record_date', '<=', to);

  // Dynamic user data filters from request parameters
  const systemKeys = new Set([
    'psId', 'station_id', 'districtId', 'district_id',
    'from', 'dateFrom', 'from_date', 'to', 'dateTo', 'to_date',
    'selected_sub_templates', 'page', 'limit'
  ]);

  for (const [key, val] of Object.entries(filters)) {
    if (systemKeys.has(key) || val === undefined || val === null || val === '') {
      continue;
    }
    const coreColumns = ['id', 'current_status', 'current_level'];
    if (coreColumns.includes(key)) {
      query = query.where(`records.${key}`, val);
    } else {
      query = query.whereRaw("records.data @> ?::jsonb", [JSON.stringify({ [key]: val })]);
    }
  }

  const results = await query.orderBy('records.record_date', 'desc');
  return results.map(r => ({
    ...r,
    data: parseJsonField(r.data)
  }));
};

const getCompilationsForReport = async (filters) => {
  let query = db('compilations')
    .select('compilations.*', 'dist.name_en as district_name')
    .leftJoin('hierarchy_nodes as dist', 'compilations.source_entity_id', 'dist.id');

  const districtId = filters.districtId || filters.district_id;
  if (districtId) query = query.where('compilations.source_entity_id', districtId);

  const results = await query.orderBy('compilations.period', 'desc');
  return results.map(c => ({
    ...c,
    compiled_summary: parseJsonField(c.compiled_summary)
  }));
};

async function generatePDF(htmlContent) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return pdfBuffer;
}

async function generateExcelFile(template_id, records, parsedFilters, psName, filePath) {
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
}

const validateCustomDefinition = async (custom_definition) => {
  if (!custom_definition || !Array.isArray(custom_definition.sheets)) {
    throw new Error('Invalid custom report definition: sheets must be an array');
  }
  for (const sheet of custom_definition.sheets) {
    const { record_type, field_keys } = sheet;
    if (!record_type || !Array.isArray(field_keys)) {
      throw new Error('Invalid sheet definition: record_type and field_keys (array) are required');
    }
    
    // Validate record_type enum
    const validTypes = ['ARREST', 'PCR_CALL', 'CASE'];
    if (!validTypes.includes(record_type)) {
      throw new Error(`Invalid record type '${record_type}'. Allowed types: ${validTypes.join(', ')}`);
    }

    const registered = await db('field_registry')
      .whereIn('field_key', field_keys)
      .andWhere('is_active', true);
    
    const registeredKeys = registered.map(r => r.field_key);
    for (const key of field_keys) {
      if (!registeredKeys.includes(key)) {
        throw new Error(`Field key '${key}' does not exist or is inactive in the field registry`);
      }
    }
  }
};

export const generateReport = async (req, res) => {
  const { template_id, custom_definition, filters, format, selected_sub_templates } = req.body;

  if (!template_id && !custom_definition) {
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'Either template_id or custom_definition is required'
    });
  }

  if (!format) {
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'format is required'
    });
  }

  let selectedTemplate = null;
  if (template_id) {
    selectedTemplate = await db('report_templates').where({ id: template_id, is_active: true }).first();
    if (!selectedTemplate) {
      const memTemplate = templates.find(t => t.id === template_id);
      if (!memTemplate) {
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
        template_definition: JSON.stringify({})
      };
    }
  }

  // Validate custom field_keys exist in field_registry
  if (!template_id && custom_definition) {
    try {
      await validateCustomDefinition(custom_definition);
    } catch (err) {
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
    return res.status(403).json({
      status: 'error',
      success: false,
      code: 'FORBIDDEN',
      message: 'Cannot generate reports outside your PS'
    });
  }

  if (req.user?.role === 'DISTRICT_OFFICER' && filterDistrictId && filterDistrictId !== userDistrictId) {
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
    }

    const filePath = path.join(reportsDir, `${jobId}.${ext}`);
    const userId = req.user ? (req.user.userId || req.user.id) : null;

    await db('report_jobs').insert({
      id: jobId,
      template_id: template_id || null,
      custom_definition: custom_definition ? JSON.stringify(custom_definition) : null,
      filters: JSON.stringify(filters || {}),
      format: fmt,
      status: 'PENDING',
      file_path: filePath,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Hand off to Python worker via RabbitMQ
    await publish('report.requested', {
      job_id: jobId,
      template_id: template_id || null,
      custom_definition: custom_definition || null,
      filters: filters || {},
      format: fmt,
      selected_sub_templates: selected_sub_templates || null,
      user_id: userId
    });

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
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const generateReportInternal = async (jobId, template_id, parsedFilters, format, filePath, userId) => {
  let records = [];
  let psName = 'All jurisdictions';

  if (parsedFilters.psId || parsedFilters.station_id) {
    const psNode = await db('hierarchy_nodes').where({ id: parsedFilters.psId || parsedFilters.station_id }).first();
    if (psNode) psName = psNode.name_en;
  } else if (parsedFilters.districtId || parsedFilters.district_id) {
    const distNode = await db('hierarchy_nodes').where({ id: parsedFilters.districtId || parsedFilters.district_id }).first();
    if (distNode) psName = distNode.name_en;
  }

  const fmt = format.toUpperCase();

  if (fmt === 'PDF') {
    const templatePath = path.resolve('src/modules/reports/templates', `${template_id}.html`);
    let html;
    if (fs.existsSync(templatePath)) {
      html = fs.readFileSync(templatePath, 'utf8');
    } else {
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

  } else if (fmt === 'CSV') {
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

  } else if (fmt === 'EXCEL' || fmt === 'XLSX') {
    if (template_id === 'daily-status') {
      const date = toISO(parsedFilters.from || parsedFilters.dateFrom) || new Date().toISOString().split('T')[0];
      const templatePath = path.resolve(__dirname, '../../../../Master/Daily_Diary_ProperHeaders.xlsx');
      const scriptPath = path.resolve(__dirname, '../../../../Master/files/export_daily_report.py');
      
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
      
      console.log(`[generateReportInternal] Executing custom daily report script: ${cmd}`);
      const { execSync } = await import('child_process');
      execSync(cmd);
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

  const { publish } = await import('../../events/eventBus.js');
  await publish('report.generated', {
    job_id: jobId,
    template_id,
    requested_by: userId,
    file_path: filePath,
    format,
    file_size_bytes: fs.statSync(filePath).size
  });
};

export const getJobStatus = async (req, res) => {
  const { id } = req.params;

  try {
    const job = await db('report_jobs').where({ id }).first();
    if (!job) {
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'Report job not found'
      });
    }

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
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const downloadReport = async (req, res) => {
  const { id } = req.params;

  try {
    const job = await db('report_jobs').where({ id }).first();
    if (!job) {
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'Report file is not ready or does not exist'
      });
    }

    if (job.status.toUpperCase() !== 'READY') {
      return res.status(400).json({
        status: 'error',
        success: false,
        code: 'BAD_REQUEST',
        message: 'Report file is not ready'
      });
    }

    if (!fs.existsSync(job.file_path)) {
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
    return res.download(job.file_path, downloadFilename);
  } catch (error) {
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

  try {
    const userId = req.user ? (req.user.userId || req.user.id) : null;
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

    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted,
      meta: { page, limit, total }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const listSchedules = async (req, res) => {
  try {
    const list = await db('scheduled_reports').orderBy('created_at', 'desc');
    return res.status(200).json({
      status: 'success',
      data: list.map(item => ({
        ...item,
        filter_spec: typeof item.filter_spec === 'string' ? JSON.parse(item.filter_spec || '{}') : item.filter_spec,
        recipients: typeof item.recipients === 'string' ? JSON.parse(item.recipients || '[]') : item.recipients
      }))
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const createSchedule = async (req, res) => {
  const { template_id, cron_expr, filter_spec, format, scope_ps_id, scope_district_id, recipients, is_active } = req.body;

  if (!template_id || !cron_expr) {
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

    // Reload job in scheduler
    const { reloadScheduledJob } = await import('./scheduler.js');
    await reloadScheduledJob(id);

    return res.status(201).json({
      status: 'success',
      data: {
        ...row,
        filter_spec: JSON.parse(row.filter_spec),
        recipients: JSON.parse(row.recipients)
      }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const updateSchedule = async (req, res) => {
  const { id } = req.params;

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

    const updated = await db('scheduled_reports').where({ id }).first();
    if (!updated) {
      return res.status(404).json({ status: 'error', message: 'Scheduled report not found' });
    }

    // Reload job in scheduler
    const { reloadScheduledJob } = await import('./scheduler.js');
    await reloadScheduledJob(id);

    return res.status(200).json({
      status: 'success',
      data: {
        ...updated,
        filter_spec: typeof updated.filter_spec === 'string' ? JSON.parse(updated.filter_spec || '{}') : updated.filter_spec,
        recipients: typeof updated.recipients === 'string' ? JSON.parse(updated.recipients || '[]') : updated.recipients
      }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const deleteSchedule = async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await db('scheduled_reports').where({ id }).first();
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Scheduled report not found' });
    }

    await db('scheduled_reports').where({ id }).del();

    // Stop job in scheduler
    const { stopScheduledJob } = await import('./scheduler.js');
    stopScheduledJob(id);

    return res.status(200).json({ status: 'success', message: 'Scheduled report deleted successfully' });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const runScheduleNow = async (req, res) => {
  const { id } = req.params;

  try {
    const schedule = await db('scheduled_reports').where({ id }).first();
    if (!schedule) {
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
      } catch (err) {
        logger.error('[RunScheduleNow] Immediate execution failed:', err.message);
        await db('scheduled_reports').where({ id }).update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'FAILED'
        });
      }
    });

    return res.status(200).json({ status: 'success', data: { job_id: jobId, message: 'Scheduled report triggered successfully' } });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getAdminStats = async (req, res) => {
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

    return res.status(200).json({
      status: 'success',
      success: true,
      data: stats
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const getFields = async (req, res) => {
  const { record_type } = req.query;

  if (!record_type) {
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

    return res.status(200).json({
      status: 'success',
      success: true,
      data: {
        fields: filtered
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

