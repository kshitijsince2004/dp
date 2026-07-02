// Clean slate for a FRESH re-import of PS_NDD_PARLIAMENTSTREET (uploader U_HC001):
// deletes ALL imported CASE rows (both duplicate copies) and ALL imported ARREST rows
// (the junk import), so you can re-import the case file and the arrest file from scratch
// with the fixed importer. Other PS and manual records are untouched.
//
// Usage (run from the backend/ folder):
//   node scratch/cleanup_bad_import.mjs            <- DRY RUN: prints what it WOULD delete
//   node scratch/cleanup_bad_import.mjs --confirm  <- actually deletes
import db from '../src/config/db.js';

const CONFIRM = process.argv.includes('--confirm');
const PS = 'PS_NDD_PARLIAMENTSTREET';
const UPLOADER = 'U_HC001';

const deleteByIds = async (ids) => {
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await db('record_links').whereIn('source_record_id', chunk).orWhereIn('target_record_id', chunk).del();
    await db('record_revisions').whereIn('record_id', chunk).del();
    await db('audit_logs').whereIn('record_id', chunk).del();
    await db('records').whereIn('id', chunk).del();
  }
};

try {
  const ids = await db('records')
    .where({ ps_id: PS, created_by: UPLOADER })
    .whereIn('record_type', ['CASE', 'ARREST'])
    .pluck('id');

  const byType = await db('records')
    .where({ ps_id: PS, created_by: UPLOADER })
    .whereIn('record_type', ['CASE', 'ARREST'])
    .select('record_type').count('* as c').groupBy('record_type');

  console.log('Will delete:', byType.map(r => `${r.record_type}=${r.c}`).join('  '), `(total ${ids.length})`);

  if (!CONFIRM) {
    console.log('\nDRY RUN — nothing deleted. Re-run with  --confirm  to apply.');
  } else {
    await deleteByIds(ids);
    const remCase = (await db('records').where({ ps_id: PS, record_type: 'CASE' }).count('* as c').first()).c;
    const remArr = (await db('records').where({ ps_id: PS, record_type: 'ARREST' }).count('* as c').first()).c;
    console.log('\nDone. Remaining in', PS, '-> CASE:', remCase, ' ARREST:', remArr);
  }
} catch (e) {
  console.error('cleanup error:', e.message);
} finally {
  await db.destroy();
}
