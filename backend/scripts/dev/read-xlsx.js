import xlsx from 'xlsx';

const workbook = xlsx.readFile('c:/Users/Ashmi/OneDrive/Desktop/Crime-Diaries/master Sheet.xlsx');
const sheet = workbook.Sheets['Sheet1'];

// Parse as arrays of arrays
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const result = {};
if (data.length > 0) {
  const headers = data[0];
  for (let col = 0; col < headers.length; col++) {
    const colName = headers[col];
    if (colName) {
      result[colName] = [];
      for (let row = 1; row < data.length; row++) {
        if (data[row][col]) {
          result[colName].push(data[row][col]);
        }
      }
    }
  }
}

console.log(JSON.stringify(result, null, 2));
