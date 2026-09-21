import { config } from 'dotenv';
config();

const districtDiaryService = await import('./src/modules/report-engine/district/district-diary.service.js');
import ExcelJS from 'exceljs';
import fs from 'fs';

async function testDistrictDiary() {
  const cutoffDate = '2026-09-21';
  console.log('Generating District Diary report using template...');

  const buffer = await districtDiaryService.generateDistrictDiary('DIST_NDD', cutoffDate, [], 'EXCEL');

  const outFile = 'C:/Users/vaibh/.gemini/antigravity-ide/brain/94910170-cf86-49be-97f3-eb9f1b001163/scratch/test_district_diary_output.xlsx';
  fs.writeFileSync(outFile, buffer);
  console.log('✅ District Diary generated successfully! Saved to:', outFile);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outFile);

  console.log('\n=== GENERATED DISTRICT DIARY WORKBOOK SUMMARY ===');
  console.log('Total worksheets:', wb.worksheets.length);
  wb.worksheets.forEach(ws => {
    console.log(`Sheet "${ws.name}": ${ws.rowCount} rows`);
  });

  process.exit(0);
}

testDistrictDiary().catch(err => {
  console.error(err);
  process.exit(1);
});
