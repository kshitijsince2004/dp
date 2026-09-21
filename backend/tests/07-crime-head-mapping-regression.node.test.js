import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Regression: Crime Head in arrest.json maps to local_head_id, not major_head_id', () => {
  const arrestConfigPath = path.resolve(__dirname, '../../config/fields/arrest.json');
  const arrestConfig = JSON.parse(fs.readFileSync(arrestConfigPath, 'utf-8'));
  const fieldsArray = Array.isArray(arrestConfig) ? arrestConfig : Object.values(arrestConfig.fields || arrestConfig);
  const crimeHeadField = fieldsArray.find(f => f.field_key === 'crime_head');

  assert.ok(crimeHeadField, 'crime_head field must exist in arrest.json');
  assert.equal(crimeHeadField.storage?.table, '$detail', 'crime_head must store in $detail');
  assert.equal(crimeHeadField.storage?.column, 'local_head_id', 'crime_head must map to local_head_id');
  assert.notEqual(crimeHeadField.storage?.column, 'major_head_id', 'crime_head must NEVER map to major_head_id');
});
