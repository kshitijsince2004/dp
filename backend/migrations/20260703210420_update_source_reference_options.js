export async function up(knex) {
  const newOptions = [
    { value: 'PCR Call', label_en: 'PCR Call', label_hi: 'पीसीआर कॉल' },
    { value: 'Written Complaint', label_en: 'Written Complaint', label_hi: 'लिखित शिकायत' },
    { value: 'Public Informant', label_en: 'Public Informant', label_hi: 'सार्वजनिक सूचना' },
    { value: 'Police Beat Officer', label_en: 'Police Beat Officer', label_hi: 'पुलिस बीट अधिकारी' },
    { value: 'Physically appear', label_en: 'Physically appear', label_hi: 'व्यक्तिगत रूप से उपस्थिति' },
    { value: 'Court Order', label_en: 'Court Order', label_hi: 'न्यायालय आदेश' },
    { value: 'Individual/Group/Agency', label_en: 'Individual/Group/Agency', label_hi: 'व्यक्ति/समूह/एजेंसी' }
  ];

  await knex('field_registry')
    .where({ field_key: 'source_reference' })
    .update({
      options: JSON.stringify(newOptions)
    });
}

export async function down(knex) {
  const oldOptions = [
    { value: 'PCR Call', label_en: 'PCR Call', label_hi: 'पीसीआर कॉल' },
    { value: 'Written Complaint', label_en: 'Written Complaint', label_hi: 'लिखित शिकायत' },
    { value: 'Public Informant', label_en: 'Public Informant', label_hi: 'सार्वजनिक सूचना' },
    { value: 'Police Beat Officer', label_en: 'Police Beat Officer', label_hi: 'पुलिस बीट अधिकारी' }
  ];

  await knex('field_registry')
    .where({ field_key: 'source_reference' })
    .update({
      options: JSON.stringify(oldOptions)
    });
}
