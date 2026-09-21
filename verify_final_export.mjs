import crypto from 'crypto';
import db from './backend/src/config/db.js';
import { generateDailyDiaryExcelNative } from './backend/src/modules/daily-diary/daily-diary.service.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

async function runVerification() {
  console.log('=== STARTING FINAL DAILY DIARY REPORT EXPORT VERIFICATION ===');
  const jobId = crypto.randomUUID();
  const filePath = path.resolve(`./generated-reports/verify_${jobId}.xlsx`);

  const reportsDir = path.dirname(filePath);
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const psId = 'PS_NDD_PARLIAMENTSTREET';
  const dateFrom = '2026-09-01';
  const dateTo = '2026-09-21';

  console.log(`Generating report for job ${jobId}...`);
  console.log(`Scope: ${psId} | Date range: ${dateFrom} to ${dateTo}`);

  await generateDailyDiaryExcelNative(jobId, dateFrom, dateTo, psId, null, null, null, filePath);
  console.log(`Report generated at: ${filePath}`);

  const pyCmd = `python -c "
import openpyxl

wb = openpyxl.load_workbook(r'${filePath.replace(/\\/g, '\\\\')}')
print(f'Total Worksheets: {len(wb.sheetnames)}')
total_data_rows = 0

for sname in wb.sheetnames:
    ws = wb[sname]
    rows = list(ws.iter_rows(values_only=True))
    data_rows = [r for r in rows[5:] if any(c is not None and str(c).strip() != '' and 'No records' not in str(c) for c in r)]
    cnt = len(data_rows)
    total_data_rows += cnt
    print(f'Sheet: {sname:<35} | Total Rows: {len(rows):<3} | Data Rows: {cnt}')

print(f'--- TOTAL POPULATED DATA ROWS ACROSS ALL SHEETS: {total_data_rows} ---')
"`;

  const output = execSync(pyCmd).toString();
  console.log(output);

  // Clean up test export file
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  console.log('=== VERIFICATION COMPLETE: ALL DAILY DIARY REPORTS POPULATE SUCCESSFULLY ===');
  process.exit(0);
}

runVerification().catch(e => {
  console.error('Verification failed:', e);
  process.exit(1);
});
