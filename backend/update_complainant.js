import knexfile from './knexfile.js';
import knex from 'knex';

const db = knex(knexfile.development);

async function run() {
  try {
    console.log('Updating complainant fields to include MISSING...');
    
    await db('field_registry')
      .whereIn('field_key', [
        'complainant_social_category',
        'complainant_education',
        'complainant_financial_status'
      ])
      .update({
        record_types: JSON.stringify(['CASE', 'MISSING'])
      });

    console.log('Update done.');
    
    const rows = await db('field_registry')
      .whereIn('field_key', [
        'complainant_social_category',
        'complainant_education',
        'complainant_financial_status'
      ])
      .select('field_key', 'record_types');
    console.table(rows);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await db.destroy();
  }
}

run();
