import db from '../backend/src/config/db.js';
import ExcelJS from 'exceljs';
import path from 'path';

async function checkKeys() {
  try {
    const caseWorkbook = new ExcelJS.Workbook();
    await caseWorkbook.xlsx.readFile('CASE_Import_Template (1).xlsx');
    const caseSheet = caseWorkbook.worksheets[0];
    const caseKeys = caseSheet.getRow(1).values.slice(1).map(v => String(v).trim());

    const arrestWorkbook = new ExcelJS.Workbook();
    await arrestWorkbook.xlsx.readFile('ARREST_Import_Template (1).xlsx');
    const arrestSheet = arrestWorkbook.worksheets[0];
    const arrestKeys = arrestSheet.getRow(1).values.slice(1).map(v => String(v).trim());

    const allFields = await db('field_registry').where('is_active', true);
    const fieldsMap = {};
    for (const f of allFields) {
      fieldsMap[f.field_key] = f;
    }

    console.log("=== CHECK CASE KEYS ===");
    for (const key of caseKeys) {
      const f = fieldsMap[key];
      if (!f) {
        console.log(`❌ Missing in registry: ${key}`);
      } else {
        let types = [];
        try {
          types = typeof f.applicable_record_types === 'string'
            ? JSON.parse(f.applicable_record_types)
            : f.applicable_record_types;
        } catch (e) {
          types = f.applicable_record_types;
        }
        if (!types.includes('CASE')) {
          console.log(`⚠️ Key ${key} exists but not applicable to CASE (applicable: ${JSON.stringify(types)})`);
        } else {
          console.log(`✅ Key ${key} is valid (Type: ${f.field_type}, Repeater: ${f.repeater_entity})`);
        }
      }
    }

    console.log("\n=== CHECK ARREST KEYS ===");
    for (const key of arrestKeys) {
      const f = fieldsMap[key];
      if (!f) {
        console.log(`❌ Missing in registry: ${key}`);
      } else {
        let types = [];
        try {
          types = typeof f.applicable_record_types === 'string'
            ? JSON.parse(f.applicable_record_types)
            : f.applicable_record_types;
        } catch (e) {
          types = f.applicable_record_types;
        }
        if (!types.includes('ARREST')) {
          console.log(`⚠️ Key ${key} exists but not applicable to ARREST (applicable: ${JSON.stringify(types)})`);
        } else {
          console.log(`✅ Key ${key} is valid (Type: ${f.field_type}, Repeater: ${f.repeater_entity})`);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkKeys();
