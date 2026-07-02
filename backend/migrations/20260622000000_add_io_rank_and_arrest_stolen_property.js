// Adds field_registry coverage requested for bulk import columns:
//   1. io_rank         — captures the "Name Of IO Rank" column (CASE + ARREST sheets)
//   2. stolen_property — extended to ARREST (was CASE only) for "Property (Stolen)"
//   3. fir_date        — extended to ARREST (was CASE only) for "FIR Date" (completeness;
//                        not used by linkage, which keys on FIR No.)
//
// applicable_record_types is stored as a JSON string to match existing rows.
export async function up(knex) {
  const existing = await knex('field_registry').where({ field_key: 'io_rank' }).first();
  if (!existing) {
    await knex('field_registry').insert({
      id: 'FLD_IO_RANK',
      field_key: 'io_rank',
      field_type: 'TEXT',
      applicable_record_types: JSON.stringify(['CASE', 'ARREST']),
      label_en: 'Name of IO Rank',
      label_hi: 'आईओ का पद',
      options: null,
      validation_rules: null,
      visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
      editable_by_levels: JSON.stringify(['PS']),
      introduced_at_level: 'PS',
      section: 'investigation_officer',
      sort_order: 18,
      full_width: false,
      show_when: null,
      is_active: true,
      scope_level: 'global',
      scope_id: null,
      created_by: null
    });
  }

  await knex('field_registry')
    .where({ field_key: 'stolen_property' })
    .update({ applicable_record_types: JSON.stringify(['CASE', 'ARREST']) });

  await knex('field_registry')
    .where({ field_key: 'fir_date' })
    .update({ applicable_record_types: JSON.stringify(['CASE', 'ARREST']) });
}

export async function down(knex) {
  await knex('field_registry').where({ field_key: 'io_rank' }).del();
  await knex('field_registry')
    .where({ field_key: 'stolen_property' })
    .update({ applicable_record_types: JSON.stringify(['CASE']) });
  await knex('field_registry')
    .where({ field_key: 'fir_date' })
    .update({ applicable_record_types: JSON.stringify(['CASE']) });
}
