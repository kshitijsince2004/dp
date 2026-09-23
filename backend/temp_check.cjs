const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5435/pharos_db' });
async function run() {
  await client.connect();
  const res = await client.query(`
    select field_key, section, field_type
    from field_registry
    where record_types @> '["MISSING"]'::jsonb
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run();
