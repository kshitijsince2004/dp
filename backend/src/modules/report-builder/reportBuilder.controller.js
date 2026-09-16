/**
 * PHAROS Report Builder — Controller
 * ====================================
 * Implements all custom report builder endpoints.
 * All dynamic queries go through the whitelisted queryEngine.js — never raw SQL.
 * All report runs and exports are audit-logged to report_builder_audit.
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import db from '../../config/db.js';
import { logger } from '../../utils/logger.js';
import {
  ALLOWED_TABLES,
  ALLOWED_JOINS,
  REPORTABLE_FIELDS,
  GROUP_LABELS,
  filterFieldsForRole,
} from './reportableFields.config.js';
import {
  validateQuerySpec,
  executeSingleTableQuery,
  executeJoinedQuery,
  executeMissingUidbCrossMatch,
} from './queryEngine.js';
import { runPivotReport } from '../warehouse/pivot-engine.js';
import { resolveUserScope } from '../warehouse/warehouse.controller.js';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const parseJson = (val, fallback) => {
  if (!val) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
};

const userId = (req) => req.user?.userId || req.user?.id || null;
const userRole = (req) => req.user?.role || 'HC';

/**
 * Write a row to report_builder_audit.
 * Non-blocking — errors are logged but not thrown to the caller.
 */
