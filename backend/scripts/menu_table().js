import { db, connectDB } from '../src/config/db.js';
import ExcelJS from 'exceljs';
import path from 'path';

const excelPath = "C:\\Users\\Admin\\OneDrive\\Documents\\Menu_Tables.xlsx";

function getVal(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object') {
    if (cell.result !== undefined) return cell.result;
    if (cell.text !== undefined) return cell.text;
    if (cell.richText !== undefined) {
      return cell.richText.map(t => t.text).join('');
    }
  }
  return cell;
}

function cleanVal(cell) {
  let val = getVal(cell);
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    val = val.trim();
    if (val === '\\N' || val === 'NULL' || val === '') return null;
  }
  return val;
}

function cleanInt(cell) {
  const val = cleanVal(cell);
  if (val === null) return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

async function main() {
  console.log("Connecting to database...");
  // Ensure DB connection is initialized
  await connectDB();

  console.log("Loading Excel file...");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  console.log("Excel file loaded successfully.");

  // Helper for batch insert
  const batchInsert = async (tableName, rows) => {
    if (rows.length === 0) return;
    console.log(`Inserting ${rows.length} rows into ${tableName}...`);
    // Insert in chunks of 500
    await db.batchInsert(tableName, rows, 500);
  };

  // 1. Truncate all tables
  const tables = [
    'excel_other_property_items',
    'excel_other_property_categories',
    'excel_jewelry_types',
    'excel_explosive_types',
    'excel_electric_goods',
    'excel_drug_types',
    'excel_document_types',
    'excel_cultural_properties',
    'excel_currency_types',
    'excel_automobiles',
    'excel_fire_arms',
    'excel_arms_categories',
    'excel_arms_made',
    'excel_property_types',
    'excel_local_heads',
    'excel_beats',
    'excel_major_minor_mapping',
    'excel_minor_heads',
    'excel_major_heads',
    'excel_sections',
    'excel_acts'
  ];

  console.log("Truncating existing tables...");
  for (const table of tables) {
    await db(table).truncate();
  }
  console.log("Tables truncated.");

  // --- 1. Sheet: act ---
  try {
    console.log("Processing sheet: act");
    const sheet = workbook.getWorksheet('act');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const act_cd = cleanInt(row.values[1]);
      const act_long = cleanVal(row.values[3]);
      if (act_cd !== null) {
        rows.push({ act_cd, act_long });
      }
    });
    await batchInsert('excel_acts', rows);
  } catch (err) {
    console.error("Error in sheet act:", err);
    throw err;
  }

  // --- 2. Sheet: section ---
  try {
    console.log("Processing sheet: section");
    const sheet = workbook.getWorksheet('section');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const section_code = cleanVal(row.values[1]);
      const section_cd = cleanVal(row.values[3]);
      const act_sec_cd = cleanVal(row.values[4]);
      const section = cleanVal(row.values[5]);
      const section_desc = cleanVal(row.values[6]);
      const pnsh_gt_7yrs = cleanVal(row.values[7]);
      if (section_code !== null) {
        rows.push({
          section_code,
          section_cd,
          act_sec_cd,
          section,
          section_desc,
          pnsh_gt_7yrs
        });
      }
    });
    await batchInsert('excel_sections', rows);
  } catch (err) {
    console.error("Error in sheet section:", err);
    throw err;
  }

  // --- 3. Sheet: major head ---
  try {
    console.log("Processing sheet: major head");
    const sheet = workbook.getWorksheet('major head');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const major_head_code = cleanInt(row.values[1]);
      const major_head = cleanVal(row.values[3]);
      if (major_head_code !== null) {
        rows.push({ major_head_code, major_head });
      }
    });
    await batchInsert('excel_major_heads', rows);
  } catch (err) {
    console.error("Error in sheet major head:", err);
    throw err;
  }

  // --- 4. Sheet: minor head ---
  try {
    console.log("Processing sheet: minor head");
    const sheet = workbook.getWorksheet('minor head');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const minor_head_cd = cleanInt(row.values[1]);
      const major_head_code = cleanInt(row.values[3]);
      const minor_head = cleanVal(row.values[4]);
      if (minor_head_cd !== null) {
        rows.push({ minor_head_cd, major_head_code, minor_head });
      }
    });
    await batchInsert('excel_minor_heads', rows);
  } catch (err) {
    console.error("Error in sheet minor head:", err);
    throw err;
  }

  // --- 5. Sheet: Major_Minor_Mapping ---
  try {
    console.log("Processing sheet: Major_Minor_Mapping");
    const sheet = workbook.getWorksheet('Major_Minor_Mapping');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const sec_mjrhd_cd = cleanInt(row.values[1]);
      const act_cd = cleanInt(row.values[3]);
      const section_code = cleanVal(row.values[4]);
      const major_head_code = cleanInt(row.values[5]);
      if (sec_mjrhd_cd !== null) {
        rows.push({ sec_mjrhd_cd, act_cd, section_code, major_head_code });
      }
    });
    await batchInsert('excel_major_minor_mapping', rows);
  } catch (err) {
    console.error("Error in sheet Major_Minor_Mapping:", err);
    throw err;
  }

  // --- 6. Sheet: Beat ---
  try {
    console.log("Processing sheet: Beat");
    const sheet = workbook.getWorksheet('Beat');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const beat_cd = cleanVal(row.values[1]);
      const beat_name = cleanVal(row.values[3]);
      const ps_cd = cleanVal(row.values[4]);
      if (beat_cd !== null) {
        rows.push({ beat_cd, beat_name, ps_cd });
      }
    });
    await batchInsert('excel_beats', rows);
  } catch (err) {
    console.error("Error in sheet Beat:", err);
    throw err;
  }

  // --- 7. Sheet: local head ---
  try {
    console.log("Processing sheet: local head");
    const sheet = workbook.getWorksheet('local head');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const local_head_cd = cleanInt(row.values[1]);
      const local_head = cleanVal(row.values[3]);
      if (local_head_cd !== null) {
        rows.push({ local_head_cd, local_head });
      }
    });
    await batchInsert('excel_local_heads', rows);
  } catch (err) {
    console.error("Error in sheet local head:", err);
    throw err;
  }

  // --- 8. Sheet: Property Type ---
  try {
    console.log("Processing sheet: Property Type");
    const sheet = workbook.getWorksheet('Property Type');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const parent_srno = cleanInt(row.values[1]);
      const parent_cd = cleanInt(row.values[3]);
      const code_type = cleanVal(row.values[4]);
      const parent_type = cleanVal(row.values[5]);
      const major_property = cleanInt(row.values[6]);
      if (parent_srno !== null) {
        rows.push({ parent_srno, parent_cd, code_type, parent_type, major_property });
      }
    });
    await batchInsert('excel_property_types', rows);
  } catch (err) {
    console.error("Error in sheet Property Type:", err);
    throw err;
  }

  // --- 9. Sheet: ARMS AND AMMUNITION ---
  try {
    console.log("Processing sheet: ARMS AND AMMUNITION");
    const sheet = workbook.getWorksheet('ARMS AND AMMUNITION');
    const armsMadeRows = [];
    const armsCatRows = [];
    const fireArmsRows = [];
    
    let sectionState = null; // 'MADE' | 'CAT' | 'FIRE_ARMS'

    sheet.eachRow((row, rowNum) => {
      const col1Val = cleanVal(row.values[1]);
      
      // State transitions
      if (col1Val === 'arms_made_cd') {
        sectionState = 'MADE';
        return;
      }
      if (col1Val === 'arms_category_cd') {
        sectionState = 'CAT';
        return;
      }
      if (col1Val === 'fire_arms_cd') {
        sectionState = 'FIRE_ARMS';
        return;
      }

      if (sectionState === 'MADE') {
        const arms_made_cd = cleanInt(row.values[1]);
        const arms_made = cleanVal(row.values[3]);
        if (arms_made_cd !== null && arms_made !== null) {
          armsMadeRows.push({ arms_made_cd, arms_made });
        }
      } else if (sectionState === 'CAT') {
        const arms_category_cd = cleanInt(row.values[1]);
        const arms_category = cleanVal(row.values[3]);
        if (arms_category_cd !== null && arms_category !== null) {
          armsCatRows.push({ arms_category_cd, arms_category });
        }
      } else if (sectionState === 'FIRE_ARMS') {
        const fire_arms_cd = cleanInt(row.values[1]);
        const arms_category_cd = cleanInt(row.values[3]);
        const fire_arms = cleanVal(row.values[4]);
        if (fire_arms_cd !== null && arms_category_cd !== null && fire_arms !== null) {
          fireArmsRows.push({ fire_arms_cd, arms_category_cd, fire_arms });
        }
      }
    });

    await batchInsert('excel_arms_made', armsMadeRows);
    await batchInsert('excel_arms_categories', armsCatRows);
    await batchInsert('excel_fire_arms', fireArmsRows);
  } catch (err) {
    console.error("Error in sheet ARMS AND AMMUNITION:", err);
    throw err;
  }

  // --- 10. Sheet: AUTOMOBILES AND OTHERS ---
  try {
    console.log("Processing sheet: AUTOMOBILES AND OTHERS");
    const sheet = workbook.getWorksheet('AUTOMOBILES AND OTHERS');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const automobile_cd = cleanInt(row.values[1]);
      const automobile = cleanVal(row.values[3]);
      if (automobile_cd !== null && automobile !== null) {
        rows.push({ automobile_cd, automobile });
      }
    });
    await batchInsert('excel_automobiles', rows);
  } catch (err) {
    console.error("Error in sheet AUTOMOBILES AND OTHERS:", err);
    throw err;
  }

  // --- 11. Sheet: COIN AND CURRENCY ---
  try {
    console.log("Processing sheet: COIN AND CURRENCY");
    const sheet = workbook.getWorksheet('COIN AND CURRENCY');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const currency_type_cd = cleanInt(row.values[1]);
      const currency_type = cleanVal(row.values[3]);
      if (currency_type_cd !== null && currency_type !== null) {
        rows.push({ currency_type_cd, currency_type });
      }
    });
    await batchInsert('excel_currency_types', rows);
  } catch (err) {
    console.error("Error in sheet COIN AND CURRENCY:", err);
    throw err;
  }

  // --- 12. Sheet: CULTURAL PROPERTY ---
  try {
    console.log("Processing sheet: CULTURAL PROPERTY");
    const sheet = workbook.getWorksheet('CULTURAL PROPERTY');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const cultural_prop_cd = cleanInt(row.values[1]);
      const cultural_prop = cleanVal(row.values[3]);
      if (cultural_prop_cd !== null && cultural_prop !== null) {
        rows.push({ cultural_prop_cd, cultural_prop });
      }
    });
    await batchInsert('excel_cultural_properties', rows);
  } catch (err) {
    console.error("Error in sheet CULTURAL PROPERTY:", err);
    throw err;
  }

  // --- 13. Sheet: Documents ---
  try {
    console.log("Processing sheet: Documents");
    const sheet = workbook.getWorksheet('Documents');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const document_type_cd = cleanInt(row.values[1]);
      const document_type = cleanVal(row.values[3]);
      if (document_type_cd !== null && document_type !== null) {
        rows.push({ document_type_cd, document_type });
      }
    });
    await batchInsert('excel_document_types', rows);
  } catch (err) {
    console.error("Error in sheet Documents:", err);
    throw err;
  }

  // --- 14. Sheet: DRUGS NARCOTIC ---
  try {
    console.log("Processing sheet: DRUGS NARCOTIC");
    const sheet = workbook.getWorksheet('DRUGS NARCOTIC');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const drug_type_cd = cleanInt(row.values[1]);
      const drug_type = cleanVal(row.values[3]);
      if (drug_type_cd !== null && drug_type !== null) {
        rows.push({ drug_type_cd, drug_type });
      }
    });
    await batchInsert('excel_drug_types', rows);
  } catch (err) {
    console.error("Error in sheet DRUGS NARCOTIC:", err);
    throw err;
  }

  // --- 15. Sheet: ELECTRICAL AND ELECTRONIC GOODS ---
  try {
    console.log("Processing sheet: ELECTRICAL AND ELECTRONIC GOODS");
    const sheet = workbook.getWorksheet('ELECTRICAL AND ELECTRONIC GOODS');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const electric_goods_cd = cleanInt(row.values[1]);
      const electric_goods = cleanVal(row.values[3]);
      if (electric_goods_cd !== null && electric_goods !== null) {
        rows.push({ electric_goods_cd, electric_goods });
      }
    });
    await batchInsert('excel_electric_goods', rows);
  } catch (err) {
    console.error("Error in sheet ELECTRICAL AND ELECTRONIC GOODS:", err);
    throw err;
  }

  // --- 16. Sheet: EXPLOSIVES ---
  try {
    console.log("Processing sheet: EXPLOSIVES");
    const sheet = workbook.getWorksheet('EXPLOSIVES');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const explosive_type_cd = cleanInt(row.values[1]);
      const explosive_type = cleanVal(row.values[3]);
      if (explosive_type_cd !== null && explosive_type !== null) {
        rows.push({ explosive_type_cd, explosive_type });
      }
    });
    await batchInsert('excel_explosive_types', rows);
  } catch (err) {
    console.error("Error in sheet EXPLOSIVES:", err);
    throw err;
  }

  // --- 17. Sheet: JEWELLERY ---
  try {
    console.log("Processing sheet: JEWELLERY");
    const sheet = workbook.getWorksheet('JEWELLERY');
    const rows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const jewelry_type_cd = cleanInt(row.values[1]);
      const jewelry_type = cleanVal(row.values[3]);
      if (jewelry_type_cd !== null && jewelry_type !== null) {
        rows.push({ jewelry_type_cd, jewelry_type });
      }
    });
    await batchInsert('excel_jewelry_types', rows);
  } catch (err) {
    console.error("Error in sheet JEWELLERY:", err);
    throw err;
  }

  // --- 18. Sheet: OTHERS ---
  try {
    console.log("Processing sheet: OTHERS");
    const sheet = workbook.getWorksheet('OTHERS');
    const catRows = [];
    const itemRows = [];
    
    let sectionState = null; // 'MAJOR' | 'MINOR'

    sheet.eachRow((row, rowNum) => {
      const col1Val = cleanVal(row.values[1]);
      
      // State transitions
      if (col1Val === 'parent_srno') {
        sectionState = 'MAJOR';
        return;
      }
      if (col1Val === 'property_cd') {
        sectionState = 'MINOR';
        return;
      }

      if (sectionState === 'MAJOR') {
        const parent_srno = cleanInt(row.values[1]);
        const parent_cd = cleanInt(row.values[3]);
        const code_type = cleanVal(row.values[4]);
        const parent_type = cleanVal(row.values[5]);
        const major_property = cleanInt(row.values[6]);
        if (parent_srno !== null && parent_cd !== null) {
          catRows.push({ parent_srno, parent_cd, code_type, parent_type, major_property });
        }
      } else if (sectionState === 'MINOR') {
        const property_cd = cleanInt(row.values[1]);
        const parent_cd = cleanInt(row.values[3]);
        const property_type_srno = cleanVal(row.values[4]); // Can be string like '\\N' or number
        const property = cleanVal(row.values[5]);
        if (property_cd !== null && parent_cd !== null && property !== null) {
          itemRows.push({ property_cd, parent_cd, property_type_srno, property });
        }
      }
    });

    await batchInsert('excel_other_property_categories', catRows);
    await batchInsert('excel_other_property_items', itemRows);
  } catch (err) {
    console.error("Error in sheet OTHERS:", err);
    throw err;
  }

  console.log("All sheets imported successfully.");
  process.exit(0);
}

main().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
