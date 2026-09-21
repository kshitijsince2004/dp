import db from '../src/config/db.js';

async function checkSections() {
  const acts = await db('acts').limit(5);
  console.log('acts:', acts);
  const secs = await db('sections').limit(5);
  console.log('sections:', secs);
  process.exit(0);
}
checkSections();
