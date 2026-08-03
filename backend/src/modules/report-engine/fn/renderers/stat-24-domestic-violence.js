import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const DV_ROWS = [
  { label: 'Cruelty by Husband / Relatives (85 BNS/498A IPC)', code: 'CRUELTY_BY_HUSBAND' },
  { label: 'Dowry Death (80 BNS/304B IPC)',                    code: 'DOWRY_DEATH' },
  { label: 'Rape',                                             code: 'RAPE' },
  { label: 'MO Women (Eve Teasing etc.)',                      code: 'MO_WOMEN' },
  { label: 'Eve Teasing',                                      code: 'EVE_TEASING' },
  { label: 'Kidnapping of Women',                              code: 'KIDNAPPING' },
  { label: 'TOTAL',                                            code: '__total__' },
];

export function renderStat24(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 24 Domestic Violence');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:E1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 24 — CRIMES AGAINST WOMEN — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:E2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Crime Head',
    `FN ${yearNum}`, `FN ${yearPrev}`,
    `Upto ${yearNum}`, `Upto ${yearPrev}`,
  ]);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const dbc  = calcData.distByCode || {};
  const g    = (code, field) => Number(dbc[code]?.[field] || 0);
  const f    = v => v > 0 ? v : '-';
  let totY = 0, totY1 = 0, totUpY = 0, totUpY1 = 0;

  DV_ROWS.forEach(h => {
    let fnY, fnY1, upY, upY1;
    if (h.code === '__total__') {
      fnY = totY; fnY1 = totY1; upY = totUpY; upY1 = totUpY1;
    } else {
      fnY  = g(h.code, 'fnY');   fnY1  = g(h.code, 'fnY1');
      upY  = g(h.code, 'uptoY'); upY1  = g(h.code, 'uptoY1');
      totY += fnY; totY1 += fnY1; totUpY += upY; totUpY1 += upY1;
    }
    const row = sheet.addRow([h.label, f(fnY), f(fnY1), f(upY), f(upY1)]);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = h.code === '__total__' ? FONTS.HEADER : FONTS.DATA;
      if (h.code === '__total__') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 44 : 14; });
}
