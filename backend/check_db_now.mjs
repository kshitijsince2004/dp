import db from './src/config/db.js';

try {
  // Total records
  const total = await db('records').count('* as c').first();
  console.log('Total records in DB:', total.c);

  // Count by record_type
  const byType = await db('records').select('record_type').count('* as c').groupBy('record_type');
  console.log('By record_type:', JSON.stringify(byType));

  // Count by status
  const byStatus = await db('records').select('current_status').count('* as c').groupBy('current_status');
  console.log('By status:', JSON.stringify(byStatus));

  // Sample 3 records with date fields
  const sample = await db('records as r')
    .leftJoin('fir_details as fd', 'r.id', 'fd.record_id')
    .select('r.id', 'r.record_type', 'r.record_date', 'r.registration_date', 'r.current_status', 'fd.fir_date')
    .limit(5);
  console.log('\nSample records with dates:');
  sample.forEach(r => console.log(JSON.stringify(r)));

  // All distinct effective dates
  const allDates = await db.raw(
    "SELECT DISTINCT COALESCE(r.registration_date, fd.fir_date, r.record_date)::date as eff_date, COUNT(*) as cnt FROM records r LEFT JOIN fir_details fd ON r.id = fd.record_id GROUP BY eff_date ORDER BY eff_date"
  );
  console.log('\nAll effective dates in DB with counts:');
  allDates.rows.forEach(row => console.log(`  ${row.eff_date} => ${row.cnt} records`));

} catch(e) {
  console.error('ERROR:', e.message, e.stack);
}

await db.destroy();
