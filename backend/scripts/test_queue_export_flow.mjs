import db from '../src/config/db.js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import { queueDailyDiaryExport } from '../src/modules/daily-diary/daily-diary.service.js';

async function testExportQueue() {
  console.log('Testing queueDailyDiaryExport for Parliament Street across date range 2026-09-01 to 2026-09-21...');

  const user = await db('users').whereILike('username', '%parliament%').first() || await db('users').first();
  const ps = await db('hierarchy_nodes').where('node_type', 'PS').whereILike('name', '%Parliament%').first();
  const dist = await db('hierarchy_nodes').where('node_type', 'DISTRICT').whereILike('name', '%New Delhi%').first();

  console.log(`User: ${user.username}, PS: ${ps.name}, District: ${dist.name}`);

  const { jobId } = await queueDailyDiaryExport(
    user,
    '2026-09-01',
    ps.id,
    dist.id,
    null,
    null,
    '2026-09-21'
  );

  console.log(`Queued Job ID: ${jobId}`);

  // Wait for background generation
  let jobRecord = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    jobRecord = await db('report_jobs').where({ id: jobId }).first();
    if (jobRecord && (jobRecord.status === 'READY' || jobRecord.status === 'COMPLETED' || jobRecord.status === 'FAILED')) {
      break;
    }
  }

  console.log(`Final Job Status: ${jobRecord?.status}`);
  console.log(`File Path: ${jobRecord?.file_path}`);
  if (jobRecord?.status !== 'READY') {
    throw new Error(`Job did not reach READY status. Error: ${jobRecord?.error_message}`);
  }

  // Inspect generated excel file
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(jobRecord.file_path);

  console.log(`\nWorkbook Inspection (${wb.worksheets.length} sheets):`);
  let populatedCount = 0;
  wb.worksheets.forEach((ws, idx) => {
    const dataRows = Math.max(0, ws.rowCount - 4);
    if (dataRows > 0) populatedCount++;
    console.log(`  [${String(idx + 1).padStart(2)}] ${ws.name.padEnd(32)}: ${dataRows} rows (${dataRows > 0 ? '✓ POPULATED' : 'EMPTY'})`);
  });

  console.log(`\nResult: ${populatedCount} / ${wb.worksheets.length} sheets populated with live records.`);
  if (populatedCount === 20) {
    console.log('SUCCESS: All 20 sheets populated perfectly without missing data!');
  } else {
    console.log(`WARNING: ${20 - populatedCount} sheets did not populate.`);
  }

  process.exit(0);
}

testExportQueue().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
