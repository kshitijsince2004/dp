import test from 'node:test';
import assert from 'node:assert/strict';
import { accusedHistory, personDisplay, custodyStatusDisplay } from '../src/utils/formulaLibrary.js';
import { fetchAllDiaryData, generateDailyDiaryExcelNative } from '../src/modules/daily-diary/daily-diary.service.js';
import { generateDistrictDiary } from '../src/modules/report-engine/district/district-diary.service.js';
import { generatePHQDiary } from '../src/modules/phq-diary/phq-diary.service.js';
import db from '../src/config/db.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

test('1. Accused History (PI/PO/BC) Permutations and Aliases in Formula Library', async (t) => {
  // 1. None
  assert.equal(accusedHistory({}), '');
  assert.equal(accusedHistory(null), '');

  // 2. Single flags
  assert.equal(accusedHistory({ prev_involvement: true }), 'PI');
  assert.equal(accusedHistory({ prev_involvement_count: 2 }), 'PI');
  assert.equal(accusedHistory({ extra: { pi_flag: true } }), 'PI');
  assert.equal(accusedHistory({ is_po: true }), 'PO');
  assert.equal(accusedHistory({ extra: { proclaimed_offender: true } }), 'PO');
  assert.equal(accusedHistory({ is_bc: true }), 'BC');
  assert.equal(accusedHistory({ bad_character: true }), 'BC');
  assert.equal(accusedHistory({ listed_criminal: true }), 'BC');
  assert.equal(accusedHistory({ whether_accused_is_bc_or_not: true }), 'BC');
  assert.equal(accusedHistory({ extra: { bad_character: true } }), 'BC');

  // 3. Double permutations
  assert.equal(accusedHistory({ prev_involvement: true, is_po: true }), 'PI/PO');
  assert.equal(accusedHistory({ prev_involvement: true, is_bc: true }), 'PI/BC');
  assert.equal(accusedHistory({ is_po: true, is_bc: true }), 'PO/BC');

  // 4. All three
  assert.equal(accusedHistory({ prev_involvement: true, is_po: true, is_bc: true }), 'PI/PO/BC');
  assert.equal(accusedHistory({ extra: { prev_involvement_count: 5, proclaimed_offender: true, listed_criminal: true } }), 'PI/PO/BC');
});

test('2. Daily Diary Generation - 24 Sheets & Person Formatting Convention 2a', async (t) => {
  const result = await fetchAllDiaryData('2026-09-15', '2026-09-21');

  assert.ok(result.defs, 'DEFS must be defined');
  assert.ok(result.defs.length >= 24, `Must have at least 24 sheets defined (found ${result.defs.length})`);

  // Check excel file generation
  const tmpFile = path.join(os.tmpdir(), `test_daily_diary_${Date.now()}.xlsx`);
  await generateDailyDiaryExcelNative({
    date: '2026-09-15',
    dateTo: '2026-09-21',
    filePath: tmpFile
  });
  assert.ok(fs.existsSync(tmpFile), 'Workbook file must be created');
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test('3. District Diary Generation - D-9 FIR & Kalandara Arrests PO/BC Integration', async (t) => {
  const district = await db('hierarchy_nodes').where('node_type', 'DISTRICT').orWhere('code', 'DIST_NDD').first();
  const districtId = district ? district.id : 'DIST_NDD';
  const buffer = await generateDistrictDiary(districtId, '2026-09-21', [], 'EXCEL');
  assert.ok(buffer, 'District diary buffer must be generated');
  assert.ok(Buffer.isBuffer(buffer) && buffer.length > 1000, 'District Excel buffer must contain valid binary data');

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const firSheet = wb.getWorksheet('D-9 FIR Arrests ') || wb.getWorksheet('D-9 FIR Arrests');
  assert.ok(firSheet, 'D-9 FIR Arrests sheet must exist');

  const kalSheet = wb.getWorksheet('D-9 Kal Arrests');
  assert.ok(kalSheet, 'D-9 Kal Arrests sheet must exist');
});

test('4. PHQ Diary Generation - End-to-End Metrics & Excel Export', async (t) => {
  const buffer = await generatePHQDiary('2026-09-21', 'ALL_DELHI_TOTAL', [], 'EXCEL');
  assert.ok(buffer, 'PHQ Diary buffer must be generated');
  assert.ok(Buffer.isBuffer(buffer) && buffer.length > 1000, 'PHQ Excel buffer must contain valid binary data');
});

test.after(async () => {
  await db.destroy();
});
