// backend/scripts/seed-test-data.js
// Dev/test data seed for PHAROS.
// Truncates test tables then reinserts fresh data on every run.
//
// Run:  node scripts/seed-test-data.js  (from backend/)
// Password for ALL test accounts: Test@1234
//
// Designed to be extended: add records to RECS, users to USERS,
// notifications to NOTIFICATIONS, etc.

import { db, connectDB } from '../src/config/db.js';
import bcrypt from 'bcryptjs';

// Dynamic date helper — keeps seed data current regardless of when seed is run
const D = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
};

// ── Hierarchy node IDs (from migration 20260620000000_full_delhi_hierarchy.js) ─
const H = {
  HQ:            'HQ',
  DIST_NDD:      'DIST_NDD',
  SUB_NDD_0:     'SUBDIV_DIST_NDD_0',
  SUB_NDD_1:     'SUBDIV_DIST_NDD_1',
  PS_PARLIAMENT: 'PS_NDD_PARLIAMENTSTREET',
  PS_CONNAUGHT:  'PS_NDD_CONNAUGHTPLACE',
  DIST_NWD:      'DIST_NWD',
  SUB_NWD_0:     'SUBDIV_DIST_NWD_0',
  PS_ADARSH:     'PS_NWD_ADARSHNAGAR',
};

const PW = bcrypt.hashSync('Test@1234', 10);

// ── ALL USERS (16) ─────────────────────────────────────────────────────────────
// IDs U_HC001..U_DO001..U_HQ001..U_SA001 are also in seeds/02_users.js.
// Those 9 will get DO NOTHING on conflict. The extra 7 here are test-only.
const USERS = [
  // NDD — Parliament Street PS
  { id:'U_HC001',  username:'hc_parliament_street',  badge_no:'HC001',  name_en:'Ramesh Kumar',    name_hi:'रमेश कुमार',         role:'HC',               station_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1 },
  { id:'U_SHO001', username:'sho_parliament_street', badge_no:'SHO001', name_en:'Vikram Singh',    name_hi:'विक्रम सिंह',        role:'SHO',              station_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1 },
  { id:'U_HC003',  username:'hc_parliament_2',       badge_no:'HC003',  name_en:'Deepak Verma',    name_hi:'दीपक वर्मा',         role:'HC',               station_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1 },
  // NDD — Connaught Place PS
  { id:'U_HC004',  username:'hc_connaught_place',    badge_no:'HC004',  name_en:'Sunita Devi',     name_hi:'सुनीता देवी',        role:'HC',               station_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0 },
  { id:'U_SHO002', username:'sho_connaught_place',   badge_no:'SHO002', name_en:'Anil Sharma',     name_hi:'अनिल शर्मा',         role:'SHO',              station_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0 },
  // NDD — ACP + DCP
  { id:'U_ACP001', username:'acp_ndd_subdiv1',       badge_no:'ACP001', name_en:'Rakesh Yadav',    name_hi:'राकेश यादव',         role:'ACP',              station_id:null, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1 },
  { id:'U_DO001',  username:'dcp_ndd',               badge_no:'DO001',  name_en:'Priya Sharma',    name_hi:'प्रिया शर्मा',       role:'DISTRICT_OFFICER', station_id:null, district_id:H.DIST_NDD, sub_div_id:null },
  // Range / Zone
  { id:'U_JCP001', username:'jcp_new_delhi_range',   badge_no:'JCP001', name_en:'Rohit Mehta',     name_hi:'रोहित मेहता',        role:'JCP',              station_id:null, district_id:null, sub_div_id:null },
  { id:'U_SCP001', username:'scp_zone_2',            badge_no:'SCP001', name_en:'Kavita Nair',     name_hi:'कविता नायर',         role:'SCP',              station_id:null, district_id:null, sub_div_id:null },
  // NWD — Adarsh Nagar PS
  { id:'U_HC002',  username:'hc_adarsh_nagar',       badge_no:'HC002',  name_en:'Sunil Dutt',      name_hi:'सुनील दत्त',         role:'HC',               station_id:H.PS_ADARSH, district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0 },
  { id:'U_SHO003', username:'sho_adarsh_nagar',      badge_no:'SHO003', name_en:'Geeta Pillai',    name_hi:'गीता पिल्लई',        role:'SHO',              station_id:H.PS_ADARSH, district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0 },
  { id:'U_ACP002', username:'acp_nwd_subdiv0',       badge_no:'ACP002', name_en:'Dinesh Rawat',    name_hi:'दिनेश रावत',         role:'ACP',              station_id:null, district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0 },
  { id:'U_DO002',  username:'dcp_nwd',               badge_no:'DO002',  name_en:'Manish Gupta',    name_hi:'मनीष गुप्ता',        role:'DISTRICT_OFFICER', station_id:null, district_id:H.DIST_NWD, sub_div_id:null },
  // HQ
  { id:'U_HQ001',  username:'hq_analyst',            badge_no:'HQ001',  name_en:'Anita Verma',     name_hi:'अनिता वर्मा',        role:'HQ_ANALYST',       station_id:null, district_id:null, sub_div_id:null },
  { id:'U_HQ002',  username:'hq_admin',              badge_no:'HQ002',  name_en:'Suresh Gupta',    name_hi:'सुरेश गुप्ता',       role:'HQ_ADMIN',         station_id:null, district_id:null, sub_div_id:null },
  { id:'U_SA001',  username:'system_admin',          badge_no:'SA001',  name_en:'System Admin',    name_hi:'सिस्टम व्यवस्थापक', role:'SYSTEM_ADMIN',     station_id:null, district_id:null, sub_div_id:null },
].map(u => ({ ...u, password_hash: PW, is_active: true }));

