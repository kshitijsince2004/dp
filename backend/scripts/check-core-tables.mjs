import fs from 'fs';

const dbSchema = JSON.parse(fs.readFileSync('scripts/parsed-full-db-schema.json', 'utf8'));
console.log('fir_details:', dbSchema.fir_details);
console.log('record_properties:', dbSchema.record_properties);
console.log('arrest_details:', dbSchema.arrest_details);
console.log('arrestee_details:', dbSchema.arrestee_details);
console.log('persons:', dbSchema.persons);
