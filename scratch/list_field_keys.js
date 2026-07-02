import db from '../backend/src/config/db.js';

async function listFields() {
  try {
    const fields = await db('field_registry')
      .where('is_active', true)
      .orderBy('sort_order', 'asc');
    
    console.log("=== FIELD REGISTRY ===");
    for (const f of fields) {
      let types = [];
      try {
        types = typeof f.applicable_record_types === 'string'
          ? JSON.parse(f.applicable_record_types)
          : f.applicable_record_types;
      } catch (e) {
        types = f.applicable_record_types;
      }
      console.log(`Key: ${f.field_key} | Types: ${JSON.stringify(types)} | Label: ${f.label_en} | Repeater: ${f.repeater_entity} | ShowWhen: ${f.show_when ? JSON.stringify(f.show_when) : 'none'}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

listFields();
