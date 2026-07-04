export async function up(knex) {
  // 1. Delete the old occurrence_state field from the registry
  await knex('field_registry').where({ field_key: 'occurrence_state' }).del();

  // 2. Migrate existing record data from occurrence_state to occurrence_landmark
  const records = await knex('records').select('id', 'data');
  for (const record of records) {
    let parsed;
    try {
      parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
    } catch (e) {
      continue;
    }
    if (parsed && parsed.occurrence_state !== undefined) {
      parsed.occurrence_landmark = parsed.occurrence_state;
      delete parsed.occurrence_state;
      await knex('records')
        .where({ id: record.id })
        .update({ data: JSON.stringify(parsed) });
    }
  }
}

export async function down(knex) {
  // 1. Delete the occurrence_landmark field from the registry
  await knex('field_registry').where({ field_key: 'occurrence_landmark' }).del();

  // 2. Rollback data from occurrence_landmark to occurrence_state
  const records = await knex('records').select('id', 'data');
  for (const record of records) {
    let parsed;
    try {
      parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
    } catch (e) {
      continue;
    }
    if (parsed && parsed.occurrence_landmark !== undefined) {
      parsed.occurrence_state = parsed.occurrence_landmark;
      delete parsed.occurrence_landmark;
      await knex('records')
        .where({ id: record.id })
        .update({ data: JSON.stringify(parsed) });
    }
  }
}
