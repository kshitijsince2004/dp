import db from '../src/config/db.js';
import { generateDailyDiaryExcelNative } from '../src/modules/daily-diary/daily-diary.service.js';
import ExcelJS from 'exceljs';
import path from 'path';
import crypto from 'crypto';

function uuid() {
  return crypto.randomUUID();
}

async function resetAndSeed() {
  console.log('=== Step 1: Cleaning Transactional Data from Database ===');
  
  const tablesToClear = [
    'notifications', 'record_links', 'report_builder_audit', 'report_jobs',
    'record_offences', 'persons', 'fir_details', 'arrest_details',
    'missing_details', 'uidb_details', 'records'
  ];
  for (const t of tablesToClear) {
    try {
      await db(t).del();
    } catch (e) {
      console.warn(`Table ${t} deletion skipped/error:`, e.message);
    }
  }
  
  console.log('Transactional tables cleared successfully.');

  console.log('\n=== Step 2: Resolving Hierarchy and Master Data ===');
  
  // Find New Delhi District and Police Stations
  const dist = await db('hierarchy_nodes').where('node_type', 'DISTRICT').where('name', 'ilike', '%New Delhi%').first() 
    || await db('hierarchy_nodes').where('node_type', 'DISTRICT').first();
  const districtId = dist ? dist.id : null;
  console.log('District:', dist?.name, '(ID:', districtId, ')');

  const psParliament = await db('hierarchy_nodes').where('node_type', 'PS').where('name', 'ilike', '%Parliament Street%').first()
    || await db('hierarchy_nodes').where('node_type', 'PS').first();
  const psParliamentId = psParliament ? psParliament.id : null;
  console.log('Primary PS:', psParliament?.name, '(ID:', psParliamentId, ')');

  // User for created_by
  const user = await db('users').where('ps_id', psParliamentId).first() || await db('users').first();
  const userId = user ? user.id : 'c1b9ca56-5c10-421c-9eec-cbc595b2fcff';
  console.log('Operator User:', user?.username, '(ID:', userId, ')');

  // Other PS in district for Goswara cross-tabulation
  const otherStations = await db('hierarchy_nodes')
    .where('node_type', 'PS')
    .whereNot('id', psParliamentId)
    .limit(4);

  // Investigating Officers
  let ios = await db('investigating_officers').where('is_active', true).limit(10);
  if (ios.length === 0) {
    const defaultIO = {
      id: uuid(),
      name: 'Subhash Chandra',
      rank: 'SI',
      pis_no: '28940123',
      mobile: '9811223344',
      is_active: true,
      ps_id: psParliamentId
    };
    await db('investigating_officers').insert(defaultIO);
    ios = [defaultIO];
  }
  const primaryIo = ios[0];
  console.log('Investigating Officer:', primaryIo.rank, primaryIo.name, `(${primaryIo.pis_no})`);

  // Local heads
  const localHeads = await db('ref.local_heads').limit(50);
  const findHead = (term) => localHeads.find(h => (h.local_head || '').toLowerCase().includes(term.toLowerCase()))?.local_head_cd || 1;
  const burglaryHead = findHead('burglary') || 12;
  const houseTheftHead = findHead('house theft') || 18;
  const mvTheftHead = findHead('motor vehicle') || 16;
  const robberyHead = findHead('robbery') || 4;
  const snatchingHead = findHead('snatching') || 9;

  // Sections
  const allSections = await db('ref.sections').limit(100);
  const sec379 = allSections.find(s => s.section === '379' || s.section === '303(2)')?.act_sec_cd || 379;
  const sec380 = allSections.find(s => s.section === '380' || s.section === '305')?.act_sec_cd || 380;
  const sec392 = allSections.find(s => s.section === '392' || s.section === '309(4)')?.act_sec_cd || 392;
  const sec457 = allSections.find(s => s.section === '457' || s.section === '331(4)')?.act_sec_cd || 457;

  console.log('\n=== Step 3: Seeding Validated Records for All 20 Daily Diary Sheets ===');

  let recCounter = 100;
  const makeStatutoryFir = (regType, seq) => {
    const s4 = String(seq).padStart(4, '0');
    if (regType === 'E_THEFT') return `0815804726${s4}`;
    if (regType === 'E_MVT') return `0815904726${s4}`;
    if (regType === 'NCRP') return `0181604726${s4}`;
    if (regType === 'ZERO_FIR') return `0815604726${s4}`;
    return `0816502226${s4}`;
  };
  const makeFirNo = (seq, regType = 'MANUAL_CCTNS') => makeStatutoryFir(regType, seq);
  const make14DigitFir = (psCode, seq) => makeStatutoryFir('MANUAL_CCTNS', seq);

  // Helper to create record envelope
  async function createRecord(r) {
    const recordId = r.id || uuid();
    await db('records').insert({
      id: recordId,
      uid: r.uid || `NDD_PARL_2026_${recCounter}`,
      record_type: r.record_type,
      ps_id: r.ps_id || psParliamentId,
      district_id: r.district_id || districtId,
      io_id: r.io_id || primaryIo.id,
      current_status: r.current_status || 'APPROVED',
      current_level: 'PS',
      record_date: r.record_date || '2026-09-05',
      registration_date: r.registration_date || r.record_date || '2026-09-05',
      created_by: userId,
      updated_by: userId,
      is_frozen: false,
      is_legacy: false
    });
    return recordId;
  }

  // Helper to create a location
  async function createLocation(details) {
    const locId = uuid();
    await db('locations').insert({
      id: locId,
      house_no: details.house_no || '12/B',
      street: details.street || 'Ashoka Road',
      colony: details.colony || 'Parliament Street Area',
      city_town_village: details.city || 'New Delhi',
      tehsil_block_mandal: details.tehsil || 'Chanakyapuri',
      landmark: details.landmark || 'Near Patel Chowk Metro',
      district: details.district || 'New Delhi District',
      state: 'Delhi',
      pincode: '110001'
    });
    return locId;
  }

  // Helper to create person
  async function createPerson(recordId, role, p) {
    const locId = await createLocation(p.location || {});
    const personId = uuid();
    let gender = (p.gender || 'MALE').toUpperCase();
    if (!['MALE', 'FEMALE', 'TRANSGENDER', 'OTHER', 'UNKNOWN'].includes(gender)) gender = 'MALE';

    let relType = (p.relation_type || 'FATHER').toUpperCase();
    if (relType === 'S/O' || relType === 'D/O' || relType === 'C/O') relType = 'FATHER';
    if (relType === 'W/O') relType = 'HUSBAND';
    if (!['FATHER', 'MOTHER', 'HUSBAND', 'WIFE', 'GUARDIAN', 'OTHER'].includes(relType)) relType = 'OTHER';

    let rRole = (role || 'COMPLAINANT').toUpperCase();
    if (rRole === 'FOUND') rRole = 'MISSING_CHILD';

    await db('persons').insert({
      id: personId,
      record_id: recordId,
      role: rRole,
      name: p.name || 'Rajesh Kumar',
      relative_name: p.relative_name || 'Ramesh Kumar',
      relation_type: relType,
      gender: gender,
      age: p.age || 32,
      mobile: p.mobile || '9876543210',
      present_location_id: locId,
      perm_location_id: locId,
      extra: p.extra || (p.status ? { custody_status: p.status } : {})
    });
    return personId;
  }

  // 1. SHEET 1: Manual FIR Cases
  recCounter++;
  const occ1 = await createLocation({ house_no: 'Flat 4A', street: 'Sansad Marg', colony: 'Connaught Place Area' });
  const c1Id = await createRecord({
    uid: `NDD_PARL_2026_${recCounter}`, record_type: 'CASE',
    record_date: '2026-09-05', registration_date: '2026-09-05'
  });
  await db('fir_details').insert({
    record_id: c1Id, ps_id: psParliamentId,
    fir_no: makeFirNo(recCounter, 'MANUAL_CCTNS'), original_fir_no: makeFirNo(recCounter, 'MANUAL_CCTNS'),
    fir_date: '2026-09-05', gd_no: '14A', gd_date: '2026-09-05',
    case_type: 'cctns(manual FIR)', registration_type: 'MANUAL_CCTNS', case_status: 'PENDING',
    local_head_id: robberyHead, occurrence_location_id: occ1,
    occurrence_from_datetime: '2026-09-05 08:15:00',
    brief_facts: 'Complainant reported robbery of purse containing cash ₹15,000 and mobile phone by two motorcycle-borne assailants.',
    is_worked_out: false
  });
  await createPerson(c1Id, 'COMPLAINANT', { name: 'Sunita Sharma', relative_name: 'Anil Sharma', relation_type: 'W/O', gender: 'Female', age: 38 });
  await createPerson(c1Id, 'ARRESTEE', { name: 'Vikram Singh @ Vicky', relative_name: 'Suraj Singh', relation_type: 'S/O', gender: 'Male', age: 24, status: 'JC' });
  await db('record_offences').insert({ id: uuid(), record_id: c1Id, other_act_name: '392 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. SHEET 2: E-Burglary Cases
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const occ2 = await createLocation({ house_no: 'Shop 14', street: 'Janpath Lane', colony: 'Janpath Market' });
  const c2Id = await createRecord({
    uid: `NDD_PARL_2026_${recCounter}`, record_type: 'CASE',
    record_date: '2026-09-08', registration_date: '2026-09-08'
  });
  await db('fir_details').insert({
    record_id: c2Id, ps_id: psParliamentId,
    fir_no: makeFirNo(recCounter, 'E_THEFT'), original_fir_no: makeFirNo(recCounter, 'E_THEFT'),
    fir_date: '2026-09-08', gd_no: '22A', gd_date: '2026-09-08',
    case_type: 'eTheft', registration_type: 'E_THEFT', case_status: 'PENDING',
    local_head_id: burglaryHead, occurrence_location_id: occ2,
    occurrence_from_datetime: '2026-09-08 02:30:00',
    brief_facts: 'Night burglary reported in optical shop. Shutter locks broken and sunglasses worth ₹80,000 stolen.',
    extra: { stolen_property: 'Ray-Ban & Oakley Sunglasses (40 units) - Estimated Value ₹80,000' }
  });
  await createPerson(c2Id, 'COMPLAINANT', { name: 'Harish Mehta', relative_name: 'K.L. Mehta', relation_type: 'S/O', gender: 'Male', age: 45 });
  await db('record_offences').insert({ id: uuid(), record_id: c2Id, other_act_name: '457 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. SHEET 3: E-House Theft Cases
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const occ3 = await createLocation({ house_no: 'B-42', street: 'Tolstoy Marg', colony: 'Barakhamba Road Area' });
  const c3Id = await createRecord({
    uid: `NDD_PARL_2026_${recCounter}`, record_type: 'CASE',
    record_date: '2026-09-10', registration_date: '2026-09-10'
  });
  await db('fir_details').insert({
    record_id: c3Id, ps_id: psParliamentId,
    fir_no: makeFirNo(recCounter), original_fir_no: make14DigitFir('0085', recCounter),
    fir_date: '2026-09-10', gd_no: '09A', gd_date: '2026-09-10',
    case_type: 'eTheft', registration_type: 'E_THEFT', case_status: 'PENDING',
    local_head_id: houseTheftHead, occurrence_location_id: occ3,
    occurrence_from_datetime: '2026-09-10 10:00:00',
    brief_facts: 'Theft of gold jewellery and wristwatches from bedroom almirah during daytime.',
    extra: { stolen_property: 'Gold Ring 8gm & Tissot Watch - Value ₹65,000' }
  });
  await createPerson(c3Id, 'COMPLAINANT', { name: 'Ritu Gupta', relative_name: 'Deepak Gupta', relation_type: 'W/O', gender: 'Female', age: 34 });
  await db('record_offences').insert({ id: uuid(), record_id: c3Id, other_act_name: '380 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. SHEET 4: E-Other Theft Cases
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const occ4 = await createLocation({ house_no: 'Pvt Bus Stand', street: 'Shivaji Stadium', colony: 'Connaught Place' });
  const c4Id = await createRecord({
    uid: `NDD_PARL_2026_${recCounter}`, record_type: 'CASE',
    record_date: '2026-09-12', registration_date: '2026-09-12'
  });
  await db('fir_details').insert({
    record_id: c4Id, ps_id: psParliamentId,
    fir_no: makeFirNo(recCounter), original_fir_no: make14DigitFir('0085', recCounter),
    fir_date: '2026-09-12', gd_no: '18A', gd_date: '2026-09-12',
    case_type: 'eTheft', registration_type: 'E_THEFT', case_status: 'PENDING',
    local_head_id: snatchingHead, occurrence_location_id: occ4,
    occurrence_from_datetime: '2026-09-12 15:30:00',
    brief_facts: 'Mobile phone pickpocketed while boarding DTC bus at Shivaji Stadium terminal.',
    extra: { stolen_property: 'OnePlus 11R Mobile Phone (Black)' }
  });
  await createPerson(c4Id, 'COMPLAINANT', { name: 'Mohit Sharma', relative_name: 'Rajinder Sharma', relation_type: 'S/O', gender: 'Male', age: 27 });
  await db('record_offences').insert({ id: uuid(), record_id: c4Id, other_act_name: '379 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SHEET 5: MVT Cases (Motor Vehicle Theft)
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const occ5 = await createLocation({ house_no: 'Parking Lot C', street: 'NDMC Palika Kendra', colony: 'Sansad Marg' });
  const c5Id = await createRecord({
    uid: `NDD_PARL_2026_${recCounter}`, record_type: 'CASE',
    record_date: '2026-09-14', registration_date: '2026-09-14'
  });
  await db('fir_details').insert({
    record_id: c5Id, ps_id: psParliamentId,
    fir_no: makeFirNo(recCounter), original_fir_no: make14DigitFir('0085', recCounter),
    fir_date: '2026-09-14', gd_no: '05A', gd_date: '2026-09-14',
    case_type: 'eMVT', registration_type: 'E_MVT', case_status: 'PENDING',
    local_head_id: mvTheftHead, occurrence_location_id: occ5,
    occurrence_from_datetime: '2026-09-14 08:00:00',
    cd_uploaded_24h: 'Y', footage_collected: 'Y',
    brief_facts: 'Theft of parked Hyundai Creta White color bearing registration DL-1CAB-9081.',
    extra: { vehicle_no: 'DL-1CAB-9081', vehicle_type: 'Hyundai Creta SUV White' }
  });
  await createPerson(c5Id, 'COMPLAINANT', { name: 'Anil Tyagi', relative_name: 'S.P. Tyagi', relation_type: 'S/O', gender: 'Male', age: 42 });
  await db('record_offences').insert({ id: uuid(), record_id: c5Id, other_act_name: '379 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. SHEET 6: Arrested - Kalandara Preventive
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const a1Id = await createRecord({
    uid: `NDD_PARL_ARR_${recCounter}`, record_type: 'ARREST',
    record_date: '2026-09-15', registration_date: '2026-09-15'
  });
  await db('arrest_details').insert({
    record_id: a1Id,
    gd_no: '34A', gd_date: '2026-09-15', gd_time: '18:00:00', intimation_datetime: '2026-09-15 18:00:00+00',
    case_type: 'kalandra', is_dd_based: true, custody_status: 'JC',
    group_patrolling: true, recovery: 'One button-actuated knife',
    reason_for_detention: 'Creating public nuisance and carrying concealed weapon near Patel Chowk.'
  });
  await createPerson(a1Id, 'ARRESTEE', { name: 'Manoj Kumar @ Kalu', relative_name: 'Dharmendra', relation_type: 'S/O', gender: 'Male', age: 26, status: 'JC' });
  await db('record_offences').insert({ id: uuid(), record_id: a1Id, other_act_name: '126/170 BNSS', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. SHEET 7: Arrested - E-FIR Theft
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const a2Id = await createRecord({
    uid: `NDD_PARL_ARR_${recCounter}`, record_type: 'ARREST',
    record_date: '2026-09-16', registration_date: '2026-09-16'
  });
  await db('arrest_details').insert({
    record_id: a2Id,
    fir_no: makeFirNo(102), fir_date: '2026-09-08', gd_no: '12B', gd_date: '2026-09-16',
    case_type: 'eTheft', is_dd_based: false, custody_status: 'PC',
    by_antisnatching_team: true, recovery: '15 units stolen sunglasses and cash ₹8,000'
  });
  await createPerson(a2Id, 'ARRESTEE', { name: 'Suraj Rawat @ Chhotu', relative_name: 'Kishan Rawat', relation_type: 'S/O', gender: 'Male', age: 22, status: 'PC' });
  await db('record_offences').insert({ id: uuid(), record_id: a2Id, other_act_name: '457 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. SHEET 8 & 10: Arrested - District & Last 24 Hrs Arrests
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const a3Id = await createRecord({
    uid: `NDD_PARL_ARR_${recCounter}`, record_type: 'ARREST',
    record_date: '2026-09-21', registration_date: '2026-09-21'
  });
  await db('arrest_details').insert({
    record_id: a3Id,
    fir_no: makeFirNo(101), fir_date: '2026-09-05', gd_no: '06A', gd_date: '2026-09-21',
    case_type: 'cctns(manual FIR)', is_dd_based: false, custody_status: 'Bail',
    integrated_pi: true, recovery: 'Stolen purse and identity cards'
  });
  await createPerson(a3Id, 'ARRESTEE', { name: 'Amit Solanki', relative_name: 'Bhupender Solanki', relation_type: 'S/O', gender: 'Male', age: 29, status: 'Bail' });
  await db('record_offences').insert({ id: uuid(), record_id: a3Id, other_act_name: '392 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. SHEET 9: Arrested - E-FIR MV Theft
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const a4Id = await createRecord({
    uid: `NDD_PARL_ARR_${recCounter}`, record_type: 'ARREST',
    record_date: '2026-09-17', registration_date: '2026-09-17'
  });
  await db('arrest_details').insert({
    record_id: a4Id,
    fir_no: makeFirNo(105), fir_date: '2026-09-14', gd_no: '21A', gd_date: '2026-09-17',
    case_type: 'eMVT', is_dd_based: false, custody_status: 'JC',
    group_patrolling: true, recovery: 'Hyundai Creta DL-1CAB-9081 and master keys'
  });
  await createPerson(a4Id, 'ARRESTEE', { name: 'Praveen Yadav @ Pehalwan', relative_name: 'Ramphal Yadav', relation_type: 'S/O', gender: 'Male', age: 31, status: 'JC' });
  await db('record_offences').insert({ id: uuid(), record_id: a4Id, other_act_name: '379 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 11, 12, 13: PI Disposal (Manual, E-Theft, E-MVT)
  // ───────────────────────────────────────────────────────────────────────────
  // Disposed Manual Case (Sheet 11)
  recCounter++;
  const d1Id = await createRecord({
    uid: `NDD_PARL_DISP_${recCounter}`, record_type: 'CASE',
    record_date: '2026-09-02', registration_date: '2026-09-02'
  });
  await db('fir_details').insert({
    record_id: d1Id, ps_id: psParliamentId,
    fir_no: makeFirNo(recCounter), original_fir_no: make14DigitFir('0085', recCounter),
    fir_date: '2026-09-02', case_type: 'cctns(manual FIR)', registration_type: 'MANUAL_CCTNS',
    case_status: 'CHARGE SHEET', disposal_type: 'Challan', rc_no: 'RC/NDD/2026/041',
    sent_to_court_date: '2026-09-18', court_case_no: 'CC-8941/2026', court_name: 'MM',
    court_disposal_type: 'PENDING_TRIAL', is_worked_out: true
  });
  await db('record_offences').insert({ id: uuid(), record_id: d1Id, other_act_name: '392 IPC', is_primary: true });

  // Disposed E-Theft Case (Sheet 12)
  recCounter++;
  const d2Id = await createRecord({
    uid: `NDD_PARL_DISP_${recCounter}`, record_type: 'CASE',
    record_date: '2026-09-03', registration_date: '2026-09-03'
  });
  await db('fir_details').insert({
    record_id: d2Id, ps_id: psParliamentId,
    fir_no: makeFirNo(recCounter), original_fir_no: make14DigitFir('0085', recCounter),
    fir_date: '2026-09-03', case_type: 'eTheft', registration_type: 'E_THEFT',
    case_status: 'CHARGE SHEET', disposal_type: 'Challan', rc_no: 'RC/NDD/2026/042',
    is_worked_out: true
  });
  await db('record_offences').insert({ id: uuid(), record_id: d2Id, other_act_name: '380 IPC', is_primary: true });

  // Disposed E-MVT Case (Sheet 13)
  recCounter++;
  const d3Id = await createRecord({
    uid: `NDD_PARL_DISP_${recCounter}`, record_type: 'CASE',
    record_date: '2026-09-04', registration_date: '2026-09-04'
  });
  await db('fir_details').insert({
    record_id: d3Id, ps_id: psParliamentId,
    fir_no: makeFirNo(recCounter), original_fir_no: make14DigitFir('0085', recCounter),
    fir_date: '2026-09-04', case_type: 'eMVT', registration_type: 'E_MVT',
    case_status: 'UNTRACED', disposal_type: 'Untraced', rc_no: 'RC/NDD/2026/043',
    is_worked_out: false
  });
  await db('record_offences').insert({ id: uuid(), record_id: d3Id, other_act_name: '379 IPC', is_primary: true });

  // ───────────────────────────────────────────────────────────────────────────
  // 14. SHEET 14: Missing Persons
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const m1Id = await createRecord({
    uid: `NDD_PARL_MISS_${recCounter}`, record_type: 'MISSING',
    record_date: '2026-09-07'
  });
  await db('missing_details').insert({
    record_id: m1Id,
    gd_no: '19A', gd_date: '2026-09-07',
    missing_type: 'Missing', missing_status: 'MISSING', operator_name: 'HC Virender Singh (MPS)',
    extra: { missing_date: '2026-09-06' }
  });
  await createPerson(m1Id, 'MISSING', {
    name: 'Pooja Devi', relative_name: 'Dinesh Kumar', relation_type: 'W/O', gender: 'Female', age: 28,
    extra: { height: "5'2\"", built: 'Medium', complexion: 'Fair', hair: 'Long Black', dress: 'Red Salwar Suit' }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 15. SHEET 15: UIDB (Unidentified Bodies)
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const floc1 = await createLocation({ house_no: 'Near Footover Bridge', street: 'Panchkuian Road', colony: 'Connaught Place Area' });
  const u1Id = await createRecord({
    uid: `NDD_PARL_UIDB_${recCounter}`, record_type: 'UIDB',
    record_date: '2026-09-09'
  });
  await db('uidb_details').insert({
    record_id: u1Id,
    uidb_no: 'UIDB/PS-PARL/2026/09', gd_no: '08A', gd_date: '2026-09-09', found_date: '2026-09-09',
    found_location_id: floc1, mortuary_remarks: 'Preserved in RML Hospital Mortuary for 72 hours'
  });
  await createPerson(u1Id, 'DECEASED', {
    name: 'Unidentified Male', gender: 'Male', age: 45,
    extra: { height: "5'7\"", built: 'Thin', complexion: 'Shallow', hair: 'Grey Short', dress: 'Blue Shirt and Khaki Trouser' }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 16. SHEET 16: Abandoned Persons
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const m2Id = await createRecord({
    uid: `NDD_PARL_ABAN_${recCounter}`, record_type: 'MISSING',
    record_date: '2026-09-11'
  });
  await db('missing_details').insert({
    record_id: m2Id,
    gd_no: '27A', gd_date: '2026-09-11', missing_type: 'Abandoned', missing_status: 'FOUND',
    operator_name: 'W/HC Sunita (MPS)'
  });
  await createPerson(m2Id, 'FOUND', {
    name: 'Golu (Mentally Challenged Boy)', gender: 'Male', age: 12,
    location: { house_no: 'Park Bench', street: 'Jantar Mantar Lawns', colony: 'Parliament Street' },
    extra: { height: "4'3\"", built: 'Slim', complexion: 'Wheatish', dress: 'Yellow T-Shirt' }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 17. SHEET 17: Traced Persons
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const m3Id = await createRecord({
    uid: `NDD_PARL_TRAC_${recCounter}`, record_type: 'MISSING',
    record_date: '2026-09-13'
  });
  await db('missing_details').insert({
    record_id: m3Id,
    gd_no: '15A', gd_date: '2026-09-13',
    missing_type: 'Missing', missing_status: 'TRACED', operator_name: 'ASI Satish Kumar (MPS)'
  });
  await createPerson(m3Id, 'MISSING', {
    name: 'Karan Mehra', relative_name: 'Shyam Lal Mehra', relation_type: 'S/O', gender: 'Male', age: 19,
    location: { house_no: 'H-12', street: 'Baird Lane', colony: 'Gole Market' }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 18. SHEET 18: Inquest Registered
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const floc2 = await createLocation({ house_no: 'Railway Track', street: 'Shivaji Bridge', colony: 'Connaught Place Area' });
  const u2Id = await createRecord({
    uid: `NDD_PARL_INQ_${recCounter}`, record_type: 'UIDB',
    record_date: '2026-09-16'
  });
  await db('uidb_details').insert({
    record_id: u2Id,
    uidb_no: 'INQ/PS-PARL/2026/04', gd_no: '04A', gd_date: '2026-09-16', found_date: '2026-09-16',
    inquest_sections: '194 BNSS (174 CrPC)', cause_of_death: 'Railway Accident / Head Injury',
    inquest_status: 'PENDING_POSTMORTEM', found_location_id: floc2
  });
  await createPerson(u2Id, 'DECEASED', {
    name: 'Maheshwar Prasad', relative_name: 'Ram Avatar', relation_type: 'S/O', gender: 'Male', age: 52,
    location: { house_no: 'Village Rampur', city: 'Gorakhpur', state: 'Uttar Pradesh' }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 19. SHEET 19: Inquest ACP/SDM Disposal
  // ───────────────────────────────────────────────────────────────────────────
  recCounter++;
  const floc3 = await createLocation({ house_no: 'Hotel Room 302', street: 'Janpath', colony: 'Connaught Place' });
  const u3Id = await createRecord({
    uid: `NDD_PARL_SDM_${recCounter}`, record_type: 'UIDB',
    record_date: '2026-09-06'
  });
  await db('uidb_details').insert({
    record_id: u3Id,
    uidb_no: 'INQ/PS-PARL/2026/02', gd_no: '11A', gd_date: '2026-09-06', found_date: '2026-09-06',
    inquest_sections: '194 BNSS', cause_of_death: 'Natural / Cardiac Arrest',
    inquest_status: 'DISPOSED', filed_by_acp_sdm: true, filed_by_acp_sdm_date: '2026-09-19',
    found_location_id: floc3
  });
  await createPerson(u3Id, 'DECEASED', {
    name: 'Robert Jenkins', relative_name: 'Arthur Jenkins', relation_type: 'S/O', gender: 'Male', age: 64,
    location: { house_no: 'Flat 12', street: 'Queen Street', city: 'London', state: 'UK' }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 20. SHEET 20: Cross-Station Arrests for Goswara Matrix
  // ───────────────────────────────────────────────────────────────────────────
  for (const st of otherStations) {
    recCounter++;
    const ostArrId = await createRecord({
      uid: `NDD_ST_${recCounter}`, record_type: 'ARREST',
      record_date: '2026-09-10', ps_id: st.id
    });
    await db('arrest_details').insert({
      record_id: ostArrId,
      gd_no: '10A', gd_date: '2026-09-10', case_type: 'eTheft', is_dd_based: false,
      custody_status: 'JC'
    });
    await createPerson(ostArrId, 'ARRESTEE', { name: `Accused at ${st.name}`, gender: 'Male', age: 25, status: 'JC' });
    await db('record_offences').insert({ id: uuid(), record_id: ostArrId, other_act_name: '380 IPC', is_primary: true });
  }

  console.log(`\nSuccessfully seeded master dataset with ${recCounter - 100} structured records.`);

  // ───────────────────────────────────────────────────────────────────────────
  // Step 4: Export Verification & Row Inspection
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n=== Step 4: Generating Excel Report & Inspecting All 20 Sheets ===');
  const exportPath = path.resolve('../scratch/final_master_diary_report.xlsx');

  await generateDailyDiaryExcelNative({
    date: '2026-09-01',
    dateTo: '2026-09-21',
    policeStationId: 'Parliament Street',
    districtId: districtId,
    filePath: exportPath
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(exportPath);

  console.log(`\nWorkbook successfully generated at: ${exportPath}`);
  console.log(`Total sheets in export: ${wb.worksheets.length}`);

  let totalExportDataRows = 0;
  console.log('\n--------------------------------------------------------------------------------');
  console.log(String('Sheet #').padEnd(8) + String('Sheet Name').padEnd(35) + String('Data Rows').padEnd(12) + 'Status');
  console.log('--------------------------------------------------------------------------------');

  wb.worksheets.forEach((ws, idx) => {
    const dataRowCount = Math.max(0, ws.rowCount - 4);
    totalExportDataRows += dataRowCount;
    const status = dataRowCount > 0 ? '✓ POPULATED' : '✗ EMPTY';
    console.log(
      String(idx + 1).padEnd(8) +
      String(`[${ws.name}]`).padEnd(35) +
      String(dataRowCount).padEnd(12) +
      status
    );
  });
  console.log('--------------------------------------------------------------------------------');
  console.log(`Total Live Data Rows Populated: ${totalExportDataRows}`);

  process.exit(0);
}

resetAndSeed().catch(err => {
  console.error('Reset and seed failed:', err);
  process.exit(1);
});
