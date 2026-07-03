export async function up(knex) {
  // 1. act
  await knex.schema.createTable('excel_acts', (table) => {
    table.increments('id').primary();
    table.integer('act_cd');
    table.text('act_long');
  });

  // 2. section
  await knex.schema.createTable('excel_sections', (table) => {
    table.increments('id').primary();
    table.text('section_code');
    table.string('section_cd');
    table.string('act_sec_cd');
    table.string('section');
    table.text('section_desc');
    table.string('pnsh_gt_7yrs');
  });

  // 3. major head
  await knex.schema.createTable('excel_major_heads', (table) => {
    table.increments('id').primary();
    table.integer('major_head_code');
    table.string('major_head');
  });

  // 4. minor head
  await knex.schema.createTable('excel_minor_heads', (table) => {
    table.increments('id').primary();
    table.integer('minor_head_cd');
    table.integer('major_head_code');
    table.string('minor_head');
  });

  // 5. Major_Minor_Mapping
  await knex.schema.createTable('excel_major_minor_mapping', (table) => {
    table.increments('id').primary();
    table.integer('sec_mjrhd_cd');
    table.integer('act_cd');
    table.text('section_code');
    table.integer('major_head_code');
  });

  // 6. Beat
  await knex.schema.createTable('excel_beats', (table) => {
    table.increments('id').primary();
    table.string('beat_cd');
    table.text('beat_name');
    table.string('ps_cd');
  });

  // 7. local head
  await knex.schema.createTable('excel_local_heads', (table) => {
    table.increments('id').primary();
    table.integer('local_head_cd');
    table.string('local_head');
  });

  // 8. Property Type
  await knex.schema.createTable('excel_property_types', (table) => {
    table.increments('id').primary();
    table.integer('parent_srno');
    table.integer('parent_cd');
    table.string('code_type');
    table.string('parent_type');
    table.integer('major_property');
  });

  // 9. ARMS AND AMMUNITION subtable 1: Made
  await knex.schema.createTable('excel_arms_made', (table) => {
    table.increments('id').primary();
    table.integer('arms_made_cd');
    table.string('arms_made');
  });

  // 10. ARMS AND AMMUNITION subtable 2: Category
  await knex.schema.createTable('excel_arms_categories', (table) => {
    table.increments('id').primary();
    table.integer('arms_category_cd');
    table.string('arms_category');
  });

  // 11. ARMS AND AMMUNITION subtable 3: Fire Arms
  await knex.schema.createTable('excel_fire_arms', (table) => {
    table.increments('id').primary();
    table.integer('fire_arms_cd');
    table.integer('arms_category_cd');
    table.string('fire_arms');
  });

  // 12. AUTOMOBILES AND OTHERS
  await knex.schema.createTable('excel_automobiles', (table) => {
    table.increments('id').primary();
    table.integer('automobile_cd');
    table.string('automobile');
  });

  // 13. COIN AND CURRENCY
  await knex.schema.createTable('excel_currency_types', (table) => {
    table.increments('id').primary();
    table.integer('currency_type_cd');
    table.string('currency_type');
  });

  // 14. CULTURAL PROPERTY
  await knex.schema.createTable('excel_cultural_properties', (table) => {
    table.increments('id').primary();
    table.integer('cultural_prop_cd');
    table.string('cultural_prop');
  });

  // 15. Documents
  await knex.schema.createTable('excel_document_types', (table) => {
    table.increments('id').primary();
    table.integer('document_type_cd');
    table.string('document_type');
  });

  // 16. DRUGS NARCOTIC
  await knex.schema.createTable('excel_drug_types', (table) => {
    table.increments('id').primary();
    table.integer('drug_type_cd');
    table.string('drug_type');
  });

  // 17. ELECTRICAL AND ELECTRONIC GOODS
  await knex.schema.createTable('excel_electric_goods', (table) => {
    table.increments('id').primary();
    table.integer('electric_goods_cd');
    table.string('electric_goods');
  });

  // 18. EXPLOSIVES
  await knex.schema.createTable('excel_explosive_types', (table) => {
    table.increments('id').primary();
    table.integer('explosive_type_cd');
    table.string('explosive_type');
  });

  // 19. JEWELLERY
  await knex.schema.createTable('excel_jewelry_types', (table) => {
    table.increments('id').primary();
    table.integer('jewelry_type_cd');
    table.string('jewelry_type');
  });

  // 20. OTHERS subtable 1: Major Property Category
  await knex.schema.createTable('excel_other_property_categories', (table) => {
    table.increments('id').primary();
    table.integer('parent_srno');
    table.integer('parent_cd');
    table.string('code_type');
    table.string('parent_type');
    table.integer('major_property');
  });

  // 21. OTHERS subtable 2: Minor Property Item
  await knex.schema.createTable('excel_other_property_items', (table) => {
    table.increments('id').primary();
    table.integer('property_cd');
    table.integer('parent_cd');
    table.string('property_type_srno');
    table.string('property');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('excel_other_property_items');
  await knex.schema.dropTableIfExists('excel_other_property_categories');
  await knex.schema.dropTableIfExists('excel_jewelry_types');
  await knex.schema.dropTableIfExists('excel_explosive_types');
  await knex.schema.dropTableIfExists('excel_electric_goods');
  await knex.schema.dropTableIfExists('excel_drug_types');
  await knex.schema.dropTableIfExists('excel_document_types');
  await knex.schema.dropTableIfExists('excel_cultural_properties');
  await knex.schema.dropTableIfExists('excel_currency_types');
  await knex.schema.dropTableIfExists('excel_automobiles');
  await knex.schema.dropTableIfExists('excel_fire_arms');
  await knex.schema.dropTableIfExists('excel_arms_categories');
  await knex.schema.dropTableIfExists('excel_arms_made');
  await knex.schema.dropTableIfExists('excel_property_types');
  await knex.schema.dropTableIfExists('excel_local_heads');
  await knex.schema.dropTableIfExists('excel_beats');
  await knex.schema.dropTableIfExists('excel_major_minor_mapping');
  await knex.schema.dropTableIfExists('excel_minor_heads');
  await knex.schema.dropTableIfExists('excel_major_heads');
  await knex.schema.dropTableIfExists('excel_sections');
  await knex.schema.dropTableIfExists('excel_acts');
}
