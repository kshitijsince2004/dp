export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('workflow_transitions_config', 'requires_field_correction');
  if (!hasCol) {
    await knex.schema.alterTable('workflow_transitions_config', (t) => {
      t.boolean('requires_field_correction').notNullable().defaultTo(false);
    });
  }
}
export async function down(knex) {
  const hasCol = await knex.schema.hasColumn('workflow_transitions_config', 'requires_field_correction');
  if (hasCol) {
    await knex.schema.alterTable('workflow_transitions_config', (t) => {
      t.dropColumn('requires_field_correction');
    });
  }
}
