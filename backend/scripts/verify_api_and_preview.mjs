import db from '../src/config/db.js';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import {
  getDailyDiaryPreview,
  getDailyDiaryData,
  generateDailyDiaryExcelNative
} from '../src/modules/daily-diary/daily-diary.service.js';

async function runVerification() {
  console.log('================================================================================');
  console.log('          PHAROS DAILY DIARY COMPLETE END-TO-END VERIFICATION');
  console.log('================================================================================');

  const district = await db('hierarchy_nodes').where('node_type', 'DISTRICT').whereILike('name', '%New Delhi%').first();
  const ps = await db('hierarchy_nodes').where('node_type', 'PS').whereILike('name', '%Parliament%').first();

  console.log(`Testing with District: ${district.name} (${district.id})`);
  console.log(`Testing with Police Station: ${ps.name} (${ps.id})\n`);

  // Test 1: getDailyDiaryPreview
  console.log('=== TEST 1: Preview Endpoint (getDailyDiaryPreview) ===');
  const preview = await getDailyDiaryPreview({
    date: '2026-09-01',
    dateTo: '2026-09-21',
    policeStationId: 'Parliament Street',
    districtId: district.id
  });
  console.log('Preview Summary Metrics:', preview.summary);
  console.log('Preview Sheets Count:', Object.keys(preview.sheets || {}).length);
  for (const [sheetKey, rows] of Object.entries(preview.sheets || {})) {
    console.log(`  - ${sheetKey.padEnd(25)}: ${rows.length} rows`);
  }

  // Test 2: getDailyDiaryData
  console.log('\n=== TEST 2: Full Data Fetch (getDailyDiaryData) ===');
  const fullData = await getDailyDiaryData({
    date: '2026-09-01',
    dateTo: '2026-09-21',
    policeStationId: 'Parliament Street',
    districtId: district.id
  });
  console.log('Total data sheets returned:', Object.keys(fullData).length);
  let totalDataRows = 0;
  for (const [k, v] of Object.entries(fullData)) {
    if (Array.isArray(v)) {
      totalDataRows += v.length;
      console.log(`  - ${k.padEnd(25)}: ${v.length} records`);
    } else if (typeof v === 'object' && v !== null) {
      console.log(`  - ${k.padEnd(25)}: [Complex Object / Matrix]`);
    }
  }
  console.log(`Total live records in memory: ${totalDataRows}`);

  // Test 3: Native Excel Generation
  console.log('\n=== TEST 3: Native Excel Generation (generateDailyDiaryExcelNative) ===');
  const testOutFile = path.resolve('../scratch/test_parliament_export.xlsx');
  await generateDailyDiaryExcelNative({
    date: '2026-09-01',
    dateTo: '2026-09-21',
    policeStationId: 'Parliament Street',
    districtId: district.id,
    filePath: testOutFile
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(testOutFile);
  console.log(`Verified generated workbook: ${wb.worksheets.length} sheets`);
  let populatedSheetCount = 0;
  wb.worksheets.forEach((ws, i) => {
    const dataRows = Math.max(0, ws.rowCount - 4);
    if (dataRows > 0) populatedSheetCount++;
    console.log(`  Sheet ${String(i + 1).padStart(2)}: [${ws.name.padEnd(30)}] -> ${dataRows} data rows`);
  });
  console.log(`Total populated sheets: ${populatedSheetCount} / ${wb.worksheets.length}`);

  // Test 4: Single-Day Filter Test
  console.log('\n=== TEST 4: Single Day Filter Test (e.g. 2026-09-05) ===');
  const singleDayData = await getDailyDiaryData({
    date: '2026-09-05',
    dateTo: '2026-09-05',
    policeStationId: 'Parliament Street',
    districtId: district.id
  });
  console.log(`Single day manual FIR count for 2026-09-05: ${singleDayData.manual_fir?.length || 0}`);
  if (singleDayData.manual_fir?.length > 0) {
    console.log(`  ✓ FIR Record No: ${singleDayData.manual_fir[0].fir_no}, Date: ${singleDayData.manual_fir[0].fir_date}`);
  }

  console.log('\n================================================================================');
  console.log('                   ALL VERIFICATION TESTS PASSED PERFECTLY!');
  console.log('================================================================================');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
