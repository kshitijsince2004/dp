import db from '../src/config/db.js';
import fs from 'fs';

async function runDbReconciliation() {
  console.log("=== DB RECONCILIATION CHECK START ===");
  const results = [];

  const tablesToCheck = [
    { schema: 'public', table: 'records' },
    { schema: 'public', table: 'fir_details' },
    { schema: 'public', table: 'arrest_details' },
    { schema: 'public', table: 'record_properties' },
    { schema: 'public', table: 'hierarchy_nodes' },
    { schema: 'public', table: 'stat_baselines' },
    { schema: 'public', table: 'report_templates' },
    { schema: 'ref', table: 'local_heads' },
    { schema: 'ref', table: 'drug_types' },
    { schema: 'ref', table: 'units' },
  ];

  for (const t of tablesToCheck) {
    try {
      const cols = await db('information_schema.columns')
        .select('column_name', 'data_type', 'is_nullable')
        .where({ table_schema: t.schema, table_name: t.table });

      if (cols.length === 0) {
        results.push({ type: 'Table', name: `${t.schema}.${t.table}`, exists: false });
      } else {
        results.push({ type: 'Table', name: `${t.schema}.${t.table}`, exists: true, colCount: cols.length });
        for (const col of cols) {
          results.push({
            type: 'Column',
            name: `${t.schema}.${t.table}.${col.column_name}`,
            exists: true,
            dataType: col.data_type,
            nullable: col.is_nullable
          });
        }
      }
    } catch (err) {
      results.push({ type: 'Table', name: `${t.schema}.${t.table}`, exists: false, error: err.message });
    }
  }

  // Check Distinct Codes in ref.local_heads
  try {
    const canonicalCodes = await db('ref.local_heads').distinct('canonical_code').pluck('canonical_code');
    results.push({ type: 'Values', name: 'ref.local_heads.canonical_code', values: canonicalCodes.sort() });
  } catch (err) {
    results.push({ type: 'Values', name: 'ref.local_heads.canonical_code', error: err.message });
  }

  // Check Distinct District Codes in hierarchy_nodes
  try {
    const districtCodes = await db('hierarchy_nodes').where({ node_type: 'DISTRICT' }).pluck('code');
    results.push({ type: 'Values', name: 'hierarchy_nodes.district_codes', values: districtCodes.sort() });
  } catch (err) {
    results.push({ type: 'Values', name: 'hierarchy_nodes.district_codes', error: err.message });
  }

  // Check Distinct Head Codes in stat_baselines
  try {
    const baselineCodes = await db('stat_baselines').distinct('head_code').pluck('head_code');
    results.push({ type: 'Values', name: 'stat_baselines.head_code', values: baselineCodes.sort() });
  } catch (err) {
    results.push({ type: 'Values', name: 'stat_baselines.head_code', error: err.message });
  }

  // Check Record Types in records
  try {
    const recordTypes = await db('records').distinct('record_type').pluck('record_type');
    results.push({ type: 'Values', name: 'records.record_type', values: recordTypes.sort() });
  } catch (err) {
    results.push({ type: 'Values', name: 'records.record_type', error: err.message });
  }

  // Check Statuses in records
  try {
    const statuses = await db('records').distinct('current_status').pluck('current_status');
    results.push({ type: 'Values', name: 'records.current_status', values: statuses.sort() });
  } catch (err) {
    results.push({ type: 'Values', name: 'records.current_status', error: err.message });
  }

  // Check Drug Types in ref.drug_types
  try {
    const drugTypes = await db('ref.drug_types').select('*');
    results.push({ type: 'Values', name: 'ref.drug_types.rows', values: drugTypes });
  } catch (err) {
    results.push({ type: 'Values', name: 'ref.drug_types.rows', error: err.message });
  }

  // Check Units in ref.units
  try {
    const units = await db('ref.units').select('*');
    results.push({ type: 'Values', name: 'ref.units.rows', values: units });
  } catch (err) {
    results.push({ type: 'Values', name: 'ref.units.rows', error: err.message });
  }

  fs.writeFileSync('./scripts/db_reconciliation_raw.json', JSON.stringify(results, null, 2));
  console.log("DB Reconciliation complete. Output written.");
  await db.destroy();
}

runDbReconciliation().catch(console.error);
