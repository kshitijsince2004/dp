import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import db from '../../../config/db.js';
import { resolvePeriod } from './periodResolver.js';
import { matchRecord } from './headResolver.js';
import { isWorkedOutAsOf, safePercentDiff, safeRatio, safeSub, fetchRecordsFull } from './measureEngine.js';
import { resolveScopeCodes, getDistrictNodeMap } from './scopeResolver.js';
import { fetchHistoricalBaseline } from './baselineService.js';
import { toDMY } from '../../../utils/dateFormat.js';

/**
 * Pharos Reporting Engine - Template Runtime & Renderer.
 * Supports STATEMENT, LISTING, and MATRIX projections, named-measure query caching,
 * multi-year column fan-out, historical baseline read-through, and Excel/PDF generation.
 */

export async function generateMetadataReport(jobId, template, userFilters, format, outputPath, userId) {
  const definition = typeof template.template_definition === 'string'
    ? JSON.parse(template.template_definition)
    : template.template_definition;

  const rawDateStr = userFilters.date || userFilters.from_date || userFilters.from || new Date().toISOString().split('T')[0];
  let runDateStr = String(rawDateStr).trim();
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(runDateStr)) {
    const parts = runDateStr.split(/[\/-]/);
    runDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  const queryCache = new Map();
  
  // Resolve jurisdiction
  const user = userId ? await db('users').where({ id: userId }).first() : null;
  const jurisdictionQuery = getJurisdictionQuery(user);

  const fmt = (format || 'EXCEL').toUpperCase();

  // If this is a PHQ Diary / PHQ comparative proforma, delegate Excel generation to the dedicated 9-sheet PHQ Diary service
  const tCode = (template?.code || definition?.code || '').toUpperCase();
  if (tCode.startsWith('PHQ') || tCode === 'PHQ_DIARY') {
    if (fmt === 'EXCEL' || fmt === 'XLSX') {
      const { generate: generatePHQDiary } = await import('../../phq-diary/phq-diary.service.js');
      const scope = userFilters.scope || 'ALL_DELHI_TOTAL';
      const buffer = await generatePHQDiary(runDateStr, scope);
      fs.writeFileSync(outputPath, buffer);
      return;
    }
  }

  if (fmt === 'EXCEL' || fmt === 'XLSX') {
    const workbook = new ExcelJS.Workbook();

    for (const section of definition.sections) {
      const sheetTitle = (section.title_en || 'Report').substring(0, 31);
      const worksheet = workbook.addWorksheet(sheetTitle);

      // Add Headers
      worksheet.addRow([definition.header?.title_en || 'PHAROS REPORT']);
      worksheet.addRow([`Run Date: ${toDMY(runDateStr)}`]);
      worksheet.addRow([`Generated At: ${new Date().toLocaleString()}`]);
      worksheet.addRow([]);

      if (section.layout_mode === 'MATRIX' || definition.layout_mode === 'MATRIX') {
        await renderMatrixSectionExcel(worksheet, section, runDateStr, jurisdictionQuery, userFilters, queryCache);
      } else if (section.layout_mode === 'LISTING') {
        await renderListingSectionExcel(worksheet, section, runDateStr, jurisdictionQuery, userFilters, queryCache);
      } else {
        await renderStatementSectionExcel(worksheet, section, runDateStr, jurisdictionQuery, userFilters, queryCache);
      }
    }

    await workbook.xlsx.writeFile(outputPath);
  } else if (fmt === 'PDF') {
    let htmlContent = `<html><head><style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { color: #1a365d; border-bottom: 2px solid #2b6cb0; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th { background-color: #ebf8ff; border: 1px solid #cbd5e0; padding: 8px; text-align: left; font-size: 11px; }
      td { border: 1px solid #cbd5e0; padding: 8px; font-size: 11px; }
      tr:nth-child(even) { background-color: #f7fafc; }
    </style></head><body>`;

    htmlContent += `<h1>${definition.header?.title_en || 'PHAROS REPORT'}</h1>`;
    htmlContent += `<p>Run Date: ${toDMY(runDateStr)} | Generated At: ${new Date().toLocaleString()}</p>`;

    for (const section of definition.sections) {
      htmlContent += `<h2>${section.title_en}</h2>`;
      if (section.layout_mode === 'MATRIX' || definition.layout_mode === 'MATRIX') {
        htmlContent += await renderMatrixSectionHTML(section, runDateStr, jurisdictionQuery, userFilters, queryCache);
      } else {
        htmlContent += await renderStatementSectionHTML(section, runDateStr, jurisdictionQuery, userFilters, queryCache);
      }
    }

    htmlContent += `</body></html>`;

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
    await browser.close();

    fs.writeFileSync(outputPath, pdfBuffer);
  }

  // Freeze official runs if requested
  if (userFilters.is_official || userFilters.freeze) {
    const districtId = jurisdictionQuery.district_id || userFilters.districtId || userFilters.district_id || (user ? user.district_id : null);
    if (districtId) {
      await freezeCompilation(db, template.code, runDateStr, districtId, {
        total_records: queryCache.size,
        matrix: { generated_at: new Date().toISOString() }
      });
    }
  }
}

