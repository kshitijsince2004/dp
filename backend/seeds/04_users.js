// backend/seeds/02_users.js
// Permanent users — real officers that will exist in production.
//
// HOW TO ADD AN OFFICER:
//   1. Add a row to the users array below.
//   2. Run `npm run db:seed` (or restart via start.bat).
//
// Strategy: ON CONFLICT (badge_no) DO NOTHING — safe to re-run.
// This file does NOT delete any users. Test/dev users are in scripts/seed-test-data.js.
//
// All hierarchy node IDs (station_id, district_id, sub_div_id) reference rows seeded
// by migration 20260620000000_full_delhi_hierarchy.js.
// To find a node ID: SELECT id, code, name_en FROM hierarchy_nodes WHERE code LIKE 'PS_NDD%';

import bcrypt from 'bcryptjs';

export async function seed(knex) {
  const passwordHash = bcrypt.hashSync('Test@1234', 10);

  const users = [
    // ── Parliament Street PS (NDD District) ─────────────────────────────────────
    {
      id:            'U_HC001',
      username:      'hc_parliament_street',
      badge_no:      'HC001',
      name_en:       'Ramesh Kumar',
      name_hi:       'रमेश कुमार',
      password_hash: passwordHash,
      role:          'HC',
      station_id:    'PS_NDD_PARLIAMENTSTREET',
      district_id:   'DIST_NDD',
      sub_div_id:    'SUBDIV_DIST_NDD_1',
      is_active:     true,
    },
    {
      id:            'U_SHO001',
      username:      'sho_parliament_street',
      badge_no:      'SHO001',
      name_en:       'Vikram Singh',
      name_hi:       'विक्रम सिंह',
      password_hash: passwordHash,
      role:          'SHO',
      station_id:    'PS_NDD_PARLIAMENTSTREET',
      district_id:   'DIST_NDD',
      sub_div_id:    'SUBDIV_DIST_NDD_1',
      is_active:     true,
    },
    {
      id:            'U_ACP001',
      username:      'acp_parliament_street',
      badge_no:      'ACP001',
      name_en:       'Rakesh Yadav',
      name_hi:       'राकेश यादव',
      password_hash: passwordHash,
      role:          'ACP',
      district_id:   'DIST_NDD',
      sub_div_id:    'SUBDIV_DIST_NDD_1',
      is_active:     true,
    },

    // ── New Delhi District HQ ────────────────────────────────────────────────────
    {
      id:            'U_DO001',
      username:      'dcp_ndd',
      badge_no:      'DO001',
      name_en:       'Priya Sharma',
      name_hi:       'प्रिया शर्मा',
      password_hash: passwordHash,
      role:          'DISTRICT_OFFICER',
      district_id:   'DIST_NDD',
      is_active:     true,
    },

    // ── Adarsh Nagar PS (NWD District) ──────────────────────────────────────────
    {
      id:            'U_HC002',
      username:      'hc_adarsh_nagar',
      badge_no:      'HC002',
      name_en:       'Sunil Dutt',
      name_hi:       'सुनील दत्त',
      password_hash: passwordHash,
      role:          'HC',
      station_id:    'PS_NWD_ADARSHNAGAR',
      district_id:   'DIST_NWD',
      sub_div_id:    'SUBDIV_DIST_NWD_0',
      is_active:     true,
    },

    // ── North West District HQ ───────────────────────────────────────────────────
    {
      id:            'U_DO002',
      username:      'dcp_nwd',
      badge_no:      'DO002',
      name_en:       'North West DCP',
      name_hi:       'उत्तर पश्चिम डीसीपी',
      password_hash: passwordHash,
      role:          'DISTRICT_OFFICER',
      district_id:   'DIST_NWD',
      is_active:     true,
    },

    // ── HQ ───────────────────────────────────────────────────────────────────────
    {
      id:            'U_HQ001',
      username:      'hq_analyst',
      badge_no:      'HQ001',
      name_en:       'Anita Verma',
      name_hi:       'अनिता वर्मा',
      password_hash: passwordHash,
      role:          'HQ_ANALYST',
      is_active:     true,
    },
    {
      id:            'U_HQ002',
      username:      'hq_admin',
      badge_no:      'HQ002',
      name_en:       'Suresh Gupta',
      name_hi:       'सुरेश गुप्ता',
      password_hash: passwordHash,
      role:          'HQ_ADMIN',
      is_active:     true,
    },
    {
      id:            'U_SA001',
      username:      'system_admin',
      badge_no:      'SA001',
      name_en:       'System Admin',
      name_hi:       'सिस्टम व्यवस्थापक',
      password_hash: passwordHash,
      role:          'SYSTEM_ADMIN',
      is_active:     true,
    },
  ];

  await knex('users').insert(users).onConflict('badge_no').ignore();
  console.log(`[02_users] Upserted ${users.length} permanent users`);
}
