import ExcelJS from 'exceljs';
import path from 'path';

async function main() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.resolve('../CASE_Import_Template_Final.xlsx');
  console.log('Reading:', filePath);
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.getWorksheet('General Information');
  if (!worksheet) {
    console.log('General Information sheet not found!');
    return;
  }
  
  console.log(`\nSheet: ${worksheet.name}`);
  const row1 = worksheet.getRow(1);
  const row2 = worksheet.getRow(2);
  const row3 = worksheet.getRow(3);
  const row4 = worksheet.getRow(4);

  for (let c = 1; c <= 40; c++) {
    const r1Val = row1.getCell(c).value;
    const r2Val = row2.getCell(c).value;
    const r3Val = row3.getCell(c).value;
    const r4Val = row4.getCell(c).value;
    console.log(`Col ${c} (${excelColName(c)}):`);
    console.log(`  Row 1 (key):   ${r1Val}`);
    console.log(`  Row 2 (sect):  ${r2Val}`);
    console.log(`  Row 3 (label): ${r3Val}`);
    console.log(`  Row 4 (hint):  ${r4Val}`);
  }
}

function excelColName(num) {
  let letter = "";
  while (num > 0) {
    let temp = (num - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    num = (num - temp - 1) / 26;
  }
  return letter;
}

main().catch(console.error);
