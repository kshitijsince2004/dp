import db from '../src/config/db.js';
import { v4 as uuidv4 } from 'uuid';

const PRESETS = [
  {
    name: 'Cases by Police Station',
    roles: ['SHO', 'DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'],
    spec: { rows: ['ps_name'], columns: [], measure: 'case_count', filters: {} },
  },
  {
    name: 'Cases by Crime Head This Month',
    roles: ['SHO', 'DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'],
    spec: {
      rows: ['crime_head'],
      columns: [],
      measure: 'case_count',
      filters: {},
    },
  },
  {
    name: 'PS × Crime Head Cross-tab',
    roles: ['DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'],
    spec: { rows: ['ps_name'], columns: ['crime_head'], measure: 'case_count', filters: {} },
  },
  {
    name: 'Arrests by Type',
    roles: ['SHO', 'DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'],
    spec: { rows: ['arrest_type'], columns: [], measure: 'arrest_count', filters: {} },
  },
  {
    name: 'Property Value Stolen by PS',
    roles: ['DISTRICT_OFFICER', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'],
    spec: { rows: ['ps_name'], columns: [], measure: 'property_value_stolen', filters: {} },
  },
];

async function run() {
  console.log('Seeding report builder role-based presets...');
  const now = new Date().toISOString();

  for (const p of PRESETS) {
    const existing = await db('report_builder_saved').where({ name: p.name }).first();
    if (!existing) {
      await db('report_builder_saved').insert({
        id: uuidv4(),
        name: p.name,
        description: `System preset for ${p.roles.join(', ')}`,
        query_spec: JSON.stringify(p.spec),
        is_shared: true,
        is_system_preset: true,
        visible_to_roles: JSON.stringify(p.roles),
        created_by: '98f6a9be-027e-4a08-bc72-58e431d268b7', // System user
        created_at: now,
        updated_at: now,
      });
      console.log(`Seeded preset: "${p.name}"`);
    } else {
      await db('report_builder_saved').where({ id: existing.id }).update({
        is_system_preset: true,
        visible_to_roles: JSON.stringify(p.roles),
        query_spec: JSON.stringify(p.spec),
        updated_at: now,
      });
      console.log(`Updated preset: "${p.name}"`);
    }
  }

  console.log('Presets seeding completed!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Seeding Error:', err);
  process.exit(1);
});
