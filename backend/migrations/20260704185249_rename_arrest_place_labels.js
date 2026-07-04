export async function up(knex) {
  await knex('field_registry')
    .where({ field_key: 'arrest_place' })
    .update({ label_en: 'House No. of Arrest', label_hi: 'गिरफ्तारी का मकान संख्या' });

  await knex('field_registry')
    .where({ field_key: 'arrest_street' })
    .update({ label_en: 'Street of Arrest', label_hi: 'गिरफ्तारी का गली / सड़क' });

  await knex('field_registry')
    .where({ field_key: 'arrest_colony' })
    .update({ label_en: 'Colony of Arrest', label_hi: 'गिरफ्तारी का कॉलोनी' });

  await knex('field_registry')
    .where({ field_key: 'arrest_district' })
    .update({ label_en: 'District of Arrest', label_hi: 'गिरफ्तारी का जिला' });

  await knex('field_registry')
    .where({ field_key: 'arrest_landmark' })
    .update({ label_en: 'Landmark of Arrest', label_hi: 'गिरफ्तारी का लैंडमार्क' });
}

export async function down(knex) {
  await knex('field_registry')
    .where({ field_key: 'arrest_place' })
    .update({ label_en: 'Place of Arrest', label_hi: 'गिरफ्तारी का स्थान' });

  await knex('field_registry')
    .where({ field_key: 'arrest_street' })
    .update({ label_en: 'Street', label_hi: 'गली / सड़क' });

  await knex('field_registry')
    .where({ field_key: 'arrest_colony' })
    .update({ label_en: 'Colony', label_hi: 'कॉलोनी' });

  await knex('field_registry')
    .where({ field_key: 'arrest_district' })
    .update({ label_en: 'District', label_hi: 'जिला' });

  await knex('field_registry')
    .where({ field_key: 'arrest_landmark' })
    .update({ label_en: 'Landmark', label_hi: 'लैंडमार्क' });
}
