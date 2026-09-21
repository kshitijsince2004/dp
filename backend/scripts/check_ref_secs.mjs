import db from '../src/config/db.js';

async function checkRefSecs() {
  const s = await db('ref.sections').limit(10);
  console.log('sample ref.sections:', s);
  process.exit(0);
}
checkRefSecs();
