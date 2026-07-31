import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import db from '../src/config/db.js';

for (const tbl of ['arrest_details','missing_details','uidb_details','persons','arrestee_details','missing_person_details','person_descriptions','record_offences','locations']) {
  const cols = await db.raw(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [tbl]);
  console.log(`${tbl}: ${cols.rows.map(r => r.column_name).join(', ')}`);
}

// Sample persons
const p = await db('persons').limit(3);
console.log('\nSample persons:', JSON.stringify(p, null, 2));

// Sample arrest_details
const ad = await db('arrest_details').limit(2);
console.log('\nSample arrest_details:', JSON.stringify(ad, null, 2));

process.exit(0);
