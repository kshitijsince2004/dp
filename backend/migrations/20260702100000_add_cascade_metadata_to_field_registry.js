export async function up(knex) {
  const hasDependsOn = await knex.schema.hasColumn('field_registry', 'depends_on');
  const hasOptionsSource = await knex.schema.hasColumn('field_registry', 'options_source');

  await knex.schema.alterTable('field_registry', (table) => {
    if (!hasDependsOn) table.string('depends_on', 60).nullable();
    if (!hasOptionsSource) table.string('options_source', 255).nullable();
  });

  // Only property_minor_category currently needs this: its options are inherently dependent on
  // a live sibling selection (property_major_category) and cannot be precomputed in a single
  // getFieldsForForm response. `{value}` is a placeholder token the consuming frontend substitutes
  // with the parent field's selected value before calling the endpoint.
  await knex('field_registry')
    .where({ field_key: 'property_minor_category' })
    .update({
      depends_on: 'property_major_category',
      options_source: '/api/fields/lookup/property-items/{value}',
    });
}

export async function down(knex) {
  try {
    await knex.schema.alterTable('field_registry', (table) => {
      table.dropColumn('options_source');
      table.dropColumn('depends_on');
    });
  } catch (e) {}
}
