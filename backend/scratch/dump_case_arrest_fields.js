import db from '../src/config/db.js';

async function run() {
  try {
    const fields = await db('field_registry')
      .where('is_active', true)
      .orderBy('sort_order');
      
    const caseFields = [];
    const arrestFields = [];
    
    for (const f of fields) {
      let types = [];
      try {
        types = typeof f.applicable_record_types === 'string'
          ? JSON.parse(f.applicable_record_types)
          : f.applicable_record_types;
      } catch (e) {}
      
      const normalizedTypes = Array.isArray(types) ? types.map(t => t.toUpperCase()) : [];
      
      const item = {
        field_key: f.field_key,
        field_type: f.field_type,
        label_en: f.label_en,
        validation_rules: f.validation_rules,
        options: f.options
      };
      
      if (normalizedTypes.includes('CASE')) {
        caseFields.push(item);
      }
      if (normalizedTypes.includes('ARREST')) {
        arrestFields.push(item);
      }
    }
    
    console.log('=== CASE FIELDS ===');
    console.log(JSON.stringify(caseFields, null, 2));
    
    console.log('\n=== ARREST FIELDS ===');
    console.log(JSON.stringify(arrestFields, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
