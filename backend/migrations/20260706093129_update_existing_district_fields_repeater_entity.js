export async function up(knex) {
  const SECTION_REPEATER_MAP = {
    victim_personal_info: 'PERSON_VICTIM',
    victim_address: 'PERSON_VICTIM',
    accused_personal_info: 'PERSON_ACCUSED',
    accused_address: 'PERSON_ACCUSED',
    arrest_details: 'PERSON_ARRESTED',
    arrested_personal_info: 'PERSON_ARRESTED',
    arrestee_info: 'PERSON_ARRESTED',
    arrested_address: 'PERSON_ARRESTED',
    property_details: 'PROPERTY',
    stolen_property: 'PROPERTY',
    recovered_property: 'PROPERTY'
  };

  for (const [section, repeater_entity] of Object.entries(SECTION_REPEATER_MAP)) {
    await knex('field_registry')
      .where({ section })
      .whereNull('repeater_entity')
      .update({ repeater_entity });
  }
}

export async function down(knex) {
  // Reverting would set them to null.
  // Note: we can limit this rollback to district scope to prevent affecting global seeds.
  const SECTION_REPEATER_MAP = {
    victim_personal_info: 'PERSON_VICTIM',
    victim_address: 'PERSON_VICTIM',
    accused_personal_info: 'PERSON_ACCUSED',
    accused_address: 'PERSON_ACCUSED',
    arrest_details: 'PERSON_ARRESTED',
    arrested_personal_info: 'PERSON_ARRESTED',
    arrestee_info: 'PERSON_ARRESTED',
    arrested_address: 'PERSON_ARRESTED',
    property_details: 'PROPERTY',
    stolen_property: 'PROPERTY',
    recovered_property: 'PROPERTY'
  };

  for (const [section, repeater_entity] of Object.entries(SECTION_REPEATER_MAP)) {
    await knex('field_registry')
      .where({ section, repeater_entity, scope_level: 'district' })
      .update({ repeater_entity: null });
  }
}