// ── DATA GENERATORS ────────────────────────────────────────────────────────────
const LOCS_NDD = ['Connaught Place', 'Parliament Street', 'Janpath', 'Patel Chowk', 'Rajpath'];
const LOCS_NWD = ['Adarsh Nagar', 'Shalimar Bagh', 'Mukherji Nagar', 'Model Town', 'Subhash Place'];
const IO_NAMES  = ['Insp. Sharma', 'Insp. Verma', 'SI Gupta', 'Insp. Singh', 'SI Tiwari'];
const CRIME_HEADS = ['Theft', 'Robbery', 'Murder', 'M.V. Theft', 'Snatching'];
const IPC_SECS    = ['302', '420', '379', '392', '66C'];

const pad  = n => String(n).padStart(2, '0');
const pad4 = n => String(n).padStart(4, '0');
const pad8 = n => String(n).padStart(8, '0');

function caseData(i, ps) {
  const loc = (ps === H.PS_PARLIAMENT || ps === H.PS_CONNAUGHT) ? LOCS_NDD[i%5] : LOCS_NWD[i%5];
  const caseType = ['cctns(manual FIR)', 'eTheft', 'eMVT', 'NCRP', 'zero FIR'][i%5];
  const complainantNames = ['Rahul Kumar','Priya Singh','Amit Jain','Meera Patel','Suresh Verma'];
  const parentNames = ['Rajesh Kumar','Harpal Singh','Mohan Jain','Ramesh Patel','Dinesh Verma'];
  
  const localHead = CRIME_HEADS[i%5];

  // Phone details conditional on local_head: 'Mobile Theft', 'Snatching', 'Robbery'
  const phoneFields = {};
  if (['Mobile Theft', 'Snatching', 'Robbery'].includes(localHead)) {
    phoneFields.phone_make = ['Apple', 'Samsung', 'OnePlus', 'Google'][i%4];
    phoneFields.phone_model = ['iPhone 15', 'Galaxy S24', '12', 'Pixel 8'][i%4];
    phoneFields.phone_imei = `35876510${pad8(i*77)}`;
    phoneFields.phone_color = ['Black', 'Silver', 'Blue', 'Green'][i%4];
    phoneFields.phone_status = ['RECOVERED', 'NOT_RECOVERED', 'PARTIAL'][i%3];
  }

  // Vehicle details conditional on local_head: 'M.V. Theft', 'M.V. Accessories Theft', 'Cycle Theft', 'Robbery', 'Snatching'
  const vehicleFields = {};
  if (['M.V. Theft', 'M.V. Accessories Theft', 'Cycle Theft', 'Robbery', 'Snatching'].includes(localHead)) {
    vehicleFields.vehicle_no = `DL-${i%9+1}C-AQ-${1000+i}`;
    vehicleFields.vehicle_type = ['Car', 'Motorcycle', 'Scooter', 'Cycle'][i%4];
    
    // cd_uploaded_24h conditional on local_head: 'M.V. Theft', 'M.V. Accessories Theft'
    if (['M.V. Theft', 'M.V. Accessories Theft'].includes(localHead)) {
      vehicleFields.cd_uploaded_24h = i%2 === 0 ? 'Yes' : 'No';
    }
  }

  return {
    case_type: caseType,
    fir_no: `FIR/2026/${1000+i}`,   fir_date: `2026-05-${pad(i%28+1)}`,
    gd_no: `GD/2026/${2000+i}`,     gd_date: `2026-05-${pad(i%28+1)}`,
    gd_time: `${pad((i*3)%24)}:${pad((i*7)%60)}`, beat_no: `B-${(i%10)+1}`,
    occurrence_date: `2026-05-${pad(i%28+1)}`,
    time_of_occurrence: `${pad((i*2+8)%24)}:${pad((i*13)%60)}`,
    occurrence_time: `${pad((i*2+8)%24)}:${pad((i*13)%60)}`,
    occurrence_place: `${loc}, New Delhi`,
    local_head: localHead, act_name: ['IPC','NDPS Act','IPC'][i%3],
    sections: IPC_SECS[i%5],
    brief_facts: `Complaint received from complainant. ${loc} area. Police reached scene and registered FIR. Investigation ongoing.`,
    complainant_name: complainantNames[i%5],
    complainant_parent_name: parentNames[i%5],
    complainant_father_husband_name: parentNames[i%5],
    complainant_address: `${100+i}, ${loc}, New Delhi - 110001`,
    accused_name: i%3===0 ? '' : `Accused-${i}`, 
    accused_father_name: i%3===0 ? '' : `AccusedParent-${i}`,
    accused_address: i%3===0 ? '' : `Unknown, New Delhi`,
    io_name: IO_NAMES[i%5], io_pis: `PIS${10000+i}`, io_mobile: `98${pad8(10000000+i*7)}`,
    property_description: i%2===0 ? `Mobile phone, cash Rs.${(i+1)*500}` : '',
    property_status: ['Stolen','Recovered','NA'][i%3],
    status: ['Open','Chargesheeted','Open','Closed','Open'][i%5],
    cctns_flag: caseType === 'cctns(manual FIR)', zero_fir_flag: caseType === 'zero FIR', remarks: '',
    footage_collected: i%2 === 0 ? 'Yes' : 'No',
    rc_no: `RC-${100000+i}`,
    disposal_type: ['Challan', 'Untrace', 'Cancel'][i%3],
    cause_of_death: localHead === 'Murder' ? 'Murder' : 'Accidental',
    deceased_father_husband_name: `DeceasedParent-${i}`,
    is_important: i%4 === 0,
    ...phoneFields,
    ...vehicleFields,
  };
}

