const db = require('./src/config/database');

async function check() {
  try {
    // Check root fields (e.g. complainant)
    const rootRes = await db.raw(`
      SELECT record_type, count(*) 
      FROM records 
      WHERE 
        record_data->>'complainant_state' = 'Delhi' OR
        record_data->>'complainant_perm_state' = 'Delhi'
      GROUP BY record_type;
    `);
    console.log('Root (Complainant) Delhi matches:', rootRes.rows);

    // Also check repeater arrays for victim, accused, arrested
    const arrRes = await db.raw(`
      SELECT record_type, count(*) 
      FROM records, jsonb_array_elements(
        CASE 
          WHEN jsonb_typeof(record_data->'victims') = 'array' THEN record_data->'victims'
          WHEN jsonb_typeof(record_data->'accused') = 'array' THEN record_data->'accused'
          WHEN jsonb_typeof(record_data->'arrested') = 'array' THEN record_data->'arrested'
          ELSE '[]'::jsonb
        END
      ) as person
      WHERE person->>'state' = 'Delhi' OR person->>'permanent_state' = 'Delhi'
      GROUP BY record_type;
    `);
    console.log('Repeater Delhi matches:', arrRes.rows);
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check();
