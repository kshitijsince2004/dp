/**
 * Migration: Add system presets support to report_builder_saved
 */

export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('report_builder_saved', 'is_system_preset');
  if (!hasCol) {
    await knex.schema.table('report_builder_saved', (t) => {
      t.boolean('is_system_preset').notNullable().defaultTo(false);
      t.jsonb('visible_to_roles').nullable();
    });
  }
}

export async function down(knex) {
  const hasCol = await knex.schema.hasColumn('report_builder_saved', 'is_system_preset');
  if (hasCol) {
    await knex.schema.table('report_builder_saved', (t) => {
      t.dropColumn('is_system_preset');
      t.dropColumn('visible_to_roles');
    });
  }
}
