import db from '../src/config/db.js';

async function run() {
  try {
    const batch = await db('import_batches').orderBy('created_at', 'desc').first();
    if (!batch) {
      console.log('No batches found.');
      process.exit(0);
    }
    console.log('--- LATEST BATCH ---');
    console.log(`ID: ${batch.id}`);
    console.log(`Record Type: ${batch.record_type}`);
    console.log(`Is Legacy: ${batch.is_legacy}`);
    console.log(`Status: ${batch.status}`);
    console.log(`Total Rows: ${batch.total_rows}`);
    console.log(`Valid Rows: ${batch.valid_rows}`);
    console.log(`Invalid Rows: ${batch.invalid_rows}`);

    const errors = await db('import_batch_errors')
      .where({ batch_id: batch.id })
      .orderBy('row_number', 'asc');
    
    console.log('\n--- VALIDATION ERRORS ---');
    if (errors.length === 0) {
      console.log('No validation errors found for this batch.');
    } else {
      errors.forEach(e => {
        console.log(`Row ${e.row_number} | Field: ${e.field_key} | Code: ${e.error_code} | Message: ${e.error_message}`);
      });
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
