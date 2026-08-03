import { PALETTE, FONTS } from '../../shared/canonical-codes.js';
import { ALL_HEADS, buildGroupSums } from '../fn-heads.js';

/**
 * STAT 36 — Running Balance of Cases
 * Formula: Pending at FN Start = Total registered upto fnEnd−15 days that are still pending
 *          Registered during FN  = cases with reg_date in [fnStart, fnEnd]
 *          Disposed during FN    = worked_out_date in [fnStart, fnEnd]
 *          Balance at FN End     = Pending at start + Registered − Disposed
 */
export function renderStat36(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 36 Disposal Balance');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;

  sheet.mergeCells('A1:G1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 36 — RUNNING BALANCE OF CASES — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:G2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}  |  Year: ${yearNum}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Head of Crime',
    'Pending at FN Start',
    'Registered During FN',
    'Total',
    'Solved (Challan)',
    'Cancelled / Untraced',
    'Balance at FN End',
  ]);
  hdr.height = 30;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const dbc     = calcData.distByCode    || {};
  const dbcWo   = calcData.distByCodeWo  || {};
  const dbcCan  = calcData.distByCodeCan || {};
  const dbcUntr = calcData.distByCodeUntr|| {};

  // Pending at FN start = (uptoY cases) - (uptoY solved+cancelled+untraced before fnStart)
  // Approximation: uptoY total − fnY (registered in this FN) − disposed during this FN
  // Since we don't have a separate "pending at FN start" count from the DB, use:
  //   pendingStart = uptoY − fnY
  // Then balance = pendingStart + fnY − disposed_fnY = uptoY − disposed_fnY

  const g  = (map, code, field) => Number(map[code]?.[field] || 0);
  const f  = v => v > 0 ? v : '-';
  const sums = buildGroupSums(dbc);
  const sumsWo  = buildGroupSums(dbcWo);
  const sumsCan = buildGroupSums(dbcCan);
  const sumsUntr= buildGroupSums(dbcUntr);

  ALL_HEADS.forEach(h => {
    let reg, uptoY, wo, can, untr;
    if (h.isTotal) {
      reg   = sums[h.group].fnY;   uptoY = sums[h.group].uptoY;
      wo    = sumsWo[h.group].fnY; can   = sumsCan[h.group].fnY; untr = sumsUntr[h.group].fnY;
    } else {
      reg   = g(dbc,    h.code, 'fnY');   uptoY = g(dbc,    h.code, 'uptoY');
      wo    = g(dbcWo,  h.code, 'fnY');   can   = g(dbcCan, h.code, 'fnY'); untr = g(dbcUntr, h.code, 'fnY');
    }
    const pendStart = Math.max(0, uptoY - reg);
    const total     = pendStart + reg;
    const disposed  = wo + can + untr;
    const balance   = Math.max(0, total - disposed);

    const row = sheet.addRow([
      h.label,
      f(pendStart),
      f(reg),
      f(total),
      f(wo),
      f(can + untr),
      f(balance),
    ]);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = h.isTotal ? FONTS.HEADER : FONTS.DATA;
      if (h.isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 34 : 18; });
}
