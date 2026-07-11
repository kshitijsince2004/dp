// backend/seeds/01_users.js — dev/test users for the NEW schema (DB restructure 2026-07).
//
// One login per role. Password for all: Test@1234
// Scope FKs (ps_id / district_id / sub_div_id) are resolved at runtime from
// hierarchy_nodes.code — run `npm run load-ref` (loads config/org/hierarchy.json) FIRST.
//
// Strategy: ON CONFLICT (username) DO NOTHING — safe to re-run, never deletes.
// NOTE: the old seed's ACP users are gone — ACP is not a role in the new CHECK set
// (HC, SHO, DISTRICT_OFFICER, JCP, SCP, HQ_ANALYST, HQ_ADMIN, SYSTEM_ADMIN).

import bcrypt from 'bcryptjs';

const USERS = [
  // role, username, badge, name, ps code, district code, sub-div code
  ['HC', 'hc_parliament_street', 'HC001', 'Ramesh Kumar', 'PS_NDD_PARLIAMENTSTREET', 'DIST_NDD', 'SUBDIV_8165_PARLIAMENTSTREET'],
  ['SHO', 'sho_parliament_street', 'SHO001', 'Vikram Singh', 'PS_NDD_PARLIAMENTSTREET', 'DIST_NDD', 'SUBDIV_8165_PARLIAMENTSTREET'],
  ['HC', 'hc_connaught_place', 'HC002', 'Suresh Chand', 'PS_NDD_CONNAUGHTPLACE', 'DIST_NDD', 'SUBDIV_8165_CONNAUGHTPLACE'],
  ['SHO', 'sho_connaught_place', 'SHO002', 'Anil Dagar', 'PS_NDD_CONNAUGHTPLACE', 'DIST_NDD', 'SUBDIV_8165_CONNAUGHTPLACE'],
  ['DISTRICT_OFFICER', 'dcp_ndd', 'DO001', 'Priya Sharma', null, 'DIST_NDD', null],
  ['DISTRICT_OFFICER', 'dcp_nwd', 'DO002', 'Arjun Mehta', null, 'DIST_NWD', null],
  ['JCP', 'jcp_new_delhi_range', 'JCP001', 'S. K. Malhotra', null, null, null],
  ['SCP', 'scp_zone_2', 'SCP001', 'R. P. Upadhyay', null, null, null],
  ['HQ_ANALYST', 'hq_analyst', 'HQA001', 'Neha Gupta', null, null, null],
  ['HQ_ADMIN', 'hq_admin', 'HQD001', 'Rajiv Ranjan', null, null, null],
  ['SYSTEM_ADMIN', 'system_admin', 'SA001', 'System Administrator', null, null, null],
];

export async function seed(knex) {
  const passwordHash = bcrypt.hashSync('Test@1234', 10);

  const nodes = await knex('hierarchy_nodes').select('id', 'code');
  const byCode = Object.fromEntries(nodes.map(n => [n.code, n.id]));
  const resolve = (code, username) => {
    if (!code) return null;
    if (!byCode[code]) throw new Error(`users seed: ${username} references unknown hierarchy code ${code} — run npm run load-ref first`);
    return byCode[code];
  };

  const rows = USERS.map(([role, username, badge_no, name, ps, district, subDiv]) => ({
    username,
    badge_no,
    name,
    password_hash: passwordHash,
    role,
    ps_id: resolve(ps, username),
    district_id: resolve(district, username),
    sub_div_id: resolve(subDiv, username),
    is_active: true,
  }));

  const inserted = await knex('users').insert(rows).onConflict('username').ignore();
  console.log(`[01_users] seeded ${rows.length} users (existing usernames left untouched)`);
  return inserted;
}
