import { PALETTE, FONTS, safeMerge } from '../../shared/canonical-codes.js';
import { varPct, detPct, computeNotWorkedOut } from '../../shared/calc.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

// code may be null for purely computed totals; isSub rows share parent code data
const ROWS = [
  { name: '1. Dacoity',              code: 'DACOITY',       isHeinous: true },
  { name: '2. Murder',               code: 'MURDER',        isHeinous: true },
  { name: '3. Att. Murder',          code: 'ATT_TO_MURDER',    isHeinous: true },
  { name: '4. Robbery (combined)',    code: 'ROBBERY',       isHeinous: true },
  { name: '   - Police Station (Manual)', code: 'ROBBERY',  isSub: true },
  { name: '   - E-FIR App',          code: null,            isSub: true },
  { name: '5. Riots',                code: 'RIOT',          isHeinous: true },
  { name: '6. Kid. Ran',             code: 'KID_FOR_RANSOM',isHeinous: true },
  { name: '7. Rape',                 code: 'RAPE',          isHeinous: true },
  { name: 'TOTAL HEINOUS',           isTotal: true, group: 'heinous' },
  { name: 'Organised Crime',         code: 'ORGANISED' },
  { name: 'Terrorist Crime',         code: 'TERRORIST' },
  { name: '8. Snatching (combined)', code: 'SNATCHING' },
  { name: '   - Police Station',     code: 'SNATCHING', isSub: true },
  { name: '   - E-FIR App',          code: null, isSub: true },
  { name: '9. Burglary (combined)',  code: 'BURGLARY' },
  { name: '   - Police Station',     code: 'BURGLARY', isSub: true },
  { name: '   - E-FIR App',          code: null, isSub: true },
  { name: '10. Extortion',           code: 'EXTORTION' },
  { name: '11. Hurt',                code: 'HURT' },
  { name: '12. M.V. Theft (combined)', code: 'MV_THEFT' },
  { name: '   - Police Station',     code: 'MV_THEFT', isSub: true },
  { name: '   - E-FIR App',          code: null, isSub: true },
  { name: '13. House Theft (combined)', code: 'HOUSE_THEFT' },
  { name: '   - Police Station',     code: 'HOUSE_THEFT', isSub: true },
  { name: '   - E-FIR App',          code: null, isSub: true },
  { name: '14. Misc. Theft (combined)', code: 'OTHER_THEFT' },
  { name: '   - Police Station',     code: 'OTHER_THEFT', isSub: true },
  { name: '   - E-FIR App',          code: null, isSub: true },
  { name: '15. Kidnapping',          code: 'KIDNAPPING' },
  { name: '16. Abduction',           code: 'ABDUCTION' },
  { name: '17. M.O. Women',          code: 'MO_WOMEN' },
  { name: '18. 498-A/406 IPC (85 BNS)', code: 'CRUELTY_BY_HUSBAND' },
  { name: '19. Eve-Teasing',         code: 'EVE_TEASING' },
  { name: '20. Sim Accident',        code: 'SIMPLE_ACCIDENT' },
  { name: '21. Fatal Accident',      code: 'FATAL_ACCIDENT' },
  { name: '22. Total Cheating (combined)', code: 'CHEATING' },
  { name: '   - Forgery Cheating',   code: 'FORGERY', isSub: true },
  { name: '   - Street Cheating',    code: null, isSub: true },
  { name: '   - Cyber Cheating (NCRP)', code: null, isSub: true },
  { name: '   - e-Cheating',         code: null, isSub: true },
  { name: '23. Drugging',            code: 'DRUGGING' },
  { name: '24. Dowry Death',         code: 'DOWRY_DEATH' },
  { name: 'Other BNS / Other IPC',   code: 'OTHER_IPC' },
  { name: 'TOTAL NON HEINOUS',       isTotal: true, group: 'non_heinous' },
  { name: 'TOTAL IPC/BNS',           isTotal: true, group: 'ipc' },
  { name: 'Arms Act',                code: 'ARMS_ACT', isAct: true },
  { name: 'Excise Act',              code: 'EXCISE_ACT', isAct: true },
  { name: 'Gambling Act',            code: 'GAMBLING_ACT', isAct: true },
  { name: 'NDPS Act',                code: 'NDPS_ACT', isAct: true },
  { name: 'Elect. Act',              code: 'ELECT_ACT', isAct: true },
  { name: 'DPDP Act',                code: 'DPDP_ACT', isAct: true },
  { name: 'POCSO Act',               code: 'POCSO', isAct: true },
  { name: 'IT Act',                  code: 'IT_ACT', isAct: true },
  { name: 'Copy Right Act',          code: 'COPYRIGHT_ACT', isAct: true },
  { name: 'Other Act',               code: 'OTHER_ACT', isAct: true },
  { name: 'TOTAL ACT',               isTotal: true, group: 'act' },
  { name: 'GRAND TOTAL',             isTotal: true, group: 'grand' },
];

