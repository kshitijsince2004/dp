import { TemplateBuilderService } from './src/modules/import/template-builder.service.js';
import ExcelJS from 'exceljs';

const wb = await TemplateBuilderService.buildTemplate('CASE', 'en');
await wb.xlsx.writeFile('./scratch_debug_CASE.xlsx');

const ws = wb.getWorksheet('General Information');
console.log('Row5 raw values, cols A-F:');
for (let c = 1; c <= 6; c++) {
  console.log(` col ${c} (${ws.getCell(1,c).value}):`, JSON.stringify(ws.getCell(5,c).value));
}

console.log('\nDistrict column (C) dataValidation row5:', JSON.stringify(ws.getCell(5,3).dataValidation));
console.log('PS column (D) dataValidation row5:', JSON.stringify(ws.getCell(5,4).dataValidation));

// dump OPT_DISTRICT named range values
const dn = wb.definedNames.model.find(n => n.name === 'OPT_DISTRICT');
console.log('\nOPT_DISTRICT range:', dn && dn.ranges);
if (dn) {
  const m = dn.ranges[0].match(/\$([A-Z]+)\$(\d+):\$[A-Z]+\$(\d+)/);
  const lookups = wb.getWorksheet('_Lookups');
  const colNum = [...m[1]].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);
  const vals = [];
  for (let r = +m[2]; r <= +m[3]; r++) vals.push(lookups.getCell(r, colNum).value);
  console.log('OPT_DISTRICT values:', vals);
}
process.exit(0);
