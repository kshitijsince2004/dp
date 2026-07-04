export async function up(knex) {
  const fields = [
    {
      id: 'A_7_street',
      field_key: 'arrest_street',
      field_type: 'TEXT',
      applicable_record_types: JSON.stringify(['ARREST']),
      label_en: 'Street',
      label_hi: 'गली / सड़क',
      visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
      editable_by_levels: JSON.stringify(['PS']),
      introduced_at_level: 'PS',
      section: 'arrest_details',
      sort_order: 7.1,
      repeater_entity: 'PERSON_ARRESTED',
      is_active: true,
      scope_level: 'global'
    },
    {
      id: 'A_7_colony',
      field_key: 'arrest_colony',
      field_type: 'TEXT',
      applicable_record_types: JSON.stringify(['ARREST']),
      label_en: 'Colony',
      label_hi: 'कॉलोनी',
      visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
      editable_by_levels: JSON.stringify(['PS']),
      introduced_at_level: 'PS',
      section: 'arrest_details',
      sort_order: 7.2,
      repeater_entity: 'PERSON_ARRESTED',
      is_active: true,
      scope_level: 'global'
    },
    {
      id: 'A_7_district',
      field_key: 'arrest_district',
      field_type: 'SELECT',
      applicable_record_types: JSON.stringify(['ARREST']),
      label_en: 'District',
      label_hi: 'जिला',
      options: JSON.stringify([
        { value: 'New Delhi District (NDD)', label_en: 'New Delhi District (NDD)', label_hi: 'नई दिल्ली जिला' },
        { value: 'Central District', label_en: 'Central District', label_hi: 'मध्य जिला' }
      ]),
      visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
      editable_by_levels: JSON.stringify(['PS']),
      introduced_at_level: 'PS',
      section: 'arrest_details',
      sort_order: 7.3,
      repeater_entity: 'PERSON_ARRESTED',
      is_active: true,
      scope_level: 'global'
    },
    {
      id: 'A_7_landmark',
      field_key: 'arrest_landmark',
      field_type: 'TEXT',
      applicable_record_types: JSON.stringify(['ARREST']),
      label_en: 'Landmark',
      label_hi: 'लैंडमार्क',
      visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
      editable_by_levels: JSON.stringify(['PS']),
      introduced_at_level: 'PS',
      section: 'arrest_details',
      sort_order: 7.4,
      repeater_entity: 'PERSON_ARRESTED',
      is_active: true,
      scope_level: 'global'
    }
  ];

  for (const f of fields) {
    const existing = await knex('field_registry').where({ id: f.id }).first();
    if (!existing) {
      await knex('field_registry').insert(f);
    }
  }
}

export async function down(knex) {
  await knex('field_registry')
    .whereIn('id', ['A_7_street', 'A_7_colony', 'A_7_district', 'A_7_landmark'])
    .del();
}
