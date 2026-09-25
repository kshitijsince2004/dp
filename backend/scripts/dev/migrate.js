import db from '../src/config/db.js';

async function run() {
  try {
    console.log('[Knex] Running migrations...');
    await db.migrate.latest();
    console.log('[Knex] Migrations completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('[Knex] Migration failed:', error);
    process.exit(1);
  }
}

run();
