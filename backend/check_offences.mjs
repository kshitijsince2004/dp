import db from './src/config/db.js';

try {
  // Check record_offences
  let offCols = 'NOT FOUND';
  try {
    const off = await db('record_offences').limit(2);
    offCols = off.length ? JSON.stringify(off, null, 2) : 'EMPTY TABLE';
  } catch(e) { offCols = 'ERROR: ' + e.message.slice(0, 100); }
  console.log('record_offences:', offCols);

  // Check ref.sections for U/S
  let secCols = 'NOT FOUND';
  try {
    const sec = await db('ref.sections').limit(1);
    secCols = sec.length ? Object.keys(sec[0]) : 'EMPTY';
  } catch(e) { secCols = 'ERROR: ' + e.message.slice(0, 100); }
  console.log('ref.sections columns:', secCols);

  // Check ref.acts
  let actCols = 'NOT FOUND';
  try {
    const act = await db('ref.acts').limit(1);
    actCols = act.length ? Object.keys(act[0]) : 'EMPTY';
  } catch(e) { actCols = 'ERROR: ' + e.message.slice(0, 100); }
  console.log('ref.acts columns:', actCols);

  // Get a sample offence row with section name
  const offSample = await db('record_offences as ro')
    .leftJoin('ref.sections as s', 'ro.section_id', 's.id')
    .leftJoin('ref.acts as a', 's.act_id', 'a.id')
    .select('ro.record_id', 'ro.section_id', 'ro.other_act_name', 's.act_sec_cd', 's.section_name', 'a.act_name')
    .limit(5);
  console.log('\nOffence samples with sections:', JSON.stringify(offSample, null, 2));

  // Check locations sample
  const locSample = await db('locations').limit(2);
  console.log('\nLocation sample:', JSON.stringify(locSample, null, 2));

  // Check what persons look like for a MISSING record
  const missPerson = await db('persons as p')
    .join('records as r', 'p.record_id', 'r.id')
    .where('r.record_type', 'MISSING')
    .select('p.*')
    .limit(2);
  console.log('\nMISSING persons sample:', JSON.stringify(missPerson, null, 2));

  // Check beats table
  let beatCols = 'NOT FOUND';
  try {
    const beat = await db('ref.beats').limit(1);
    beatCols = beat.length ? Object.keys(beat[0]) : 'EMPTY';
  } catch(e) { beatCols = 'ERROR: ' + e.message.slice(0, 100); }
  console.log('ref.beats columns:', beatCols);

  // Check existing persons for all record types
  const persRoles = await db('persons').select('role').count('* as c').groupBy('role');
  console.log('\nPerson roles:', JSON.stringify(persRoles));

} catch(e) {
  console.error('FATAL ERROR:', e.message);
}
await db.destroy();
