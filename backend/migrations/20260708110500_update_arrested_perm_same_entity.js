export async function up(knex) {
  await knex('field_registry')
    .where({ field_key: 'arrested_perm_same' })
    .update({ repeater_entity: 'PERSON_ARRESTED', field_type: 'BOOLEAN' });
}

export async function down(knex) {
  await knex('field_registry')
    .where({ field_key: 'arrested_perm_same' })
    .update({ repeater_entity: null, field_type: 'RADIO' });
}
