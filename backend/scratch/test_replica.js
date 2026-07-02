import db from '../src/config/db.js';

async function run() {
  try {
    await db.raw("SET session_replication_role = 'replica'");
    console.log('Replica role works!');
    await db.raw("SET session_replication_role = 'origin'");
  } catch (err) {
    console.error('Replica role failed:', err.message);
  } finally {
    await db.destroy();
  }
}
run();