async function writeAuditLog(entry) {
  try {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let userIdVal = entry.user_id;
    let validUser = false;
    if (userIdVal && typeof userIdVal === 'string' && UUID_RE.test(userIdVal)) {
      const u = await db('users').where({ id: userIdVal }).first();
      if (u) validUser = true;
    }
    if (!validUser) {
      const fallback = await db('users').select('id').first();
      userIdVal = fallback ? fallback.id : null;
    }

    let validJobId = null;
    if (entry.job_id && typeof entry.job_id === 'string' && UUID_RE.test(entry.job_id)) {
      const jobRow = await db('report_jobs').where({ id: entry.job_id }).first();
      if (jobRow) validJobId = entry.job_id;
    }

    await db('report_builder_audit').insert({
      id: uuidv4(),
      user_id: userIdVal,
      user_role: entry.user_role || 'HC',
      run_type: entry.run_type || 'QUERY',
      table_spec: JSON.stringify(entry.table_spec || ''),
      fields_spec: JSON.stringify(entry.fields_spec || []),
      filter_spec: JSON.stringify(entry.filter_spec || {}),
      format: entry.format || null,
      row_count: entry.row_count || 0,
      job_id: validJobId,
      ip_address: entry.ip_address || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[ReportBuilderAudit] Failed to write audit log: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/builder/metadata
// Returns the full field dictionary for all reportable tables.
// Response is filtered for the requesting user's role (PII gating).
// ─────────────────────────────────────────────────────────────────────────────
export const getMetadata = async (req, res) => {
  try {
    const role = userRole(req);

    const tables = {};
    for (const [tableKey, fields] of Object.entries(REPORTABLE_FIELDS)) {
      if (tableKey === '_SYSTEM') continue;
      const filtered = filterFieldsForRole(fields, role).map(f => ({
        key: f.key,
        label_en: f.label_en,
        label_hi: f.label_hi,
        data_type: f.data_type,
        operators: f.operators,
        options: f.options || null,
        is_pii: f.is_pii,
        join_key: f.join_key || false,
        group: f.group || null,
      }));

      // Collapse group labels actually present (after PII filtering) into a lookup for this table
      const groupKeysPresent = new Set(filtered.filter(f => f.group).map(f => f.group));
      const groups = Array.from(groupKeysPresent).map(groupKey => ({
        key: groupKey,
        label_en: GROUP_LABELS[`${tableKey}.${groupKey}`]?.label_en || groupKey,
        label_hi: GROUP_LABELS[`${tableKey}.${groupKey}`]?.label_hi || groupKey,
      }));

      tables[tableKey] = {
        record_type: tableKey,
        label_en: { CASE: 'FIR Master', ARREST: 'Arrest / Person Master', PCR_CALL: 'PCR', MISSING: 'Missing Person Master', UIDB: 'UIDB Master' }[tableKey] || tableKey,
        fields: filtered,
        groups,
        system_fields: filterFieldsForRole(REPORTABLE_FIELDS._SYSTEM, role).map(f => ({
          key: f.key, label_en: f.label_en, label_hi: f.label_hi, data_type: f.data_type, operators: f.operators
        })),
      };
    }

    const joins = Object.entries(ALLOWED_JOINS).map(([key, def]) => ({
      key,
      tables: def.tables,
      label_en: def.label_en,
      label_hi: def.label_hi,
      join_on: def.join_on,
    }));

    const { ROW_GRAIN_OPTIONS, SYSTEM_PRESET_SPECS } = await import('./reportableFields.config.js');

    return res.status(200).json({
      success: true,
      data: {
        tables,
        joins,
        allowed_tables: ALLOWED_TABLES,
        row_grain_options: ROW_GRAIN_OPTIONS,
        preset_specs: SYSTEM_PRESET_SPECS,
      }
    });
  } catch (err) {
    logger.error(`[ReportBuilder] getMetadata error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reports/builder/query
// Body: { table, join?, fields[], filters?, sort?, page?, pageSize? }
// Returns paginated rows (preview mode — no file generation).
// ─────────────────────────────────────────────────────────────────────────────
export const runQuery = async (req, res) => {
  try {
    const spec = req.body;
    const role = userRole(req);
    const uid = userId(req);
    const jurisdictionQuery = req.jurisdictionQuery || {};
    const ip = req.ip || req.headers?.['x-forwarded-for'] || null;

    // Quick validation before query
    const { ok, errors } = validateQuerySpec(spec, role);
    if (!ok) {
      return res.status(400).json({ success: false, message: errors.join('; '), errors });
    }

    let result;
    if (spec.join) {
      result = await executeJoinedQuery(spec, jurisdictionQuery, role);
    } else {
      result = await executeSingleTableQuery(spec, jurisdictionQuery, role);
    }

    // Audit log (non-blocking)
    writeAuditLog({
      user_id: uid, user_role: role, run_type: 'PREVIEW',
      table_spec: spec.join ? `${spec.table}+${spec.join}` : spec.table,
      fields_spec: spec.fields, filter_spec: spec.filters,
      row_count: result.total, ip_address: ip,
    });

    return res.status(200).json({
      success: true,
      data: result.rows,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total }
    });
  } catch (err) {
    logger.error(`[ReportBuilder] runQuery error: ${err.message}`);
    return res.status(err.message.startsWith('Query validation') ? 400 : 500).json({
      success: false, message: err.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reports/builder/export
// Body: { table, join?, fields[], filters?, sort?, format: 'csv'|'xlsx'|'pdf' }
// Queues async export job, returns job_id immediately.
// ─────────────────────────────────────────────────────────────────────────────
export const startExport = async (req, res) => {
  try {
    const spec = req.body;
    const format = (spec.format || 'csv').toLowerCase();
    const role = userRole(req);
    const uid = userId(req);
    const ip = req.ip || req.headers?.['x-forwarded-for'] || null;

    if (!['csv', 'xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({ success: false, message: 'format must be csv, xlsx, or pdf' });
    }

    // Validate spec before queuing
    const { ok, errors } = validateQuerySpec(spec, role);
    if (!ok) {
      return res.status(400).json({ success: false, message: errors.join('; '), errors });
    }

    const jobId = uuidv4();
    const reportsDir = process.env.REPORTS_DIR || './generated-reports';
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const ext = format === 'xlsx' ? 'xlsx' : format;
    const fileName = `rb_${jobId}.${ext}`;
    const filePath = path.join(reportsDir, fileName);

    const templateCode = `BUILDER_${(spec.table || 'UNKNOWN')}`;
    let template = await db('report_templates').where({ code: templateCode }).first();
    if (!template) {
      const newId = uuidv4();
      await db('report_templates').insert({
        id: newId,
        code: templateCode,
        name: `Custom Report: ${spec.table || 'UNKNOWN'}`,
        record_types: JSON.stringify([spec.table || 'CASE']),
        levels: JSON.stringify(['HQ']),
        template_definition: JSON.stringify({}),
        output_formats: JSON.stringify(['CSV', 'EXCEL', 'PDF']),
        is_active: true,
      });
      template = { id: newId };
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let creatorId = uid;
    let validCreator = false;
    if (creatorId && typeof creatorId === 'string' && UUID_RE.test(creatorId)) {
      const u = await db('users').where({ id: creatorId }).first();
      if (u) validCreator = true;
    }
    if (!validCreator) {
      const fallbackUser = await db('users').select('id').first();
      creatorId = fallbackUser ? fallbackUser.id : null;
    }

    // Insert job record (reuse existing report_jobs table with valid UUIDs)
    await db('report_jobs').insert({
      id: jobId,
      template_id: template.id,
      filters: JSON.stringify({ spec }),
      format: format.toUpperCase(),
      status: 'PENDING',
      file_path: filePath,
      created_by: creatorId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Start async export (non-blocking)
    const jurisdictionQuery = req.jurisdictionQuery || {};
    setImmediate(async () => {
      try {
        await runExportJob(jobId, spec, jurisdictionQuery, role, format, filePath, uid, ip);
      } catch (err) {
        logger.error(`[ReportBuilderExport] Job ${jobId} failed: ${err.message}`);
        await db('report_jobs').where({ id: jobId }).update({
          status: 'FAILED',
          error_message: String(err.message || 'Export execution failed').slice(0, 1000),
          updated_at: new Date().toISOString()
        });
      }
    });

    return res.status(201).json({
      success: true,
      data: { job_id: jobId, status: 'PENDING', format }
    });
  } catch (err) {
    logger.error(`[ReportBuilder] startExport error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Build Form Section Column list for a selected fields array.
 * Groups fields belonging to the same form section under ONE section column header,
 * and formats all member field data strategically inside each cell.
 */
function buildSectionConsolidatedHeaders(fields, tables, userRoleStr, rowGrain = 'per_fir') {
  const tablesToSearch = Array.isArray(tables) ? tables : [tables];
  const systemFieldDefs = filterFieldsForRole(REPORTABLE_FIELDS._SYSTEM || [], userRoleStr);

  const sectionGroupsMap = new Map(); // fullGroupKey -> { groupKey, label, isGroup, memberFields: [] }

  for (const fieldRef of fields) {
    const { field, table: fTable } = typeof fieldRef === 'string'
      ? { field: fieldRef, table: tablesToSearch[0] }
      : fieldRef;
    const t = fTable || tablesToSearch[0];

    if (field.startsWith('_')) {
      const def = systemFieldDefs.find(f => f.key === field);
      const label = def ? def.label_en : field;
      sectionGroupsMap.set(`sys__${field}`, {
        groupKey: field,
        label: label,
        isGroup: false,
        memberFields: [{ colKey: field, label_en: label, key: field }]
      });
    } else {
      const tableDefs = filterFieldsForRole(REPORTABLE_FIELDS[t] || [], userRoleStr);
      const def = tableDefs.find(f => f.key === field);
      const colKey = tablesToSearch.length > 1 ? `${t}__${field}` : field;

      const groupKey = def?.group;

      const isGrainSection = (
        (rowGrain === 'per_accused' && (groupKey === 'accused' || groupKey?.startsWith('accused_') || field.startsWith('accused_'))) ||
        (rowGrain === 'per_victim' && (groupKey === 'victim' || groupKey?.startsWith('victim_') || field.startsWith('victim_'))) ||
        (rowGrain === 'per_property' && (groupKey === 'property_details' || field.startsWith('property_') || field.includes('value')))
      );

      if (groupKey && !isGrainSection) {
        const fullGroupKey = `${t}.${groupKey}`;
        const groupLabel = GROUP_LABELS[fullGroupKey]?.label_en || groupKey;

        if (!sectionGroupsMap.has(fullGroupKey)) {
          sectionGroupsMap.set(fullGroupKey, {
            groupKey: fullGroupKey,
            label: groupLabel,
            isGroup: true,
            memberFields: []
          });
        }
        sectionGroupsMap.get(fullGroupKey).memberFields.push({
          colKey,
          key: field,
          label_en: def ? def.label_en : field
        });
      } else {
        const cleanLabel = def ? def.label_en : field;
        sectionGroupsMap.set(`single__${colKey}`, {
          groupKey: colKey,
          label: cleanLabel,
          isGroup: false,
          memberFields: [{ colKey, key: field, label_en: cleanLabel }]
        });
      }
    }
  }

  return Array.from(sectionGroupsMap.values());
}

/** Strategically format all member field data inside a section column cell. */
function formatSectionCell(row, groupDef, rowGrain = 'per_fir') {
  if (!groupDef.isGroup) {
    const member = groupDef.memberFields[0];
    const val = row[member.colKey];
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch { return String(val); }
    }
    return String(val);
  }

  const fullKey = groupDef.groupKey || '';
  if (fullKey.includes('accused') && row._compiled_accused && rowGrain !== 'per_accused') {
    return row._compiled_accused;
  }
  if (fullKey.includes('victim') && row._compiled_victim && rowGrain !== 'per_victim') {
    return row._compiled_victim;
  }
  if (fullKey.includes('property') && row._compiled_property && rowGrain !== 'per_property') {
    return row._compiled_property;
  }

  // Address Compilation Helper: merges micro-address components into a single line
  const addressParts = [];
  const standardParts = [];

  for (const member of groupDef.memberFields) {
    const val = row[member.colKey];
    if (val !== null && val !== undefined && val !== '' && val !== 'N/A' && val !== 'NA') {
      const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);

      // Check if this is a micro-address field (house no, street, colony, city, landmark, district, pincode, state)
      const keyLower = member.key.toLowerCase();
      if (keyLower.includes('house_no') || keyLower.includes('street') || keyLower.includes('colony') ||
          keyLower.includes('landmark') || keyLower.includes('city_town') || keyLower.includes('tehsil') ||
          keyLower.includes('present_address') || keyLower.includes('pincode')) {
        addressParts.push(displayVal);
      } else {
        standardParts.push(`${member.label_en}: ${displayVal}`);
      }
    }
  }

  const parts = [];
  if (addressParts.length > 0) {
    parts.push(`Address: ${addressParts.join(', ')}`);
  }
  parts.push(...standardParts);

  if (parts.length === 0) return '—';
  return parts.join(' \n'); // Separated strategically with newlines
}

async function runExportJob(jobId, spec, jurisdictionQuery, role, format, filePath, uid, ip) {
  const exportSpec = { ...spec, page: 1, pageSize: 50000 };

  let result;
  if (spec.join) {
    result = await executeJoinedQuery(exportSpec, jurisdictionQuery, role);
  } else {
    result = await executeSingleTableQuery(exportSpec, jurisdictionQuery, role);
  }

  const { rows } = result;
  const tables = spec.join ? [spec.table, spec.join] : [spec.table];
  const rowGrain = spec.row_grain || 'per_fir';
  const sectionHeaders = buildSectionConsolidatedHeaders(spec.fields || [], tables, role, rowGrain);

  if (format === 'csv') {
    await generateCsv(rows, sectionHeaders, filePath, rowGrain);
  } else if (format === 'xlsx') {
    await generateXlsx(rows, sectionHeaders, spec, filePath, rowGrain);
  } else if (format === 'pdf') {
    await generatePdf(rows, sectionHeaders, spec, filePath);
  }

  await db('report_jobs').where({ id: jobId }).update({
    status: 'READY', updated_at: new Date().toISOString()
  });

  await writeAuditLog({
    user_id: uid, user_role: role, run_type: 'EXPORT',
    table_spec: spec.join ? `${spec.table}+${spec.join}` : spec.table,
    fields_spec: spec.fields, filter_spec: spec.filters,
    format: format.toUpperCase(), row_count: rows.length,
    job_id: jobId, ip_address: ip,
  });

  logger.info(`[ReportBuilderExport] Job ${jobId} complete — ${rows.length} rows, format=${format}`);
}

async function generateCsv(rows, sectionHeaders, filePath, rowGrain = 'per_fir') {
  const colLabels = sectionHeaders.map(h => h.label);
  const lines = [colLabels.map(l => `"${String(l).replace(/"/g, '""')}"`).join(',')];
  for (const row of rows) {
    const cells = sectionHeaders.map(groupDef => {
      const formatted = formatSectionCell(row, groupDef, rowGrain);
      return `"${formatted.replace(/"/g, '""')}"`;
    });
    lines.push(cells.join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

async function generateXlsx(rows, sectionHeaders, spec, filePath, rowGrain = 'per_fir') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PHAROS Executive Report Command Center';
  wb.created = new Date();
  const ws = wb.addWorksheet('Form Section Register Report');

  // Title Block Header
  const titleRow = ws.addRow([`PHAROS OFFICIAL REGISTER REPORT — ${spec.table}${spec.join ? ` + ${spec.join}` : ''} [Grain: ${rowGrain}]`]);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  ws.mergeCells(1, 1, 1, Math.max(sectionHeaders.length, 4));

  const metaRow = ws.addRow([`Generated: ${new Date().toLocaleString()} | Total Records: ${rows.length} | Row Grain: ${rowGrain}`]);
  metaRow.font = { italic: true, size: 10, color: { argb: 'FF475569' } };

  ws.addRow([]); // Spacing

  // Form Section Column Header Row
  const headerRow = ws.addRow(sectionHeaders.map(h => h.label));
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } }; // Vivid Blue Header
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 32;

  // Thin Border Style for data preservation
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'CBD5E1' } },
    left: { style: 'thin', color: { argb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
    right: { style: 'thin', color: { argb: 'CBD5E1' } },
  };

  // Data rows
  let rIdx = 0;
  for (const row of rows) {
    const rowValues = sectionHeaders.map(groupDef => formatSectionCell(row, groupDef, rowGrain));

    const addedRow = ws.addRow(rowValues);
    
    // Auto-calculate line count for height padding
    let maxLinesInRow = 1;
    rowValues.forEach(val => {
      const lineCount = String(val).split('\n').length;
      if (lineCount > maxLinesInRow) maxLinesInRow = lineCount;
    });
    addedRow.height = Math.max(24, maxLinesInRow * 18);

    const isEven = rIdx % 2 === 0;
    const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    addedRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      cell.border = thinBorder;
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.font = { size: 10, color: { argb: 'FF1E293B' } };
    });

    rIdx++;
  }

  // Strategic Auto-Column Width Calculation
  ws.columns.forEach((col, cIdx) => {
    if (cIdx >= sectionHeaders.length) return;
    let maxLen = sectionHeaders[cIdx] ? sectionHeaders[cIdx].label.length : 20;
    col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber <= 3) return; // Skip title block
      const cellLines = String(cell.value || '').split('\n');
      cellLines.forEach(l => {
        if (l.length > maxLen) maxLen = l.length;
      });
    });
    col.width = Math.max(Math.min(maxLen + 4, 75), 24);
  });

  await wb.xlsx.writeFile(filePath);
}

