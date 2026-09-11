import knexfile from './knexfile.js';
import knex from 'knex';

const db = knex(knexfile.development);

async function run() {
  try {
    console.log('Updating repeater_entity for victim and accused...');
    
    await db('field_registry')
      .whereIn('field_key', [
        'victim_social_category',
        'victim_education',
        'victim_financial_status'
      ])
      .update({
        repeater_entity: 'PERSON_VICTIM'
      });

    await db('field_registry')
      .whereIn('field_key', [
        'accused_social_category',
        'accused_education',
        'accused_financial_status'
      ])
      .update({
        repeater_entity: 'PERSON_ACCUSED'
      });

    console.log('Update done.');
    
    const rows = await db('field_registry')
      .where('field_key', 'like', 'victim_%_category')
      .orWhere('field_key', 'like', 'accused_%_category')
      .select('field_key', 'repeater_entity');
    console.table(rows);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await db.destroy();
  }
}

run();
