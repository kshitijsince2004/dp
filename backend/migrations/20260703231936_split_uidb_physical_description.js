export async function up(knex) {
  // Update U_6 (description textarea) to corpse_physical section
  await knex('field_registry')
    .where({ id: 'U_6' })
    .update({ section: 'corpse_physical' });
}

export async function down(knex) {
  // Restore U_6 back to corpse_desc section
  await knex('field_registry')
    .where({ id: 'U_6' })
    .update({ section: 'corpse_desc' });
}
