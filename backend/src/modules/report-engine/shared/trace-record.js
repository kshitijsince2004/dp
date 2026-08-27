import fs from 'fs';
import path from 'path';
import db from '../../../config/db.js';
import { fetchRecordFull } from '../../records/records.service.js';

let contractRegisterCache = null;

function getContractRegister() {
  if (!contractRegisterCache) {
    const regPath = path.resolve(process.cwd(), '../context-bundle/22-CORRECTNESS-SYSTEM/sheet-contract-register.json');
    if (fs.existsSync(regPath)) {
      contractRegisterCache = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    } else {
      contractRegisterCache = {};
    }
  }
  return contractRegisterCache;
}

/**
 * Checks whether a full record matches a row's source mapping expression.
 */
function recordMatchesSource(recObj, sourceExpr) {
  if (!sourceExpr || typeof sourceExpr !== 'string') return false;

  const canonicalCode = recObj.canonical_code || '';
  const recordType = recObj.record_type || 'CASE';

  if (sourceExpr.includes("canonical_code='")) {
    const match = sourceExpr.match(/canonical_code='([^']+)'/);
    if (match && match[1] === canonicalCode) return true;
  }

  if (sourceExpr.includes("canonical_code IN")) {
    const match = sourceExpr.match(/canonical_code IN \(([^)]+)\)/);
    if (match) {
      const codes = match[1].split(',').map((c) => c.trim().replace(/'/g, ''));
      if (codes.includes(canonicalCode)) return true;
    }
  }

  if (sourceExpr.includes('is_dd_based=true') && recObj.detail?.is_dd_based) {
    return true;
  }

  if (sourceExpr.includes('education=') && recObj.personRows?.some((p) => p.education)) {
    return true;
  }

  if (sourceExpr.includes('social_category=') && recObj.personRows?.some((p) => p.social_category)) {
    return true;
  }

  if (sourceExpr.includes('SUM(') || sourceExpr.includes('COUNT(')) {
    return true;
  }

  return false;
}

/**
 * Traces a record by ID or FIR number through all report templates and sheets.
 * Returns: { recordSummary, contributions }
 */
export async function traceRecordThroughReports(recordIdOrFirNo) {
  let recordId = recordIdOrFirNo;
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(recordIdOrFirNo);

  if (!isUuid) {
    const found = await db('fir_details').where({ fir_no: recordIdOrFirNo }).first();
    if (found) {
      recordId = found.record_id;
    } else {
      const recFound = await db('records').where({ id: recordIdOrFirNo }).first();
      if (!recFound) throw new Error(`Record or FIR Number "${recordIdOrFirNo}" not found`);
      recordId = recFound.id;
    }
  }

  const fullData = await fetchRecordFull(db, recordId);
  if (!fullData || !fullData.record) throw new Error(`Record ID "${recordId}" not found`);

  const { record, detail, personRows, propertyRows } = fullData;

  // Resolve canonical code
  let canonicalCode = detail?.canonical_code || 'UNCLASSIFIED';
  if (canonicalCode === 'UNCLASSIFIED' && detail?.local_head_id) {
    const lh = await db('ref.local_heads').where({ local_head_cd: detail.local_head_id }).first();
    if (lh?.canonical_code) canonicalCode = lh.canonical_code;
  }

  // Resolve PS & District names
  let psName = 'N/A';
  let districtName = 'N/A';
  if (record.ps_id) {
    const psNode = await db('hierarchy_nodes').where({ id: record.ps_id }).first();
    if (psNode) psName = psNode.name;
  }
  if (record.district_id) {
    const distNode = await db('hierarchy_nodes').where({ id: record.district_id }).first();
    if (distNode) districtName = distNode.name;
  }

  const recordSummary = {
    id: record.id,
    record_type: record.record_type,
    fir_no: detail?.fir_no || 'N/A',
    canonical_code: canonicalCode,
    record_date: record.record_date,
    fir_date: detail?.fir_date || record.record_date,
    current_status: record.current_status,
    ps_name: psName,
    district_name: districtName,
    person_count: personRows?.length || 0,
    property_count: propertyRows?.length || 0,
  };

  const recObj = {
    id: record.id,
    record_type: record.record_type,
    canonical_code: canonicalCode,
    current_status: record.current_status,
    detail,
    personRows,
    propertyRows,
  };

  const register = getContractRegister();
  const contributions = [];

  for (const [reportType, sheets] of Object.entries(register)) {
    for (const [sheetId, sheet] of Object.entries(sheets)) {
      for (const row of sheet.rows || []) {
        if (recordMatchesSource(recObj, row.source)) {
          contributions.push({
            report: reportType,
            sheet: sheetId,
            sheet_title: sheet.sheet_title,
            row: row.row,
            label: row.label,
            status: row.status,
            reason: `Matches rule "${row.source}" — Record canonical_code is "${canonicalCode}", status is "${record.current_status}".`,
          });
        }
      }
    }
  }

  return { record: recordSummary, contributions };
}
