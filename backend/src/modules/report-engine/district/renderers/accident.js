import { PALETTE, FONTS, safeMerge } from '../../shared/canonical-codes.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

export function renderAccident(workbook, scope, calcData) {
  let sheet = workbook.getWorksheet('Accident Cases') || workbook.addWorksheet('Accident Cases');
  const distTitle = formatDistrictTitle(scope.self_name);
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;
  const dbc = calcData.distByCode || {};
  const fmt = v => (v > 0 ? v : '-');

  const simpleDay  = dbc['SIMPLE_ACCIDENT']?.dayY  || 0;
  const simpleUptoY = dbc['SIMPLE_ACCIDENT']?.repY  || 0;
  const simpleUptoY1= dbc['SIMPLE_ACCIDENT']?.repY1 || 0;
  const fatalDay   = dbc['FATAL_ACCIDENT']?.dayY   || 0;
  const fatalUptoY = dbc['FATAL_ACCIDENT']?.repY   || 0;
  const fatalUptoY1= dbc['FATAL_ACCIDENT']?.repY1  || 0;

  // Title
  safeMerge(sheet, 'A1:G1');
  const t1 = sheet.getCell('A1');
  t1.value = `ACCIDENT CASES STATEMENT — ${distTitle}`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Multi-row headers
  const r2 = sheet.addRow(['District', 'Simple / Grievous Accident', '', '', 'Fatal Accident', '', '']);
  r2.height = 24;
  const r3 = sheet.addRow(['', 'Today', `Upto Date ${yearNum}`, `Upto Date ${yearPrev}`, 'Today', `Upto Date ${yearNum}`, `Upto Date ${yearPrev}`]);
  r3.height = 22;

  safeMerge(sheet, 'A2:A3');
  safeMerge(sheet, 'B2:D2');
  safeMerge(sheet, 'E2:G2');

  [r2, r3].forEach(row => {
    row.eachCell(c => {
      c.font = FONTS.HEADER;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  // Data row — real counts from distByCode
  const d1 = sheet.addRow([
    distTitle,
    fmt(simpleDay), fmt(simpleUptoY), fmt(simpleUptoY1),
    fmt(fatalDay),  fmt(fatalUptoY),  fmt(fatalUptoY1),
  ]);
  d1.font = FONTS.DATA;
  d1.eachCell((cell, colIdx) => {
    cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  sheet.addRow([]);
  sheet.addRow([]);

  // Brief Facts section
  const bfRow = sheet.rowCount + 1;
  safeMerge(sheet, `A${bfRow}:G${bfRow}`);
  const bfHead = sheet.getCell(`A${bfRow}`);
  bfHead.value = `Brief facts of all fatal cases in ${distTitle}:`;
  bfHead.font = FONTS.SUBTITLE;
  bfHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };

  const list = calcData.accidentList || [];
  if (list.length === 0) {
    const nr = sheet.addRow(['1', 'Nil fatal accident reported today']);
    nr.getCell(2).font = FONTS.DATA;
  } else {
    list.forEach((item, idx) => {
      const nr = sheet.addRow([
        idx + 1,
        `${item.ps_name} - FIR No. ${item.fir_no || 'N/A'}: ${item.brief_facts || 'No brief facts provided'}`,
      ]);
      nr.getCell(2).font = FONTS.DATA;
    });
  }

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 32 : idx === 1 ? 40 : 16;
  });
}
