import db from '../src/config/db.js';

async function checkPersonsConstraint() {
  const res = await db.raw(`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS constraint_def
    FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE cl.relname = 'persons' AND c.contype = 'c';
  `);
  console.log('persons check constraints:', res.rows);
  process.exit(0);
}
checkPersonsConstraint();