function arrestData(i, ps) {
  const loc = (ps === H.PS_PARLIAMENT || ps === H.PS_CONNAUGHT) ? LOCS_NDD[i%5] : LOCS_NWD[i%5];
  const firstNames = ['Mohan','Sohan','Ram','Shyam','Gita'];
  const lastNames  = ['Lal','Kumar','Singh','Prasad','Devi'];
  const parentFirstNames = ['Hari','Shiv','Ram','Vishnu','Durga'];
  const RANKS = ['Inspector','Sub-Inspector','ASI','Head Constable','Inspector'];
  return {
    linked_fir_dd_no: `FIR/2026/${1000+i}`,
    act_name: ['IPC','NDPS Act','Prevention of Corruption Act'][i%3],
    sections: IPC_SECS[i%5],
    arrested_name: `${firstNames[i%5]} ${lastNames[i%5]}`,
    parents_name: `${parentFirstNames[i%5]} ${lastNames[i%5]}`,
    arrested_father_husband_name: `${parentFirstNames[i%5]} ${lastNames[i%5]}`,
    age_gender: `${25+(i*3)%30} / ${['Male','Female','Male','Male','Female'][i%5]}`,
    age: 25+(i*3)%30,
    arrested_address: `${50+i}, ${loc}, Delhi`,
    arrest_date: `2026-05-${pad(i%28+1)}`, arrest_place: `Near market, ${loc}`,
    crime_head: ['IPC','LOCAL','PREVENTIVE'][i%3],
    status: ['judicial_custody','police_custody','bail','released','others'][i%5],
    other_status_reason: i%5===4 ? 'Surrendered voluntarily' : '',
    io_name: IO_NAMES[i%5], io_rank: RANKS[i%5], io_mobile: `98${pad8(20000000+i*11)}`,
    nafis_prepared: i%2===0, dossier_prepared: i%3===0,
    
    // New fields:
    bad_character: i%3 === 0 ? 'Yes' : 'No',
    proclaimed_offender: i%4 === 0,
    listed_criminal: i%5 === 0,
    stolen_property: i%2 === 0 ? `Stolen gold chain value approx Rs.${(i+1)*5000}` : '',
    fir_date: `2026-05-${pad(i%28+1)}`,
    
    // Schemes
    integrated_pi: i%2 === 0 ? 'Yes' : 'No',
    group_patrolling: i%3 === 0 ? 'Yes' : 'No',
    cycle_patrolling: i%4 === 0 ? 'Yes' : 'No',
    by_antisnatching_team: i%5 === 0 ? 'Yes' : 'No',
    by_prahari: i%2 === 0 ? 'Yes' : 'No',
    by_eyes_ears_scheme_members: i%3 === 0 ? 'Yes' : 'No',

    // Financial
    cheated_amount: i%3 === 0 ? `Rs. ${50000 + i*15000}` : '',
    modus_operandi: i%3 === 0 ? 'Created fake website and lured victim into investing money.' : '',
  };
}

function pcrData(i) {
  const loc = LOCS_NDD[i%5];
  return {
    pcr_no: `PCR/2026/${3000+i}`, gd_no: `GD/2026/${4000+i}`,
    gd_date: `2026-06-${pad(i%17+1)}`, gd_time: `${pad((i*4)%24)}:${pad((i*11)%60)}`,
    call_head: ['Simple Hurt','Murder','Theft In Shop','Other IPC','Day Burglary','Robbery'][i%6],
    call_gist: `PCR call regarding ${['neighbour dispute','road accident','theft complaint','domestic issue','medical emergency','suspicious activity'][i%6]} at ${loc}. Beat officer deputed immediately.`,
    caller_name: `Caller-${i}`, caller_mobile: `70${pad8(10000000+i*9)}`,
    io_name: IO_NAMES[i%5], arrival_time: `${pad((i*2)%24)}:${pad((i*5)%60)}`,
    status: ['attended','fir_registered','no_cognizable'][i%3],
  };
}

function missingData(i) {
  const minor = i%3===0;
  return {
    dd_no: `DD/2026/${5000+i}`, dd_date: `2026-05-${pad(i%28+1)}`,
    missing_name: `${['Ankit','Priya','Ravi','Sunita','Mohan'][i%5]} ${['Sharma','Gupta','Singh','Verma','Yadav'][i%5]}`,
    age: String(minor ? (i%10)+8 : (i%40)+20), gender: ['Male','Female','Male','Female','Other'][i%5],
    major_minor: minor ? 'Minor' : 'Major',
    missing_date: `2026-05-${pad(i%28+1)}`,
    missing_place: ['Old Delhi Rly Stn','Chandni Chowk market','New Delhi Rly Stn','Nehru Place'][i%4],
    physical_description: `Ht ~${150+(i%30)}cm, ${['fair','wheatish','dark'][i%3]} complexion, ${['short','medium','long'][i%3]} hair`,
    informant_name: `${['Father','Mother','Brother','Sister'][i%4]} of missing`,
    informant_mobile: `91${pad8(10000000+i*13)}`,
    io_name: IO_NAMES[i%5], zipnet_no: `ZN2026${pad4(1000+i)}`,
    status: ['Missing','Traced','Missing','Closed','Missing'][i%5],
    
    // New fields:
    missing_address: `${10+i}, Sector-${i%10}, Rohini, Delhi`,
    source: i%2 === 0 ? 'PCR' : 'DD',
  };
}

function uidbData(i) {
  return {
    dd_no: `DD/2026/${6000+i}`, found_date: `2026-05-${pad(i%28+1)}`,
    found_place: `Near ${['railway track Paharganj','Yamuna Pushta','isolated plot Sadar Bazar','road NH-8'][i%4]}, Delhi`,
    gender: ['Male','Female','Unknown'][i%3], approx_age: `${25+(i*7)%40}-${35+(i*7)%40} yrs`,
    description: `${['Tall','Medium','Short'][i%3]} build, ${['blue shirt','saree','torn clothes'][i%3]}, no ID found`,
    io_name: IO_NAMES[i%5], informant_name: `${['Railway staff','Passerby','Local resident','Shopkeeper'][i%4]}`,
    zipnet_no: `ZN2026${pad4(2000+i)}`, identified: i%4===0,
    status: ['Unidentified, held in mortuary','Identified, body claimed','Referred to district hospital'][i%3],
  };
}

function makeData(type, i, ps) {
  switch (type) {
    case 'CASE':     return caseData(i, ps);
    case 'ARREST':   return arrestData(i, ps);
    case 'PCR_CALL': return pcrData(i);
    case 'MISSING':  return missingData(i);
    case 'UIDB':     return uidbData(i);
  }
}

