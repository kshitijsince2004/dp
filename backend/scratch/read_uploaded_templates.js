import ExcelJS from 'exceljs';
import path from 'path';

async function inspect(filename) {
  const filePath = path.resolve(filename);
  console.log(`\n================ INSPECTING ${filename} ================`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.getWorksheet(1);
  console.log('Worksheet name:', ws.name);
  console.log('Row count:', ws.rowCount);
  
  // Print first 10 rows completely
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const row = ws.getRow(r);
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      values.push(cell.value);
    });
    // Find if there is any data
    if (values.some(v => v !== null && v !== '')) {
      console.log(`  Row ${r}:`, values.map(v => typeof v === 'object' ? JSON.stringify(v) : v));
    }
  }
}

async function main() {
  await inspect('../ARREST_Import_Template (1).xlsx');
  await inspect('../CASE_Import_Template (1).xlsx');
}

main().catch(console.error);
