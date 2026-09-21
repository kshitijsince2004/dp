import db from '../src/config/db.js';

async function checkSectionsTable() {
  const t = await db.raw(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name IN ('sections', 'acts');
  `);
  console.log('matching tables:', t.rows);

  const secCols = await db.raw(`
    SELECT table_schema, table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name IN ('sections', 'acts');
  `);
  console.log('columns:', secCols.rows);

  const sampleSec = await db.raw(`SELECT * FROM "sections" LIMIT 5;`);
  console.log('sample public.sections:', sampleSec.rows);

  process.exit(0);
}
checkSectionsTable();
