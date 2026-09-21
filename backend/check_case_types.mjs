import db from './src/config/db.js';

try {
  // What case_type values exist in fir_details?
  const caseTypes = await db('fir_details').select('case_type').count('* as c').groupBy('case_type');
  console.log('case_type values in fir_details:', JSON.stringify(caseTypes));

  // What registration_type values exist?
  const regTypes = await db('fir_details').select('registration_type').count('* as c').groupBy('registration_type');
  console.log('registration_type values:', JSON.stringify(regTypes));

  // What disposal_type values exist?
  const disposalTypes = await db('fir_details').select('disposal_type').count('* as c').groupBy('disposal_type').whereNotNull('disposal_type');
  console.log('disposal_type values:', JSON.stringify(disposalTypes));

  // Missing type values
  const missingTypes = await db('missing_details').select('missing_type', 'missing_status').count('* as c').groupBy('missing_type', 'missing_status');
  console.log('missing_type values:', JSON.stringify(missingTypes));

  // UIDB status and inquest status
  const uiTbStatus = await db('uidb_details').select('uidb_status', 'inquest_status').count('* as c').groupBy('uidb_status', 'inquest_status');
  console.log('uidb_status/inquest_status values:', JSON.stringify(uiTbStatus));

  // Arrest case_type
  const arrCaseTypes = await db('arrest_details').select('case_type').count('* as c').groupBy('case_type');
  console.log('arrest case_type values:', JSON.stringify(arrCaseTypes));

  // Check locations table
  let locCols = 'NOT FOUND';
  try {
    const loc = await db('locations').limit(1);
    locCols = loc.length ? Object.keys(loc[0]) : 'EMPTY';
  } catch(e) { locCols = 'TABLE NOT FOUND: ' + e.message.slice(0, 80); }
  console.log('locations table columns:', locCols);

  // Check ref.local_heads
  let lhCols = 'NOT FOUND';
  try {
    const lh = await db('ref.local_heads').limit(1);
    lhCols = lh.length ? Object.keys(lh[0]) : 'EMPTY';
  } catch(e) { lhCols = 'TABLE NOT FOUND: ' + e.message.slice(0, 80); }
  console.log('ref.local_heads columns:', lhCols);

  // Get a full sample CASE row with key fields
  const firSample = await db('records as r')
    .join('fir_details as fd', 'r.id', 'fd.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .leftJoin('ref.local_heads as lh', 'fd.local_head_id', 'lh.local_head_cd')
    .select(
      'r.id', 'r.record_type', 'r.record_date', 'r.registration_date', 'r.current_status',
      'ps.name as ps_name',
      'io.name as io_name', 'io.rank as io_rank', 'io.pis_no',
      'fd.fir_no', 'fd.fir_date', 'fd.gd_no', 'fd.gd_date', 'fd.case_type', 'fd.registration_type',
      'fd.brief_facts', 'fd.disposal_type', 'fd.rc_no', 'fd.disposal_type',
      'fd.occurrence_from_datetime', 'fd.occurrence_location_id', 'fd.cd_uploaded_24h', 'fd.footage_collected',
      'lh.local_head as crime_head'
    )
    .limit(3);
  console.log('\nFIR samples:', JSON.stringify(firSample, null, 2));

  // Full arrest sample
  const arrSample = await db('records as r')
    .join('arrest_details as ad', 'r.id', 'ad.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .leftJoin('ref.local_heads as lh', 'ad.local_head_id', 'lh.local_head_cd')
    .select(
      'r.id', 'r.record_date', 'r.current_status',
      'ps.name as ps_name',
      'io.name as io_name', 'io.rank as io_rank', 'io.pis_no',
      'ad.gd_no', 'ad.fir_no', 'ad.case_type', 'ad.custody_status',
      'ad.recovery', 'ad.scheme_of_arrest', 'ad.arresting_officer_name', 'ad.arresting_officer_rank',
      'lh.local_head as crime_head'
    )
    .limit(3);
  console.log('\nARREST samples:', JSON.stringify(arrSample, null, 2));

} catch(e) {
  console.error('ERROR:', e.message);
}
await db.destroy();
