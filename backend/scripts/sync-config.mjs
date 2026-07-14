// CLI wrapper for the config-as-data sync. Logic lives in lib/sync-config-core.mjs
// (shared with the startup auto-loader). Usage: npm run sync-config
import knex from 'knex';
import cfg from '../knexfile.js';
import { syncConfig } from './lib/sync-config-core.mjs';

const db = knex(cfg.development);
try {
  await syncConfig(db);
  console.log('\n✓ sync-config complete');
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
