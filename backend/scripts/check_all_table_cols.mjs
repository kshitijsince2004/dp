import db from '../src/config/db.js';

async function checkAllCols() {
  const tables = ['fir_details', 'arrest_details', 'missing_details', 'uidb_details', 'persons', 'locations', 'record_offences'];
  for (const t of tables) {
    const cols = await db(t).columnInfo();
    console.log(`=== ${t} columns ===\n`, Object.keys(cols));
  }
  process.exit(0);
}
checkAllCols();
