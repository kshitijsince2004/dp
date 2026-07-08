import ExcelJS from 'exceljs';

for (const f of ['CASE_Import_Template_Final.xlsx', 'ARREST_Import_Template_Final.xlsx']) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('./' + f);
  console.log('\n=== RAW BASE FILE:', f, '===');
  wb.worksheets.forEach(ws => {
    if (ws.name === '_Lookups') return;
    const row1 = ws.getRow(1);
    let distCol = -1, psCol = -1;
    row1.eachCell({includeEmpty:true}, (c, n) => {
      if (c.value === 'district') distCol = n;
      if (c.value === 'police_station') psCol = n;
    });
    if (distCol === -1) return;
    console.log(` sheet "${ws.name}": district col ${distCol}, police_station col ${psCol}`);
    for (let r = 4; r <= 8; r++) {
      console.log(`   row${r}: district=${JSON.stringify(ws.getCell(r,distCol).value)} ps=${JSON.stringify(ws.getCell(r,psCol).value)}`);
    }
  });
}
process.exit(0);
