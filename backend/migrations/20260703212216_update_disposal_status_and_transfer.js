export async function up(knex) {
  // 1. Update sort orders for existing fields
  await knex('field_registry')
    .where({ field_key: 'io_mobile' })
    .update({ sort_order: 502 });

  await knex('field_registry')
    .where({ field_key: 'disposal_type' })
    .update({ sort_order: 504 });

  await knex('field_registry')
    .where({ field_key: 'rc_no' })
    .update({ sort_order: 505 });

  await knex('field_registry')
    .where({ field_key: 'io_pis' })
    .update({ sort_order: 506 });

  // 2. Insert new case_status field if not exists
  const csExists = await knex('field_registry').where({ field_key: 'case_status' }).first();
  if (!csExists) {
    const caseStatusOptions = [
      { value: 'CHARGE SHEET', label_en: 'CHARGE SHEET', label_hi: 'आरोप पत्र' },
      { value: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_en: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_hi: 'पुलिस जांच रिपोर्ट (PIR-JCL)' },
      { value: 'UNTRACED', label_en: 'UNTRACED', label_hi: 'अनट्रेस्ड' },
      { value: 'PENDING', label_en: 'PENDING', label_hi: 'लंबित' },
      { value: 'CANCELLATION', label_en: 'CANCELLATION', label_hi: 'रद्दीकरण' },
      { value: 'QUASHED', label_en: 'QUASHED', label_hi: 'रद्द / क्वैश' },
      { value: 'CLOSURE REPORT', label_en: 'CLOSURE REPORT', label_hi: 'क्लोजर रिपोर्ट' },
      { value: 'RELEASED U/S 189 BNSS', label_en: 'RELEASED U/S 189 BNSS', label_hi: 'धारा 189 बीएनएसएस के तहत रिहा' }
    ];

    await knex('field_registry').insert({
      id: 'C_case_status',
      field_key: 'case_status',
      field_type: 'SELECT',
      applicable_record_types: JSON.stringify(['CASE']),
      label_en: 'Status',
      label_hi: 'स्थिति',
      visible_to_levels: JSON.stringify(['PS', 'DISTRICT', 'HQ']),
      editable_by_levels: JSON.stringify(['PS']),
      section: 'investigation_details',
      sort_order: 503,
      is_active: true,
      scope_level: 'global',
      options: JSON.stringify(caseStatusOptions)
    });
  }

  // 3. Insert transfer_status field if not exists
  const tsExists = await knex('field_registry').where({ field_key: 'transfer_status' }).first();
  if (!tsExists) {
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
  }

  // 4. Update transfer_to field in registry
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

export async function down(knex) {
  // Restore sort orders for existing fields
  await knex('field_registry')
    .where({ field_key: 'io_mobile' })
    .update({ sort_order: 503 });

  await knex('field_registry')
    .where({ field_key: 'disposal_type' })
    .update({ sort_order: 61 });

  await knex('field_registry')
    .where({ field_key: 'rc_no' })
    .update({ sort_order: 60 });

  await knex('field_registry')
    .where({ field_key: 'io_pis' })
    .update({ sort_order: 502 });

  // Delete case_status
  await knex('field_registry').where({ field_key: 'case_status' }).del();

  // Delete transfer_status
  await knex('field_registry').where({ field_key: 'transfer_status' }).del();

  // Restore transfer_to fields to original SELECT
  const oldTransferToOptions = [
    { value: 'Court',  label_en: 'Court',  label_hi: 'न्यायालय' },
    { value: 'CBI',    label_en: 'CBI (Central Bureau of Investigation)', label_hi: 'सीबीआई' },
    { value: 'EOW',    label_en: 'EOW (Economic Offences Wing)', label_hi: 'ईओडब्ल्यू' },
    { value: 'ACB',    label_en: 'ACB (Anti-Corruption Bureau)', label_hi: 'एसीबी' },
    { value: 'NIA',    label_en: 'NIA (National Investigation Agency)', label_hi: 'एनआईए' },
    { value: 'ED',     label_en: 'ED (Enforcement Directorate)', label_hi: 'प्रवर्तन निदेशालय' },
    { value: 'NCB',    label_en: 'NCB (Narcotics Control Bureau)', label_hi: 'एनसीबी' },
    { value: 'STF',    label_en: 'STF (Special Task Force)', label_hi: 'एसटीएफ' },
    { value: 'SIT',    label_en: 'SIT (Special Investigation Team)', label_hi: 'एसआईटी' },
    { value: 'Other',  label_en: 'Other Investigative Agency', label_hi: 'अन्य जांच एजेंसी' },
  ];

  await knex('field_registry')
    .where({ field_key: 'transfer_to' })
    .update({
      field_type: 'SELECT',
      options: JSON.stringify(oldTransferToOptions),
      show_when: JSON.stringify({ field: 'status', value: 'Transfer' }),
      sort_order: 61.5
    });
}
