import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderStat03(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 3 Act Cases');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:E1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 3 — CASES UNDER LOCAL & SPECIAL LAWS — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:E2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Act / Law',
    `Cases FN ${yearNum}`, `Cases FN ${yearPrev}`,
    `Upto ${yearNum}`, `Upto ${yearPrev}`,
  ]);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Build act → count map from actRowsY and actRowsY1
  const actY  = {};
  const actY1 = {};
  for (const r of (calcData.actRowsY  || [])) { actY[r.act_id]  = (actY[r.act_id]  || 0) + Number(r.cnt); }
  for (const r of (calcData.actRowsY1 || [])) { actY1[r.act_id] = (actY1[r.act_id] || 0) + Number(r.cnt); }

  // Build unique act list with labels
  const actMap = {};
  for (const r of [...(calcData.actRowsY || []), ...(calcData.actRowsY1 || [])]) {
    if (!actMap[r.act_id]) actMap[r.act_id] = r.act_long || r.act_id;
  }

  const f = v => v > 0 ? v : '-';
  let totalY = 0, totalY1 = 0;

  for (const [actId, label] of Object.entries(actMap)) {
    const y  = actY[actId]  || 0;
    const y1 = actY1[actId] || 0;
    totalY  += y;
    totalY1 += y1;
    const row = sheet.addRow([label, f(y), f(y1), '-', '-']);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = FONTS.DATA;
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  }

  const tot = sheet.addRow(['TOTAL', f(totalY), f(totalY1), '-', '-']);
  tot.height = 20;
  tot.eachCell((cell, col) => {
    cell.font = FONTS.HEADER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
    cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 40 : 14; });
}
