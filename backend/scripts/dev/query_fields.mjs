import db, { connectDB } from '../../src/config/db.js';

async function main() {
  await connectDB();
  const rows = await db('field_registry')
    .select('field_key', 'section', 'record_types')
    .where('section', 'accompanying_children');
  
  console.table(rows);
  process.exit(0);
}

main().catch(console.error);
