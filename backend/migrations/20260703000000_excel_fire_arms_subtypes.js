// The "ARMS AND AMMUNITION" sheet in seeds/Menu_Tables.xlsx has a 3rd section, "Sub Type of
// Fire Arm" (rows 43+), keyed by arms_type_cd -> fire_arms_cd from the "Type of Fire Arm"
// section. The seeds/02_menu_tables.js parser didn't recognize that section header, so those
// rows were silently mis-parsed as extra excel_fire_arms rows (e.g. "AK 47" ending up with a
// bogus fire_arms_cd/arms_category_cd pair). This table + the parser fix in the same change
// give Subtype of Arm a real, correctly-linked data source.
export async function up(knex) {
  await knex.schema.createTable('excel_fire_arms_subtypes', (table) => {
    table.increments('id').primary();
    table.integer('arms_subtype_cd');
    table.integer('arms_type_cd'); // -> excel_fire_arms.fire_arms_cd
    table.string('arms_subtype');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('excel_fire_arms_subtypes');
}
