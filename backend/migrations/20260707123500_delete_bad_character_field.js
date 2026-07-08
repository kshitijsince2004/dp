export async function up(knex) {
  // Delete the duplicate 'bad_character' field from the field_registry table
  await knex('field_registry').where({ field_key: 'bad_character' }).del();
}

export async function down(knex) {
  // Safe fallback if rolled back: re-insert if needed (since it's a duplicate, we can leave it empty)
}
