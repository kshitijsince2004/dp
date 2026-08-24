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
    await db('report_builder_audit').insert({
      id: uuidv4(),
      user_id: entry.user_id,
      user_role: entry.user_role,
      run_type: entry.run_type,
      table_spec: typeof entry.table_spec === 'string' ? entry.table_spec : JSON.stringify(entry.table_spec),
      fields_spec: typeof entry.fields_spec === 'string' ? entry.fields_spec : JSON.stringify(entry.fields_spec || []),
      filter_spec: typeof entry.filter_spec === 'string' ? entry.filter_spec : JSON.stringify(entry.filter_spec || {}),
      format: entry.format || null,
      row_count: entry.row_count || 0,
      job_id: entry.job_id || null,
      ip_address: entry.ip_address || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[ReportBuilderAudit] Failed to write audit log: ${err.message}`);
  }
}

/**
 * Build flat column list for a selected fields array.
 * Returns array of { label, key } for CSV/Excel headers.
 */
function buildColumnHeaders(fields, tables, userRoleStr) {
  const headers = [];
  const tablesToSearch = Array.isArray(tables) ? tables : [tables];

  // System virtual fields
  const systemFieldDefs = filterFieldsForRole(REPORTABLE_FIELDS._SYSTEM || [], userRoleStr);

  for (const fieldRef of fields) {
    const { field, table: fTable } = typeof fieldRef === 'string'
      ? { field: fieldRef, table: tablesToSearch[0] }
      : fieldRef;
    const t = fTable || tablesToSearch[0];

    if (field.startsWith('_')) {
      const def = systemFieldDefs.find(f => f.key === field);
      headers.push({ key: field, label: def ? def.label_en : field });
    } else {
      const tableDefs = filterFieldsForRole(REPORTABLE_FIELDS[t] || [], userRoleStr);
      const def = tableDefs.find(f => f.key === field);
      const colKey = tablesToSearch.length > 1 ? `${t}__${field}` : field;
      headers.push({ key: colKey, label: def ? `${t}: ${def.label_en}` : `${t}: ${field}` });
    }
  }
  return headers;
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

    return res.status(200).json({
      success: true,
      data: { tables, joins, allowed_tables: ALLOWED_TABLES }
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
    const ip = req.ip || req.headers['x-forwarded-for'] || null;

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
    const ip = req.ip || req.headers['x-forwarded-for'] || null;

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

    const templateId = `BUILDER_${(spec.table || 'UNKNOWN')}`;
    const templateExists = await db('report_templates').where({ id: templateId }).first();
    if (!templateExists) {
      await db('report_templates').insert({
        id: templateId,
        name_en: `Custom Report: ${spec.table || 'UNKNOWN'}`,
        name_hi: `कस्टम रिपोर्ट: ${spec.table || 'UNKNOWN'}`,
        applicable_record_types: JSON.stringify([spec.table || 'CASE']),
        applicable_levels: JSON.stringify(['HQ']),
        template_definition: JSON.stringify({}),
        output_formats: JSON.stringify(['CSV', 'EXCEL', 'PDF']),
        is_active: true,
        created_by: uid || 'U_SA001',
      });
    }

    // Insert job record (reuse existing report_jobs table)
    await db('report_jobs').insert({
      id: jobId,
      template_id: templateId,
      filters: JSON.stringify({ spec }),
      format: format.toUpperCase(),
      status: 'PENDING',
      file_path: filePath,
      created_by: uid,
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
          status: 'FAILED', updated_at: new Date().toISOString()
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

// ─────────────────────────────────────────────────────────────────────────────
// Async export job worker
// ─────────────────────────────────────────────────────────────────────────────
async function runExportJob(jobId, spec, jurisdictionQuery, role, format, filePath, uid, ip) {
  // Fetch all rows (no pagination for export — but capped at 50k for safety)
  const exportSpec = { ...spec, page: 1, pageSize: 50000 };

  let result;
  if (spec.join) {
    result = await executeJoinedQuery(exportSpec, jurisdictionQuery, role);
  } else {
    result = await executeSingleTableQuery(exportSpec, jurisdictionQuery, role);
  }

  const { rows } = result;
  const tables = spec.join ? [spec.table, spec.join] : [spec.table];
  const headers = buildColumnHeaders(spec.fields || [], tables, role);

  if (format === 'csv') {
    await generateCsv(rows, headers, filePath);
  } else if (format === 'xlsx') {
    await generateXlsx(rows, headers, spec, filePath);
  } else if (format === 'pdf') {
    await generatePdf(rows, headers, spec, filePath);
  }

  await db('report_jobs').where({ id: jobId }).update({
    status: 'READY', updated_at: new Date().toISOString()
  });

  // Audit log
  await writeAuditLog({
    user_id: uid, user_role: role, run_type: 'EXPORT',
    table_spec: spec.join ? `${spec.table}+${spec.join}` : spec.table,
    fields_spec: spec.fields, filter_spec: spec.filters,
    format: format.toUpperCase(), row_count: rows.length,
    job_id: jobId, ip_address: ip,
  });

  logger.info(`[ReportBuilderExport] Job ${jobId} complete — ${rows.length} rows, format=${format}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// File generators
// ─────────────────────────────────────────────────────────────────────────────

async function generateCsv(rows, headers, filePath) {
  const colKeys = headers.map(h => h.key);
  const colLabels = headers.map(h => h.label);
  const lines = [colLabels.map(l => `"${String(l).replace(/"/g, '""')}"`).join(',')];
  for (const row of rows) {
    const cells = colKeys.map(k => {
      const v = row[k] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    });
    lines.push(cells.join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

async function generateXlsx(rows, headers, spec, filePath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PHAROS Report Builder';
  wb.created = new Date();
  const ws = wb.addWorksheet('Report');

  // Meta rows
  ws.addRow([`PHAROS CUSTOM REPORT — ${spec.table}${spec.join ? ` + ${spec.join}` : ''}`]);
  ws.addRow([`Generated: ${new Date().toLocaleString()}`]);
  ws.addRow([`Filters: ${spec.filters ? JSON.stringify(spec.filters) : 'None'}`]);
  ws.addRow([]);

  // Header row
  const headerRow = ws.addRow(headers.map(h => h.label));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C6B' } };

  // Data rows
  for (const row of rows) {
    ws.addRow(headers.map(h => row[h.key] ?? ''));
  }

  // Auto-width
  ws.columns.forEach(col => {
    let maxLen = 12;
    col.eachCell({ includeEmpty: false }, cell => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 60);
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

    // Get usage counts from audit table
    const usageCounts = await db('report_builder_audit')
      .where('user_id', uid)
      .select('table_spec')
      .count('* as runs')
      .groupBy('table_spec');

    const usageMap = Object.fromEntries(
      usageCounts.map((u) => [u.table_spec, parseInt(u.runs || 0, 10)])
    );

    const enriched = filtered.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      is_system_preset: !!r.is_system_preset,
      created_by: r.created_by,
      created_at: r.created_at,
      spec: parseJson(r.query_spec, {}),
      run_count: usageMap[r.name] || 0,
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
        data = ['Open','Chargesheeted','Closed','Charge Sheet','PIR-JCL','Untraced','Pending','Cancellation','Quashed','Closure Report','Released U/S 189 BNSS'].map(v => ({ value: v, label: v }));
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
