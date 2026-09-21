import db from '../src/config/db.js';

async function checkUsers() {
  const users = await db('users').limit(5);
  console.log('Users:');
  for (const u of users) {
    console.log({ id: u.id, username: u.username, role: u.role, ps_id: u.ps_id });
  }
  process.exit(0);
}
checkUsers();
