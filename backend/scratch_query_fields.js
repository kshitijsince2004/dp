import knex from 'knex';
import path from 'path';

async function main() {
  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: path.resolve('database.sqlite')
    },
    useNullAsDefault: true
  });

  const fields = await db('field_registry').where('is_active', true);
  console.log(`Found ${fields.length} active fields`);

  // Print all fields in case
  for (const f of fields) {
    let types = [];
    try {
      types = JSON.parse(f.applicable_record_types);
    } catch (e) {}

    if (types.includes('CASE')) {
      console.log(`Key: ${f.field_key.padEnd(35)} | Label: ${f.label_en.padEnd(50)} | Section: ${f.section}`);
    }
  }

  await db.destroy();
}

main().catch(console.error);
