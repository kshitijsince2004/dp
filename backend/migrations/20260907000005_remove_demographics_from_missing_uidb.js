/**
 * Migration 20260907000005: Remove financial_status, social_category, and education
 * fields from MISSING and UIDB forms.
 */

export async function up(knex) {
  // 1. Update root unsectioned fields: remove MISSING and UIDB from record_types
  for (const key of ['financial_status', 'social_category', 'education']) {
    const row = await knex('field_registry').where('field_key', key).first();
    if (row) {
      let rTypes = [];
      try {
        rTypes = typeof row.record_types === 'string' ? JSON.parse(row.record_types) : (row.record_types || []);
      } catch {
        rTypes = ['CASE', 'ARREST'];
      }
      const updated = rTypes.filter(rt => rt !== 'MISSING' && rt !== 'UIDB');
      await knex('field_registry').where('field_key', key).update({
        record_types: JSON.stringify(updated),
      });
    }
  }

  // 2. Deactivate mp_* demographic fields for MISSING
  await knex('field_registry')
    .whereIn('field_key', ['mp_financial_status', 'mp_social_category', 'mp_education'])
    .update({
      is_active: false,
      record_types: JSON.stringify([]),
    });
}

export async function down(knex) {
  for (const key of ['financial_status', 'social_category', 'education']) {
    await knex('field_registry').where('field_key', key).update({
      record_types: JSON.stringify(['CASE', 'ARREST', 'MISSING', 'UIDB']),
    });
  }
  await knex('field_registry')
    .whereIn('field_key', ['mp_financial_status', 'mp_social_category', 'mp_education'])
    .update({
      is_active: true,
      record_types: JSON.stringify(['MISSING']),
    });
}
