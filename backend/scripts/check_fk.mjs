import db from '../src/config/db.js';

async function checkFK() {
  const res = await db.raw(`
    SELECT
      tc.table_schema, 
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='record_offences';
  `);
  console.log('record_offences foreign keys:', res.rows);
  
  if (res.rows.length > 0) {
    for (const fk of res.rows) {
      const targetTable = `${fk.foreign_table_schema}.${fk.foreign_table_name}`;
      const sample = await db.raw(`SELECT * FROM ${targetTable} LIMIT 3;`);
      console.log(`Sample from ${targetTable}:`, sample.rows);
    }
  }
  process.exit(0);
}
checkFK();
