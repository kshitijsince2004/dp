import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  const res = {};
  
  // 1A. Query ref.local_heads for codes 30,31,32,33,34,35,38,39,110,111,112,113,114,115
  const q1a = await pool.query(`
    SELECT local_head_cd, local_head, crime_category, canonical_code 
    FROM ref.local_heads 
    WHERE local_head_cd IN (30,31,32,33,34,35,38,39,110,111,112,113,114,115) 
    ORDER BY local_head_cd
  `);
  res.q1a = q1a.rows;

  // 1A extra: Cheating/fraud search
  const q1a_all = await pool.query(`
    SELECT local_head_cd, local_head, crime_category, canonical_code 
    FROM ref.local_heads 
    WHERE local_head ILIKE '%cheat%' OR local_head ILIKE '%fraud%' OR local_head ILIKE '%forg%' OR local_head ILIKE '%cyber%' OR canonical_code ILIKE '%CHEAT%'
    ORDER BY local_head_cd
  `);
  res.q1a_cheating_heads = q1a_all.rows;

  // 2A. Check table person_record_links and columns of records and persons
  const q2a_person_links = await pool.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name = 'person_record_links'
  `);
  res.person_record_links_table = q2a_person_links.rows;

  const q2a_rec_cols = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'records' 
    ORDER BY ordinal_position
  `);
  res.records_columns = q2a_rec_cols.rows;

  const q2a_persons_cols = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'persons' 
    ORDER BY ordinal_position
  `);
  res.persons_columns = q2a_persons_cols.rows;

  // 2B. Columns of fir_details
  const q2b_fir_cols = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'fir_details' 
    ORDER BY ordinal_position
  `);
  res.fir_details_columns = q2b_fir_cols.rows;

  // 2C. Columns of record_properties
  const q2c_prop_cols = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'record_properties' 
    ORDER BY ordinal_position
  `);
  res.record_properties_columns = q2c_prop_cols.rows;

  // Check ref.property_categories or ref property tables
  const q2c_ref_prop = await pool.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'ref' AND table_name ILIKE '%prop%'
  `);
  res.ref_property_tables = q2c_ref_prop.rows;

  if (q2c_ref_prop.rows.length > 0) {
    const q_prop_cat_rows = await pool.query(`SELECT * FROM ref.property_categories LIMIT 20`);
    res.ref_property_categories_rows = q_prop_cat_rows.rows;
  }

  // 2D. Columns of arrest_details
  const q2d_arr_cols = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'arrest_details' 
    ORDER BY ordinal_position
  `);
  res.arrest_details_columns = q2d_arr_cols.rows;

  // 2E. Check disposal columns in fir_details and across all tables
  const q2e_disp_cols = await pool.query(`
    SELECT table_schema, table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE column_name ILIKE '%dispos%' OR column_name ILIKE '%outcome%' OR column_name ILIKE '%challan%' OR column_name ILIKE '%untrace%'
    ORDER BY table_name, column_name
  `);
  res.disposal_columns = q2e_disp_cols.rows;

  // 2F. Columns of missing_details
  const q2f_miss_cols = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'missing_details' 
    ORDER BY ordinal_position
  `);
  res.missing_details_columns = q2f_miss_cols.rows;

  // 3B. ref.major_heads inspection
  const q3b_major_exists = await pool.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'ref' AND table_name = 'major_heads'
  `);
  res.major_heads_table_exists = q3b_major_exists.rows;

  if (q3b_major_exists.rows.length > 0) {
    const q3b_major_cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'ref' AND table_name = 'major_heads'`);
    res.major_heads_columns = q3b_major_cols.rows;
    const q3b_major_rows = await pool.query(`SELECT * FROM ref.major_heads LIMIT 60`);
    res.major_heads_first_60 = q3b_major_rows.rows;
  }

  fs.writeFileSync('d:/DPI/FIR/pharos-prototype/backend/test-out.json', JSON.stringify(res, null, 2));
  console.log('COMPLETE');
  await pool.end();
}

run().catch(console.error);
