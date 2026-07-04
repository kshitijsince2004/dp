export async function up(knex) {
  // 1. Update case_status options to include TRANSFER if not already present
  const newCaseStatusOptions = [
    { value: 'CHARGE SHEET', label_en: 'CHARGE SHEET', label_hi: 'आरोप पत्र' },
    { value: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_en: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_hi: 'पुलिस जांच रिपोर्ट (PIR-JCL)' },
    { value: 'UNTRACED', label_en: 'UNTRACED', label_hi: 'अनट्रेस्ड' },
    { value: 'PENDING', label_en: 'PENDING', label_hi: 'लंबित' },
    { value: 'CANCELLATION', label_en: 'CANCELLATION', label_hi: 'रद्दीकरण' },
    { value: 'QUASHED', label_en: 'QUASHED', label_hi: 'रद्द / क्वैश' },
    { value: 'CLOSURE REPORT', label_en: 'CLOSURE REPORT', label_hi: 'क्लोजर रिपोर्ट' },
    { value: 'RELEASED U/S 189 BNSS', label_en: 'RELEASED U/S 189 BNSS', label_hi: 'धारा 189 बीएनएसएस के तहत रिहा' },
    { value: 'TRANSFER', label_en: 'TRANSFER', label_hi: 'स्थानांतरण' }
  ];

  await knex('field_registry')
    .where({ field_key: 'case_status' })
    .update({
      options: JSON.stringify(newCaseStatusOptions)
    });

  // 2. Delete the separate transfer_status Yes/No field row (from previous migration)
  await knex('field_registry')
    .where({ field_key: 'transfer_status' })
    .del();

  // 3. Deactivate transfer_to field in registry (since it's now handled inline inside case_status cell)
  await knex('field_registry')
    .where({ field_key: 'transfer_to' })
    .update({
      is_active: false
    });
}

export async function down(knex) {
  // 1. Reactivate transfer_to field in registry
  await knex('field_registry')
    .where({ field_key: 'transfer_to' })
    .update({
      is_active: true
    });

  // 2. Insert transfer_status field back
  await knex('field_registry').insert({
    id: 'C_transfer_status',
    field_key: 'transfer_status',
    field_type: 'RADIO',
    applicable_record_types: JSON.stringify(['CASE']),
    label_en: 'Transfer',
    label_hi: 'स्थानांतरण',
    visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
    editable_by_levels: JSON.stringify(['PS']),
    section: 'investigation_details',
    sort_order: 507,
    is_active: true,
    scope_level: 'global',
    options: JSON.stringify([{ value: true, label_en: 'Yes', label_hi: 'हाँ' }, { value: false, label_en: 'No', label_hi: 'नहीं' }])
  });

  // 3. Revert case_status options (remove TRANSFER)
  const oldCaseStatusOptions = [
    { value: 'CHARGE SHEET', label_en: 'CHARGE SHEET', label_hi: 'आरोप पत्र' },
    { value: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_en: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_hi: 'पुलिस जांच रिपोर्ट (PIR-JCL)' },
    { value: 'UNTRACED', label_en: 'UNTRACED', label_hi: 'अनट्रेस्ड' },
    { value: 'PENDING', label_en: 'PENDING', label_hi: 'लंबित' },
    { value: 'CANCELLATION', label_en: 'CANCELLATION', label_hi: 'रद्दीकरण' },
    { value: 'QUASHED', label_en: 'QUASHED', label_hi: 'रद्द / क्वैश' },
    { value: 'CLOSURE REPORT', label_en: 'CLOSURE REPORT', label_hi: 'क्लोजर रिपोर्ट' },
    { value: 'RELEASED U/S 189 BNSS', label_en: 'RELEASED U/S 189 BNSS', label_hi: 'धारा 189 बीएनएसएस के तहत रिहा' }
  ];

  await knex('field_registry')
    .where({ field_key: 'case_status' })
    .update({
      options: JSON.stringify(oldCaseStatusOptions)
    });
}
