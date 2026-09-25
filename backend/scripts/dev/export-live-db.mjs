// Stage 0: export live-DB truth to docs/db-audit/exports/ before the wipe.
import knex from 'knex';
import fs from 'fs';
import path from 'path';
import cfg from '/home/ashmit/Projects/Crime-Diaries/backend/knexfile.js';

const OUT = '/home/ashmit/Projects/Crime-Diaries/docs/db-audit/exports';
fs.mkdirSync(OUT, { recursive: true });
const db = knex(cfg.development);

const dump = async (table) => {
  const rows = await db(table).select('*').orderBy('id');
  fs.writeFileSync(path.join(OUT, `${table}.json`), JSON.stringify(rows, null, 1));
  console.log(`${table}: ${rows.length} rows`);
};

await dump('hierarchy_nodes');
await dump('field_registry');
await dump('workflow_transitions_config');
await dump('level_data_contracts');
await dump('report_templates');
// users too — needed to rewrite the users seed with real usernames/roles
const users = await db('users').select('*');
for (const u of users) u.password_hash = u.password_hash ? '<redacted>' : null;
fs.writeFileSync(path.join(OUT, 'users.json'), JSON.stringify(users, null, 1));
console.log(`users: ${users.length} rows (hashes redacted)`);

await db.destroy();
