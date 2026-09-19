import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  const q_fields = await pool.query(`
    SELECT 
      field_key,
      labels->>'en' as label_en,
      field_type,
      record_types,
      section,
      section_labels->>'en' as section_label_en,
      storage,
      validation_rules,
      show_when,
      options,
      options_source,
      repeater_entity,
      sort_order
    FROM field_registry
    WHERE is_active = true
    ORDER BY section, sort_order, field_key
  `);

  const formsByRecordType = {};

  for (const f of q_fields.rows) {
    const rtypes = Array.isArray(f.record_types) ? f.record_types : [f.record_types];
    for (const rt of rtypes) {
      if (!formsByRecordType[rt]) formsByRecordType[rt] = {};
      const sec = f.section || 'General';
      if (!formsByRecordType[rt][sec]) formsByRecordType[rt][sec] = [];
      formsByRecordType[rt][sec].push({
        key: f.field_key,
        label: f.label_en || f.field_key,
        type: f.field_type,
        storage: f.storage,
        required: f.validation_rules?.required || false,
        repeater: f.repeater_entity || null
      });
    }
  }

  fs.writeFileSync('d:/DPI/FIR/pharos-prototype/backend/form-fields-matrix.json', JSON.stringify(formsByRecordType, null, 2));
  console.log('Successfully wrote form-fields-matrix.json. Record types:', Object.keys(formsByRecordType));

  await pool.end();
}

run().catch(console.error);
