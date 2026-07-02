import fs from 'fs';
import path from 'path';

async function main() {
  const seedPath = path.resolve('seeds/01_fields.js');
  let content = fs.readFileSync(seedPath, 'utf8');

  // Modify to export fields
  content = content.replace('export async function seed', 'async function seed');
  content += '\nexport { fields };\n';

  const tmpPath = path.resolve('scratch_fields_tmp.js');
  fs.writeFileSync(tmpPath, content, 'utf8');

  try {
    const { fields } = await import('./scratch_fields_tmp.js');
    console.log(`Successfully imported fields! Total fields: ${fields.length}`);
    console.log(`First field:`, fields[0]);
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

main().catch(console.error);
