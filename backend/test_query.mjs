import knex from 'knex';
import { config } from 'dotenv';
config();

const db = knex({ client: 'pg', connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  const psId = '8ca42ce6-64b8-4180-b622-da5411eeefb3'; // PS Parliament Street
  const date = '2026-09-01';
  const dateTo = '2026-09-21';

  console.log('Testing query for Parliament Street CASE records...');

  // 1. Existing applyDate query
  const caseRowsExist = await db('records as r')
    .join('fir_details as fd', 'r.id', 'fd.record_id')
    .leftJoin('hierarchy_nodes as ps',   'r.ps_id',       'ps.id')
    .leftJoin('hierarchy_nodes as dist', 'r.district_id', 'dist.id')
    .leftJoin('investigating_officers as io', 'r.io_id',  'io.id')
    .leftJoin('ref.local_heads as lh',   'fd.local_head_id', 'lh.local_head_cd')
    .leftJoin('locations as occ',        'fd.occurrence_location_id', 'occ.id')
    .leftJoin('ref.beats as bt',         'fd.beat_id',    'bt.beat_cd')
    .whereNot('r.current_status', 'DELETED')
    .where('r.record_type', 'CASE')
    .where('r.ps_id', psId)
    .whereRaw("COALESCE(r.registration_date, fd.fir_date, r.record_date) BETWEEN ? AND ?", [date, dateTo])
    .select('r.id', 'r.record_date', 'r.registration_date', 'fd.fir_date', 'fd.fir_no', 'fd.registration_type');

  console.log('Existing query returned:', caseRowsExist.length, 'rows');
  console.log(caseRowsExist);

  // 2. Query with ::date cast
  const caseRowsCast = await db('records as r')
    .join('fir_details as fd', 'r.id', 'fd.record_id')
    .leftJoin('hierarchy_nodes as ps',   'r.ps_id',       'ps.id')
    .leftJoin('hierarchy_nodes as dist', 'r.district_id', 'dist.id')
    .whereNot('r.current_status', 'DELETED')
    .where('r.record_type', 'CASE')
    .where('r.ps_id', psId)
    .whereRaw("COALESCE(r.registration_date, fd.fir_date, r.record_date)::date BETWEEN ? AND ?", [date, dateTo])
    .select('r.id', 'r.record_date', 'r.registration_date', 'fd.fir_date', 'fd.fir_no', 'fd.registration_type');

  console.log('\nQuery with ::date cast returned:', caseRowsCast.length, 'rows');
  console.log(caseRowsCast);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
