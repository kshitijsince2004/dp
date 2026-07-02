import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

function getHint(field) {
  const reqStr = field.validation_rules?.required ? '[Required] ' : '';
  if (field.field_type === 'SELECT') {
    let options = [];
    try {
      options = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
    } catch (e) {}
    const optList = Array.isArray(options) ? options.map(o => (o && typeof o === 'object') ? o.value : o).join(', ') : '';
    return `${reqStr}select: ${optList}`;
  }
  if (field.field_type === 'DATE') {
    return `${reqStr}date (YYYY-MM-DD)`;
  }
  if (field.field_type === 'TIME') {
    return `${reqStr}time (HH:MM)`;
  }
  if (field.field_type === 'NUMBER') {
    return `${reqStr}number`;
  }
  return `${reqStr}${field.field_type.toLowerCase()}`;
}

async function main() {
  const seedPath = path.resolve('seeds/01_fields.js');
  let content = fs.readFileSync(seedPath, 'utf8');
  content = content.replace('export async function seed', 'async function seed');
  content += '\nexport { fields };\n';
  const tmpPath = path.resolve('scratch_fields_tmp.js');
  fs.writeFileSync(tmpPath, content, 'utf8');

  let fields = [];
  try {
    const mod = await import('./scratch_fields_tmp.js');
    fields = mod.fields;
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }

  fields = fields.map(f => {
    let appRecTypes = [];
    try { appRecTypes = typeof f.applicable_record_types === 'string' ? JSON.parse(f.applicable_record_types) : f.applicable_record_types; } catch (e) {}
    let valRules = {};
    try { valRules = typeof f.validation_rules === 'string' ? JSON.parse(f.validation_rules) : f.validation_rules; } catch (e) {}
    return {
      ...f,
      applicable_record_types: appRecTypes || [],
      validation_rules: valRules || {}
    };
  });

  const workbook = new ExcelJS.Workbook();
  const excelPath = path.resolve('../CASE_Import_Template_Final.xlsx');
  await workbook.xlsx.readFile(excelPath);

  let outText = '';
  workbook.eachSheet((worksheet) => {
    outText += `\n=========================================\n`;
    outText += `Sheet: ${worksheet.name}\n`;
    outText += `=========================================\n`;

    const row1 = worksheet.getRow(1);
    const row2 = worksheet.getRow(2);
    const row3 = worksheet.getRow(3);
    const row4 = worksheet.getRow(4);

    const maxCol = Math.max(row1.cellCount, row3.cellCount);

    for (let c = 1; c <= maxCol; c++) {
      const currentKey = row1.getCell(c).value ? String(row1.getCell(c).value).trim() : '';
      const currentSect = row2.getCell(c).value ? String(row2.getCell(c).value).trim() : '';
      const currentLabel = row3.getCell(c).value ? String(row3.getCell(c).value).trim() : '';
      const currentHint = row4.getCell(c).value ? String(row4.getCell(c).value).trim() : '';

      if (!currentLabel) {
        if (currentKey) {
          outText += `Col ${c}: Key="${currentKey}" | (No Label in Row 3)\n`;
        }
        continue;
      }

      const normLabel = currentLabel.toLowerCase().replace(/\s+/g, ' ').trim();
      let candidates = fields.filter(f => {
        const normFieldLabel = f.label_en ? f.label_en.toLowerCase().replace(/\s+/g, ' ').trim() : '';
        return normFieldLabel === normLabel;
      });

      let matchedField = null;

      if (candidates.length > 0) {
        if (worksheet.name === 'Victim Information') {
          const victimCand = candidates.filter(f => f.field_key.startsWith('victim_'));
          if (victimCand.length > 0) candidates = victimCand;
        } else if (worksheet.name === 'Accused Detail') {
          const accusedCand = candidates.filter(f => f.field_key.startsWith('accused_'));
          if (accusedCand.length > 0) candidates = accusedCand;
        } else if (worksheet.name === 'General Information') {
          if (currentSect.toLowerCase().includes('complainant') || normLabel.startsWith('complainant')) {
            const compCand = candidates.filter(f => f.field_key.startsWith('complainant_'));
            if (compCand.length > 0) candidates = compCand;
          } else if (currentSect.toLowerCase().includes('place of occurrence') || currentSect.toLowerCase().includes('occurrence address')) {
            const occCand = candidates.filter(f => f.field_key.startsWith('occurrence_'));
            if (occCand.length > 0) candidates = occCand;
          } else if (currentSect.toLowerCase().includes('io details') || currentSect.toLowerCase().includes('officer')) {
            const ioCand = candidates.filter(f => f.field_key.startsWith('io_'));
            if (ioCand.length > 0) candidates = ioCand;
          }
        }
        matchedField = candidates[0];
      }

      if (matchedField) {
        const correctHint = getHint(matchedField);
        const hintIsMatch = currentHint === correctHint;
        const keyIsMatch = currentKey === matchedField.field_key;

        outText += `Col ${c}: Label="${currentLabel}"\n`;
        outText += `  Key:  Current="${currentKey}" | Matched="${matchedField.field_key}" | Match? ${keyIsMatch}\n`;
        outText += `  Hint: Current="${currentHint}" | Matched="${correctHint}" | Match? ${hintIsMatch}\n`;
      } else {
        outText += `Col ${c}: Label="${currentLabel}"\n`;
        outText += `  Current Key: "${currentKey}"\n`;
        outText += `  Current Hint: "${currentHint}"\n`;
        outText += `  ⚠️  NO DB MATCH FOUND!\n`;
      }
    }
  });

  fs.writeFileSync('scratch/alignment_analysis_output.txt', outText, 'utf8');
  console.log('Saved alignment analysis to scratch/alignment_analysis_output.txt');
}

main().catch(console.error);