// ── RECORD CONFIG TABLE ────────────────────────────────────────────────────────
const RECS = [
  // NDD / Parliament Street PS ──────────────────────────────────────────────────
  // Dates are relative to today so daily diary always has current data.
  { id:'R_NDD_C01', type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(57), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:0  },
  { id:'R_NDD_C02', type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(53), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:1  },
  { id:'R_NDD_C03', type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(48), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:2  },
  { id:'R_NDD_C04', type:'CASE',    status:'ARCHIVED',       level:'HQ',       date:D(68), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:3  },
  { id:'R_NDD_C05', type:'CASE',    status:'DISTRICT_REVIEW',level:'DISTRICT', date:D(20), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:4  },
  { id:'R_NDD_C06', type:'CASE',    status:'PENDING_SHO',    level:'PS',       date:D(3),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:5  },
  { id:'R_NDD_C07', type:'CASE',    status:'SENT_BACK',      level:'PS',       date:D(7),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:6  },
  { id:'R_NDD_C08', type:'CASE',    status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:7  },
  { id:'R_NDD_C09', type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(46), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC003', di:8  },
  { id:'R_NDD_C10', type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(43), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC003', di:9  },
  { id:'R_NDD_A01', type:'ARREST',  status:'HQ_RECEIVED',    level:'HQ',       date:D(55), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:10 },
  { id:'R_NDD_A02', type:'ARREST',  status:'HQ_RECEIVED',    level:'HQ',       date:D(50), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:11 },
  { id:'R_NDD_A03', type:'ARREST',  status:'DISTRICT_REVIEW',level:'DISTRICT', date:D(18), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:12 },
  { id:'R_NDD_A04', type:'ARREST',  status:'PENDING_SHO',    level:'PS',       date:D(1),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:13 },
  { id:'R_NDD_A05', type:'ARREST',  status:'SENT_BACK',      level:'PS',       date:D(5),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:14 },
  { id:'R_NDD_A06', type:'ARREST',  status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC003', di:15 },
  { id:'R_NDD_A07', type:'ARREST',  status:'HQ_RECEIVED',    level:'HQ',       date:D(36), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC003', di:16 },
  { id:'R_NDD_P01', type:'PCR_CALL',status:'HQ_RECEIVED',    level:'HQ',       date:D(54), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:17 },
  { id:'R_NDD_P02', type:'PCR_CALL',status:'HQ_RECEIVED',    level:'HQ',       date:D(49), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:18 },
  { id:'R_NDD_P03', type:'PCR_CALL',status:'PENDING_SHO',    level:'PS',       date:D(2),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:19 },
  { id:'R_NDD_P04', type:'PCR_CALL',status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:20 },
  { id:'R_NDD_P05', type:'PCR_CALL',status:'HQ_RECEIVED',    level:'HQ',       date:D(44), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC003', di:21 },
  { id:'R_NDD_M01', type:'MISSING', status:'HQ_RECEIVED',    level:'HQ',       date:D(52), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:22 },
  { id:'R_NDD_M02', type:'MISSING', status:'PENDING_SHO',    level:'PS',       date:D(4),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:23 },
  { id:'R_NDD_M03', type:'MISSING', status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC003', di:24 },
  { id:'R_NDD_U01', type:'UIDB',    status:'HQ_RECEIVED',    level:'HQ',       date:D(47), ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:25 },
  { id:'R_NDD_U02', type:'UIDB',    status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_PARLIAMENT, district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_1, creator:'U_HC001', di:26 },
  // NDD / Connaught Place PS ────────────────────────────────────────────────────
  { id:'R_CP_C01',  type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(56), ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:27 },
  { id:'R_CP_C02',  type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(51), ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:28 },
  { id:'R_CP_C03',  type:'CASE',    status:'DISTRICT_REVIEW',level:'DISTRICT', date:D(22), ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:29 },
  { id:'R_CP_C04',  type:'CASE',    status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:30 },
  { id:'R_CP_A01',  type:'ARREST',  status:'HQ_RECEIVED',    level:'HQ',       date:D(45), ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:31 },
  { id:'R_CP_A02',  type:'ARREST',  status:'PENDING_SHO',    level:'PS',       date:D(2),  ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:32 },
  { id:'R_CP_P01',  type:'PCR_CALL',status:'HQ_RECEIVED',    level:'HQ',       date:D(42), ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:33 },
  { id:'R_CP_P02',  type:'PCR_CALL',status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:34 },
  { id:'R_CP_M01',  type:'MISSING', status:'HQ_RECEIVED',    level:'HQ',       date:D(39), ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:35 },
  { id:'R_CP_U01',  type:'UIDB',    status:'DISTRICT_REVIEW',level:'DISTRICT', date:D(15), ps_id:H.PS_CONNAUGHT,  district_id:H.DIST_NDD, sub_div_id:H.SUB_NDD_0, creator:'U_HC004', di:36 },
  // NWD / Adarsh Nagar PS ───────────────────────────────────────────────────────
  { id:'R_NWD_C01', type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(56), ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:37 },
  { id:'R_NWD_C02', type:'CASE',    status:'HQ_RECEIVED',    level:'HQ',       date:D(50), ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:38 },
  { id:'R_NWD_C03', type:'CASE',    status:'DISTRICT_REVIEW',level:'DISTRICT', date:D(21), ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:39 },
  { id:'R_NWD_C04', type:'CASE',    status:'PENDING_SHO',    level:'PS',       date:D(3),  ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:40 },
  { id:'R_NWD_C05', type:'CASE',    status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:41 },
  { id:'R_NWD_A01', type:'ARREST',  status:'HQ_RECEIVED',    level:'HQ',       date:D(53), ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:42 },
  { id:'R_NWD_A02', type:'ARREST',  status:'PENDING_SHO',    level:'PS',       date:D(2),  ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:43 },
  { id:'R_NWD_A03', type:'ARREST',  status:'SENT_BACK',      level:'PS',       date:D(6),  ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:44 },
  { id:'R_NWD_P01', type:'PCR_CALL',status:'HQ_RECEIVED',    level:'HQ',       date:D(47), ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:45 },
  { id:'R_NWD_P02', type:'PCR_CALL',status:'HQ_RECEIVED',    level:'HQ',       date:D(41), ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:46 },
  { id:'R_NWD_P03', type:'PCR_CALL',status:'DRAFT',          level:'PS',       date:D(0),  ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:47 },
  { id:'R_NWD_M01', type:'MISSING', status:'HQ_RECEIVED',    level:'HQ',       date:D(45), ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:48 },
  { id:'R_NWD_M02', type:'MISSING', status:'PENDING_SHO',    level:'PS',       date:D(4),  ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:49 },
  { id:'R_NWD_U01', type:'UIDB',    status:'HQ_RECEIVED',    level:'HQ',       date:D(38), ps_id:H.PS_ADARSH,     district_id:H.DIST_NWD, sub_div_id:H.SUB_NWD_0, creator:'U_HC002', di:50 },
];

// ── WORKFLOW HELPERS ───────────────────────────────────────────────────────────
function getSHO(ps_id) {
  if (ps_id === H.PS_PARLIAMENT) return 'U_SHO001';
  if (ps_id === H.PS_CONNAUGHT)  return 'U_SHO002';
  return 'U_SHO003';
}
function getDO(district_id) {
  return district_id === H.DIST_NDD ? 'U_DO001' : 'U_DO002';
}

function makeTransitions(rec) {
  const { id, status, creator, ps_id, district_id, date } = rec;
  const sho = getSHO(ps_id), doUser = getDO(district_id);
  const ts = [], at = new Date(date + 'T10:00:00Z').toISOString();
  let seq = 1;
  const add = (from_status, to_status, from_level, to_level, action, performed_by, comment = null) =>
    ts.push({ id:`WT_${id}_${seq++}`, record_id:id, from_status, to_status, from_level, to_level,
              action, performed_by, performed_at:at, comment, target_fields:null });

  if (status === 'DRAFT') return ts;
  add('DRAFT','PENDING_SHO','PS','PS','SUBMIT',creator);
  if (status === 'SENT_BACK') {
    add('PENDING_SHO','SENT_BACK','PS','PS','SEND_BACK',sho,'Please correct IO name and section details before resubmitting.');
    return ts;
  }
  if (['DISTRICT_REVIEW','HQ_RECEIVED','ARCHIVED'].includes(status))
    add('PENDING_SHO','DISTRICT_REVIEW','PS','DISTRICT','APPROVE',sho);
  if (['HQ_RECEIVED','ARCHIVED'].includes(status))
    add('DISTRICT_REVIEW','HQ_RECEIVED','DISTRICT','HQ','APPROVE',doUser);
  if (status === 'ARCHIVED')
    add('HQ_RECEIVED','ARCHIVED','HQ','HQ','CLOSE','U_HQ002','Verified and archived after compilation.');
  return ts;
}

function makeRevisions(rec) {
  const { id, status, creator, ps_id, district_id } = rec;
  const sho = getSHO(ps_id), doUser = getDO(district_id);
  const rv = [];
  let seq = 1;
  const add = (changed_by, level, change_type, field_changes, comment = null) =>
    rv.push({ id:`RV_${id}_${seq++}`, record_id:id, revision_number:seq-1, changed_by, level,
              change_type, field_changes:JSON.stringify(field_changes), comment, reason:null, ip_address:'10.0.0.1' });

  add(creator, 'PS', 'CREATE', []);
  if (status === 'DRAFT') return rv;
  add(creator, 'PS', 'STATUS_CHANGE', [{field_key:'current_status',old_value:'DRAFT',new_value:'PENDING_SHO'}]);
  if (status === 'PENDING_SHO') return rv;
  if (status === 'SENT_BACK') {
    add(sho, 'PS', 'STATUS_CHANGE', [{field_key:'current_status',old_value:'PENDING_SHO',new_value:'SENT_BACK'}], 'Please correct IO name and section details.');
    return rv;
  }
  add(sho, 'DISTRICT', 'LEVEL_TRANSITION', [{field_key:'current_status',old_value:'PENDING_SHO',new_value:'DISTRICT_REVIEW'}]);
  if (status === 'DISTRICT_REVIEW') return rv;
  add(doUser, 'HQ', 'LEVEL_TRANSITION', [{field_key:'current_status',old_value:'DISTRICT_REVIEW',new_value:'HQ_RECEIVED'}]);
  if (status === 'HQ_RECEIVED') return rv;
  if (status === 'ARCHIVED')
    add('U_HQ002', 'HQ', 'STATUS_CHANGE', [{field_key:'current_status',old_value:'HQ_RECEIVED',new_value:'ARCHIVED'}], 'Archived after verification.');
  return rv;
}

// ── COMPILATIONS ───────────────────────────────────────────────────────────────
const HQ_IDS_NDD = RECS.filter(r => r.district_id === H.DIST_NDD && r.status === 'HQ_RECEIVED').map(r => r.id);
const HQ_IDS_NWD = RECS.filter(r => r.district_id === H.DIST_NWD && r.status === 'HQ_RECEIVED').map(r => r.id);

const COMPILATIONS = [
  {
    id: 'COMP_NDD_MAY26', source_level:'DISTRICT', target_level:'HQ', route:'OPS_CHAIN',
    period:'2026-05-31', source_entity_id:H.DIST_NDD, status:'SUBMITTED',
    record_ids: JSON.stringify(HQ_IDS_NDD.slice(0, 8)),
    compiled_summary: JSON.stringify({ total_records:8, by_type:{CASE:3,ARREST:3,PCR_CALL:1,MISSING:1}, period:'2026-05', district:'New Delhi District' }),
    submitted_by:'U_DO001', submitted_at:new Date('2026-06-01T09:00:00Z').toISOString(),
  },
  {
    id: 'COMP_NWD_MAY26', source_level:'DISTRICT', target_level:'HQ', route:'OPS_CHAIN',
    period:'2026-05-31', source_entity_id:H.DIST_NWD, status:'DRAFT',
    record_ids: JSON.stringify(HQ_IDS_NWD), compiled_summary:null, submitted_by:null, submitted_at:null,
  },
  {
    id: 'COMP_NDD_JUN26', source_level:'DISTRICT', target_level:'HQ', route:'OPS_CHAIN',
    period:'2026-06-30', source_entity_id:H.DIST_NDD, status:'DRAFT',
    record_ids: JSON.stringify([]), compiled_summary:null, submitted_by:null, submitted_at:null,
  },
];

const COMPILATION_RECORDS = COMPILATIONS.flatMap(c =>
  JSON.parse(c.record_ids).map((rid, i) => ({ id:`CR_${c.id}_${i}`, compilation_id:c.id, record_id:rid }))
);

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
const NOTIFICATIONS = [
  { id:'N01', user_id:'U_HC001',  record_id:'R_NDD_C07', is_read:false, title_en:'Record Sent Back', title_hi:'रिकॉर्ड वापस भेजा गया', message_en:'Your CASE record R_NDD_C07 has been sent back by SHO. Please correct IO name.', message_hi:'आपका CASE रिकॉर्ड R_NDD_C07 SHO द्वारा वापस भेजा गया है।' },
  { id:'N02', user_id:'U_HC001',  record_id:'R_NDD_A05', is_read:false, title_en:'Record Sent Back', title_hi:'रिकॉर्ड वापस भेजा गया', message_en:'Your ARREST record R_NDD_A05 has been sent back by SHO. Please verify sections.', message_hi:'आपका ARREST रिकॉर्ड R_NDD_A05 SHO द्वारा वापस भेजा गया है।' },
  { id:'N03', user_id:'U_HC001',  record_id:'R_NDD_C09', is_read:true,  title_en:'Record Approved by SHO', title_hi:'SHO द्वारा रिकॉर्ड स्वीकृत', message_en:'Your CASE record has been approved by SHO and forwarded to District.', message_hi:'आपका CASE रिकॉर्ड SHO द्वारा स्वीकृत किया गया।' },
  { id:'N04', user_id:'U_SHO001', record_id:'R_NDD_C06', is_read:false, title_en:'New Record Pending Approval', title_hi:'नया रिकॉर्ड स्वीकृति हेतु लंबित', message_en:'A new CASE record from HC Ramesh Kumar is awaiting your approval.', message_hi:'HC रमेश कुमार का नया CASE रिकॉर्ड आपकी स्वीकृति हेतु लंबित है।' },
  { id:'N05', user_id:'U_SHO001', record_id:'R_NDD_A04', is_read:false, title_en:'New Record Pending Approval', title_hi:'नया रिकॉर्ड स्वीकृति हेतु लंबित', message_en:'A new ARREST record is awaiting your approval.', message_hi:'एक नया ARREST रिकॉर्ड आपकी स्वीकृति हेतु लंबित है।' },
  { id:'N06', user_id:'U_SHO001', record_id:'R_NDD_M02', is_read:true,  title_en:'Missing Person Record Submitted', title_hi:'लापता व्यक्ति रिकॉर्ड सबमिट', message_en:'A MISSING person record has been submitted for your review.', message_hi:'एक लापता व्यक्ति रिकॉर्ड आपकी समीक्षा हेतु सबमिट किया गया है।' },
  { id:'N07', user_id:'U_DO001',  record_id:'R_NDD_C05', is_read:false, title_en:'Record at District Review', title_hi:'रिकॉर्ड जिला समीक्षा में', message_en:'CASE record R_NDD_C05 has reached District level for review.', message_hi:'CASE रिकॉर्ड R_NDD_C05 जिला स्तर पर समीक्षा हेतु पहुंचा।' },
  { id:'N08', user_id:'U_DO001',  record_id:null,         is_read:false, title_en:'Compilation Ready for Submission', title_hi:'संकलन सबमिशन के लिए तैयार', message_en:'May 2026 compilation for New Delhi District is ready for submission to HQ.', message_hi:'नई दिल्ली जिले का मई 2026 संकलन HQ को सबमिट करने के लिए तैयार है।' },
  { id:'N09', user_id:'U_HQ001',  record_id:null,         is_read:false, title_en:'New Compilation Received', title_hi:'नया संकलन प्राप्त', message_en:'Compilation from New Delhi District (May 2026) has been received at HQ.', message_hi:'नई दिल्ली जिले का संकलन (मई 2026) HQ में प्राप्त हुआ।' },
  { id:'N10', user_id:'U_HC002',  record_id:'R_NWD_A03', is_read:false, title_en:'Record Sent Back', title_hi:'रिकॉर्ड वापस भेजा गया', message_en:'Your ARREST record has been sent back by SHO. Please review.', message_hi:'आपका ARREST रिकॉर्ड SHO द्वारा वापस भेजा गया है।' },
  { id:'N11', user_id:'U_SHO003', record_id:'R_NWD_C04', is_read:false, title_en:'New Record Pending Approval', title_hi:'नया रिकॉर्ड स्वीकृति हेतु लंबित', message_en:'A new CASE record from HC Sunil Dutt is awaiting your approval.', message_hi:'HC सुनील दत्त का नया CASE रिकॉर्ड आपकी स्वीकृति हेतु लंबित है।' },
];

// ── FILTER PRESETS ─────────────────────────────────────────────────────────────
const FILTER_PRESETS = [
  { id:'FP_01', name_en:'Pending Records', name_hi:'लंबित रिकॉर्ड', scope:'SYSTEM', scope_id:null, filter_spec:JSON.stringify({ operator:'AND', conditions:[{ field:'current_status', op:'IN', value:['PENDING_SHO','DISTRICT_REVIEW'] }] }), applicable_record_types:JSON.stringify(['CASE','ARREST','PCR_CALL','MISSING','UIDB']), created_by:'U_SA001', is_active:true, created_at:new Date().toISOString() },
  { id:'FP_02', name_en:'Murder Cases', name_hi:'हत्या के मामले', scope:'SYSTEM', scope_id:null, filter_spec:JSON.stringify({ operator:'AND', conditions:[{ field:'data.local_head', op:'EQ', value:'Murder' }] }), applicable_record_types:JSON.stringify(['CASE']), created_by:'U_HQ001', is_active:true, created_at:new Date().toISOString() },
  { id:'FP_03', name_en:'June 2026 Records', name_hi:'जून 2026 रिकॉर्ड', scope:'SYSTEM', scope_id:null, filter_spec:JSON.stringify({ operator:'AND', conditions:[{ field:'record_date', op:'GTE', value:'2026-06-01' }] }), applicable_record_types:JSON.stringify(['CASE','ARREST','PCR_CALL','MISSING','UIDB']), created_by:'U_SA001', is_active:true, created_at:new Date().toISOString() },
];

// ── PHASE-2 CONFIG ─────────────────────────────────────────────────────────────
const WF_CONFIG = [
  { id:'WTC_01', record_type:'*', from_status:'DRAFT',           to_status:'PENDING_SHO',     action:'submit',    allowed_roles:JSON.stringify(['HC']),                          requires_comment:false, sla_hours:24,   is_active:true },
  { id:'WTC_02', record_type:'*', from_status:'PENDING_SHO',     to_status:'DISTRICT_REVIEW', action:'approve',   allowed_roles:JSON.stringify(['SHO']),                         requires_comment:false, sla_hours:48,   is_active:true },
  { id:'WTC_03', record_type:'*', from_status:'PENDING_SHO',     to_status:'SENT_BACK',       action:'send_back', allowed_roles:JSON.stringify(['SHO']),                         requires_comment:true,  sla_hours:null, is_active:true },
  { id:'WTC_04', record_type:'*', from_status:'SENT_BACK',       to_status:'PENDING_SHO',     action:'submit',    allowed_roles:JSON.stringify(['HC']),                          requires_comment:false, sla_hours:24,   is_active:true },
  { id:'WTC_05', record_type:'*', from_status:'DISTRICT_REVIEW', to_status:'HQ_RECEIVED',     action:'approve',   allowed_roles:JSON.stringify(['DISTRICT_OFFICER']),            requires_comment:false, sla_hours:48,   is_active:true },
  { id:'WTC_06', record_type:'*', from_status:'DISTRICT_REVIEW', to_status:'SENT_BACK',       action:'send_back', allowed_roles:JSON.stringify(['DISTRICT_OFFICER']),            requires_comment:true,  sla_hours:null, is_active:true },
  { id:'WTC_07', record_type:'*', from_status:'HQ_RECEIVED',     to_status:'ARCHIVED',        action:'archive',   allowed_roles:JSON.stringify(['HQ_ADMIN','SYSTEM_ADMIN']),     requires_comment:false, sla_hours:null, is_active:true },
  { id:'WTC_08', record_type:'*', from_status:'HQ_RECEIVED',     to_status:'COMPILED',        action:'compile',   allowed_roles:JSON.stringify(['DISTRICT_OFFICER','HQ_ADMIN']), requires_comment:false, sla_hours:null, is_active:true },
];

const LEVEL_CONTRACTS = [
  { id:'LDC_PS_DIST_ALL',  from_level:'PS',       to_level:'DISTRICT', route:'OPS_CHAIN', record_type:'*', visible_field_keys:JSON.stringify(['case_type','fir_no','fir_date','local_head','occurrence_place','io_name','status','brief_facts','arrested_name','arrest_date','crime_head','pcr_no','call_head','missing_name','missing_date','found_date','found_place']), aggregate_definitions:JSON.stringify([]), is_active:true, updated_at:new Date().toISOString() },
  { id:'LDC_DIST_HQ_ALL',  from_level:'DISTRICT', to_level:'HQ',       route:'OPS_CHAIN', record_type:'*', visible_field_keys:JSON.stringify(['case_type','fir_no','fir_date','local_head','occurrence_place','status','brief_facts','crime_head','call_head','missing_name','found_date']), aggregate_definitions:JSON.stringify([{ type:'count', label_en:'Total Records', label_hi:'कुल रिकॉर्ड' }, { type:'count_by', field:'local_head', label_en:'By Crime Head', label_hi:'अपराध शीर्ष अनुसार' }]), is_active:true, updated_at:new Date().toISOString() },
];

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function seed() {
  await connectDB();
  console.log('Clearing test tables (truncate in dependency order)...');

  await db('audit_logs').del();
  await db('custom_field_values').del();
  await db('custom_field_definitions').del();
  await db('notifications').del();
  await db('compilation_records').del();
  await db('compilations').del();
  await db('report_jobs').del();
  await db('workflow_transitions').del();
  await db('record_revisions').del();
  try { await db('record_links').del(); } catch (_) {}
  await db('records').del();
  await db('filter_presets').del();
  for (const t of ['level_data_contracts','workflow_transitions_config','legacy_amendments','legacy_import_batches','scheduled_reports']) {
    try { await db(t).del(); } catch (_) {}
  }

  // Users — DO NOTHING on conflict: permanent users from seeds/02_users.js stay; test extras get added
  console.log('Seeding users...');
  await db('users').insert(USERS).onConflict('badge_no').ignore();

  // Records + revisions + transitions
  console.log('Seeding records...');
  const allRevisions = [], allTransitions = [];
  for (const rec of RECS) {
    const updater = ['DRAFT','PENDING_SHO','SENT_BACK'].includes(rec.status)
      ? rec.creator : ['DISTRICT_REVIEW'].includes(rec.status)
      ? getSHO(rec.ps_id) : getDO(rec.district_id);

    await db('records').insert({
      id: rec.id, record_type: rec.type,
      ps_id: rec.ps_id, district_id: rec.district_id, sub_div_id: rec.sub_div_id,
      data: JSON.stringify(makeData(rec.type, rec.di, rec.ps_id)),
      current_status: rec.status, current_level: rec.level,
      record_date: rec.date, created_by: rec.creator, updated_by: updater, is_legacy: false,
    });
    allRevisions.push(...makeRevisions(rec));
    allTransitions.push(...makeTransitions(rec));
  }
  if (allRevisions.length)   await db('record_revisions').insert(allRevisions);
  if (allTransitions.length) await db('workflow_transitions').insert(allTransitions);
  console.log(`  ${RECS.length} records, ${allRevisions.length} revisions, ${allTransitions.length} transitions`);

  // Record links (CASE -> ARREST)
  try {
    const linkType = await db('link_type_registry').where({ code:'CASE_ARREST' }).first();
    if (linkType) {
      const LINKS = [
        { source_record_id:'R_NDD_C01', target_record_id:'R_NDD_A01', created_by:'U_HC001' },
        { source_record_id:'R_NDD_C02', target_record_id:'R_NDD_A02', created_by:'U_HC001' },
        { source_record_id:'R_NDD_C03', target_record_id:'R_NDD_A03', created_by:'U_HC001' },
        { source_record_id:'R_CP_C01',  target_record_id:'R_CP_A01',  created_by:'U_HC004' },
        { source_record_id:'R_NWD_C01', target_record_id:'R_NWD_A01', created_by:'U_HC002' },
      ];
      await db('record_links').insert(LINKS.map(l => ({ ...l, link_type_id:linkType.id, metadata:'{}' })));
      console.log(`  ${LINKS.length} CASE_ARREST record links`);
    }
  } catch (e) { console.warn(`  (record_links skipped: ${e.message})`); }

  // Compilations
  console.log('Seeding compilations...');
  await db('compilations').insert(COMPILATIONS);
  if (COMPILATION_RECORDS.length) await db('compilation_records').insert(COMPILATION_RECORDS);

  // Notifications
  console.log('Seeding notifications...');
  await db('notifications').insert(NOTIFICATIONS.map(n => ({ ...n, created_at:new Date().toISOString() })));

  // Audit logs
  console.log('Seeding audit logs...');
  const auditLogs = [];
  let seq = 1;
  for (const u of ['U_HC001','U_SHO001','U_DO001','U_HQ001','U_HQ002','U_SA001','U_HC002','U_SHO003','U_DO002']) {
    const role = USERS.find(x => x.id === u)?.role;
    auditLogs.push({ id:`AL${seq++}`, table_name:'users', record_id:u, action:'LOGIN', changed_by_id:u, changed_by_role:role, changed_at:new Date().toISOString(), ip_address:'10.0.0.1' });
  }
  for (const r of RECS.slice(0, 8)) {
    auditLogs.push({ id:`AL${seq++}`, table_name:'records', record_id:r.id, action:'CREATE', changed_by_id:r.creator, changed_by_role:'HC', changed_at:new Date(r.date+'T09:00:00Z').toISOString(), ip_address:'10.0.0.1' });
  }
  auditLogs.push({ id:`AL${seq++}`, table_name:'compilations', record_id:'COMP_NDD_MAY26', action:'SUBMIT', changed_by_id:'U_DO001', changed_by_role:'DISTRICT_OFFICER', changed_at:new Date('2026-06-01T09:00:00Z').toISOString(), ip_address:'10.0.0.2' });
  await db('audit_logs').insert(auditLogs);

  // Filter presets
  console.log('Seeding filter presets...');
  await db('filter_presets').insert(FILTER_PRESETS);

  // Phase-2 tables (skip gracefully if not migrated)
  try {
    await db('workflow_transitions_config').insert(WF_CONFIG);
    console.log('  workflow_transitions_config seeded');
  } catch (_) { console.warn('  (workflow_transitions_config skipped — run Phase 2 migration first)'); }

  try {
    await db('level_data_contracts').insert(LEVEL_CONTRACTS);
    console.log('  level_data_contracts seeded');
  } catch (_) { console.warn('  (level_data_contracts skipped — run Phase 2 migration first)'); }

  console.log('\nSeed complete!');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST ACCOUNTS (all passwords: Test@1234)');
  console.log('───────────────────────────────────────────────────────────────');
  const summary = [
    ['HC001','hc_parliament_street','HC','PS Parliament Street, NDD'],
    ['HC003','hc_parliament_2','HC','PS Parliament Street, NDD (2nd HC)'],
    ['HC004','hc_connaught_place','HC','PS Connaught Place, NDD'],
    ['SHO001','sho_parliament_street','SHO','PS Parliament Street, NDD'],
    ['SHO002','sho_connaught_place','SHO','PS Connaught Place, NDD'],
    ['ACP001','acp_ndd_subdiv1','ACP','Sub-Div 1, NDD'],
    ['DO001','dcp_ndd','DISTRICT_OFFICER','New Delhi District'],
    ['JCP001','jcp_new_delhi_range','JCP','New Delhi Range'],
    ['SCP001','scp_zone_2','SCP','Zone 2'],
    ['HC002','hc_adarsh_nagar','HC','PS Adarsh Nagar, NWD'],
    ['SHO003','sho_adarsh_nagar','SHO','PS Adarsh Nagar, NWD'],
    ['ACP002','acp_nwd_subdiv0','ACP','Sub-Div 0, NWD'],
    ['DO002','dcp_nwd','DISTRICT_OFFICER','North West District'],
    ['HQ001','hq_analyst','HQ_ANALYST','HQ'],
    ['HQ002','hq_admin','HQ_ADMIN','HQ'],
    ['SA001','system_admin','SYSTEM_ADMIN','HQ'],
  ];
  for (const [badge, user, role, scope] of summary)
    console.log(`  ${badge.padEnd(7)} | ${user.padEnd(26)} | ${role.padEnd(20)} | ${scope}`);
  console.log(`\nRecords: ${RECS.length} | Compilations: ${COMPILATIONS.length} | Notifications: ${NOTIFICATIONS.length}`);
  console.log('───────────────────────────────────────────────────────────────');

  await db.destroy();
}

seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
