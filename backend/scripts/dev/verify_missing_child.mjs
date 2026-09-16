import db, { connectDB } from '../src/config/db.js';
import { connectEventBus } from '../src/events/eventBus.js';
import * as notifyHandler from '../src/events/handlers/notifyHandler.js';
import * as linkAuditHandler from '../src/events/handlers/linkAuditHandler.js';
import * as linkResolver from '../src/events/handlers/linkResolver.js';
import * as recordsService from '../src/modules/records/records.service.js';

function asServiceUser(row) {
  return {
    id: row.id, sub: row.id, username: row.username, role: row.role,
    ps_id: row.ps_id, district_id: row.district_id, sub_div_id: row.sub_div_id,
  };
}

async function main() {
  await connectDB();
  await connectEventBus();

  const userRow = await db('users').where({ username: 'hc_parliament_street' }).first();
  if (!userRow) throw new Error("hc_parliament_street not found");
  const hcUser = asServiceUser(userRow);

  const missingPayload = {
    data: {
      gd_no: `GD/9999/TEST`,
      gd_date: new Date().toISOString().split('T')[0],
      source: 'DD',
      missing_type: 'Missing',
      case_registered: 'No',
      mp_known: true,
      missing_name: `Primary Missing Adult`,
      gender: 'Female',
      age: 35,
      missing_date: new Date().toISOString().split('T')[0],
      missing_place: `Test Place`,
      mp_perm_same: true,
      mp_house_no: `123`,
      mp_city_town_village: 'New Delhi',
      informant_name: `Test Informant`,
      informant_relation: 'Husband',
      informant_mobile: `9100000000`,
      zipnet_no: `ZN2026TEST`,
      height: `160cm`,
      complexion: 'Fair',
      physical_description: 'Test physical description.',
    },
    persons: [
      {
        person_type: 'MISSING_CHILD',
        data: {
          accompanying_child_name: 'Test Child',
          accompanying_child_age: 8,
          accompanying_child_gender: 'Male',
          accompanying_child_relation: 'Son'
        }
      }
    ],
    properties: [],
    offences: [],
    recordDate: new Date().toISOString().split('T')[0]
  };

  console.log('Creating MISSING record with accompanying child...');
  const { id: recordId } = await recordsService.createRecord(
    hcUser, 'MISSING', missingPayload.recordDate, missingPayload.data, '127.0.0.1',
    { persons: missingPayload.persons, properties: missingPayload.properties, offences: missingPayload.offences }
  );

  console.log(`Created Record ID: ${recordId}`);
  
  const persons = await db('persons').where('record_id', recordId);
  console.log('\n--- persons table ---');
  console.log(JSON.stringify(persons, null, 2));

  const missingPersonDetails = await db('missing_person_details').whereIn('person_id', persons.map(p => p.id));
  console.log('\n--- missing_person_details table ---');
  console.log(JSON.stringify(missingPersonDetails, null, 2));

  const personDescriptions = await db('person_descriptions').whereIn('person_id', persons.map(p => p.id));
  console.log('\n--- person_descriptions table ---');
  console.log(JSON.stringify(personDescriptions, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
