export async function up(knex) {
  // 1. Update case_status options to include TRANSFER
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

  // 2. Delete the transfer_status field row
  await knex('field_registry')
    .where({ field_key: 'transfer_status' })
    .del();

  // 3. Update transfer_to field in registry (sort order 507, show_when dependent on case_status = TRANSFER)
  const transferToOptions = [
    { value: 'PS', label_en: 'PS', label_hi: 'पुलिस स्टेशन' },
    { value: 'Agency', label_en: 'Agency', label_hi: 'एजेंसी' }
  ];

  await knex('field_registry')
    .where({ field_key: 'transfer_to' })
    .update({
      field_type: 'RADIO',
      options: JSON.stringify(transferToOptions),
      show_when: JSON.stringify({ field: 'case_status', value: 'TRANSFER' }),
      sort_order: 507
    });
}

export async function down(knex) {
  // 1. Revert case_status options
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

  // 2. Insert transfer_status back
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

  // 3. Revert transfer_to field
  const transferToOptions = [
    { value: 'PS', label_en: 'PS', label_hi: 'पुलिस स्टेशन' },
    { value: 'Agency', label_en: 'Agency', label_hi: 'एजेंसी' }
  ];

  await knex('field_registry')
    .where({ field_key: 'transfer_to' })
    .update({
      field_type: 'RADIO',
      options: JSON.stringify(transferToOptions),
      show_when: JSON.stringify({ field: 'transfer_status', value: true }),
      sort_order: 508
    });
}
