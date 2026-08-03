import { PALETTE, FONTS } from '../../shared/canonical-codes.js';
import { ALL_HEADS, HEINOUS_CODES, ACT_CODES, buildGroupSums } from '../fn-heads.js';

/**
 * STAT 37 — Pending Cases by Age Buckets
 * Uses pendingRows from fetchPendingCasesByAge: { canonical_code, age_bucket, cnt }
 */
export function renderStat37(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 37 Pending Age');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd } = calcData;

  sheet.mergeCells('A1:F1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 37 — PENDING CASES BY AGE — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = `As of FN End: ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Head of Crime',
    'Total Pending',
    'Under 6 Months',
    '6–12 Months',
    '1–2 Years',
    'Over 2 Years',
  ]);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Build pending age map: { canonical_code → { lt6m, 6to12m, 1to2yr, gt2yr, total } }
  const ageMap = {};
  for (const r of (calcData.pendingRows || [])) {
    const code = r.canonical_code || '__UNKNOWN__';
    if (!ageMap[code]) ageMap[code] = { lt6m: 0, '6to12m': 0, '1to2yr': 0, gt2yr: 0 };
    ageMap[code][r.age_bucket] = (ageMap[code][r.age_bucket] || 0) + Number(r.cnt);
  }

  // Group sums
  const buckets = ['lt6m', '6to12m', '1to2yr', 'gt2yr'];
  const groupSums = {
    heinous: {}, non_heinous: {}, ipc: {}, act: {}, grand: {},
  };
  Object.values(groupSums).forEach(g => buckets.forEach(b => (g[b] = 0)));

  ALL_HEADS.forEach(h => {
    if (!h.code || h.isTotal) return;
    const am = ageMap[h.code] || {};
    const grps = HEINOUS_CODES.has(h.code)
      ? ['heinous', 'ipc', 'grand']
      : ACT_CODES.has(h.code)
        ? ['act', 'grand']
        : ['non_heinous', 'ipc', 'grand'];
    buckets.forEach(b => {
      const v = am[b] || 0;
      grps.forEach(g => { groupSums[g][b] += v; });
    });
  });

  const f = v => v > 0 ? v : '-';

  ALL_HEADS.forEach(h => {
    let lt6m, m6to12, yr1to2, gt2yr;
    if (h.isTotal) {
      lt6m   = groupSums[h.group].lt6m    || 0;
      m6to12 = groupSums[h.group]['6to12m'] || 0;
      yr1to2 = groupSums[h.group]['1to2yr'] || 0;
      gt2yr  = groupSums[h.group].gt2yr   || 0;
    } else {
      const am = ageMap[h.code] || {};
      lt6m   = am.lt6m    || 0;
      m6to12 = am['6to12m'] || 0;
      yr1to2 = am['1to2yr'] || 0;
      gt2yr  = am.gt2yr   || 0;
    }
    const total = lt6m + m6to12 + yr1to2 + gt2yr;

    const row = sheet.addRow([h.label, f(total), f(lt6m), f(m6to12), f(yr1to2), f(gt2yr)]);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = h.isTotal ? FONTS.HEADER : FONTS.DATA;
      if (h.isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 34 : 16; });
}