const HEINOUS_CODES = new Set(['DACOITY','MURDER','ATT_TO_MURDER','ROBBERY','RIOT','KID_FOR_RANSOM','RAPE']);
const ACT_CODES = new Set(['ARMS_ACT','EXCISE_ACT','GAMBLING_ACT','NDPS_ACT','ELECT_ACT','DPDP_ACT','POCSO','IT_ACT','COPYRIGHT_ACT','OTHER_ACT']);

export function renderDCsPChart(workbook, scope, calcData) {
  let sheet = workbook.getWorksheet('DCsP- Crime Chart') || workbook.getWorksheet('DCsP- Crime Chart ') || workbook.addWorksheet('DCsP- Crime Chart');
  const distTitle = formatDistrictTitle(scope.self_name);
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;
  const dbc = calcData.distByCode || {};

  const gd = (code, field) => Number(dbc[code]?.[field] || 0);

  // Precompute group totals
  const sums = { heinous: {}, non_heinous: {}, ipc: {}, act: {}, grand: {} };
  const tFields = ['dayY','dayY1','dayYWo','dayY1Wo','repY','repY1','woY','woY1'];
  Object.values(sums).forEach(g => tFields.forEach(f => (g[f] = 0)));

  ROWS.forEach(r => {
    if (!r.code || r.isSub || r.isTotal) return;
    tFields.forEach(f => {
      const v = gd(r.code, f);
      if (r.isHeinous) { sums.heinous[f] += v; sums.ipc[f] += v; sums.grand[f] += v; }
      else if (r.isAct) { sums.act[f] += v; sums.grand[f] += v; }
      else              { sums.non_heinous[f] += v; sums.ipc[f] += v; sums.grand[f] += v; }
    });
  });

  // Title Row 1
  safeMerge(sheet, 'A1:M1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `DCsP CRIME CHART — ${distTitle}`;
  titleCell.font = FONTS.TITLE;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const r2 = sheet.addRow([
    'Crime Head / Sub-Category',
    `Today Y (${yearNum}) Rep`, '',
    `Today Y-1 (${yearPrev}) Rep`, '',
    'Inc/Dec %',
    `Upto Date Y (${yearNum})`, '', '', '',
    `Upto Date Y-1 (${yearPrev})`, '', ''
  ]);
  r2.height = 24;

  const r3 = sheet.addRow([
    '',
    'Rep', 'W-O',
    'Rep', 'W-O',
    '',
    'Rep', 'W-O', 'N-W', 'W/out %age Y',
    'Rep', 'W-O', 'W/out %age Y-1'
  ]);
  r3.height = 22;

  safeMerge(sheet, 'A2:A3');
  safeMerge(sheet, 'B2:C2');
  safeMerge(sheet, 'D2:E2');
  safeMerge(sheet, 'F2:F3');
  safeMerge(sheet, 'G2:J2');
  safeMerge(sheet, 'K2:M2');

  [r2, r3].forEach(row => {
    row.eachCell(c => {
      c.font = FONTS.HEADER;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  function fmtRow(dayY, dayYWo, dayY1, dayY1Wo, repY, woY, repY1, woY1) {
    const incDec = varPct(dayY, dayY1);
    const nwY    = computeNotWorkedOut(repY, woY);
    const solY   = detPct(woY, repY);
    const solY1  = detPct(woY1, repY1);
    const f  = v => v > 0 ? v : '-';
    return [f(dayY), f(dayYWo), f(dayY1), f(dayY1Wo), incDec, f(repY), f(woY), f(nwY), solY, f(repY1), f(woY1), solY1];
  }

  ROWS.forEach(r => {
    let cells;
    if (r.isTotal) {
      const s = sums[r.group];
      cells = fmtRow(s.dayY, s.dayYWo, s.dayY1, s.dayY1Wo, s.repY, s.woY, s.repY1, s.woY1);
    } else if (r.isSub || !r.code) {
      cells = ['-','-','-','-','-','-','-','-','-','-','-','-'];
    } else {
      cells = fmtRow(
        gd(r.code,'dayY'), gd(r.code,'dayYWo'), gd(r.code,'dayY1'), gd(r.code,'dayY1Wo'),
        gd(r.code,'repY'), gd(r.code,'woY'), gd(r.code,'repY1'), gd(r.code,'woY1'),
      );
    }

    const dRow = sheet.addRow([r.name, ...cells]);
    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = r.isTotal ? FONTS.HEADER : FONTS.DATA;
      if (r.isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 35 : 14; });
}