async function renderStatementSectionExcel(worksheet, section, runDateStr, jurisdictionQuery, userFilters, queryCache) {
  const period = resolvePeriod(section.measures?.[0]?.period || 'DURING_DAY', runDateStr);
  const records = await queryRecordsForSectionCached(db, section, period, jurisdictionQuery, userFilters, queryCache);

  const headerRow = worksheet.addRow(['Crime Head', 'Registered', 'Worked Out', 'Pending']);
  headerRow.font = { bold: true };

  for (const rowDef of section.rows || []) {
    const matched = records.filter(rec => matchRecord(rec, rowDef.classification));
    const registered = matched.length;

    let workedOut = 0;
    for (const mDef of section.measures || []) {
      if (mDef.measure_type === 'WORKED_OUT') {
        const mPeriod = resolvePeriod(mDef.period, runDateStr);
        const mRecords = await queryRecordsForSectionCached(db, section, mPeriod, jurisdictionQuery, userFilters, queryCache);
        const mMatched = mRecords.filter(rec => matchRecord(rec, rowDef.classification));
        workedOut = mMatched.filter(r => isWorkedOutAsOf(r, mPeriod.to)).length;
      }
    }
    const pending = registered - workedOut;
    worksheet.addRow([rowDef.label_en, registered, workedOut, pending]);
  }
}

async function renderListingSectionExcel(worksheet, section, runDateStr, jurisdictionQuery, userFilters, queryCache) {
  const period = resolvePeriod(section.measures?.[0]?.period || 'DURING_DAY', runDateStr);
  const records = await queryRecordsForSectionCached(db, section, period, jurisdictionQuery, userFilters, queryCache);

  const fieldKeys = section.fields || ['id', 'record_type', 'record_date'];
  const headerRow = worksheet.addRow(fieldKeys.map(k => k.toUpperCase()));
  headerRow.font = { bold: true };

  for (const r of records) {
    const d = r.detail || r.data || {};
    const rowValues = fieldKeys.map(k => {
      if (k === 'record_date') return toDMY(r.record_date);
      return d[k] || r[k] || '';
    });
    worksheet.addRow(rowValues);
  }
}

async function renderMatrixSectionExcel(worksheet, section, runDateStr, jurisdictionQuery, userFilters, queryCache) {
  const rows = section.rows || [];
  const columnsSpec = section.columns || [];

  // Expand Multi-Year column fan-out if specified
  const expandedColumns = expandColumnsSpec(columnsSpec, runDateStr);

  const colHeaders = ['Crime Head', ...expandedColumns.map(c => c.label_en)];
  const headerRow = worksheet.addRow(colHeaders);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  });

  const nodeMap = await getDistrictNodeMap(db);

  for (const rDef of rows) {
    const rowData = [rDef.label_en];

    for (const colDef of expandedColumns) {
      const val = await computeCellFact(section, rDef, colDef, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap);
      rowData.push(val);
    }
    worksheet.addRow(rowData);
  }
}

function parseRunYear(val) {
  if (!val) return new Date().getFullYear();
  if (typeof val === 'string' && val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 3) {
      const y = parseInt(parts[2], 10);
      if (!isNaN(y)) return y;
    }
  }
  const y = new Date(val).getFullYear();
  return isNaN(y) ? new Date().getFullYear() : y;
}

function expandColumnsSpec(columnsSpec, runDateStr) {
  const expanded = [];
  const runYear = parseRunYear(runDateStr);

  for (const col of columnsSpec) {
    if (col.year_offsets && Array.isArray(col.year_offsets)) {
      for (const offset of col.year_offsets) {
        const yearVal = runYear + offset;
        expanded.push({
          ...col,
          year_offset: offset,
          label_en: col.label_template ? col.label_template.replace(/{{year}}/g, yearVal) : `${col.label_en || ''} ${yearVal}`.trim()
        });
      }
    } else {
      expanded.push(col);
    }
  }
  return expanded;
}