async function generatePdf(rows, headers, spec, filePath) {
  const tableRows = rows.slice(0, 5000); // PDF limit
  const thead = headers.map(h => `<th>${h.label}</th>`).join('');
  const tbody = tableRows.map(row =>
    `<tr>${headers.map(h => `<td>${row[h.key] ?? ''}</td>`).join('')}</tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>PHAROS Custom Report</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; color: #1a1a2e; }
  h1 { color: #1a3c6b; font-size: 18px; border-bottom: 2px solid #1a3c6b; padding-bottom: 8px; }
  .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
  th { background: #1a3c6b; color: white; padding: 6px 8px; text-align: left; }
  td { border: 1px solid #ddd; padding: 5px 8px; }
  tr:nth-child(even) { background: #f5f8ff; }
</style>
</head>
<body>
<h1>PHAROS CUSTOM REPORT — ${spec.table}${spec.join ? ` + ${spec.join}` : ''}</h1>
<div class="meta">
  <p>Generated: ${new Date().toLocaleString()} | Total rows: ${rows.length}${tableRows.length < rows.length ? ` (showing first ${tableRows.length})` : ''}</p>
  <p>Filters: ${spec.filters ? JSON.stringify(spec.filters) : 'None'}</p>
</div>
<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
</body></html>`;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuf = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
  await browser.close();
  fs.writeFileSync(filePath, pdfBuf);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/builder/export/:jobId
// Poll status or download a completed export.
// ─────────────────────────────────────────────────────────────────────────────
export const getExportStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await db('report_jobs').where({ id: jobId }).first();
    if (!job) {
      return res.status(404).json({ success: false, message: 'Export job not found' });
    }

    const status = job.status?.toUpperCase();

    if (status !== 'READY') {
      return res.status(200).json({
        success: true,
        data: { job_id: jobId, status: status || 'PENDING', format: job.format }
      });
    }

    // If ready, stream the file
    if (!fs.existsSync(job.file_path)) {
      return res.status(404).json({ success: false, message: 'Export file not found on disk' });
    }

    const ext = (job.format || 'CSV').toLowerCase();
    const mimeMap = { csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const filename = `PHAROS_Report_${jobId}.${ext === 'xlsx' ? 'xlsx' : ext}`;

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.download(job.file_path, filename);
  } catch (err) {
    logger.error(`[ReportBuilder] getExportStatus error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/builder/saved
// List saved report templates for the current user.
// ─────────────────────────────────────────────────────────────────────────────
export const listSavedReports = async (req, res) => {
  try {
    const uid = userId(req);
    const role = userRole(req);
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 20, 10);
    const offset = (page - 1) * limit;

    // HQ+ can see shared templates; others see only their own
    const isGlobal = ['HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'].includes(role);
    let query = db('report_builder_saved');
    if (isGlobal) {
      query = query.where(function () { this.where('created_by', uid).orWhere('is_shared', true); });
    } else {
      query = query.where('created_by', uid);
    }

    const countRow = await query.clone().count('* as count').first();
    const total = parseInt(countRow?.count || 0, 10);
    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);

    const formatted = rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      is_shared: !!r.is_shared,
      created_by: r.created_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
      query_spec: parseJson(r.query_spec, {}),
    }));

    return res.status(200).json({ success: true, data: formatted, meta: { page, limit, total } });
  } catch (err) {
    logger.error(`[ReportBuilder] listSavedReports error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reports/builder/saved
// Create a saved report template.
// Body: { name, description?, query_spec: { table, join?, fields[], filters?, sort? }, is_shared? }
// ─────────────────────────────────────────────────────────────────────────────
export const createSavedReport = async (req, res) => {
  try {
    const { name, description, query_spec, is_shared } = req.body;
    const uid = userId(req);
    const role = userRole(req);

    if (!name || !query_spec) {
      return res.status(400).json({ success: false, message: 'name and query_spec are required' });
    }

    // Validate the query spec
    const { ok, errors } = validateQuerySpec(query_spec, role);
    if (!ok) {
      return res.status(400).json({ success: false, message: `Invalid query spec: ${errors.join('; ')}`, errors });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const row = {
      id,
      name: String(name).slice(0, 255),
      description: description ? String(description).slice(0, 1000) : null,
      query_spec: JSON.stringify(query_spec),
      is_shared: is_shared ? 1 : 0,
      created_by: uid,
      created_at: now,
      updated_at: now,
    };

    await db('report_builder_saved').insert(row);

    return res.status(201).json({ success: true, data: { ...row, is_shared: !!is_shared, query_spec } });
  } catch (err) {
    logger.error(`[ReportBuilder] createSavedReport error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/reports/builder/saved/:id
// ─────────────────────────────────────────────────────────────────────────────
export const updateSavedReport = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = userId(req);
    const role = userRole(req);

    const existing = await db('report_builder_saved').where({ id }).first();
    if (!existing) return res.status(404).json({ success: false, message: 'Saved report not found' });
    if (existing.created_by !== uid && !['HQ_ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this report' });
    }

    const updates = {};
    if (req.body.name) updates.name = String(req.body.name).slice(0, 255);
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.is_shared !== undefined) updates.is_shared = req.body.is_shared ? 1 : 0;
    if (req.body.query_spec) {
      const { ok, errors } = validateQuerySpec(req.body.query_spec, role);
      if (!ok) return res.status(400).json({ success: false, message: errors.join('; '), errors });
      updates.query_spec = JSON.stringify(req.body.query_spec);
    }
    updates.updated_at = new Date().toISOString();

    await db('report_builder_saved').where({ id }).update(updates);
    const updated = await db('report_builder_saved').where({ id }).first();
    return res.status(200).json({ success: true, data: { ...updated, query_spec: parseJson(updated.query_spec, {}) } });
  } catch (err) {
    logger.error(`[ReportBuilder] updateSavedReport error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/reports/builder/saved/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deleteSavedReport = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = userId(req);
    const role = userRole(req);

    const existing = await db('report_builder_saved').where({ id }).first();
    if (!existing) return res.status(404).json({ success: false, message: 'Saved report not found' });
    if (existing.created_by !== uid && !['HQ_ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this report' });
    }

    await db('report_builder_saved').where({ id }).del();
    return res.status(200).json({ success: true, message: 'Saved report deleted successfully' });
  } catch (err) {
    logger.error(`[ReportBuilder] deleteSavedReport error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reports/builder/saved/:id/run
// Run a saved pivot report by ID and log usage audit entry.
// ─────────────────────────────────────────────────────────────────────────────
export const runSavedReport = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = userId(req);
    const role = userRole(req);

    const saved = await db('report_builder_saved').where({ id }).first();
    if (!saved) {
      return res.status(404).json({ success: false, message: 'Saved report not found' });
    }

    const spec = typeof saved.query_spec === 'string' ? JSON.parse(saved.query_spec) : (saved.query_spec || {});
    const { scopeType, scopeId } = resolveUserScope(req.user);

    const result = await runPivotReport({
      rows: spec.rows || [],
      columns: spec.columns || [],
      measure: spec.measure || 'case_count',
      filters: spec.filters || {},
      scopeType,
      scopeId,
    });

    // Write audit log entry
    await writeAuditLog({
      user_id: uid,
      user_role: role,
      run_type: 'SAVED_PIVOT_RUN',
      table_spec: saved.name,
      fields_spec: [...(spec.rows || []), ...(spec.columns || [])],
      filter_spec: spec.filters || {},
      row_count: result.rowHeaders?.length || 0,
      ip_address: req.ip || null,
    });

    return res.status(200).json({
      success: true,
      data: {
        saved_report: { id: saved.id, name: saved.name, description: saved.description, is_system_preset: !!saved.is_system_preset },
        pivot: result,
      },
    });
  } catch (err) {
    logger.error(`[ReportBuilder] runSavedReport error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/builder/quick-access
// Returns combined saved reports & role-targeted system presets with run counts.
// ─────────────────────────────────────────────────────────────────────────────
export const getQuickAccessReports = async (req, res) => {
  try {
    const uid = userId(req);
    const role = userRole(req);

    const allSaved = await db('report_builder_saved').select('*');

    // Filter by ownership or system preset visibility for user's role
    const filtered = allSaved.filter((r) => {
      if (r.created_by === uid) return true;
      if (r.is_system_preset) {
        if (!r.visible_to_roles) return true;
        const allowedRoles = typeof r.visible_to_roles === 'string' ? parseJson(r.visible_to_roles, []) : r.visible_to_roles;
        return Array.isArray(allowedRoles) && allowedRoles.includes(role);
      }
      return !!r.is_shared;
    });

    // Deduplicate by name to prevent duplicate preset tiles
    const uniqueMap = new Map();
    for (const r of filtered) {
      if (!uniqueMap.has(r.name)) {
        uniqueMap.set(r.name, r);
      }
    }
    const uniqueList = Array.from(uniqueMap.values());

    // Ensure default system preset for Left Out Accused is present
    const leftOutPreset = {
      id: 'system-left-out-accused-preset',
      name: 'Unarrested / Left Out Accused Dossier',
      description: 'Accused persons listed in FIRs who are not yet arrested, grouped by station & crime head',
      is_system_preset: true,
      created_by: 'system',
      created_at: new Date().toISOString(),
      spec: {
        rows: ['ps_name'],
        columns: ['crime_head'],
        measure: 'case_count',
        filters: { recordType: 'CASE', caseStatus: '' }
      },
      run_count: 99
    };
    if (!uniqueList.some(r => r.name.includes('Left Out') || r.name.includes('Unarrested'))) {
      uniqueList.unshift(leftOutPreset);
    }

    const enriched = uniqueList.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      is_system_preset: !!r.is_system_preset,
      created_by: r.created_by,
      created_at: r.created_at,
      spec: parseJson(r.query_spec, r.spec || {}),
      run_count: usageMap[r.name] || r.run_count || 0,
    })).sort((a, b) => b.run_count - a.run_count);

    return res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    logger.error(`[ReportBuilder] getQuickAccessReports error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/builder/lookups/:type
// Returns dropdown options for filter UIs.
// type: districts | police-stations | crime-heads | case-status | arrestee-status
// ─────────────────────────────────────────────────────────────────────────────
export const getLookupValues = async (req, res) => {
  try {
    const { type } = req.params;
    const uid = userId(req);
    const role = userRole(req);
    const jurisdictionQuery = req.jurisdictionQuery || {};

    let data = [];

    switch (type) {
      case 'districts': {
        let q = db('hierarchy_nodes').where({ node_type: 'DISTRICT', is_active: true }).select('id', 'name', 'code');
        if (jurisdictionQuery.district_id) q = q.where('id', jurisdictionQuery.district_id);
        data = await q.orderBy('name');
        break;
      }
      case 'police-stations': {
        let q = db('hierarchy_nodes').where({ node_type: 'PS', is_active: true }).select('id', 'name', 'code', 'parent_id');
        if (jurisdictionQuery.ps_id) q = q.where('id', jurisdictionQuery.ps_id);
        else if (jurisdictionQuery.district_id) q = q.where('parent_id', jurisdictionQuery.district_id);
        if (req.query.district_id) q = q.where('parent_id', req.query.district_id);
        data = await q.orderBy('name');
        break;
      }
      case 'crime-heads': {
        const { REPORTABLE_FIELDS: RF } = await import('./reportableFields.config.js');
        const caseFields = RF.CASE || [];
        const localHead = caseFields.find(f => f.key === 'local_head');
        data = (localHead?.options || []).map(v => ({ value: v, label: v }));
        break;
      }
      case 'case-status':
        data = ['Open','Chargesheeted','Closed','Charge Sheet','POLICE INVESTIGATION REPORT(PIR-JCL)','PIR-JCL','SUPPLEMENTARY CHARGESHEET','Untraced','Pending','Cancellation','Quashed','Closure Report','Released U/S 189 BNSS'].map(v => ({ value: v, label: v }));
        break;
      case 'arrestee-status':
        data = ['judicial_custody','police_custody','bail','released','others'].map(v => ({ value: v, label: v }));
        break;
      case 'workflow-status':
        data = ['DRAFT','PENDING_SHO','DISTRICT_REVIEW','HQ_RECEIVED','ARCHIVED','SENT_BACK','COMPILED'].map(v => ({ value: v, label: v }));
        break;
      case 'record-types':
        data = [
          { value: 'CASE', label: 'FIR Master' },
          { value: 'ARREST', label: 'Arrest / Person Master' },
          { value: 'PCR_CALL', label: 'PCR' },
          { value: 'MISSING', label: 'Missing Person Master' },
          { value: 'UIDB', label: 'UIDB Master' },
        ];
        break;
      default:
        return res.status(400).json({ success: false, message: `Unknown lookup type: "${type}"` });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error(`[ReportBuilder] getLookupValues error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reports/builder/cross-match/missing-uidb
// Missing Person ↔ UIDB similarity report (§4.5)
// Body: { gender?, age_min?, age_max?, description_keywords?, max_results? }
// ─────────────────────────────────────────────────────────────────────────────
export const crossMatchMissingUidb = async (req, res) => {
  try {
    const params = req.body || {};
    const uid = userId(req);
    const role = userRole(req);
    const jurisdictionQuery = req.jurisdictionQuery || {};
    const ip = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await executeMissingUidbCrossMatch(params, jurisdictionQuery);

    // Audit log
    writeAuditLog({
      user_id: uid, user_role: role, run_type: 'CROSS_MATCH',
      table_spec: 'MISSING+UIDB', fields_spec: [], filter_spec: params,
      row_count: result.total, ip_address: ip,
    });

    return res.status(200).json({
      success: true,
      data: result.rows,
      meta: { total: result.total }
    });
  } catch (err) {
    logger.error(`[ReportBuilder] crossMatchMissingUidb error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/builder/audit
// Admin-only: view report builder audit log.
// ─────────────────────────────────────────────────────────────────────────────
export const getBuilderAuditLog = async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 50, 10);
    const offset = (page - 1) * limit;

    const countRow = await db('report_builder_audit').count('* as count').first();
    const total = parseInt(countRow?.count || 0, 10);

    const rows = await db('report_builder_audit')
      .select('report_builder_audit.*', 'u.username', 'u.name_en as user_fullname')
      .leftJoin('users as u', 'report_builder_audit.user_id', 'u.id')
      .orderBy('report_builder_audit.created_at', 'desc')
      .limit(limit).offset(offset);

    const formatted = rows.map(r => ({
      ...r,
      table_spec: parseJson(r.table_spec, r.table_spec),
      fields_spec: parseJson(r.fields_spec, []),
      filter_spec: parseJson(r.filter_spec, {}),
    }));

    return res.status(200).json({ success: true, data: formatted, meta: { page, limit, total } });
  } catch (err) {
    logger.error(`[ReportBuilder] getBuilderAuditLog error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};
