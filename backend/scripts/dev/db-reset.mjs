// Dev helper: full DB reset — drops ALL schemas (public, ref, legacy rpt) and recreates empty public.
// Data is disposable by design (docs/db-audit/HANDOFF.md). Usage: node scripts/dev/db-reset.mjs
import knex from 'knex';
import cfg from '../../knexfile.js';

const db = knex(cfg.development);
console.log('Dropping schemas public, ref, rpt …');
await db.raw(`
  DROP SCHEMA IF EXISTS public CASCADE;
  DROP SCHEMA IF EXISTS ref CASCADE;
  DROP SCHEMA IF EXISTS rpt CASCADE;
  CREATE SCHEMA public;
`);
console.log('Done. Now run: npm run db:migrate && npm run sync-config && npm run load-ref && npm run db:seed');
await db.destroy();
