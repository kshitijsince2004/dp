import db from '../src/config/db.js';

async function checkConstraint() {
  const res = await db.raw(`
    SELECT pg_get_constraintdef(c.oid) AS constraint_def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'records' AND c.conname = 'chk_records_current_status';
  `);
  console.log('chk_records_current_status def:', res.rows[0]);
  process.exit(0);
}
checkConstraint();
