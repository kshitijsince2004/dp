// CLI wrapper for the hierarchy + ref.* loader. Logic lives in lib/load-ref-core.mjs
// (shared with the startup auto-loader). Usage: npm run load-ref
import knex from 'knex';
import cfg from '../knexfile.js';
import { loadRef } from './lib/load-ref-core.mjs';

const db = knex(cfg.development);
try {
  await loadRef(db);
  console.log('✓ load-ref complete');
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
