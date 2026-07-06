import db from './src/config/db.js';

async function main() {
  try {
    const tables = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema IN ('public', 'rpt')
      ORDER BY table_schema, table_name;
    `);
    console.log('--- Tables:');
    console.log(tables.rows.map(r => r.table_name));
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}

main();
