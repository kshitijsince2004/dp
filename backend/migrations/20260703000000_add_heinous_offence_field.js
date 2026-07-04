import { v4 as uuidv4 } from 'uuid';

export async function up(knex) {
  const exists = await knex('field_registry').where({ field_key: 'heinous_offence' }).first();
  if (!exists) {
    await knex('field_registry').insert({
      id: uuidv4(),
      field_key: 'heinous_offence',
      field_type: 'RADIO',
      applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      label_en: 'Heinous Offences',
      label_hi: 'जघन्य अपराध',
      options: JSON.stringify([
        { value: true, label_en: 'Yes', label_hi: 'हाँ' },
        { value: false, label_en: 'No', label_hi: 'नहीं' }
      ]),
      visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
      editable_by_levels: JSON.stringify(['PS']),
      section: 'incident_details',
      sort_order: 9.5,
      validation_rules: JSON.stringify({ required: false }),
      is_active: true,
      scope_level: 'global'
    });
  }
}

export async function down(knex) {
  await knex('field_registry').where({ field_key: 'heinous_offence' }).delete();
}
