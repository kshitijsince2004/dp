import knexfile from './knexfile.js';
import knex from 'knex';

const db = knex(knexfile.development);

async function run() {
  try {
    const rows = await db('field_registry')
      .where('field_key', 'like', '%_social_category')
      .select('field_key', 'record_types', 'section');
    console.table(rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await db.destroy();
  }
}

run();
