export async function up(knex) {
  // Restore MISSING and UIDB to zipnet_no's applicable record types
  await knex('field_registry')
    .where({ field_key: 'zipnet_no' })
    .update({ applicable_record_types: JSON.stringify(['MISSING', 'UIDB']) });
}

export async function down(knex) {
  // Set back to only UIDB
  await knex('field_registry')
    .where({ field_key: 'zipnet_no' })
    .update({ applicable_record_types: JSON.stringify(['UIDB']) });
}
