import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const MISSING_TYPES = [
  { label: 'Children (Male)',      type: 'CHILD',   gender: 'MALE' },
  { label: 'Children (Female)',    type: 'CHILD',   gender: 'FEMALE' },
  { label: 'Women (Adult)',        type: 'ADULT',   gender: 'FEMALE' },
  { label: 'Men (Adult)',          type: 'ADULT',   gender: 'MALE' },
  { label: 'Senior Citizens',      type: 'SENIOR',  gender: null },
  { label: 'TOTAL',                type: '__total__', gender: null },
];

export function renderStat19(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 19 Missing');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:G1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 19 — MISSING PERSONS — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:G2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Category',
    `Reported FN ${yearNum}`, `Reported FN ${yearPrev}`,
    `Traced FN ${yearNum}`, `Traced FN ${yearPrev}`,
    `Pending FN ${yearNum}`, `Pending FN ${yearPrev}`,
  ]);
  hdr.height = 30;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Build lookup from missing_type/missing_status
  const countY  = {};
  const countY1 = {};
  const key = (type, gender) => `${type}|${gender || 'ANY'}`;
  for (const r of (calcData.missingRowsY  || [])) {
    const k = key(r.missing_type, r.gender);
    if (!countY[k]) countY[k] = { rep: 0, traced: 0 };
    countY[k].rep += Number(r.cnt);
    if (r.missing_status === 'TRACED') countY[k].traced += Number(r.cnt);
  }
  for (const r of (calcData.missingRowsY1 || [])) {
    const k = key(r.missing_type, r.gender);
    if (!countY1[k]) countY1[k] = { rep: 0, traced: 0 };
    countY1[k].rep += Number(r.cnt);
    if (r.missing_status === 'TRACED') countY1[k].traced += Number(r.cnt);
  }

  const f = v => v > 0 ? v : '-';
  let totRepY = 0, totRepY1 = 0, totTrY = 0, totTrY1 = 0;

  MISSING_TYPES.forEach(mt => {
    let repY, repY1, trY, trY1, pendY, pendY1;
    if (mt.type === '__total__') {
      repY = totRepY; repY1 = totRepY1; trY = totTrY; trY1 = totTrY1;
      pendY = repY - trY; pendY1 = repY1 - trY1;
    } else {
      const k = key(mt.type, mt.gender);
      repY  = countY[k]?.rep    || 0; repY1  = countY1[k]?.rep    || 0;
      trY   = countY[k]?.traced || 0; trY1   = countY1[k]?.traced || 0;
      pendY = repY - trY; pendY1 = repY1 - trY1;
      totRepY += repY; totRepY1 += repY1; totTrY += trY; totTrY1 += trY1;
    }
    const row = sheet.addRow([mt.label, f(repY), f(repY1), f(trY), f(trY1), f(pendY), f(pendY1)]);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = mt.type === '__total__' ? FONTS.HEADER : FONTS.DATA;
      if (mt.type === '__total__') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 28 : 18; });
}
