export async function up(knex) {
  const existing = await knex('field_registry').where({ field_key: 'work_out' }).first();
  if (existing) return;

  await knex('field_registry').insert({
    id: 'C_work_out',
    field_key: 'work_out',
    field_type: 'RADIO',
    applicable_record_types: JSON.stringify(['CASE']),
    label_en: 'WorkOut',
    label_hi: 'वर्कआउट',
    visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
    editable_by_levels: JSON.stringify(['PS']),
    section: 'investigation_officer',
    sort_order: 508,
    is_active: true,
    scope_level: 'global',
    options: JSON.stringify([
      { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
      { value: 'No', label_en: 'No', label_hi: 'नहीं' }
    ])
  });
}

export async function down(knex) {
  await knex('field_registry').where({ field_key: 'work_out' }).del();
}
