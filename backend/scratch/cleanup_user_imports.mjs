import db from '../src/config/db.js';

const UPLOADER = 'U_HC001';

async function run() {
  try {
    console.log(`=== Starting optimized cleanup for user ${UPLOADER} ===`);

    const recordsCount = await db('records').where({ created_by: UPLOADER }).count('* as c').first();
    console.log(`Remaining records for this user: ${recordsCount.c}`);

    await db.transaction(async (trx) => {
      // 1. Delete from record_links using subqueries
      console.log('Deleting from record_links...');
      await trx('record_links')
        .whereIn('source_record_id', function() {
          this.select('id').from('records').where({ created_by: UPLOADER });
        })
        .orWhereIn('target_record_id', function() {
          this.select('id').from('records').where({ created_by: UPLOADER });
        })
        .del();

      // 2. Delete from record_revisions
      console.log('Deleting from record_revisions...');
      await trx('record_revisions')
        .whereIn('record_id', function() {
          this.select('id').from('records').where({ created_by: UPLOADER });
        })
        .del();

      // 3. Delete from audit_logs
      console.log('Deleting from audit_logs...');
      await trx('audit_logs')
        .whereIn('record_id', function() {
          this.select('id').from('records').where({ created_by: UPLOADER });
        })
        .orWhere({ changed_by_id: UPLOADER })
        .del();

      // 4. Delete from records
      console.log('Deleting from records...');
      await trx('records')
        .where({ created_by: UPLOADER })
        .del();

      // 5. Delete import batches
      console.log('Deleting import batches...');
      const batches = await trx('import_batches')
        .where({ uploaded_by: UPLOADER })
        .pluck('id');
      if (batches.length > 0) {
        await trx('import_batch_errors').whereIn('batch_id', batches).del();
        await trx('import_batches').whereIn('id', batches).del();
      }
    });

    // Double check counts
    const remRecords = await db('records').count('* as c').first();
    const remBatches = await db('import_batches').count('* as c').first();
    
    console.log(`=== Cleanup completed ===`);
    console.log(`Remaining records in database: ${remRecords.c}`);
    console.log(`Remaining import batches in database: ${remBatches.c}`);

    process.exit(0);
  } catch (err) {
    console.error('Cleanup failed with error:', err);
    process.exit(1);
  }
}

run();
