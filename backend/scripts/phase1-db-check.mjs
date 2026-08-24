import db from '../src/config/db.js';
import fs from 'fs';

async function runPhase1DbCheck() {
  console.log('=== PHASE 1.1 Master DB Column Check ===');

  const mainCols = await db.raw(`
    SELECT
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name IN (
      'fir_details', 'arrest_details', 'arrestee_details',
      'persons', 'record_properties', 'missing_details',
      'missing_person_details', 'pcr_call_details', 'uidb_details',
      'records', 'locations', 'person_descriptions'
    )
    ORDER BY table_name, ordinal_position;
  `);

  const refCols = await db.raw(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'ref'
    ORDER BY table_name, ordinal_position;
  `);

  const locationsCheck = await db.raw(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'locations'
    ORDER BY ordinal_position;
  `);

  const neSample = await db.raw(`
    SELECT DISTINCT state, COUNT(*) as persons
    FROM locations
    WHERE UPPER(state) IN (
      'ASSAM','ARUNACHAL PRADESH','MANIPUR','MEGHALAYA',
      'MIZORAM','NAGALAND','SIKKIM','TRIPURA'
    )
    GROUP BY state;
  `);

  const permLocationCheck = await db.raw(`
    SELECT
      p.name, p.role,
      l_perm.state AS perm_state,
      l_perm.city  AS perm_city,
      l_pres.state AS present_state
    FROM persons p
    LEFT JOIN locations l_perm ON l_perm.id = p.perm_location_id
    LEFT JOIN locations l_pres ON l_pres.id = p.present_location_id
    WHERE l_perm.state IS NOT NULL
    LIMIT 10;
  `);

  const result = {
    mainCols: mainCols.rows,
    refCols: refCols.rows,
    locationsCheck: locationsCheck.rows,
    neSample: neSample.rows,
    permLocationSample: permLocationCheck.rows
  };

  fs.writeFileSync('scripts/db-dump.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('Master DB column dump saved successfully! Total main cols:', mainCols.rows.length, 'Ref cols:', refCols.rows.length);

  await db.destroy();
}

runPhase1DbCheck().catch(console.error);
