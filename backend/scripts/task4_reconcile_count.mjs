import fs from 'fs';
import path from 'path';

async function reconcileCount() {
  const formDir = './config/fields';
  const formFiles = fs.readdirSync(formDir).filter(f => f.endsWith('.json'));

  let allFields = [];

  for (const file of formFiles) {
    const filePath = path.join(formDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const formName = path.basename(file, '.json');

    if (Array.isArray(content)) {
      content.forEach(item => {
        if (item.field_key) {
          allFields.push({
            form: formName,
            section: item.section || 'General',
            label_en: item.labels?.en || item.field_key,
            field_key: item.field_key,
            field_type: item.field_type || 'text',
            storage: item.storage
          });
        }
      });
    }
  }

  console.log(`Total Extracted Form Fields: ${allFields.length}`);

  // Method 1: Strict storage-object entity/table categorization (Round A logic)
  const roundA = { direct: 0, locations: 0, persons: 0, record_properties: 0, extra: 0, ui_only: 0 };
  allFields.forEach(f => {
    if (f.storage === 'ui_only') roundA.ui_only++;
    else if (f.storage === 'extra') roundA.extra++;
    else if (typeof f.storage === 'object' && f.storage !== null) {
      if (f.storage.entity === 'location') roundA.locations++;
      else if (f.storage.entity === 'person') roundA.persons++;
      else if (f.storage.entity === 'property') roundA.record_properties++;
      else roundA.direct++;
    } else roundA.direct++;
  });

  // Method 2: Keyword-fallback heuristic categorization (Round B logic)
  const roundB = { direct: 0, locations: 0, persons: 0, record_properties: 0, extra: 0, ui_only: 0 };
  allFields.forEach(f => {
    const st = typeof f.storage === 'string' ? f.storage : (f.storage?.entity || f.storage?.table || 'direct');
    if (st === 'ui_only') roundB.ui_only++;
    else if (st === 'extra') roundB.extra++;
    else if (st === 'locations' || st === 'location' || f.field_key.includes('location') || f.field_key.includes('address') || f.field_key.includes('street') || f.field_key.includes('pincode')) roundB.locations++;
    else if (st === 'persons' || st === 'person' || f.field_key.includes('name') || f.field_key.includes('accused') || f.field_key.includes('complainant') || f.field_key.includes('victim') || f.field_key.includes('arrested') || f.field_key.includes('gender') || f.field_key.includes('age')) roundB.persons++;
    else if (st === 'record_properties' || st === 'property' || f.field_key.includes('property') || f.field_key.includes('vehicle') || f.field_key.includes('imei') || f.field_key.includes('recovery')) roundB.record_properties++;
    else roundB.direct++;
  });

  console.log('\n--- CATEGORIZATION METHOD COMPARISON ---');
  console.log('Round A (Strict Schema Entity Target):', roundA);
  console.log('Round B (Keyword-Fallback Heuristic): ', roundB);

  process.exit(0);
}

reconcileCount().catch(e => { console.error(e); process.exit(1); });