async function computeCellFact(section, rDef, colDef, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap) {
  if (colDef.type === 'DERIVED' || colDef.formula) {
    return computeDerivedCell(section, rDef, colDef, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap);
  }

  const periodExpr = colDef.period || section.measures?.[0]?.period || 'UPTO_DATE';
  const yearOffset = colDef.year_offset || 0;
  const period = resolvePeriod(periodExpr, runDateStr, yearOffset);
  const measureType = colDef.measure_type || 'REGISTERED';

  const scopeGroupName = colDef.scope_group || userFilters.scope_group;
  const targetScopeCodes = scopeGroupName ? await resolveScopeCodes(scopeGroupName, db) : null;

  // Check if historical year predates live system data (e.g. year < 2024)
  if (period.year < 2024) {
    let totalStat = 0;
    let foundStat = false;

    const scopesToQuery = targetScopeCodes || Array.from(nodeMap.keys());
    for (const scopeCode of scopesToQuery) {
      const stat = await fetchHistoricalBaseline(period.year, scopeCode, rDef.code || rDef.id, db);
      if (stat) {
        foundStat = true;
        totalStat += measureType === 'WORKED_OUT' ? stat.solved : stat.reported;
      }
    }
    if (foundStat) return totalStat;
    return '-'; // Render dash if absent
  }

  // Query Live Database
  const records = await queryRecordsForSectionCached(db, section, period, jurisdictionQuery, userFilters, queryCache);
  let matched = records.filter(rec => matchRecord(rec, rDef.classification));

  // Filter by scope codes if scope-group specified
  if (targetScopeCodes && targetScopeCodes.length > 0) {
    matched = matched.filter(rec => {
      const psNode = nodeMap.get(rec.ps_id);
      const distNode = nodeMap.get(rec.district_id);
      return (psNode && targetScopeCodes.includes(psNode.code)) || (distNode && targetScopeCodes.includes(distNode.code));
    });
  }

  if (measureType === 'WORKED_OUT') {
    return matched.filter(r => isWorkedOutAsOf(r, period.to)).length;
  }
  return matched.length;
}

async function computeDerivedCell(section, rDef, colDef, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap) {
  const formula = colDef.formula || colDef.derived_type;
  if (!formula) return '-';

  if (formula === 'VARIATION_PERCENT' || formula === 'PERCENT_DIFF') {
    const currCol = { ...colDef.curr_col, type: 'BASE' };
    const prevCol = { ...colDef.prev_col, type: 'BASE' };

    const currVal = await computeCellFact(section, rDef, currCol, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap);
    const prevVal = await computeCellFact(section, rDef, prevCol, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap);

    return safePercentDiff(currVal, prevVal);
  }

  if (formula === 'DETECTION_PERCENT' || formula === 'RATIO') {
    const numCol = { ...colDef.num_col, type: 'BASE' };
    const denCol = { ...colDef.den_col, type: 'BASE' };

    const numVal = await computeCellFact(section, rDef, numCol, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap);
    const denVal = await computeCellFact(section, rDef, denCol, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap);

    return safeRatio(numVal, denVal);
  }

  return '-';
}

