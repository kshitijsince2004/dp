import knex from 'knex';
import { config } from 'dotenv';
config();

const db = knex({ client: 'pg', connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  console.log('=== ALL RECORDS IN DB ===');
  const allRecs = await db('records').select('id', 'ps_id', 'record_type', 'current_status', 'record_date', 'registration_date');
  console.log('Total records in DB:', allRecs.length);
  console.table(allRecs);

  console.log('=== ALL FIR DETAILS IN DB ===');
  const allFir = await db('fir_details').select('record_id', 'fir_no', 'fir_date', 'registration_type', 'local_head_id');
  console.table(allFir);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
