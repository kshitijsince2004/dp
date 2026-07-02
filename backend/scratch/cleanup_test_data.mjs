// One-off cleanup of the test records inserted while debugging bulk import.
// Scoped strictly to MY test data:
//   - PS_ASHOK_VIHAR records uploaded by U_HQ002 (CASE/ARREST)
//   - any record whose data contains the LOCKTEST marker
// Your real import (PS_NDD_PARLIAMENTSTREET, uploaded by U_HC001) is NOT touched.
//
// Run from the backend/ folder:  node scratch/cleanup_test_data.mjs
import db from '../src/config/db.js';

try {
  const ids = await db('records')
    .where({ ps_id: 'PS_ASHOK_VIHAR', created_by: 'U_HQ002' })
    .whereIn('record_type', ['CASE', 'ARREST'])
    .pluck('id');

  const lockIds = await db('records').whereRaw("data LIKE '%LOCKTEST%'").pluck('id');
  const allIds = [...new Set([...ids, ...lockIds])];
  console.log('records to delete:', allIds.length);

  for (let i = 0; i < allIds.length; i += 500) {
    const chunk = allIds.slice(i, i + 500);
    await db('record_links').whereIn('source_record_id', chunk).orWhereIn('target_record_id', chunk).del();
    await db('record_revisions').whereIn('record_id', chunk).del();
    await db('audit_logs').whereIn('record_id', chunk).del();
    await db('records').whereIn('id', chunk).del();
  }

  const batches = await db('import_batches')
    .where({ uploaded_by: 'U_HQ002', ps_id: 'PS_ASHOK_VIHAR' })
    .pluck('id');
  await db('import_batch_errors').whereIn('batch_id', batches).del();
  await db('import_batches').whereIn('id', batches).del();
  console.log('deleted import batches:', batches.length);
  console.log('done');
} catch (e) {
  console.error('cleanup error:', e.message);
} finally {
  await db.destroy();
}
