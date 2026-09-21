import db from '../src/config/db.js';

async function checkRecordsCols() {
  const cols = await db('records').columnInfo();
  console.log('records columns:', Object.keys(cols));
  process.exit(0);
}
checkRecordsCols();
