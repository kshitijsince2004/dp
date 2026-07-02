export async function up(knex) {
  const hasShowWhen = await knex.schema.hasColumn('field_registry', 'show_when');
  if (!hasShowWhen) {
    await knex.schema.alterTable('field_registry', (table) => {
      table.jsonb('show_when').nullable();
    });
  }

  // Update property_description and property_status to only show when local_head is a property-related crime
  const propertyCrimes = [
    'Property',
    'Theft',
    'Robbery',
    'Burglary',
    'House Theft',
    'Other Theft',
    'Night Burglary',
    'Day Burglary',
    'Mobile Phone Theft',
    'Cycle Theft',
    'M.V. Theft',
    'Snatching'
  ];

  const showWhenRule = JSON.stringify({
    field: 'local_head',
    value: propertyCrimes
  });

  await knex('field_registry')
    .whereIn('field_key', ['property_description', 'property_status'])
    .update({
      show_when: showWhenRule
    });
}

export async function down(knex) {
  await knex('field_registry')
    .whereIn('field_key', ['property_description', 'property_status'])
    .update({ show_when: null });

  const hasShowWhen = await knex.schema.hasColumn('field_registry', 'show_when');
  if (hasShowWhen) {
    try {
      await knex.schema.alterTable('field_registry', (table) => {
        table.dropColumn('show_when');
      });
    } catch (e) {}
  }

}
