import knexfile from './knexfile.js';
import knex from 'knex';
import { up } from './migrations/20260822000001_demographic_fields_registry.js';

const db = knex(knexfile.development);

async function run() {
  try {
    console.log('Running up() migration...');
    await up(db);
    console.log('Migration up() complete.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await db.destroy();
  }
}

run();
