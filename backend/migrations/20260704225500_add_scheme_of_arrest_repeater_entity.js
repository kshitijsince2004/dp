export async function up(knex) {
  await knex('field_registry')
    .where({ field_key: 'scheme_of_arrest' })
    .update({ repeater_entity: 'PERSON_ARRESTED' });
}

export async function down(knex) {
  await knex('field_registry')
    .where({ field_key: 'scheme_of_arrest' })
    .update({ repeater_entity: null });
}
