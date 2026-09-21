import puppeteer from 'puppeteer';
import { varPct, detPct, computeNotWorkedOut } from './calc.js';

const SHARED_CSS = `
  @page {
    size: A4 landscape;
    margin: 12mm 10mm 12mm 10mm;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-size: 8pt;
      color: #666;
    }
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: 'Segoe UI', Calibri, Arial, sans-serif;
    color: #1a1a1a;
    background: #fff;
    margin: 0;
    padding: 0;
    font-size: 9pt;
    line-height: 1.3;
  }
  .report-page {
    page-break-after: always;
    padding-bottom: 20px;
  }
  .report-page:last-child {
    page-break-after: auto;
  }
  .report-header {
    border-bottom: 2px solid #1F4E79;
    padding-bottom: 8px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .report-title {
    font-size: 14pt;
    font-weight: bold;
    color: #1F4E79;
    margin: 0;
    text-transform: uppercase;
  }
  .report-subtitle {
    font-size: 9pt;
    color: #555;
    margin: 3px 0 0 0;
  }
  .report-meta {
    font-size: 8.5pt;
    color: #444;
    text-align: right;
  }
  .sheet-section {
    margin-bottom: 20px;
  }
  .sheet-title {
    font-size: 11pt;
    font-weight: bold;
    color: #003366;
    background: #eef3f8;
    padding: 6px 10px;
    border-left: 4px solid #1F4E79;
    margin: 0 0 8px 0;
  }
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    font-size: 8pt;
  }
  table.data-table th, table.data-table td {
    border: 1px solid #c0c0c0;
    padding: 4px 6px;
  }
  table.data-table th {
    background-color: #1F4E79;
    color: #ffffff;
    font-weight: bold;
    text-align: center;
    vertical-align: middle;
  }
  table.data-table th.sub-header {
    background-color: #FCD5B5;
    color: #333333;
    font-size: 7.5pt;
  }
  table.data-table th.group-header {
    background-color: #2e6b9e;
    color: #fff;
  }
  table.data-table td {
    vertical-align: middle;
  }
  table.data-table td.text-left { text-align: left; }
  table.data-table td.text-center { text-align: center; }
  table.data-table td.text-right { text-align: right; }
  table.data-table tr.total-row td {
    background-color: #fff2cc;
    font-weight: bold;
    border-top: 2px solid #b38600;
    border-bottom: 2px solid #b38600;
  }
  table.data-table tr.group-total td {
    background-color: #eaeaea;
    font-weight: bold;
  }
  table.data-table tr:nth-child(even):not(.total-row):not(.group-total) {
    background-color: #f9fbfd;
  }
  .badge {
    display: inline-block;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 7pt;
    font-weight: bold;
  }
  .badge-heinous { background: #fee2e2; color: #991b1b; }
  .badge-act { background: #fef3c7; color: #92400e; }
  .badge-ipc { background: #e0e7ff; color: #3730a3; }
`;

