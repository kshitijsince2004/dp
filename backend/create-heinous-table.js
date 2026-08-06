import db from './src/config/db.js';

async function main() {
  try {
    const exists = await db.schema.hasTable('excel_heinous_offences');
    if (!exists) {
      console.log("Creating excel_heinous_offences table...");
      await db.schema.createTable('excel_heinous_offences', (table) => {
        table.increments('id').primary();
        table.integer('heinous_offence_cd');
        table.string('heinous_offence');
      });
      console.log("Table created successfully.");
    } else {
      console.log("Table excel_heinous_offences already exists.");
    }
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    await db.destroy();
  }
}
main();
