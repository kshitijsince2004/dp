import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  const res = {};

  // 1a. Foreign key constraints on record_offences
  const q1a_fk = await pool.query(`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'record_offences';
  `);
  res.q1a_foreign_keys = q1a_fk.rows;

  // Check ref.acts schema
  const q1a_acts_cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'ref' AND table_name = 'acts'
    ORDER BY ordinal_position;
  `);
  res.ref_acts_columns = q1a_acts_cols.rows;

  // 1b. Query ref.acts where act_cd IN (102, 103) vs ref.local_heads where local_head_cd IN (102, 103)
  const q1b_acts = await pool.query(`
    SELECT act_cd, act_long FROM ref.acts WHERE act_cd IN (102, 103) ORDER BY act_cd;
  `);
  res.q1b_acts = q1b_acts.rows;

  const q1b_local_heads = await pool.query(`
    SELECT local_head_cd, local_head FROM ref.local_heads WHERE local_head_cd IN (102, 103) ORDER BY local_head_cd;
  `);
  res.q1b_local_heads = q1b_local_heads.rows;

  // 1c. Distinct acts matching Arms, NDPS, Excise, Gambling, DP Act in ref.acts
  const q1c_matched_acts = await pool.query(`
    SELECT act_cd, act_long 
    FROM ref.acts 
    WHERE act_long ILIKE '%arms%' 
       OR act_long ILIKE '%ndps%' 
       OR act_long ILIKE '%narcotic%' 
       OR act_long ILIKE '%excise%' 
       OR act_long ILIKE '%gambling%' 
       OR act_long ILIKE '%delhi police%'
    ORDER BY act_cd;
  `);
  res.q1c_matched_acts_in_ref = q1c_matched_acts.rows;

  // Query actual distinct rows in record_offences joined to ref.acts
  const q1c_ro = await pool.query(`
    SELECT 
      COALESCE(a.act_long, ro.other_act_name, 'UNKNOWN ACT') as resolved_act_name,
      ro.act_id,
      ro.other_act_name,
      ro.section_id,
      COUNT(*) as count
    FROM record_offences ro
    LEFT JOIN ref.acts a ON a.act_cd = ro.act_id
    WHERE a.act_long ILIKE '%arms%' 
       OR a.act_long ILIKE '%ndps%' 
       OR a.act_long ILIKE '%narcotic%' 
       OR a.act_long ILIKE '%excise%' 
       OR a.act_long ILIKE '%gambling%' 
       OR a.act_long ILIKE '%delhi police%'
       OR ro.other_act_name ILIKE '%arms%'
       OR ro.other_act_name ILIKE '%ndps%'
       OR ro.other_act_name ILIKE '%excise%'
       OR ro.other_act_name ILIKE '%gambling%'
       OR ro.other_act_name ILIKE '%delhi police%'
    GROUP BY COALESCE(a.act_long, ro.other_act_name, 'UNKNOWN ACT'), ro.act_id, ro.other_act_name, ro.section_id
    ORDER BY resolved_act_name, count DESC;
  `);
  res.q1c_ro_data = q1c_ro.rows;

  // Also let's check ALL distinct act_id values present in record_offences
  const q1c_all_acts_in_ro = await pool.query(`
    SELECT ro.act_id, a.act_long, ro.other_act_name, COUNT(*) as count
    FROM record_offences ro
    LEFT JOIN ref.acts a ON a.act_cd = ro.act_id
    GROUP BY ro.act_id, a.act_long, ro.other_act_name
    ORDER BY count DESC;
  `);
  res.q1c_all_acts_in_ro = q1c_all_acts_in_ro.rows;

  // 1d. Cheating/fraud query
  const q1d_cheat = await pool.query(`
    SELECT DISTINCT ro.section_id, COUNT(*)
    FROM record_offences ro
    JOIN fir_details fd ON fd.record_id = ro.record_id
    WHERE fd.local_head_id IN (38, 39, 127)
    GROUP BY ro.section_id 
    ORDER BY COUNT(*) DESC;
  `);
  res.q1d_cheating_sections = q1d_cheat.rows;

  // 4. Find dates with substantial data volume
  const q4_dates = await pool.query(`
    SELECT 
      COALESCE(r.registration_date, r.record_date) as case_date,
      COUNT(*) as total_cases
    FROM records r
    WHERE r.record_type = 'CASE'
    GROUP BY COALESCE(r.registration_date, r.record_date)
    ORDER BY total_cases DESC
    LIMIT 5;
  `);
  res.q4_top_dates = q4_dates.rows;

  // Pick top date and run the exact invariant query
  if (q4_dates.rows.length > 0) {
    const testDate = q4_dates.rows[0].case_date;
    res.test_date = testDate;

    const q4_inv = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM records r 
           JOIN fir_details fd ON fd.record_id = r.id
           JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
           WHERE lh.crime_category = 'HEINOUS' 
             AND COALESCE(r.registration_date, r.record_date) = $1) AS heinous,
        (SELECT COUNT(*) FROM records r 
           JOIN fir_details fd ON fd.record_id = r.id
           JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
           WHERE lh.crime_category = 'NON_HEINOUS' 
             AND COALESCE(r.registration_date, r.record_date) = $1) AS non_heinous,
        (SELECT COUNT(*) FROM records r 
           JOIN fir_details fd ON fd.record_id = r.id
           JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
           WHERE lh.crime_category = 'OTHER' 
             AND COALESCE(r.registration_date, r.record_date) = $1) AS acts,
        (SELECT COUNT(*) FROM records r 
           WHERE r.record_type = 'CASE' 
             AND COALESCE(r.registration_date, r.record_date) = $1) AS total_registered;
    `, [testDate]);
    res.q4_invariant_result = q4_inv.rows[0];

    // Check all-time total invariant across whole database
    const q4_all_time = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM records r 
           JOIN fir_details fd ON fd.record_id = r.id
           JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
           WHERE lh.crime_category = 'HEINOUS') AS all_time_heinous,
        (SELECT COUNT(*) FROM records r 
           JOIN fir_details fd ON fd.record_id = r.id
           JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
           WHERE lh.crime_category = 'NON_HEINOUS') AS all_time_non_heinous,
        (SELECT COUNT(*) FROM records r 
           JOIN fir_details fd ON fd.record_id = r.id
           JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
           WHERE lh.crime_category = 'OTHER') AS all_time_acts,
        (SELECT COUNT(*) FROM records r 
           WHERE r.record_type = 'CASE') AS all_time_total_registered,
        (SELECT COUNT(*) FROM records r 
           JOIN fir_details fd ON fd.record_id = r.id 
           WHERE fd.local_head_id IS NULL) AS cases_with_null_local_head,
        (SELECT COUNT(*) FROM records r 
           LEFT JOIN fir_details fd ON fd.record_id = r.id 
           WHERE r.record_type = 'CASE' AND fd.record_id IS NULL) AS cases_missing_fir_details;
    `);
    res.q4_all_time_invariant = q4_all_time.rows[0];
  }

  fs.writeFileSync('d:/DPI/FIR/pharos-prototype/backend/gap_investigation_results.json', JSON.stringify(res, null, 2));
  console.log('COMPLETE');
  await pool.end();
}

run().catch(console.error);
