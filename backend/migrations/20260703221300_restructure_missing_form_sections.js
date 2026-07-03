export async function up(knex) {
  // 1. Hide mp_known from UI (auto-set by missing_type in frontend)
  await knex('field_registry').where({ field_key: 'mp_known' }).update({ is_active: false });

  // 2. Move present address fields to missing_address section
  const presentAddrFields = ['mp_house_no', 'mp_street', 'mp_colony', 'mp_city_town_village', 'mp_state', 'mp_district', 'mp_pincode', 'mp_address'];
  for (const key of presentAddrFields) {
    await knex('field_registry').where({ field_key: key }).update({ section: 'missing_address' });
  }

  // 3. Move permanent address toggle + fields to missing_address section
  const permAddrFields = ['mp_perm_same', 'mp_perm_house_no', 'mp_perm_street', 'mp_perm_colony', 'mp_perm_city_town_village', 'mp_perm_state', 'mp_perm_district', 'mp_perm_pincode', 'missing_address'];
  for (const key of permAddrFields) {
    await knex('field_registry').where({ field_key: key }).update({ section: 'missing_address' });
  }

  // 4. Move physical description fields to missing_physical section
  const physFields = ['height', 'built', 'complexion', 'face', 'hair', 'moustache', 'beard', 'upper_dress_color', 'lower_dress_color', 'physical_description'];
  for (const key of physFields) {
    await knex('field_registry').where({ field_key: key }).update({ section: 'missing_physical' });
  }
}

export async function down(knex) {
  // Restore mp_known to visible
  await knex('field_registry').where({ field_key: 'mp_known' }).update({ is_active: true });

  // Restore all moved fields back to person_details
  const allMovedFields = [
    'mp_house_no', 'mp_street', 'mp_colony', 'mp_city_town_village', 'mp_state', 'mp_district', 'mp_pincode', 'mp_address',
    'mp_perm_same', 'mp_perm_house_no', 'mp_perm_street', 'mp_perm_colony', 'mp_perm_city_town_village', 'mp_perm_state', 'mp_perm_district', 'mp_perm_pincode', 'missing_address',
    'height', 'built', 'complexion', 'face', 'hair', 'moustache', 'beard', 'upper_dress_color', 'lower_dress_color', 'physical_description'
  ];
  for (const key of allMovedFields) {
    await knex('field_registry').where({ field_key: key }).update({ section: 'person_details' });
  }
}
