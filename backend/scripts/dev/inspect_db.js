import db from '../src/config/db.js';

async function run() {
  try {
    const users = await db('users').select('id', 'username', 'badge_no', 'role', 'is_active', 'password_hash');
    console.log('--- Seeded Users ---');
    console.log(JSON.stringify(users, null, 2));
    
    // Also check hierarchy nodes
    const nodes = await db('hierarchy_nodes').select('id', 'name_en', 'node_type', 'code');
    console.log('--- Hierarchy Nodes ---');
    console.log(JSON.stringify(nodes, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error reading DB:', error);
    process.exit(1);
  }
}

run();
