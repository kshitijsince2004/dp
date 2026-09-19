export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('arrest_details', 'scheme_of_arrest_other');
  if (!hasCol) {
    await knex.schema.alterTable('arrest_details', (t) => {
      t.string('scheme_of_arrest_other', 500).nullable();
    });
  }
}
export async function down(knex) {
  const hasCol = await knex.schema.hasColumn('arrest_details', 'scheme_of_arrest_other');
  if (hasCol) {
    await knex.schema.alterTable('arrest_details', (t) => {
      t.dropColumn('scheme_of_arrest_other');
    });
  }
}
