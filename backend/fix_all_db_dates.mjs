import knex from 'knex';
import { config } from 'dotenv';
config();

const db = knex({ client: 'pg', connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  console.log('Fixing dates for ALL records in DB to fall in September 2026...');

  // 1. Update records table
  await db.raw(`
    UPDATE records
    SET 
      record_date = '2026-09-10 10:00:00+00',
      registration_date = '2026-09-10'
    WHERE EXTRACT(YEAR FROM COALESCE(registration_date, record_date)) != 2026 
       OR EXTRACT(MONTH FROM COALESCE(registration_date, record_date)) != 9;
  `);

  // 2. Update fir_details table
  await db.raw(`
    UPDATE fir_details
    SET fir_date = '2026-09-10'
    WHERE fir_date IS NULL 
       OR EXTRACT(YEAR FROM fir_date) != 2026 
       OR EXTRACT(MONTH FROM fir_date) != 9;
  `);

  // 3. Distribute dates across 01/09/2026 to 20/09/2026 for variety
  const recs = await db('records').select('id', 'record_type').orderBy('created_at', 'asc');
  console.log(`Updating ${recs.length} total records...`);

  for (let i = 0; i < recs.length; i++) {
    const day = String((i % 18) + 2).padStart(2, '0'); // days 02 to 19 Sept 2026
    const dateStr = `2026-09-${day}`;
    const dtStr = `2026-09-${day} 10:30:00+00`;

    await db('records').where({ id: recs[i].id }).update({
      record_date: dtStr,
      registration_date: dateStr
    });

    if (recs[i].record_type === 'CASE') {
      await db('fir_details').where({ record_id: recs[i].id }).update({ fir_date: dateStr });
    } else if (recs[i].record_type === 'ARREST') {
      await db('arrest_details').where({ record_id: recs[i].id }).update({ gd_date: dateStr, fir_date: dateStr });
    } else if (recs[i].record_type === 'MISSING') {
      await db('missing_details').where({ record_id: recs[i].id }).update({ gd_date: dateStr });
    } else if (recs[i].record_type === 'UIDB') {
      await db('uidb_details').where({ record_id: recs[i].id }).update({ gd_date: dateStr, found_date: dateStr });
    }
  }

  console.log('✅ Successfully updated all record dates to September 2026!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
