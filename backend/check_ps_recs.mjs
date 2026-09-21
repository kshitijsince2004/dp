import knex from 'knex';
import { config } from 'dotenv';
config();

const db = knex({ client: 'pg', connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/pharos_db' });

async function run() {
  const parliamentNodeId = '8ca42ce6-64b8-4180-b622-da5411eeefb3';

  console.log('=== RECORDS FOR PARLIAMENT STREET ===');
  const recs = await db('records').where({ ps_id: parliamentNodeId });
  console.table(recs);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
