export async function up(knex) {
  await knex('field_registry')
    .where({ field_key: 'scheme_of_arrest' })
    .update({ section: 'arrested_personal_info' });
}

export async function down(knex) {
  await knex('field_registry')
    .where({ field_key: 'scheme_of_arrest' })
    .update({ section: 'arrested_info' });
}
