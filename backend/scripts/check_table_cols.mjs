import db from '../src/config/db.js';

async function checkTableCols() {
  const tables = ['arrest_details', 'missing_details', 'uidb_details'];
  for (const t of tables) {
    const cols = await db.raw(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = ?;
    `, [t]);
    console.log(`=== ${t} columns ===`);
    console.log(cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  }
  process.exit(0);
}
checkTableCols();
