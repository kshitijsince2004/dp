import ExcelJS from 'exceljs';
import path from 'path';

async function main() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.resolve('../CASE_Import_Template_Final.xlsx');
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.getWorksheet('General Information');
  if (!worksheet) {
    console.log('General Information sheet not found!');
    return;
  }
  
  console.log(`Sheet: ${worksheet.name}`);
  const row1 = worksheet.getRow(1);
  const row3 = worksheet.getRow(3);
  const row4 = worksheet.getRow(4);

  const totalCols = row4.cellCount;
  console.log(`Total columns: ${totalCols}`);
  for (let c = 1; c <= totalCols; c++) {
    const key = row1.getCell(c).value;
    const label = row3.getCell(c).value;
    const hint = row4.getCell(c).value;
    console.log(`Col ${c}: key="${key}" | label="${label}" | hint="${hint}"`);
  }
}

main().catch(console.error);
