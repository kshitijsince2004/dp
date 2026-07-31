import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import db from '../src/config/db.js';
import bcrypt from 'bcryptjs';

const HASH = await bcrypt.hash('Test@1234', 10);

// Districts that have seeded records (PS -> SUB_DIV -> DISTRICT)
const rows = await db.raw(`
  SELECT DISTINCT dist.id, dist.name, dist.code
  FROM hierarchy_nodes dist
  JOIN hierarchy_nodes subdiv ON subdiv.parent_id = dist.id AND subdiv.node_type = 'SUB_DIV'
  JOIN hierarchy_nodes ps ON ps.parent_id = subdiv.id AND ps.node_type = 'PS'
  JOIN records rec ON rec.ps_id = ps.id
  WHERE dist.node_type = 'DISTRICT'
  ORDER BY dist.name
`);

const districts = rows.rows;
console.log(`Found ${districts.length} districts with seeded data\n`);

let seq = 3100;
let created = 0;

for (const d of districts) {
  // derive a clean code slug from district code, e.g. DIST_RND -> rnd
  const slug = d.code.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const username = `dcp_${slug}`.substring(0, 50);
  const badge = `DO${String(seq).padStart(4, '0')}`;
  seq++;

  try {
    await db('users').insert({
      username,
      password_hash: HASH,
      role: 'DISTRICT_OFFICER',
      district_id: d.id,
      name: `DCP ${d.name}`,
      badge_no: badge,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('username').ignore();
    created++;
    console.log(`  ✓ ${username.padEnd(40)} ${d.name}`);
  } catch (e) {
    console.log(`  ✗ ${username}: ${e.message}`);
  }
}

console.log(`\nDone — ${created} district officer accounts upserted`);
process.exit(0);
