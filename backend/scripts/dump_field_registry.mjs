import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  const output = {};

  // 1. Query field_registry columns and counts
  const q_total = await pool.query(`SELECT count(*) as total, count(*) FILTER (WHERE is_active = true) as active FROM field_registry`);
  output.total_fields = q_total.rows[0];

  // 2. Query all field_registry rows grouped by record_types and section
  const q_fields = await pool.query(`
    SELECT 
      field_key,
      labels,
      field_type,
      record_types,
      section,
      section_labels,
      storage,
      validation_rules,
      show_when,
      options,
      options_source,
      repeater_entity,
      is_active,
      sort_order
    FROM field_registry
    WHERE is_active = true
    ORDER BY section, sort_order, field_key
  `);
  output.fields = q_fields.rows;

  // 3. Summarize storage destinations
  const storageSummary = {};
  const sectionSummary = {};
  const recordTypeSummary = {};

  for (const f of q_fields.rows) {
    // Record types
    const rtypes = Array.isArray(f.record_types) ? f.record_types : [f.record_types];
    for (const rt of rtypes) {
      recordTypeSummary[rt] = (recordTypeSummary[rt] || 0) + 1;
    }

    // Section
    sectionSummary[f.section] = (sectionSummary[f.section] || 0) + 1;

    // Storage
    let storageStr = typeof f.storage === 'object' ? JSON.stringify(f.storage) : String(f.storage);
    storageSummary[storageStr] = (storageSummary[storageStr] || 0) + 1;
  }

  output.recordTypeSummary = recordTypeSummary;
  output.sectionSummary = sectionSummary;
  output.storageSummary = storageSummary;

  fs.writeFileSync('d:/DPI/FIR/pharos-prototype/backend/field-registry-dump.json', JSON.stringify(output, null, 2));
  console.log('Successfully wrote field-registry-dump.json. Total fields:', q_fields.rows.length);

  await pool.end();
}

run().catch(console.error);