async function renderStatementSectionHTML(section, runDateStr, jurisdictionQuery, userFilters, queryCache) {
  const period = resolvePeriod(section.measures?.[0]?.period || 'DURING_DAY', runDateStr);
  const records = await queryRecordsForSectionCached(db, section, period, jurisdictionQuery, userFilters, queryCache);

  let html = `<table><thead><tr><th>Crime Head</th><th>Registered</th><th>Worked Out</th><th>Pending</th></tr></thead><tbody>`;

  for (const rowDef of section.rows || []) {
    const matched = records.filter(rec => matchRecord(rec, rowDef.classification));
    const registered = matched.length;
    let workedOut = 0;
    for (const mDef of section.measures || []) {
      if (mDef.measure_type === 'WORKED_OUT') {
        const mPeriod = resolvePeriod(mDef.period, runDateStr);
        const mRecords = await queryRecordsForSectionCached(db, section, mPeriod, jurisdictionQuery, userFilters, queryCache);
        const mMatched = mRecords.filter(rec => matchRecord(rec, rowDef.classification));
        workedOut = mMatched.filter(r => isWorkedOutAsOf(r, mPeriod.to)).length;
      }
    }
    const pending = registered - workedOut;
    html += `<tr><td>${rowDef.label_en}</td><td>${registered}</td><td>${workedOut}</td><td>${pending}</td></tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

async function renderMatrixSectionHTML(section, runDateStr, jurisdictionQuery, userFilters, queryCache) {
  const rows = section.rows || [];
  const expandedColumns = expandColumnsSpec(section.columns || [], runDateStr);
  const nodeMap = await getDistrictNodeMap(db);

  let html = `<table><thead><tr><th>Crime Head</th>`;
  for (const c of expandedColumns) html += `<th>${c.label_en}</th>`;
  html += `</tr></thead><tbody>`;

  for (const rDef of rows) {
    html += `<tr><td>${rDef.label_en}</td>`;
    for (const colDef of expandedColumns) {
      const val = await computeCellFact(section, rDef, colDef, runDateStr, jurisdictionQuery, userFilters, queryCache, nodeMap);
      html += `<td>${val}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function formatDateISO(val) {
  if (!val) return null;
  const str = String(val).trim();
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(str)) {
    const parts = str.split(/[\/-]/);
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return str.split('T')[0];
}

async function queryRecordsForSection(trx, sectionDef, period, jurisdictionQuery, userFilters) {
  const record_type = sectionDef.record_type || 'CASE';
  const rawFrom = userFilters.dateFrom || userFilters.date_from || userFilters.from || period.from;
  const rawTo = userFilters.dateTo || userFilters.date_to || userFilters.to || period.to;
  const from = formatDateISO(rawFrom);
  const to = formatDateISO(rawTo);

  let query = trx('records').where({ record_type }).whereBetween('record_date', [from, to]);

  // Enforce role jurisdiction scope
  if (jurisdictionQuery.ps_id) {
    query = query.where('records.ps_id', jurisdictionQuery.ps_id);
  } else if (userFilters.ps_id || userFilters.psId) {
    query = query.where('records.ps_id', userFilters.ps_id || userFilters.psId);
  }

  if (jurisdictionQuery.district_id) {
    query = query.where('records.district_id', jurisdictionQuery.district_id);
  } else if (userFilters.district_id || userFilters.districtId) {
    query = query.where('records.district_id', userFilters.district_id || userFilters.districtId);
  }

  if (jurisdictionQuery.sub_div_id) {
    query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id);
  }

  const records = await query.select('id');
  const recordIds = records.map(r => r.id);

  return fetchRecordsFull(trx, recordIds);
}

async function queryRecordsForSectionCached(trx, sectionDef, period, jurisdictionQuery, userFilters, queryCache) {
  if (!queryCache) return queryRecordsForSection(trx, sectionDef, period, jurisdictionQuery, userFilters);

  const record_type = sectionDef.record_type || 'CASE';
  const from = userFilters.dateFrom || userFilters.date_from || userFilters.from || period.from;
  const to = userFilters.dateTo || userFilters.date_to || userFilters.to || period.to;
  const psId = jurisdictionQuery.ps_id || userFilters.ps_id || userFilters.psId || '';
  const districtId = jurisdictionQuery.district_id || userFilters.district_id || userFilters.districtId || '';
  const subDivId = jurisdictionQuery.sub_div_id || '';

  const cacheKey = `${record_type}:${from}:${to}:${psId}:${districtId}:${subDivId}`;
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey);
  }

  const result = await queryRecordsForSection(trx, sectionDef, period, jurisdictionQuery, userFilters);
  queryCache.set(cacheKey, result);
  return result;
}

function getJurisdictionQuery(user) {
  if (!user) return {};
  const { role, ps_id, district_id, sub_div_id } = user;

  if (role === 'HC' || role === 'SHO') {
    return { ps_id };
  } else if (role === 'ACP') {
    return { sub_div_id };
  } else if (role === 'DISTRICT_OFFICER') {
    return { district_id };
  }
  return {};
}

export async function freezeCompilation(trx, templateCode, period, districtId, summaryData) {
  const existing = await trx('compilations')
    .where({ source_entity_id: districtId, period, status: 'DRAFT' })
    .first();

  const compiledSummary = {
    template_code: templateCode,
    total_records: summaryData.total_records || 0,
    frozen_at: new Date().toISOString(),
    matrix: summaryData.matrix || {}
  };

  const { v4: uuidv4 } = await import('uuid');

  if (existing) {
    await trx('compilations').where({ id: existing.id }).update({
      compiled_summary: JSON.stringify(compiledSummary),
      updated_at: trx.fn.now()
    });
  } else {
    await trx('compilations').insert({
      id: uuidv4(),
      source_level: 'DISTRICT',
      target_level: 'HQ',
      route: 'OPS_CHAIN',
      source_entity_id: districtId,
      period,
      status: 'DRAFT',
      compiled_summary: JSON.stringify(compiledSummary)
    });
  }
}
