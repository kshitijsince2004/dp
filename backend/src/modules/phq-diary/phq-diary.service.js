import { buildDateWindows, fetchCaseCounts, fetchArrestCounts, fetchDrugRecovery, resolveChildrenNodes } from './phq-diary.data.js';
import { buildManualyData, buildDrugData, buildArrestData, buildDistrictMatrix, buildMondayMorningData } from './phq-diary.calc.js';
import { buildWorkbook } from './phq-diary.excel.js';
import { resolveScope } from '../reports/engine/scopeResolver.js';
import { renderPHQDiaryHtml, convertHtmlToPdf } from '../report-engine/shared/report-html-renderer.js';
import db from '../../config/db.js';

/**
 * @param {string} date           - YYYY-MM-DD diary date
 * @param {string} scope          - SCOPE_GROUP name, range code, district code/UUID or PS code/UUID
 * @param {Array<string>} selectedSheets - optional sheets subset to include
 * @param {string} format         - 'EXCEL' | 'PDF'
 * @returns {Buffer}              - xlsx or pdf file bytes
 */
export async function generate(date, scope = 'ALL_DELHI_TOTAL', selectedSheets = [], format = 'EXCEL') {
  const windows = buildDateWindows(date);

  // 1. Resolve hierarchy scope details (and perform authorization if requested via Controller)
  const scopeData = await resolveScope(scope);
  const { level, self_id, self_name, children_ids } = scopeData;

  // 2. Determine target query parameters
  let entityField = 'district_id';
  let queryIds = [];

  if (level === 'HQ' || level === 'RANGE' || level === 'ZONE') {
    entityField = 'district_id';
    queryIds = children_ids;
  } else if (level === 'DISTRICT' || level === 'SUB_DIV') {
    entityField = 'ps_id';
    queryIds = children_ids;
  } else if (level === 'PS') {
    entityField = 'ps_id';
    queryIds = [self_id];
  }

  // 3. Query records for this scope
  const [caseRows, arrestRows, drugRows] = await Promise.all([
    fetchCaseCounts(queryIds, entityField, windows),
    fetchArrestCounts(queryIds, entityField, windows),
    fetchDrugRecovery(queryIds, entityField, windows),
  ]);

  // 4. Build totals for the self node (pass self_id if PS leaf node, else undefined for aggregate)
  const selfEntityFilter = (level === 'PS') ? self_id : undefined;
  const allDelhi = buildManualyData(caseRows, arrestRows, drugRows, selfEntityFilter, windows);
  allDelhi._mmData = buildMondayMorningData(caseRows, selfEntityFilter, windows);

  // 5. Build sub-unit matrix if children exist
  let subUnitMatrix = null;
  let subUnitColumns = [];
  if (children_ids.length > 0) {
    const childNodesMap = await resolveChildrenNodes(children_ids);
    subUnitMatrix = buildDistrictMatrix(caseRows, childNodesMap, windows);
    subUnitColumns = scopeData.children.map(c => ({
      code: c.code || c.id,
      label: c.name
    }));
  }

  if (String(format).toUpperCase() === 'PDF') {
    const html = renderPHQDiaryHtml(date, scopeData, allDelhi, selectedSheets);
    return await convertHtmlToPdf(html);
  }

  // 6. Build the Excel workbook
  const wb = await buildWorkbook(
    allDelhi,
    subUnitMatrix,
    subUnitColumns,
    windows,
    level,
    selectedSheets,
    self_name
  );

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

export { generate as generatePHQDiary };

/**
 * Generate and write to a file path.
 */
export async function generateToFile(date, scope, outputPath) {
  const buffer = await generate(date, scope);
  const fs = await import('fs');
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}
