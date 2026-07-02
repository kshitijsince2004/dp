import ExcelJS from 'exceljs';
import path from 'path';

async function scanForData(filename) {
  const filePath = path.resolve(filename);
  console.log(`\n================ SCANNING ${filename} ================`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.getWorksheet(1);
  
  let dataRowsCount = 0;
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      values.push(cell.value);
    });
    if (values.length > 0) {
      dataRowsCount++;
      if (dataRowsCount <= 5) {
        console.log(`  Row ${r}:`, values.map(v => typeof v === 'object' ? JSON.stringify(v) : v));
      }
    }
  }
  console.log(`Total rows with data (row >= 4):`, dataRowsCount);
}

async function main() {
  await scanForData('../ARREST_Import_Template (1).xlsx');
  await scanForData('../CASE_Import_Template (1).xlsx');
}

main().catch(console.error);
