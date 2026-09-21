import db from './src/config/db.js';
import { generateDailyDiaryExcelNative } from './src/modules/daily-diary/daily-diary.service.js';
import path from 'path';
import ExcelJS from 'exceljs';

async function testExport() {
  const hcUser = await db('users').where('username', 'hc_parliament_street').first();
  console.log('HC User:', hcUser.username, '| PS ID:', hcUser.ps_id);

  // 1. Query all records for this PS ID in database
  const psRecs = await db('records').where('ps_id', hcUser.ps_id).whereNot('current_status', 'DELETED');
  console.log(`Total non-deleted records in DB for PS Parliament Street: ${psRecs.length}`);

  // 2. Generate export with Date Range covering August-September 2026
  const outPathRange = path.resolve('..', 'scratch', 'Daily_Diary_Parliament_Street_Range.xlsx');
  console.log('\nGenerating export for date range 2026-08-01 to 2026-09-21...');
  await generateDailyDiaryExcelNative('test-job-range', '2026-08-01', '2026-09-21', hcUser.ps_id, null, null, null, outPathRange);

  // Read back generated file
  const wbRange = new ExcelJS.Workbook();
  await wbRange.xlsx.readFile(outPathRange);
  let totalRowsFound = 0;
  for (const ws of wbRange.worksheets) {
    if (ws.rowCount >= 6) {
      console.log(`  Sheet [${ws.name}]: ${ws.rowCount - 5} data row(s)`);
      totalRowsFound += (ws.rowCount - 5);
    }
  }
  console.log(`\nTotal data rows in Range Export: ${totalRowsFound}`);

  // 3. Generate export with Date = null (All Dates)
  const outPathAll = path.resolve('..', 'scratch', 'Daily_Diary_Parliament_Street_All.xlsx');
  console.log('\nGenerating export for ALL dates (date=null)...');
  await generateDailyDiaryExcelNative('test-job-all', null, null, hcUser.ps_id, null, null, null, outPathAll);

  const wbAll = new ExcelJS.Workbook();
  await wbAll.xlsx.readFile(outPathAll);
  let totalRowsAll = 0;
  for (const ws of wbAll.worksheets) {
    if (ws.rowCount >= 6) {
      console.log(`  Sheet [${ws.name}]: ${ws.rowCount - 5} data row(s)`);
      totalRowsAll += (ws.rowCount - 5);
    }
  }
  console.log(`\nTotal data rows in All-Dates Export: ${totalRowsAll}`);

  process.exit(0);
}

testExport().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
