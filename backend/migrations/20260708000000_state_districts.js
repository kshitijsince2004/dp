import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// State-wise district data seeded from "State Wise District Data.xlsx"
const STATE_DISTRICT_DATA = require('./state_district_data.json');

export async function up(knex) {
  // Create state_districts lookup table
  await knex.schema.createTable('state_districts', (table) => {
    table.increments('id').primary();
    table.string('state_name', 100).notNullable();
    table.string('district_name', 150).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.index(['state_name'], 'idx_state_districts_state');
    table.unique(['state_name', 'district_name'], 'uq_state_district');
  });

  // Seed data in batches
  const batchSize = 100;
  for (let i = 0; i < STATE_DISTRICT_DATA.length; i += batchSize) {
    const batch = STATE_DISTRICT_DATA.slice(i, i + batchSize).map(r => ({
      state_name: r.state,
      district_name: r.district,
      is_active: true,
    }));
    await knex('state_districts').insert(batch);
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('state_districts');
}
