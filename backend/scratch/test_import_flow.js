// backend/scratch/test_import_flow.js
// Automated verification script for Phase 3 Bulk Import module & SELECT validation
import axios from 'axios';
import db from '../src/config/db.js';
import ExcelJS from 'exceljs';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const testPort = 39999;
const baseURL = `http://localhost:${testPort}/api/v1`;

async function run() {
  console.log('[Test] Starting automated integration verification tests for Phase 3 bulk import...');
  
  process.env.PORT = testPort;
  process.env.NODE_ENV = 'development';
  process.env.PHAROS_TEST = 'true';

  const { default: app } = await import('../src/app.js');
  const eventBus = await import('../src/events/eventBus.js');
  const importHandler = await import('../src/events/handlers/importHandler.js');

  try {
    await eventBus.connect();
  } catch (err) {
    console.warn('[Test] RabbitMQ not connected, proceeding in mock event mode...', err.message);
  }

  try {
    await importHandler.init();
  } catch (err) {
    console.error('[Test] Failed to initialize import handler:', err.message);
    process.exit(1);
  }

  let server;
  try {
    server = app.listen(testPort);
    console.log(`[Test] Server booted on port ${testPort}`);
  } catch (err) {
    console.error('[Test] Failed to boot test server:', err.message);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  const assert = (condition, description) => {
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
      failed++;
    }
  };

  try {
    // 1. Authenticate
    const hcRes = await axios.post(`${baseURL}/auth/login`, { badge_no: 'HC001', password: 'test123' });
    assert(hcRes.status === 200, 'HC login succeeds');
    const token = hcRes.data.data.accessToken;

    // 2. Validate SELECT normalisation check (HTTP 422)
    console.log('\n--- Test 2: SELECT normalisation check (HTTP 422) ---');
    const invalidCaseData = {
      fir_no: 'FIR-9999-NWD',
      fir_date: '2026-06-15',
      gd_no: 'GD-88A',
      gd_date: '2026-06-15',
      gd_time: '22:30',
      occurrence_date: '2026-06-15',
      occurrence_place: 'Janpath Metro Station',
      complainant_name: 'Rajesh Tyagi',
      complainant_address: 'Subhash Place Phase 2',
      local_head: 'INVALID_CRIME_HEAD_VALUE', // Out of vocabulary option
      brief_facts: 'Test facts',
      io_name: 'ASI Mahender',
      io_pis: 'PIS-49910',
      status: 'Open'
    };

    try {
      await axios.post(`${baseURL}/records`, {
        record_type: 'CASE',
        record_date: '2026-06-15',
        data: invalidCaseData
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert(false, 'Create record with invalid select option should have failed');
    } catch (err) {
      assert(err.response?.status === 422, 'Server correctly rejects out-of-vocabulary select option with HTTP 422');
      console.log(`[Info] Rejection message: ${err.response?.data?.message}`);
    }

    // 3. Download template
    console.log('\n--- Test 3: GET /import/template/:record_type ---');
    const templateRes = await axios.get(`${baseURL}/import/template/ARREST`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer'
    });
    assert(templateRes.status === 200, 'Arrest import template download succeeds');
    assert(templateRes.headers['content-type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Download has correct Excel Content-Type');

    // 4. Construct a sample Excel import sheet with valid and invalid rows
    console.log('\n--- Test 4: Preparing upload template with mock records ---');
    const inWorkbook = new ExcelJS.Workbook();
    await inWorkbook.xlsx.load(templateRes.data);
    const inWorksheet = inWorkbook.getWorksheet(1);

    // Hidden keys row: check that key is present
    const keysRow = inWorksheet.getRow(1);
    assert(keysRow.getCell(1).value !== null, 'Hidden field_keys header is present');

    // Row 4: Valid record row
    const row4 = inWorksheet.getRow(4);
    // fields: linked_fir_dd_no, act_name, sections, arrested_name, arrested_address, arrest_date, arrest_place, crime_head, status, other_status_reason, io_name, nafis_prepared, dossier_prepared
    // let's fill by field keys order from row 1
    const colCount = keysRow.actualCellCount;
    for (let c = 1; c <= colCount; c++) {
      const key = keysRow.getCell(c).value;
      if (key === 'arrested_name') row4.getCell(c).value = 'Arrestee Valid';
      else if (key === 'arrest_date') row4.getCell(c).value = '2026-06-15';
      else if (key === 'crime_head') row4.getCell(c).value = 'Other IPC'; // Valid select option
      else if (key === 'status') row4.getCell(c).value = 'bail'; // Valid select option
      else if (key === 'linked_fir_dd_no') row4.getCell(c).value = 'FIR/2026/9001';
      else if (key === 'io_name') row4.getCell(c).value = 'SI Rajesh';
    }

    // Row 5: Invalid record row (Missing required field `arrested_name` and bad Date `arrest_date` and invalid `status`)
    const row5 = inWorksheet.getRow(5);
    for (let c = 1; c <= colCount; c++) {
      const key = keysRow.getCell(c).value;
      if (key === 'arrest_date') row5.getCell(c).value = '2026-15-15'; // Bad Date
      else if (key === 'crime_head') row5.getCell(c).value = 'IPC';
      else if (key === 'status') row5.getCell(c).value = 'INVALID_STATUS'; // Invalid option
      else if (key === 'linked_fir_dd_no') row5.getCell(c).value = 'FIR/2026/9002';
      else if (key === 'io_name') row5.getCell(c).value = 'SI Rajesh';
      // arrested_name is left blank (REQUIRED field is missing)
    }

    const testFile = path.resolve('./scratch/temp_test_upload.xlsx');
    await inWorkbook.xlsx.writeFile(testFile);
    console.log('[Test] Written test Excel file to scratch/temp_test_upload.xlsx');

    // 5. Upload Excel for validate dry-run
    console.log('\n--- Test 5: POST /import/validate ---');
    const form = new FormData();
    form.append('file', fs.createReadStream(testFile));
    form.append('record_type', 'ARREST');
    form.append('is_legacy', 'false');

    const validateRes = await axios.post(`${baseURL}/import/validate`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`
      }
    });

    assert(validateRes.status === 200, 'Import dry-run validation returns status 200');
    const batchId = validateRes.data.data.batch_id;
    assert(batchId !== undefined, 'Validation response returns a batch_id');
    assert(validateRes.data.data.total_rows === 2, 'Validation correct total rows parsed: 2');
    assert(validateRes.data.data.valid_rows === 1, 'Validation correct valid rows: 1');
    assert(validateRes.data.data.invalid_rows === 1, 'Validation correct invalid rows: 1');

    const uploadErrors = validateRes.data.data.errors;
    assert(uploadErrors.length > 0, 'Validation errors array is returned with details');
    console.log('[Test] Validation Errors received:', JSON.stringify(uploadErrors, null, 2));

    // 6. Check batches list
    console.log('\n--- Test 6: GET /import/batches ---');
    const batchesRes = await axios.get(`${baseURL}/import/batches`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(batchesRes.status === 200, 'Retrieve import batches list succeeds');
    const foundBatch = batchesRes.data.data.find(b => b.id === batchId);
    assert(foundBatch !== undefined, 'Batches list contains the generated batch_id');
    assert(foundBatch.status === 'VALIDATION_DONE', 'Batch has status VALIDATION_DONE');

    // 7. Check batch detail
    console.log('\n--- Test 7: GET /import/batches/:batchId ---');
    const detailRes = await axios.get(`${baseURL}/import/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(detailRes.status === 200, 'Retrieve batch details succeeds');
    assert(detailRes.data.data.errors.length > 0, 'Batch detail returns error checklist');

    // 8. Confirm import batch
    console.log('\n--- Test 8: POST /import/confirm/:batchId ---');
    const confirmRes = await axios.post(`${baseURL}/import/confirm/${batchId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(confirmRes.status === 202, 'Confirm batch returns status 202 (Accepted)');
    assert(confirmRes.data.data.status === 'IMPORTING', 'Batch status is IMPORTING');

    // Poll for status to be COMPLETED
    console.log('[Test] Polling batch status for background processing completion...');
    let isCompleted = false;
    let pollRes;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      pollRes = await axios.get(`${baseURL}/import/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (pollRes.data.data.status === 'COMPLETED') {
        isCompleted = true;
        break;
      }
      if (pollRes.data.data.status === 'FAILED') {
        console.error('[Test] Batch processing status became FAILED:', pollRes.data.data.errors);
        break;
      }
    }
    assert(isCompleted, 'Batch status updated to COMPLETED within timeout');
    assert(pollRes?.data?.data?.imported_rows === 1, 'Correct imported rows committed: 1');
    assert(pollRes?.data?.data?.skipped_rows === 1, 'Correct skipped rows from errors: 1');

    // 9. Verify that details are stored correctly in DB
    console.log('\n--- Test 9: Verify DB record contents ---');
    const record = await db('records').where({ ps_id: 'PS_NDD_PARLIAMENTSTREET', record_type: 'ARREST' }).orderBy('created_at', 'desc').first();
    assert(record !== undefined, 'Arrest record is inserted into the database');
    const recData = JSON.parse(record.data);
    assert(recData.arrested_name === 'Arrestee Valid', 'Data match: arrested name is "Arrestee Valid"');
    assert(record.current_status === 'DRAFT', 'Standard non-legacy import creates records in DRAFT status');

    // Clean up temporary test file
    try { fs.unlinkSync(testFile); } catch(_) {}

  } catch (err) {
    console.error('[Test] Unexpected crash during test execution:', err.message, err.response?.data || err);
    failed++;
  } finally {
    if (server) {
      server.close();
      console.log('\n[Test] Test server shutdown.');
    }

    console.log(`\n===================================================`);
    console.log(`  Phase 3 Import Verification completed. Passed: ${passed}, Failed: ${failed}`);
    console.log(`===================================================`);

    await db.destroy();
    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('[Test] All Phase 3 Bulk Import checks passed!');
      process.exit(0);
    }
  }
}

run();
