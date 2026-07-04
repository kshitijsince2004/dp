export async function up(knex) {
  // Update case_status and transfer_to applicable record types to only CASE
  await knex('field_registry')
    .whereIn('field_key', ['case_status', 'transfer_to'])
    .update({ applicable_record_types: JSON.stringify(['CASE']) });
}

export async function down(knex) {
  // Revert back to all types
  await knex('field_registry')
    .whereIn('field_key', ['case_status', 'transfer_to'])
    .update({ applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']) });
}
