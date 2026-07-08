// Links a property item to a specific person within the same record — needed for ARREST,
// where one record can have multiple arrested persons, each with their own distinct
// stolen/recovered property list (previously property was record-level only, shared
// across every arrested person).

export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('record_properties', 'person_id');
  if (!hasCol) {
    await knex.schema.alterTable('record_properties', (table) => {
      table.string('person_id', 36).nullable()
        .references('id').inTable('record_persons').onDelete('CASCADE');
    });
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_record_properties_person_id ON record_properties(person_id)');
  }
}

export async function down(knex) {
  const hasCol = await knex.schema.hasColumn('record_properties', 'person_id');
  if (hasCol) {
    await knex.schema.alterTable('record_properties', (table) => {
      table.dropColumn('person_id');
    });
  }
}
