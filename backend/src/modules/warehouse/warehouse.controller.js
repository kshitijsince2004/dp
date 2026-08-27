/**
 * Warehouse API Controller
 * ========================
 * Exposes system status, ad-hoc pivot engine, reportable fields catalogue, and Excel export.
 */

import ExcelJS from 'exceljs';
import { getWarehouseStats, isWarehouseReady } from './warehouse.db.js';
import { runPivotReport, getCatalogue } from './pivot-engine.js';
import { logger } from '../../utils/logger.js';

export function resolveUserScope(user) {
  if (!user) return { scopeType: 'HQ', scopeId: null };
  const role = user.role || '';
  if (role === 'HC' || role === 'SHO' || role === 'IO') {
    return { scopeType: 'PS', scopeId: user.ps_id || user.scope_node_id };
  }
  if (role === 'DISTRICT_OFFICER' || role === 'DCP' || role === 'ACP') {
    return { scopeType: 'DISTRICT', scopeId: user.district_id || user.scope_node_id };
  }
  return { scopeType: 'HQ', scopeId: null };
}

/**
 * GET /warehouse/status
 */
export async function getStatus(req, res, next) {
  try {
    const ready = await isWarehouseReady();
    const queryMode = process.env.WAREHOUSE_QUERY_MODE || 'AUTO';
    const stats = await getWarehouseStats();

    return res.status(200).json({
      success: true,
      ready,
      queryMode,
      counts: stats.counts,
      lastSync: stats.lastSync,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /warehouse/fields
 * Returns allowlist of dimensions and measures
 */
export async function getReportableFields(req, res, next) {
  try {
    const cat = getCatalogue();
    res.json({
      success: true,
      data: {
        dimensions: cat.dimensions.map((d) => ({ key: d.key, label: d.label, data_type: d.data_type })),
        measures: cat.measures.map((m) => ({ key: m.key, label: m.label })),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /warehouse/run
 * Runs ad-hoc pivot query
 */
export async function runReport(req, res, next) {
  try {
    const { rows = [], columns = [], measure = 'case_count', filters = {} } = req.body;
    const { scopeType, scopeId } = resolveUserScope(req.user);

    const result = await runPivotReport({
      rows,
      columns,
      measure,
      filters,
      scopeType,
      scopeId,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * Sanitizes cell values against formula injection vulnerability in Excel.
 */
function sanitizeExcelCell(val) {
  if (typeof val === 'string' && /^[=+@-]/ .test(val)) {
    return `'${val}`;
  }
  return val;
}

/**
 * POST /warehouse/export
 * Generates and downloads Excel (.xlsx) file with professional formatting, auto-widths, and sanitization.
 */
export async function exportReport(req, res, next) {
  try {
    const { rows = [], columns = [], measure = 'case_count', filters = {}, name = 'Custom_Pivot_Report' } = req.body;
    const { scopeType, scopeId } = resolveUserScope(req.user);

    const result = await runPivotReport({ rows, columns, measure, filters, scopeType, scopeId });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(name.slice(0, 30));

    // Sticky Header Frozen Split
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Header Row Styling (Executive Slate #0F172A)
    const colNames = ['Row Header', ...result.columnHeaders.map((c) => c.values.join(' / ')), 'Total'];
    const headerRow = ws.addRow(colNames.map(sanitizeExcelCell));

    headerRow.height = 24;
    headerRow.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Data Rows
    result.rowHeaders.forEach((rh, ri) => {
      const rowValues = [rh.values.join(' / '), ...result.cells[ri], result.rowTotals[ri]];
      const r = ws.addRow(rowValues.map(sanitizeExcelCell));
      r.height = 20;

      // Alternating row background fill
      if (ri % 2 === 1) {
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
      }

      // Format measure cells as numbers
      for (let c = 2; c <= rowValues.length; c++) {
        const cell = r.getCell(c);
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      }
    });

    // Grand Total Row (Emerald Border & Slate Accent #E2E8F0)
    const totalRowValues = ['Grand Total', ...result.grandTotals, result.grandTotals.reduce((a, b) => a + b, 0)];
    const totalRow = ws.addRow(totalRowValues.map(sanitizeExcelCell));
    totalRow.height = 22;
    totalRow.font = { name: 'Calibri', bold: true, size: 11, color: { argb: '0F172A' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };

    for (let c = 1; c <= totalRowValues.length; c++) {
      const cell = totalRow.getCell(c);
      if (typeof cell.value === 'number') {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    }

    // Auto-calculate column widths to prevent truncation
    ws.columns.forEach((column) => {
      let maxLen = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(maxLen + 4, 45);
    });

    const sanitizedFilename = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}.xlsx"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('exportReport failed', { err });
    next(err);
  }
}
