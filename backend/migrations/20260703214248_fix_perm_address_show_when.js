export async function up(knex) {
  // Remove show_when from arrested_perm_address so it stays visible even when Same as Present is checked
  await knex('field_registry')
    .where({ field_key: 'arrested_perm_address' })
    .update({ show_when: null });

  // Remove show_when from all arrested_perm_* address fields
  await knex('field_registry')
    .where('field_key', 'like', 'arrested_perm_%')
    .update({ show_when: null });
}

export async function down(knex) {
  const showWhenFalse = JSON.stringify({ field: 'arrested_perm_same', value: false });

  await knex('field_registry')
    .where({ field_key: 'arrested_perm_address' })
    .update({ show_when: showWhenFalse });

  const permFields = await knex('field_registry')
    .where('field_key', 'like', 'arrested_perm_%')
    .select('field_key');

  for (const f of permFields) {
    await knex('field_registry')
      .where({ field_key: f.field_key })
      .update({ show_when: showWhenFalse });
  }
}
