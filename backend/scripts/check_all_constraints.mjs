import db from '../src/config/db.js';

async function checkAllConstraints() {
  const tables = ['fir_details', 'arrest_details', 'missing_details', 'uidb_details'];
  for (const t of tables) {
    const res = await db.raw(`
      SELECT c.conname, pg_get_constraintdef(c.oid) AS constraint_def
      FROM pg_constraint c
      JOIN pg_class cl ON c.conrelid = cl.oid
      WHERE cl.relname = ? AND c.contype = 'c';
    `, [t]);
    console.log(`=== ${t} check constraints ===`);
    console.log(res.rows);
  }
  process.exit(0);
}
checkAllConstraints();
