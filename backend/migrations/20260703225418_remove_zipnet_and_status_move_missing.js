export async function up(knex) {
  // 1. Remove MISSING from zipnet_no's applicable record types so it is only for UIDB
  await knex('field_registry')
    .where({ field_key: 'zipnet_no' })
    .update({ applicable_record_types: JSON.stringify(['UIDB']) });
}

export async function down(knex) {
  // Restore MISSING to zipnet_no applicable record types
  await knex('field_registry')
    .where({ field_key: 'zipnet_no' })
    .update({ applicable_record_types: JSON.stringify(['MISSING', 'UIDB']) });
}
