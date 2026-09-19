import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  const output = {};

  // 2a. Columns of public.record_offences
  const q_cols = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'record_offences' 
    ORDER BY ordinal_position
  `);
  output.record_offences_columns = q_cols.rows;

  // 2c. Check real rows in record_offences where a record has multiple offences with different crime_group
  const q_multi_group = await pool.query(`
    SELECT 
      ro.record_id,
      r.uid,
      r.record_type,
      COUNT(ro.id) as offence_count,
      COUNT(DISTINCT ro.crime_group) as distinct_groups,
      array_agg(ro.crime_group) as crime_groups,
      array_agg(ro.act_name) as act_names,
      array_agg(ro.section) as sections,
      array_agg(ro.is_primary) as is_primaries
    FROM record_offences ro
    JOIN records r ON r.id = ro.record_id
    GROUP BY ro.record_id, r.uid, r.record_type
    HAVING COUNT(DISTINCT ro.crime_group) > 1
    LIMIT 10
  `);
  output.cases_with_multiple_crime_groups = q_multi_group.rows;

  // Total counts in record_offences
  const q_total_ro = await pool.query(`
    SELECT 
      count(*) as total_offence_rows,
      count(DISTINCT record_id) as distinct_records,
      count(*) FILTER (WHERE is_primary = true) as primary_rows
    FROM record_offences
  `);
  output.record_offences_totals = q_total_ro.rows[0];

  fs.writeFileSync('d:/DPI/FIR/pharos-prototype/backend/item2_reverify.json', JSON.stringify(output, null, 2));
  console.log('Successfully wrote item2_reverify.json');

  await pool.end();
}

run().catch(console.error);
