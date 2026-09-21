import db from '../src/config/db.js';

async function checkCols() {
  const cols = await db('hierarchy_nodes').columnInfo();
  console.log('hierarchy_nodes columns:', Object.keys(cols));
  const sample = await db('hierarchy_nodes').limit(3);
  console.log('sample nodes:', sample);
  process.exit(0);
}
checkCols();
