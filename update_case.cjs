const fs = require('fs');
const file = 'config/fields/case.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const field of data) {
  if (field.field_key === 'occurrence_time_type') {
    field.is_active = false;
    break;
  }
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Updated occurrence_time_type to is_active: false');
