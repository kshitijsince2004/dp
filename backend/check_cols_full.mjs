import db from './src/config/db.js';

try {
  // Check fir_details columns
  const fir = await db('fir_details').limit(1);
  console.log('fir_details columns:', fir.length ? Object.keys(fir[0]) : 'EMPTY');

  // Check arrest_details columns
  const arr = await db('arrest_details').limit(1);
  console.log('arrest_details columns:', arr.length ? Object.keys(arr[0]) : 'EMPTY');

  // Check missing_details columns
  const miss = await db('missing_details').limit(1);
  console.log('missing_details columns:', miss.length ? Object.keys(miss[0]) : 'EMPTY');

  // Check uidb_details columns
  const uidb = await db('uidb_details').limit(1);
  console.log('uidb_details columns:', uidb.length ? Object.keys(uidb[0]) : 'EMPTY');

  // Check pcr_call_details columns
  const pcr = await db('pcr_call_details').limit(1);
  console.log('pcr_call_details columns:', pcr.length ? Object.keys(pcr[0]) : 'EMPTY');

  // Check records columns
  const rec = await db('records').limit(1);
  console.log('records columns:', rec.length ? Object.keys(rec[0]) : 'EMPTY');

  // Check persons columns
  const per = await db('persons').limit(1);
  console.log('persons columns:', per.length ? Object.keys(per[0]) : 'EMPTY');

  // Check investigating_officers columns
  const io = await db('investigating_officers').limit(1);
  console.log('investigating_officers columns:', io.length ? Object.keys(io[0]) : 'EMPTY');

  // Check properties columns
  let prop_cols = 'NOT FOUND';
  try {
    const prop = await db('properties').limit(1);
    prop_cols = prop.length ? Object.keys(prop[0]) : 'EMPTY';
  } catch(e) { prop_cols = 'TABLE NOT FOUND: ' + e.message.slice(0, 80); }
  console.log('properties columns:', prop_cols);

  // Get a full CASE sample with all joins
  const sample = await db('records as r')
    .leftJoin('fir_details as fd', 'r.id', 'fd.record_id')
    .leftJoin('arrest_details as ad', 'r.id', 'ad.record_id')
    .leftJoin('missing_details as md', 'r.id', 'md.record_id')
    .leftJoin('uidb_details as ud', 'r.id', 'ud.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .leftJoin('persons as p', function() { this.on('p.record_id', 'r.id').andOn(db.raw("p.role = 'COMPLAINANT'")); })
    .where('r.record_type', 'CASE')
    .select(
      'r.id', 'r.record_type', 'r.record_date', 'r.registration_date', 'r.current_status',
      'r.gd_no', 'r.district_id',
      'ps.name as ps_name', 'ps.code as ps_code',
      'io.name as io_name', 'io.rank as io_rank', 'io.phone as io_phone',
      'fd.*', 'p.name as complainant_name'
    )
    .limit(1);
  if (sample.length > 0) {
    console.log('\nFull CASE sample:');
    console.log(JSON.stringify(sample[0], null, 2));
  }

  // Sample ARREST
  const arr_sample = await db('records as r')
    .leftJoin('arrest_details as ad', 'r.id', 'ad.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .leftJoin('persons as p', function() { this.on('p.record_id', 'r.id').andOn(db.raw("p.role = 'ARRESTEE'")); })
    .where('r.record_type', 'ARREST')
    .select('r.id', 'r.record_date', 'r.current_status', 'ps.name as ps_name', 'io.name as io_name', 'ad.*', 'p.name as accused_name')
    .limit(1);
  if (arr_sample.length > 0) {
    console.log('\nFull ARREST sample:');
    console.log(JSON.stringify(arr_sample[0], null, 2));
  }

  // Sample MISSING
  const miss_sample = await db('records as r')
    .leftJoin('missing_details as md', 'r.id', 'md.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .leftJoin('persons as p', function() { this.on('p.record_id', 'r.id').andOn(db.raw("p.role = 'MISSING'")); })
    .where('r.record_type', 'MISSING')
    .select('r.id', 'r.record_date', 'r.current_status', 'ps.name as ps_name', 'io.name as io_name', 'md.*', 'p.name as missing_name')
    .limit(1);
  if (miss_sample.length > 0) {
    console.log('\nFull MISSING sample:');
    console.log(JSON.stringify(miss_sample[0], null, 2));
  }

  // Sample UIDB
  const uidb_sample = await db('records as r')
    .leftJoin('uidb_details as ud', 'r.id', 'ud.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .where('r.record_type', 'UIDB')
    .select('r.id', 'r.record_date', 'r.current_status', 'ps.name as ps_name', 'io.name as io_name', 'ud.*')
    .limit(1);
  if (uidb_sample.length > 0) {
    console.log('\nFull UIDB sample:');
    console.log(JSON.stringify(uidb_sample[0], null, 2));
  }

} catch(e) {
  console.error('ERROR:', e.message, e.stack);
}
await db.destroy();
