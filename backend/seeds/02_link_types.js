// link_type_registry seed (ruling 19 + 23c) — CASE_ARREST and CASE_MISSING are the two
// link types the async link-resolver subscriber (events/handlers/linkResolver.js) inserts
// resolved FIR-reference links under. Upsert-by-code, same pattern as backend/seeds/01_users.js.
export async function seed(knex) {
  const rows = [
    { code: 'CASE_ARREST', source_record_type: 'CASE', target_record_type: 'ARREST', label: 'Arrest under this case', cardinality: 'ONE_TO_MANY' },
    { code: 'CASE_MISSING', source_record_type: 'CASE', target_record_type: 'MISSING', label: 'Missing-person FIR', cardinality: 'ONE_TO_MANY' },
  ];

  for (const row of rows) {
    const existing = await knex('link_type_registry').where({ code: row.code }).first();
    if (existing) {
      await knex('link_type_registry').where({ code: row.code }).update({ ...row, updated_at: knex.fn.now() });
    } else {
      await knex('link_type_registry').insert(row);
    }
  }

  console.log(`[02_link_types] upserted ${rows.length} link types`);
}