export function renderDistrictDiaryHtml(scope, calcData, selectedSheets = []) {
  const districtTitle = (scope.self_name || 'DISTRICT').toUpperCase();
  const cutoffDate = calcData.cutoff_date || new Date().toISOString().slice(0, 10);
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const { psByCode = {}, psByCodeY1 = {}, psByCodeWo = {}, psByCodeY1Wo = {} } = calcData;

  const HEINOUS_CODES = ['DACOITY','MURDER','ATT_TO_MURDER','ROBBERY','RIOT','KID_FOR_RANSOM','RAPE'];
  const ACT_CODES = ['ARMS_ACT','EXCISE_ACT','GAMBLING_ACT','NDPS_ACT','POCSO','ORGANISED_CRIME','TERRORIST_ACT','OTHER_ACT'];
  const NON_HEINOUS_CODES = [
    'EXTORTION','SNATCHING','HURT','BURGLARY','HOUSE_THEFT','MV_THEFT',
    'SERVANT_THEFT','OTHER_THEFT','MO_WOMEN','EVE_TEASING','KIDNAPPING',
    'ABDUCTION','FATAL_ACCIDENT','SIMPLE_ACCIDENT','OTHER_IPC'
  ];

  function psAgg(psId, codes) {
    const g = c => Number(psByCode[psId]?.[c] || 0);
    const g1= c => Number(psByCodeY1[psId]?.[c] || 0);
    const w = c => Number(psByCodeWo[psId]?.[c] || 0);
    const w1= c => Number(psByCodeY1Wo[psId]?.[c] || 0);
    return codes.reduce((acc, c) => {
      acc.repY += g(c); acc.repY1 += g1(c);
      acc.woY += w(c); acc.woY1 += w1(c);
      return acc;
    }, { repY: 0, repY1: 0, woY: 0, woY1: 0 });
  }

  let chartRowsHtml = '';
  const distH = { repY: 0, repY1: 0, woY: 0, woY1: 0 };
  const distNH = { repY: 0, repY1: 0, woY: 0, woY1: 0 };
  const distAct = { repY: 0, repY1: 0, woY: 0, woY1: 0 };

  children.forEach(psId => {
    const psName = displayNames[psId] || psId;
    const h = psAgg(psId, HEINOUS_CODES);
    const nh = psAgg(psId, NON_HEINOUS_CODES);
    const act = psAgg(psId, ACT_CODES);
    const bns = { repY: h.repY + nh.repY, repY1: h.repY1 + nh.repY1, woY: h.woY + nh.woY, woY1: h.woY1 + nh.woY1 };

    ['repY','repY1','woY','woY1'].forEach(f => {
      distH[f] += h[f]; distNH[f] += nh[f]; distAct[f] += act[f];
    });

    const fmtCol = (d) => `
      <td class="text-center">${d.repY1 || '-'}</td>
      <td class="text-center">${d.repY || '-'}</td>
      <td class="text-center">${d.woY1 || '-'}</td>
      <td class="text-center">${d.woY || '-'}</td>
      <td class="text-center">${computeNotWorkedOut(d.repY, d.woY) || '-'}</td>
      <td class="text-center">${detPct(d.woY, d.repY)}</td>
      <td class="text-center">${varPct(d.repY, d.repY1)}</td>
    `;

    chartRowsHtml += `
      <tr>
        <td class="text-left font-semibold">${psName}</td>
        ${fmtCol(h)}
        ${fmtCol(nh)}
        ${fmtCol(bns)}
        ${fmtCol(act)}
      </tr>
    `;
  });

  const distBns = { repY: distH.repY + distNH.repY, repY1: distH.repY1 + distNH.repY1, woY: distH.woY + distNH.woY, woY1: distH.woY1 + distNH.woY1 };
  const fmtTotCol = (d) => `
    <td class="text-center">${d.repY1 || '-'}</td>
    <td class="text-center">${d.repY || '-'}</td>
    <td class="text-center">${d.woY1 || '-'}</td>
    <td class="text-center">${d.woY || '-'}</td>
    <td class="text-center">${computeNotWorkedOut(d.repY, d.woY) || '-'}</td>
    <td class="text-center">${detPct(d.woY, d.repY)}</td>
    <td class="text-center">${varPct(d.repY, d.repY1)}</td>
  `;

  const totalRowHtml = `
    <tr class="total-row">
      <td class="text-left">TOTAL ${districtTitle}</td>
      ${fmtTotCol(distH)}
      ${fmtTotCol(distNH)}
      ${fmtTotCol(distBns)}
      ${fmtTotCol(distAct)}
    </tr>
  `;

  // Heinous Brief Facts Table
  const heinousList = calcData.heinousList || [];
  let heinousTableRows = '';
  if (heinousList.length === 0) {
    heinousTableRows = `<tr><td colspan="7" class="text-center">Nil heinous cases reported on ${cutoffDate}</td></tr>`;
  } else {
    heinousList.forEach((item, idx) => {
      heinousTableRows += `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td class="text-left">${item.ps_name || '-'}</td>
          <td class="text-center font-bold">${item.fir_no || '-'}</td>
          <td class="text-center"><span class="badge badge-heinous">${item.canonical_code || 'HEINOUS'}</span></td>
          <td class="text-center">${item.registration_date || cutoffDate}</td>
          <td class="text-left">${item.brief_facts || 'N/A'}</td>
        </tr>
      `;
    });
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>District Crime Diary - ${districtTitle}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <!-- Page 1: Crime Chart -->
  <div class="report-page">
    <div class="report-header">
      <div>
        <h1 class="report-title">DELHI POLICE — ${districtTitle} DISTRICT</h1>
        <p class="report-subtitle">Daily Crime Compilation & Comparative Analysis</p>
      </div>
      <div class="report-meta">
        <strong>Cutoff Date:</strong> ${cutoffDate}<br>
        <strong>Generated:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
      </div>
    </div>

    <div class="sheet-section">
      <h2 class="sheet-title">CRIME CHART (HEINOUS, OTHER BNS & TOTAL BNS / ACT)</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th rowspan="2">Police Station</th>
            <th colspan="7" class="group-header">TOTAL HEINOUS (Up to Date)</th>
            <th colspan="7" class="group-header">OTHER BNS / IPC (Up to Date)</th>
            <th colspan="7" class="group-header">TOTAL BNS / IPC (Up to Date)</th>
            <th colspan="7" class="group-header">TOTAL ACT (Up to Date)</th>
          </tr>
          <tr>
            <th class="sub-header">${yearPrev}</th><th class="sub-header">${yearNum}</th>
            <th class="sub-header">W/O ${yearPrev}</th><th class="sub-header">W/O ${yearNum}</th>
            <th class="sub-header">N/W</th><th class="sub-header">Det%</th><th class="sub-header">Var%</th>
            <th class="sub-header">${yearPrev}</th><th class="sub-header">${yearNum}</th>
            <th class="sub-header">W/O ${yearPrev}</th><th class="sub-header">W/O ${yearNum}</th>
            <th class="sub-header">N/W</th><th class="sub-header">Det%</th><th class="sub-header">Var%</th>
            <th class="sub-header">${yearPrev}</th><th class="sub-header">${yearNum}</th>
            <th class="sub-header">W/O ${yearPrev}</th><th class="sub-header">W/O ${yearNum}</th>
            <th class="sub-header">N/W</th><th class="sub-header">Det%</th><th class="sub-header">Var%</th>
            <th class="sub-header">${yearPrev}</th><th class="sub-header">${yearNum}</th>
            <th class="sub-header">W/O ${yearPrev}</th><th class="sub-header">W/O ${yearNum}</th>
            <th class="sub-header">N/W</th><th class="sub-header">Det%</th><th class="sub-header">Var%</th>
          </tr>
        </thead>
        <tbody>
          ${chartRowsHtml}
          ${totalRowHtml}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Page 2: D-2 Heinous Brief Facts -->
  <div class="report-page">
    <div class="report-header">
      <div>
        <h1 class="report-title">D-2 HEINOUS BRIEF FACTS STATEMENT — ${districtTitle}</h1>
        <p class="report-subtitle">Statutory Heinous Crime Narratives (Reported on ${cutoffDate})</p>
      </div>
      <div class="report-meta">
        <strong>Cutoff Date:</strong> ${cutoffDate}
      </div>
    </div>

    <div class="sheet-section">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 5%;">S.No</th>
            <th style="width: 15%;">Police Station</th>
            <th style="width: 12%;">FIR No.</th>
            <th style="width: 12%;">Head of Crime</th>
            <th style="width: 10%;">Reg. Date</th>
            <th style="width: 46%;">Brief Facts of the Case</th>
          </tr>
        </thead>
        <tbody>
          ${heinousTableRows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

export function renderPHQDiaryHtml(cutoffDate, scope, manualyData, selectedSheets = []) {
  const windows = manualyData.windows || {};
  const yearCurr = windows.year_curr || new Date(cutoffDate).getFullYear();
  const yearPrev = windows.year_prev || yearCurr - 1;

  const renderCrimeRows = (rows) => (rows || []).map(r => `
    <tr>
      <td class="text-left font-medium">${r.label}</td>
      <td class="text-center">${r.day_prev || '-'}</td>
      <td class="text-center">${r.day_curr || '-'}</td>
      <td class="text-center">${varPct(r.day_curr, r.day_prev)}</td>
      <td class="text-center">${r.upto_prev || '-'}</td>
      <td class="text-center">${r.upto_curr || '-'}</td>
      <td class="text-center">${varPct(r.upto_curr, r.upto_prev)}</td>
      <td class="text-center">${r.det_upto_prev || '-'}</td>
      <td class="text-center">${r.det_upto_curr || '-'}</td>
      <td class="text-center">${detPct(r.det_upto_curr, r.upto_curr)}</td>
    </tr>
  `).join('');

  const renderSummaryRow = (label, obj) => `
    <tr class="total-row">
      <td class="text-left">${label}</td>
      <td class="text-center">${obj.day_prev || '-'}</td>
      <td class="text-center">${obj.day_curr || '-'}</td>
      <td class="text-center">${varPct(obj.day_curr, obj.day_prev)}</td>
      <td class="text-center">${obj.upto_prev || '-'}</td>
      <td class="text-center">${obj.upto_curr || '-'}</td>
      <td class="text-center">${varPct(obj.upto_curr, obj.upto_prev)}</td>
      <td class="text-center">${obj.det_upto_prev || '-'}</td>
      <td class="text-center">${obj.det_upto_curr || '-'}</td>
      <td class="text-center">${detPct(obj.det_upto_curr, obj.upto_curr)}</td>
    </tr>
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PHQ Daily Crime Diary - ${cutoffDate}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="report-page">
    <div class="report-header">
      <div>
        <h1 class="report-title">DELHI POLICE HEADQUARTERS</h1>
        <p class="report-subtitle">Daily Crime Diary — Executive Crime & Enforcement Statement</p>
      </div>
      <div class="report-meta">
        <strong>Cutoff Date:</strong> ${cutoffDate}<br>
        <strong>Scope:</strong> ALL DELHI (STATEWIDE)
      </div>
    </div>

    <div class="sheet-section">
      <h2 class="sheet-title">STATEWIDE CRIME SUMMARY (HEINOUS, NON-HEINOUS & SPECIAL ACTS)</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th rowspan="2" style="width: 24%;">Crime Head</th>
            <th colspan="3" class="group-header">Daily (${cutoffDate})</th>
            <th colspan="3" class="group-header">Cumulative (Up to Date)</th>
            <th colspan="3" class="group-header">Detections (Up to Date)</th>
          </tr>
          <tr>
            <th class="sub-header">${yearPrev}</th><th class="sub-header">${yearCurr}</th><th class="sub-header">Var%</th>
            <th class="sub-header">${yearPrev}</th><th class="sub-header">${yearCurr}</th><th class="sub-header">Var%</th>
            <th class="sub-header">W/O ${yearPrev}</th><th class="sub-header">W/O ${yearCurr}</th><th class="sub-header">Det%</th>
          </tr>
        </thead>
        <tbody>
          <tr class="group-total"><td colspan="10" class="text-left">I. HEINOUS CRIME HEADS</td></tr>
          ${renderCrimeRows(manualyData.heinousRows)}
          ${renderSummaryRow('TOTAL HEINOUS', manualyData.totalHeinous || {})}

          <tr class="group-total"><td colspan="10" class="text-left">II. NON-HEINOUS CRIME HEADS</td></tr>
          ${renderCrimeRows(manualyData.nonHeinousRows)}
          ${renderSummaryRow('TOTAL NON-HEINOUS', manualyData.totalNonHeinous || {})}
          ${renderSummaryRow('TOTAL IPC / BNS', manualyData.totalIPC || {})}

          <tr class="group-total"><td colspan="10" class="text-left">III. LOCAL & SPECIAL LAWS (LSL) / SPECIAL ACTS</td></tr>
          ${renderCrimeRows(manualyData.lslRows)}
          ${renderSummaryRow('TOTAL ACT', manualyData.totalAct || {})}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

export async function convertHtmlToPdf(htmlContent) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
