/**
 * Seed the 8 "Quick Access" system report presets into report_builder_saved.
 *
 * Idempotent: removes every existing is_system_preset row first (the table had
 * duplicate rows from earlier runs) then inserts exactly these 8. Each preset is
 * a pivot-engine query_spec — { rows, columns, measure, filters } — not bespoke
 * query code. See context-bundle/29-REPORTING-ARCHITECTURE-PLAN.md §"Quick Access".
 */
import db from '../src/config/db.js';
import { v4 as uuidv4 } from 'uuid';

const ALL_SUPERVISORY = ['DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];
const WITH_SHO = ['SHO', ...ALL_SUPERVISORY];

const PRESETS = [
  {
    name: '1. Records by Police Station',
    roles: WITH_SHO,
    spec: { rows: ['ps_name'], columns: ['record_type'], measure: 'record_count', filters: {} },
  },
  {
    name: '2. FIR by Crime Head by Police Station',
    roles: WITH_SHO,
    spec: { rows: ['ps_name'], columns: ['crime_head'], measure: 'case_count', filters: { recordType: 'CASE' } },
  },
  {
    name: '3. FIR by Act Classification by Police Station',
    roles: WITH_SHO,
    spec: { rows: ['ps_name'], columns: ['act_class'], measure: 'case_count', filters: { recordType: 'CASE' } },
  },
  {
    name: '4. Arrest by Crime Head by Police Station',
    roles: WITH_SHO,
    spec: { rows: ['ps_name'], columns: ['crime_head'], measure: 'arrest_count', filters: { recordType: 'ARREST' } },
  },
  {
    name: '5. Arrest by Act Classification by Police Station',
    roles: WITH_SHO,
    spec: { rows: ['ps_name'], columns: ['act_class'], measure: 'arrest_count', filters: { recordType: 'ARREST' } },
  },
  {
    name: '6. FIR by Heinous / Non-Heinous / Other by Police Station',
    roles: WITH_SHO,
    spec: { rows: ['ps_name'], columns: ['crime_category'], measure: 'case_count', filters: { recordType: 'CASE' } },
  },
  {
    name: '7. Arrest by Heinous / Non-Heinous / Other by Police Station',
    roles: WITH_SHO,
    spec: { rows: ['ps_name'], columns: ['crime_category'], measure: 'arrest_count', filters: { recordType: 'ARREST' } },
  },
  {
    name: '8. Property Stolen Items by Category by Police Station',
    roles: ALL_SUPERVISORY,
    spec: { rows: ['ps_name'], columns: ['property_category'], measure: 'property_stolen_count', filters: { recordType: 'CASE' } },
  },
];

const SYSTEM_USER_ID = '98f6a9be-027e-4a08-bc72-58e431d268b7';

async function run() {
  console.log('Seeding the 8 Quick Access system presets...');
  const now = new Date().toISOString();

  const removed = await db('report_builder_saved').where({ is_system_preset: true }).del();
  console.log(`Removed ${removed} existing system-preset row(s).`);

  // fall back to any real user id if the fixed system user is absent
  let creatorId = SYSTEM_USER_ID;
  const sysUser = await db('users').where({ id: SYSTEM_USER_ID }).first();
  if (!sysUser) {
    const anyAdmin = await db('users')
      .whereIn('role', ['SYSTEM_ADMIN', 'HQ_ADMIN'])
      .first();
    creatorId = anyAdmin ? anyAdmin.id : null;
    console.log(`System user ${SYSTEM_USER_ID} not found; using created_by = ${creatorId}`);
  }

  for (const p of PRESETS) {
    await db('report_builder_saved').insert({
      id: uuidv4(),
      name: p.name,
      description: `Quick Access preset — visible to ${p.roles.join(', ')}`,
      query_spec: JSON.stringify(p.spec),
      is_shared: true,
      is_system_preset: true,
      visible_to_roles: JSON.stringify(p.roles),
      created_by: creatorId,
      created_at: now,
      updated_at: now,
    });
    console.log(`Seeded: "${p.name}"`);
  }

  console.log('Done — 8 Quick Access presets seeded.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Seeding Error:', err);
  process.exit(1);
});
