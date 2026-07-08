export async function up(knex) {
  const fieldsToDelete = [
    'bad_character',
    'complainant_marital_status',
    'victim_marital_status',
    'accused_marital_status',
    'arrested_marital_status',
    'complainant_qualification',
    'victim_qualification',
    'accused_qualification',
    'arrested_qualification',
    'complainant_name'
  ];
  await knex('field_registry').whereIn('field_key', fieldsToDelete).del();
}

export async function down(knex) {
  // safe fallback
}
