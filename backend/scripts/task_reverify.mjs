import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  const res = {};

  // Task 1: Exact query
  const q1 = await pool.query(`
    SELECT local_head_cd, local_head, canonical_code, crime_category
    FROM ref.local_heads
    WHERE canonical_code IN ('ARMS_ACT', 'EXCISE_ACT', 'GAMBLING_ACT',
                             'NDPS', 'NDPS_ACT', 'POCSO', 'POCSO_ACT')
       OR local_head ILIKE '%arms%'
       OR local_head ILIKE '%ndps%'
       OR local_head ILIKE '%narcotic%'
       OR local_head ILIKE '%pocso%'
    ORDER BY local_head_cd;
  `);
  res.task1_query_result = q1.rows;

  // Task 2a: Query for codes 101, 102, 103, 104, 105, 205
  const q2a = await pool.query(`
    SELECT local_head_cd, local_head, canonical_code, created_at, updated_at 
    FROM ref.local_heads 
    WHERE local_head_cd IN (101, 102, 103, 104, 105, 205) 
    ORDER BY local_head_cd;
  `);
  res.task2a_query_result = q2a.rows;

  // Let's also query ALL rows between 100 and 110 in ref.local_heads to see everything in that range
  const q2_range = await pool.query(`
    SELECT local_head_cd, local_head, canonical_code, crime_category, created_at, updated_at
    FROM ref.local_heads
    WHERE local_head_cd BETWEEN 100 AND 110
    ORDER BY local_head_cd;
  `);
  res.task2_range_100_110 = q2_range.rows;

  fs.writeFileSync('d:/DPI/FIR/pharos-prototype/backend/task_reverify_output.json', JSON.stringify(res, null, 2));
  console.log('COMPLETE');
  await pool.end();
}

run().catch(console.error);
