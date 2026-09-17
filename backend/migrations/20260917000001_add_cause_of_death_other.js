export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('uidb_details', 'cause_of_death_other');
  if (!hasCol) {
    await knex.schema.alterTable('uidb_details', (t) => {
      t.string('cause_of_death_other', 500).nullable();
    });
  }
};

export async function down(knex) {
  const hasCol = await knex.schema.hasColumn('uidb_details', 'cause_of_death_other');
  if (hasCol) {
    await knex.schema.alterTable('uidb_details', (t) => {
      t.dropColumn('cause_of_death_other');
    });
  }
};
