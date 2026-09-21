import { generateDailyDiaryExcelNative } from '../src/modules/daily-diary/daily-diary.service.js';
import db from '../src/config/db.js';
import ExcelJS from 'exceljs';
import path from 'path';

async function runExportTest() {
  console.log('--- Starting Daily Diary Export Verification ---');

  const filePath = path.resolve('../scratch/test_verified_export.xlsx');
  
  const result = await generateDailyDiaryExcelNative({
    date: '2026-09-01',
    dateTo: '2026-09-21',
    policeStationId: 'Parliament Street',
    userRole: 'PS_OPERATOR',
    userScope: {
      role: 'PS_OPERATOR',
      policeStationId: 'Parliament Street',
    },
    filePath
  });

  console.log('Export generation completed. Output file:', filePath);

  // Inspect generated workbook
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  console.log(`\n=== Workbook Sheet Inspection (${wb.worksheets.length} Sheets) ===`);
  let totalDataRows = 0;
  wb.worksheets.forEach((ws, idx) => {
    // Row 1: Title, Row 2: Subtitle, Row 3: Blank, Row 4: Column Headers, Row 5+: Data rows
    const dataRowCount = Math.max(0, ws.rowCount - 4);
    totalDataRows += dataRowCount;
    console.log(`Sheet ${idx + 1}: [${ws.name}] -> ${ws.rowCount} total rows (${dataRowCount} data rows)`);
  });

  console.log(`\nTotal Data Rows Across All Sheets: ${totalDataRows}`);
  process.exit(0);
}

runExportTest().catch(err => {
  console.error('Export test failed:', err);
  process.exit(1);
});
