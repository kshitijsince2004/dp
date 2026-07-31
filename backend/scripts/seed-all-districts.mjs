// backend/scripts/seed-all-districts.mjs
// 2 PS users per district + comprehensive record coverage for all report columns.
// Safe to re-run: user inserts use ON CONFLICT IGNORE.

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import db from '../src/config/db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

// ── Dates ─────────────────────────────────────────────────────────────────────
const D = {
  TODAY:     '2026-07-30',
  YESTERDAY: '2026-07-29',
  D7:        '2026-07-23',
  FORT_MID:  '2026-07-20',
  PREV_FORT: '2026-07-05',
  YTD:       '2026-02-15',
  Y1_FORT:   '2025-07-18',
  Y1_EARLY:  '2025-02-15',
  Y2_EARLY:  '2024-02-15',
  PRE_BNS:   '2024-05-20',
  BNS_ERA:   '2024-08-20',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function yr(d) { return parseInt(d.split('-')[0]); }
function ts(d, t = '10:30:00') { return `${d}T${t}Z`; }

const firCtrs = new Map();
function nextFir(psId, year) {
  const k = `${psId}::${year}`;
  const n = (firCtrs.get(k) || 0) + 1;
  firCtrs.set(k, n);
  return pad(n, 4);
}

// ── Name / data pools ─────────────────────────────────────────────────────────
const M = ['Rajesh Kumar','Sandeep Singh','Mohd. Irfan Khan','Virender Sharma',
  'Suresh Chand','Deepak Yadav','Ankit Gupta','Pawan Kumar','Gurpreet Singh',
  'Rakesh Chauhan','Faizan Ahmed','Satish Kumar','Amit Verma','Rohit Kaushik',
  'Naresh Tiwari','Tejpal Singh','Vijay Pandey','Mukesh Agarwal','Kuldeep Nagar',
  'Dinesh Rawat','Mohd. Aslam','Harjinder Singh','Pradeep Sharma','Saurabh Jain'];
const F = ['Anita Devi','Nasreen Begum','Sunita Kumari','Rekha Verma','Meena Yadav',
  'Harjinder Kaur','Kavita Singh','Renu Gupta','Sushma Bhatia','Asha Rani',
  'Priya Malhotra','Neha Joshi','Geeta Rawat','Saroj Kumari','Poonam Sharma','Rubina Khatoon'];
const FATHERS = ['Sh. Ram Lal','Sh. Hari Ram','Sh. Bhagwan Dass','Sh. Ram Nath',
  'Sh. Narayan Singh','Sh. Shiv Kumar','Sh. Mohan Lal','Sh. Sita Ram',
  'Sh. Abdul Rashid','Sh. Gurmail Singh','Sh. Bhupender Kumar'];
const ACCUSED = [
  {name:'Ramesh @ Kalu',age:24},{name:'Vicky @ Chhotu',age:22},
  {name:'Mohd. Sajid @ Bunty',age:29},{name:'Deepak Kumar @ Tillu',age:27},
  {name:'Rahul Singh @ Monu',age:21},{name:'Amit Kumar @ Golu',age:26},
  {name:'Sonu @ Takla',age:31},{name:'Vijay @ Kalia',age:28},
  {name:'Asif Khan @ Chiku',age:23},{name:'Suresh @ Lambu',age:30},
];
const IOS = ['SI Rakesh Kumar','ASI Jitender Singh','Insp. Satish Kumar',
  'SI Naresh Chand','ASI Anil Verma','SI Pardeep Kumar','Insp. Suresh Pal',
  'SI Rajeev Sharma','ASI Yogesh Pal','SI Bhupesh Kumar'];
const CUSTODY = ['J/C','P/C','Bail','J/C','J/C','Notice u/s 35(1) BNSS'];
const STATUSES = ['DRAFT','SUBMITTED','SUBMITTED','APPROVED'];

const DIST_COL = {
  'NEW DELHI':  ['Connaught Place','Janpath','India Gate Area','Sansad Marg','Mandir Marg'],
  'NORTH':      ['Civil Lines','Kotwali Marg','Sadar Bazar','Kashmere Gate','Subzi Mandi'],
  'CENTRAL':    ['Paharganj','Karol Bagh','Patel Nagar','Rajendra Place','Anand Parbat'],
  'SOUTH':      ['Hauz Khas','Saket','Malviya Nagar','Greater Kailash-I','Chirag Delhi'],
  'SOUTH EAST': ['Lajpat Nagar','Okhla Phase-I','Jasola','Sarita Vihar','Kalkaji'],
  'SOUTH WEST': ['Dwarka Sector-10','Janakpuri B-Block','Uttam Nagar','Vikaspuri','Bindapur'],
  'WEST':       ['Rajouri Garden','Moti Nagar','Punjabi Bagh','Madipur','Kirti Nagar'],
  'EAST':       ['Laxmi Nagar','Preet Vihar','Mayur Vihar Phase-2','Gandhinagar','Shakarpur'],
  'NORTH EAST': ['Yamuna Vihar Block-B','Bhajanpura','Nand Nagri','Seelampur','Gokulpuri'],
  'NORTH WEST': ['Rohini Sector-7','Pitampura','Shalimar Bagh','Keshav Puram','Ashok Vihar'],
  'SHAHDARA':   ['Shahdara A-Block','Vivek Vihar','Dilshad Garden','Mansarovar Park','Welcome Colony'],
  'OUTER':      ['Mundka','Nangloi Jat Colony','Paschim Vihar','Peeragarhi','Nihal Vihar'],
  'OUTER NORTH':['Alipur','Narela Industrial Area','Bawana','Samaypur','Burari'],
  'DWARKA':     ['Dwarka Sector-6','Dwarka Sector-23','Uttam Nagar East','Bindapur','Chhawla'],
  'ROHINI':     ['Rohini Sector-3','Rohini Sector-16','Prashant Vihar','Badli','Sanjay Gandhi T.N.'],
  DEFAULT:      ['Laxmi Nagar','Rohini Sector-3','Dwarka Sector-6','Saket','Mayur Vihar Phase-1'],
};
function colony(distName) {
  if (!distName) return rnd(DIST_COL.DEFAULT);
  const u = distName.toUpperCase();
  for (const [k, arr] of Object.entries(DIST_COL)) {
    if (k !== 'DEFAULT' && u.includes(k)) return rnd(arr);
  }
  return rnd(DIST_COL.DEFAULT);
}

// ── Insert helpers ────────────────────────────────────────────────────────────

async function insertCase(ps, crime, date, opts = {}) {
  const {
    source = 'MANUAL',
    isWorkedOut = Math.random() > 0.35,
    organisedCrime = false,
    cdUploaded = null,
    footageCollected = null,
    disposalType = null,
    addOffenceActId = null,
    addVehicleProp = false,
    addDrugProp = false,
    AUTO_MC = 4,
    AUTO_CAR = 11,
    DRUG_GANJA = 401,
  } = opts;

  const caseId = uuidv4();
  const fir = nextFir(ps.ps_id, yr(date));
  const col = colony(ps.distName);
  const io = rnd(IOS);
  const compName = crime.victimF ? rnd(F) : rnd(M);

  await db('records').insert({
    id: caseId, record_type: 'CASE',
    ps_id: ps.ps_id, district_id: ps.district_id, sub_div_id: ps.sub_div_id || null,
    record_date: date, current_status: rnd(STATUSES),
    source_system: source,
    created_by: ps.userId, updated_by: ps.userId,
    created_at: ts(date), updated_at: ts(date),
  });

  await db('fir_details').insert({
    record_id: caseId, ps_id: ps.ps_id,
    fir_no: fir, fir_year: yr(date), fir_date: date,
    gd_no: String(rndInt(1, 99)), gd_date: date,
    gd_time: `${pad(rndInt(6, 9))}:${pad(rndInt(10, 59))}:00`,
    case_type: rnd(['FIR', 'FIR', 'FIR', 'DD_CASE']),
    is_worked_out: isWorkedOut,
    worked_out_date: isWorkedOut ? date : null,
    local_head_id: crime.headId,
    brief_facts: `${crime.brief} Complainant: ${compName}, R/o ${col}, Delhi. IO: ${io}.`,
    is_important: crime.heinous && Math.random() > 0.5,
    organised_crime: organisedCrime,
    cd_uploaded_24h: cdUploaded,
    footage_collected: footageCollected,
    disposal_type: disposalType,
    created_at: ts(date), updated_at: ts(date),
  });

  // Complainant
  await db('persons').insert({
    id: uuidv4(), record_id: caseId, role: 'COMPLAINANT',
    name: compName, relative_name: rnd(FATHERS),
    relation_type: crime.victimF ? rnd(['FATHER', 'HUSBAND']) : 'FATHER',
    gender: crime.victimF ? 'FEMALE' : 'MALE',
    age: rndInt(25, 55), mobile: `98${rndInt(10000000, 99999999)}`,
    sort_order: 0, created_at: ts(date), updated_at: ts(date),
  });

  // Victim (skip for police-action crime heads)
  const skipVictim = [101, 102, 103, 105, 135].includes(crime.headId);
  if (!skipVictim) {
    const vn = crime.victimF ? rnd(F) : rnd(M);
    await db('persons').insert({
      id: uuidv4(), record_id: caseId, role: 'VICTIM',
      name: vn, relative_name: rnd(FATHERS),
      relation_type: crime.victimF ? rnd(['FATHER', 'HUSBAND', 'GUARDIAN']) : 'FATHER',
      gender: crime.victimF ? 'FEMALE' : 'MALE',
      age: rndInt(18, 60), mobile: `97${rndInt(10000000, 99999999)}`,
      sort_order: 1, created_at: ts(date), updated_at: ts(date),
    });
  }

  // Accused (worked-out cases)
  if (isWorkedOut) {
    const acc = rnd(ACCUSED);
    await db('persons').insert({
      id: uuidv4(), record_id: caseId, role: 'ACCUSED',
      name: acc.name, relative_name: rnd(FATHERS), relation_type: 'FATHER',
      gender: 'MALE', age: acc.age, sort_order: 2,
      created_at: ts(date), updated_at: ts(date),
    });
  }

  // Record offence (act-based cases)
  if (addOffenceActId) {
    await db('record_offences').insert({
      id: uuidv4(), record_id: caseId, act_id: addOffenceActId,
      is_primary: true, sort_order: 0,
      created_at: ts(date), updated_at: ts(date),
    }).catch(() => {});
  }

  // Stolen vehicle property (MVT / DP Act)
  if (addVehicleProp) {
    const isTwoWheeler = Math.random() > 0.5;
    await db('record_properties').insert({
      id: uuidv4(), record_id: caseId,
      status: 'STOLEN',
      automobile_id: isTwoWheeler ? AUTO_MC : AUTO_CAR,
      vehicle_no: `DL${rndInt(1, 9)}C${String.fromCharCode(65 + rndInt(0, 25))}${String.fromCharCode(65 + rndInt(0, 25))}${rndInt(1000, 9999)}`,
      vehicle_make: rnd(['Honda Activa', 'Hero Splendor', 'TVS Jupiter', 'Hyundai Creta', 'Maruti Swift', 'Honda City']),
      details: 'Vehicle stolen from outside residence / public place.',
      estimated_value: rndInt(40000, 800000),
      sort_order: 0, created_at: ts(date), updated_at: ts(date),
    });
  }

  // Drug seizure property (NDPS)
  if (addDrugProp) {
    await db('record_properties').insert({
      id: uuidv4(), record_id: caseId,
      status: 'SEIZED',
      drug_type_id: rnd([DRUG_GANJA, 404, 395, 393]),
      details: `${rndInt(50, 500)} grams of contraband substance seized from accused person.`,
      estimated_value: rndInt(5000, 200000),
      sort_order: 0, created_at: ts(date), updated_at: ts(date),
    });
  }

  return { caseId, fir };
}

async function insertArrest(ps, crime, date, opts = {}) {
  const { caseType = 'FIR', linkedFir = null, source = 'MANUAL' } = opts;
  const arrestId = uuidv4();
  const io = rnd(IOS);
  const acc = rnd(ACCUSED);

  await db('records').insert({
    id: arrestId, record_type: 'ARREST',
    ps_id: ps.ps_id, district_id: ps.district_id, sub_div_id: ps.sub_div_id || null,
    record_date: date, current_status: rnd(['SUBMITTED', 'SUBMITTED', 'APPROVED']),
    source_system: source,
    created_by: ps.userId, updated_by: ps.userId,
    created_at: ts(date, '15:00:00'), updated_at: ts(date, '15:00:00'),
  });

  await db('arrest_details').insert({
    record_id: arrestId,
    gd_no: String(rndInt(50, 150)), gd_date: date, gd_time: '15:00:00',
    case_type: caseType,
    fir_no: linkedFir || null, fir_date: linkedFir ? date : null,
    is_dd_based: caseType === 'DD_CASE',
    local_head_id: crime.headId,
    arresting_officer_name: io,
    arresting_officer_rank: io.split(' ')[0],
    custody_status: rnd(CUSTODY),
    nafis_prepared: Math.random() > 0.4,
    dossier_prepared: Math.random() > 0.5,
    recovery: caseType !== 'KALANDAR' ? `${crime.name}: recovery of incriminating material during search of accused.` : null,
    integrated_pi: Math.random() > 0.7,
    group_patrolling: Math.random() > 0.6,
    by_antisnatching_team: crime.headId === 9 && Math.random() > 0.5,
    by_prahari: Math.random() > 0.8,
    by_eyes_ears_scheme_members: Math.random() > 0.7,
    created_at: ts(date, '15:00:00'), updated_at: ts(date, '15:00:00'),
  });

  const arresteeId = uuidv4();
  await db('persons').insert({
    id: arresteeId, record_id: arrestId, role: 'ARRESTEE',
    name: acc.name, relative_name: rnd(FATHERS), relation_type: 'FATHER',
    gender: 'MALE', age: acc.age, mobile: `99${rndInt(10000000, 99999999)}`,
    sort_order: 0, created_at: ts(date, '15:00:00'), updated_at: ts(date, '15:00:00'),
  });

  await db('arrestee_details').insert({
    person_id: arresteeId,
    arrest_date: date, arrest_time: `15:${pad(rndInt(0, 59))}:00`,
    prev_involvement_count: rndInt(0, 5),
    is_po: Math.random() < 0.08,
    is_bc: Math.random() < 0.12,
    created_at: ts(date, '15:00:00'), updated_at: ts(date, '15:00:00'),
  });
}

async function insertPcr(ps, date) {
  const pcrId = uuidv4();
  const ch = rnd(['Quarrel', 'Medical Emergency', 'Theft', 'Road Accident',
                  'Domestic Violence', 'Suspicious Person', 'Lost Child']);
  const incHr = rndInt(8, 19);

  await db('records').insert({
    id: pcrId, record_type: 'PCR_CALL',
    ps_id: ps.ps_id, district_id: ps.district_id, sub_div_id: ps.sub_div_id || null,
    record_date: date, current_status: 'SUBMITTED',
    created_by: ps.userId, created_at: ts(date, '08:30:00'), updated_at: ts(date, '08:30:00'),
  });

  await db('pcr_call_details').insert({
    record_id: pcrId,
    pcr_no: `PCR${rndInt(1000, 9999)}`,
    gd_no: String(rndInt(1, 99)), gd_date: date,
    gd_time: `${pad(rndInt(8, 20))}:${pad(rndInt(0, 59))}:00`,
    call_head: ch,
    call_gist: `PCR call regarding ${ch.toLowerCase()} near ${colony(ps.distName)}. Response team dispatched.`,
    incident_datetime: `${date}T${pad(incHr)}:${pad(rndInt(0, 59))}:00Z`,
    arrival_time: `${pad(Math.min(incHr + 1, 23))}:${pad(rndInt(5, 30))}:00`,
    action_taken: 'Parties counselled. Matter resolved at spot. Report submitted to PS.',
    final_call_status: rnd(['RESOLVED', 'RESOLVED', 'UNRESOLVED', 'REFERRED']),
    created_at: ts(date, '08:30:00'), updated_at: ts(date, '08:30:00'),
  });
}

async function insertMissing(ps, date, opts = {}) {
  const { type = 'ADULT', status = 'PENDING', gender = 'MALE', age = null } = opts;
  const missingId = uuidv4();
  const personId = uuidv4();
  const pName = gender === 'FEMALE' ? rnd(F) : rnd(M);
  const pAge = age !== null ? age : (type === 'CHILD' ? rndInt(5, 17) : rndInt(18, 65));

  await db('records').insert({
    id: missingId, record_type: 'MISSING',
    ps_id: ps.ps_id, district_id: ps.district_id, sub_div_id: ps.sub_div_id || null,
    record_date: date, current_status: 'SUBMITTED',
    created_by: ps.userId, created_at: ts(date), updated_at: ts(date),
  });

  await db('persons').insert({
    id: personId, record_id: missingId, role: 'MISSING',
    name: pName, relative_name: rnd(FATHERS),
    relation_type: gender === 'FEMALE' ? rnd(['FATHER', 'HUSBAND']) : 'FATHER',
    gender: gender === 'FEMALE' ? 'FEMALE' : 'MALE',
    age: pAge, sort_order: 0, created_at: ts(date), updated_at: ts(date),
  });

  await db('missing_details').insert({
    record_id: missingId,
    gd_no: String(rndInt(1, 99)), gd_date: date,
    missing_type: type, missing_status: status,
    operator_name: rnd(IOS), source: 'COMPLAINT', case_registered: false,
    created_at: ts(date), updated_at: ts(date),
  });
}

async function insertUidb(ps, date, opts = {}) {
  const { identified = false } = opts;
  const uidbId = uuidv4();

  await db('records').insert({
    id: uidbId, record_type: 'UIDB',
    ps_id: ps.ps_id, district_id: ps.district_id, sub_div_id: ps.sub_div_id || null,
    record_date: date, current_status: 'SUBMITTED',
    created_by: ps.userId, created_at: ts(date), updated_at: ts(date),
  });

  await db('uidb_details').insert({
    record_id: uidbId,
    uidb_no: `UIDB${rndInt(1, 999)}`,
    gd_no: String(rndInt(1, 99)), gd_date: date,
    found_date: date,
    found_time: `${pad(rndInt(6, 20))}:00:00`,
    duty_officer: rnd(IOS),
    identified,
    cause_of_death: rnd(['Asphyxia', 'Head Injury', 'Drowning', 'Poisoning', 'Unknown Causes', 'Natural Causes']),
    uidb_status: identified ? 'IDENTIFIED' : 'PENDING',
    filed_by_acp_sdm: Math.random() > 0.5,
    created_at: ts(date), updated_at: ts(date),
  });
}

// ── Crime catalogue ───────────────────────────────────────────────────────────
const ALL_CRIMES = {
  DACOITY:     { headId:1,   heinous:true,  victimF:false, brief:'Armed dacoity at a gold shop. Four miscreants looted ornaments worth Rs 8 Lakhs.' },
  MURDER:      { headId:2,   heinous:true,  victimF:false, brief:'Fatal stabbing during quarrel near market. Victim succumbed at RML Hospital.' },
  ATT_MURDER:  { headId:3,   heinous:true,  victimF:false, brief:'Firing by motorcycle-borne assailants. Victim sustained gunshot injury on shoulder.' },
  ROBBERY:     { headId:4,   heinous:true,  victimF:true,  brief:'Robbery of gold chain and mobile at knifepoint near metro station subway.' },
  RIOT:        { headId:5,   heinous:true,  victimF:false, brief:'Unlawful assembly and stone pelting between groups following property dispute. Four injured.' },
  RANSOM:      { headId:6,   heinous:true,  victimF:false, brief:"Kidnapping of businessman's son with demand of Rs 25 Lakhs ransom." },
  RAPE:        { headId:7,   heinous:true,  victimF:true,  brief:'Sexual assault under false pretext of marriage.' },
  EXTORTION:   { headId:8,   heinous:false, victimF:false, brief:'Extortion demand of Rs 5 Lakhs under threat of violence by local goons.' },
  SNATCHING:   { headId:9,   heinous:false, victimF:false, brief:'Snatching of iPhone 15 Pro by bike-borne miscreants near metro station.' },
  HURT:        { headId:10,  heinous:false, victimF:false, brief:'Causing hurt with iron rod during road rage at traffic intersection.' },
  GRIEV_HURT:  { headId:11,  heinous:false, victimF:false, brief:'Grievous hurt with blunt object. Victim sustained fracture of arm.' },
  BURGLARY:    { headId:12,  heinous:false, victimF:false, brief:'House breaking during night. Cash Rs 85,000 and silver utensils stolen.' },
  KIDNAPPING:  { headId:14,  heinous:false, victimF:true,  brief:'Kidnapping of 14-year-old from school bus stand by unknown persons.' },
  MVT:         { headId:16,  heinous:false, victimF:false, brief:'Theft of vehicle parked outside residence. No eyewitness. CCTV being examined.' },
  SERVANT:     { headId:17,  heinous:false, victimF:false, brief:'Theft of cash Rs 1.2 Lakhs and gold wrist watch by domestic help.' },
  HOUSE_THEFT: { headId:18,  heinous:false, victimF:false, brief:'Theft of laptop and cash Rs 35,000 from unlocked ground floor apartment.' },
  OTHER_THEFT: { headId:19,  heinous:false, victimF:false, brief:'Theft of copper cable wire worth Rs 2.8 Lakhs from DMRC construction site.' },
  PICKPOCKET:  { headId:21,  heinous:false, victimF:false, brief:'Pickpocket stole wallet and mobile in crowded market near bus stand.' },
  SIMPLE_ACC:  { headId:29,  heinous:false, victimF:false, brief:'Road accident: car collided with auto-rickshaw. Driver sustained grievous injuries.' },
  FATAL_ACC:   { headId:30,  heinous:false, victimF:false, brief:'Fatal road accident: speeding truck hit scooter near GT road. Rider died on spot.' },
  MO_WOMEN:    { headId:31,  heinous:false, victimF:true,  brief:'Criminal force to outrage modesty of woman in parking area near market.' },
  CBT:         { headId:37,  heinous:false, victimF:false, brief:'Criminal breach of trust by business partner. Rs 3.5 Lakhs misappropriated.' },
  CHEATING:    { headId:38,  heinous:false, victimF:false, brief:'Cyber fraud of Rs 95,000 via phishing link sent as KYC update message.' },
  FORGERY:     { headId:39,  heinous:false, victimF:false, brief:'Forgery of property documents to claim false ownership of plot.' },
  CRUELTY:     { headId:43,  heinous:false, victimF:true,  brief:'Dowry harassment and cruelty by husband and in-laws. Demanded Rs 3 Lakhs cash.' },
  DOWRY_DEATH: { headId:44,  heinous:true,  victimF:true,  brief:'Unnatural death of married woman within 7 years of marriage. In-laws suspected.' },
  EVE_TEAS:    { headId:54,  heinous:false, victimF:true,  brief:'Eve teasing and molestation of woman near bus stand by two miscreants.' },
  DRUGGING:    { headId:59,  heinous:false, victimF:false, brief:'Administering intoxicant substance to victim in hotel room. Recovery made.' },
  ARMS:        { headId:101, heinous:false, victimF:false, brief:'Seizure of countrymade pistol (Katta) with 2 live cartridges during night patrolling.' },
  EXCISE:      { headId:102, heinous:false, victimF:false, brief:'Illegal transportation of 40 cartons of illicit liquor in private vehicle.' },
  GAMBLING:    { headId:103, heinous:false, victimF:false, brief:'Recovery of stake money Rs 35,000 from public gambling den during PS raid.' },
  NDPS:        { headId:105, heinous:false, victimF:false, brief:'Seizure of 180 grams Ganja from drug peddler operating near school gate.' },
  DP_ACT:      { headId:135, heinous:false, victimF:false, brief:'Vehicle seized creating nuisance. Action u/s 66 Delhi Police Act.' },
  POCSO:       { headId:205, heinous:false, victimF:true,  brief:'Case U/s POCSO Act. Sexual harassment of 12-year-old child by neighbour.' },
  DAY_BURG:    { headId:209, heinous:false, victimF:false, brief:'Day burglary. House broken into while family was away. Cash and jewellery taken.' },
  NIGHT_BURG:  { headId:210, heinous:false, victimF:false, brief:'Night burglary. Lock broken. Electronic items and cash stolen.' },
  OTHER_IPC:   { headId:99,  heinous:false, victimF:false, brief:'Case registered under other IPC provisions. Investigation underway.' },
  OTHER_BNS:   { headId:215, heinous:false, victimF:false, brief:'Case registered under other BNS provisions. Investigation underway.' },
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function seedAllDistricts() {
  console.log('─── SEED ALL DISTRICTS ───');

  // Reference checks
  const validHeads = new Set(await db('ref.local_heads').pluck('local_head_cd'));
  const allActs = await db('ref.acts').select('act_cd', 'act_long');
  const findAct = (re) => allActs.find(a => re.test(a.act_long))?.act_cd;
  const ACT_ARMS   = findAct(/arms act.*1959/i)               || 4;
  const ACT_NDPS   = findAct(/narcotic drugs.*1985/i)         || 48;
  const ACT_GAMBLE = findAct(/delhi.*gambling/i)              || 2612;
  const ACT_EXCISE = findAct(/delhi excise act.*2009/i)       || 3032;
  const ACT_IT     = findAct(/information technology act 2000/i) || 2625;
  const ACT_DP     = findAct(/delhi police act/i)             || 2118;
  console.log(`Acts: ARMS=${ACT_ARMS} NDPS=${ACT_NDPS} GAMBLE=${ACT_GAMBLE} EXCISE=${ACT_EXCISE} IT=${ACT_IT} DP=${ACT_DP}`);

  const DRUG_GANJA = 401;
  const AUTO_MC = 4;
  const AUTO_CAR = 11;
  const propRef = { DRUG_GANJA, AUTO_MC, AUTO_CAR };

  // Seed firCtrs from existing DB rows so re-runs don't collide
  const existingFirs = await db('fir_details as fd')
    .join('records as r', 'r.id', 'fd.record_id')
    .whereNotNull('fd.fir_year')
    .whereRaw("fd.fir_no ~ '^[0-9]+$'")
    .select('r.ps_id', 'fd.fir_year', db.raw('MAX(CAST(fd.fir_no AS INTEGER)) as max_no'))
    .groupBy('r.ps_id', 'fd.fir_year');
  for (const row of existingFirs) {
    firCtrs.set(`${row.ps_id}::${row.fir_year}`, parseInt(row.max_no));
  }
  console.log(`FIR counters pre-seeded for ${existingFirs.length} PS+year combinations`);

  // Filter crimes to heads that exist in DB
  const C = {};
  for (const [k, c] of Object.entries(ALL_CRIMES)) {
    if (validHeads.has(c.headId)) C[k] = c;
    else console.warn(`  ⚠ head_id ${c.headId} (${k}) not found in ref.local_heads — skipped`);
  }

  const defaultUser = await db('users').first('id');
  if (!defaultUser) { console.error('No users — run db:seed first'); process.exit(1); }

  // Select 2 PS per district
  const psRows = await db('hierarchy_nodes as ps')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'ps.parent_id')
    .leftJoin('hierarchy_nodes as dist', 'dist.id', 'sd.parent_id')
    .where('ps.node_type', 'PS')
    .select('ps.id as ps_id', 'ps.name as ps_name', 'ps.code as ps_code',
            'sd.id as sub_div_id', 'dist.id as district_id', 'dist.name as district_name')
    .orderBy(['dist.name', 'ps.name']);

  const byDist = new Map();
  for (const ps of psRows) {
    if (!ps.district_id) continue;
    if (!byDist.has(ps.district_id)) byDist.set(ps.district_id, { name: ps.district_name, list: [] });
    byDist.get(ps.district_id).list.push(ps);
  }

  const selected = [];
  for (const [, { name, list }] of byDist) {
    for (const ps of list.slice(0, 2)) selected.push({ ...ps, distName: name });
  }
  console.log(`Selected ${selected.length} PS from ${byDist.size} districts`);

  // Create HC + SHO users
  const pwHash = bcrypt.hashSync('Test@1234', 10);
  let badgeSeq = 3000;
  let userCount = 0;

  for (let i = 0; i < selected.length; i++) {
    const ps = selected[i];
    const base = ps.ps_code.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 43);
    for (const [role, pfx] of [['HC', 'hc_'], ['SHO', 'sho_']]) {
      const uname = `${pfx}${base}`.substring(0, 50);
      const badge = `DS${pad(badgeSeq++, 4)}${role}`;
      await db('users').insert({
        username: uname, badge_no: badge,
        name: `${role} ${ps.ps_name}`.substring(0, 100),
        password_hash: pwHash, role,
        ps_id: ps.ps_id, district_id: ps.district_id, sub_div_id: ps.sub_div_id || null,
        is_active: true,
      }).onConflict('username').ignore();
      userCount++;
    }
    const sho = await db('users').where('username', `sho_${base}`.substring(0, 50)).first('id');
    selected[i].userId = sho?.id || defaultUser.id;
  }
  console.log(`User rows attempted: ${userCount} (duplicates silently skipped)`);

  // Seed records
  let nCase = 0, nArrest = 0, nPcr = 0, nMiss = 0, nUidb = 0;

  for (const ps of selected) {
    console.log(`  ${ps.ps_name} (${ps.distName})`);
    try {
      const ic = (crime, date, opts) => {
        if (!crime) return Promise.resolve();
        return insertCase(ps, crime, date, { ...propRef, ...opts }).then(() => { nCase++; });
      };
      const ia = (crime, date, opts) => {
        if (!crime) return Promise.resolve();
        return insertArrest(ps, crime, date, opts).then(() => { nArrest++; });
      };

      // TODAY — all heinous + special heads
      await ic(C.DACOITY,    D.TODAY);
      await ic(C.MURDER,     D.TODAY);
      await ic(C.ATT_MURDER, D.TODAY);
      await ic(C.ROBBERY,    D.TODAY);
      await ic(C.RIOT,       D.TODAY);
      await ic(C.RAPE,       D.TODAY);
      await ic(C.DOWRY_DEATH,D.TODAY);
      await ic(C.RANSOM,     D.TODAY);
      await ic(C.SNATCHING,  D.TODAY, { source: 'E_THEFT' });
      await ic(C.MVT,        D.TODAY, { source: 'E_MVT', cdUploaded: true, footageCollected: true, addVehicleProp: true });
      await ic(C.PICKPOCKET, D.TODAY);
      await ic(C.EVE_TEAS,   D.TODAY);

      // YESTERDAY — remaining non-heinous + E-FIR variants
      await ic(C.MURDER,      D.YESTERDAY);
      await ic(C.ROBBERY,     D.YESTERDAY, { source: 'E_THEFT' });
      await ic(C.SNATCHING,   D.YESTERDAY);
      await ic(C.BURGLARY,    D.YESTERDAY, { source: 'E_THEFT' });
      await ic(C.MVT,         D.YESTERDAY, { source: 'E_MVT', cdUploaded: false, footageCollected: true, addVehicleProp: true });
      await ic(C.HOUSE_THEFT, D.YESTERDAY, { source: 'E_THEFT' });
      await ic(C.CHEATING,    D.YESTERDAY, { source: 'NCRP' });
      await ic(C.CHEATING,    D.YESTERDAY, { source: 'E_THEFT' });
      await ic(C.CRUELTY,     D.YESTERDAY);
      await ic(C.MO_WOMEN,    D.YESTERDAY);

      // D7 — local-act cases + day/night burglary + special attributes
      await ic(C.ARMS,       D.D7, { addOffenceActId: ACT_ARMS });
      await ic(C.EXCISE,     D.D7, { addOffenceActId: ACT_EXCISE });
      await ic(C.GAMBLING,   D.D7, { addOffenceActId: ACT_GAMBLE });
      await ic(C.NDPS,       D.D7, { addOffenceActId: ACT_NDPS, addDrugProp: true });
      await ic(C.DAY_BURG,   D.D7);
      await ic(C.NIGHT_BURG, D.D7);
      await ic(C.HURT,       D.D7);
      await ic(C.GRIEV_HURT, D.D7);
      await ic(C.DRUGGING,   D.D7);
      await ic(C.EXTORTION,  D.D7);
      await ic(C.DACOITY,    D.D7, { organisedCrime: true });

      // FORT_MID — POCSO, accidents, DP Act, misc heads
      await ic(C.POCSO,      D.FORT_MID);
      await ic(C.FATAL_ACC,  D.FORT_MID);
      await ic(C.SIMPLE_ACC, D.FORT_MID);
      await ic(C.DP_ACT,     D.FORT_MID, { addOffenceActId: ACT_DP, addVehicleProp: true });
      await ic(C.OTHER_IPC,  D.FORT_MID);
      await ic(C.OTHER_BNS,  D.FORT_MID);
      await ic(C.FORGERY,    D.FORT_MID, { addOffenceActId: ACT_IT });
      await ic(C.KIDNAPPING, D.FORT_MID);
      await ic(C.CBT,        D.FORT_MID);

      // PREV_FORT — disposal types + remaining heads
      await ic(C.MURDER,      D.PREV_FORT, { disposalType: 'CHARGE_SHEET', isWorkedOut: true });
      await ic(C.MVT,         D.PREV_FORT, { source: 'E_MVT', disposalType: 'UNTRACED', isWorkedOut: false, cdUploaded: true, footageCollected: false, addVehicleProp: true });
      await ic(C.HOUSE_THEFT, D.PREV_FORT, { disposalType: 'FINAL_REPORT', isWorkedOut: false });
      await ic(C.CHEATING,    D.PREV_FORT, { source: 'NCRP', disposalType: 'CHARGE_SHEET', isWorkedOut: true });
      await ic(C.SERVANT,     D.PREV_FORT);
      await ic(C.OTHER_THEFT, D.PREV_FORT);

      // YTD — early 2026 spread
      await ic(C.DACOITY,    D.YTD);
      await ic(C.MURDER,     D.YTD);
      await ic(C.RAPE,       D.YTD);
      await ic(C.MVT,        D.YTD, { source: 'E_MVT', cdUploaded: true, footageCollected: true, addVehicleProp: true });
      await ic(C.NDPS,       D.YTD, { addOffenceActId: ACT_NDPS, addDrugProp: true });
      await ic(C.SNATCHING,  D.YTD, { source: 'E_THEFT' });
      await ic(C.BURGLARY,   D.YTD);
      await ic(C.CHEATING,   D.YTD, { source: 'NCRP' });

      // Y1_FORT — corresponding fortnight last year
      await ic(C.DACOITY,    D.Y1_FORT);
      await ic(C.MURDER,     D.Y1_FORT);
      await ic(C.ROBBERY,    D.Y1_FORT);
      await ic(C.RAPE,       D.Y1_FORT);
      await ic(C.SNATCHING,  D.Y1_FORT, { source: 'E_THEFT' });
      await ic(C.BURGLARY,   D.Y1_FORT);
      await ic(C.MVT,        D.Y1_FORT, { source: 'E_MVT', cdUploaded: true, footageCollected: false, addVehicleProp: true });
      await ic(C.CHEATING,   D.Y1_FORT, { source: 'NCRP' });

      // Y1_EARLY — early 2025
      await ic(C.DACOITY,   D.Y1_EARLY);
      await ic(C.MURDER,    D.Y1_EARLY);
      await ic(C.MVT,       D.Y1_EARLY, { source: 'E_MVT', addVehicleProp: true, cdUploaded: false, footageCollected: true });
      await ic(C.RAPE,      D.Y1_EARLY);

      // Y2_EARLY — early 2024 (Y-2 comparison)
      await ic(C.DACOITY,   D.Y2_EARLY);
      await ic(C.MURDER,    D.Y2_EARLY);
      await ic(C.MVT,       D.Y2_EARLY, { source: 'E_MVT', addVehicleProp: true, cdUploaded: true, footageCollected: false });

      // PRE_BNS — IPC era records
      await ic(C.MURDER,    D.PRE_BNS);
      await ic(C.DACOITY,   D.PRE_BNS);
      await ic(C.MVT,       D.PRE_BNS, { source: 'E_MVT', addVehicleProp: true, cdUploaded: true, footageCollected: true });

      // BNS_ERA — early BNS
      await ic(C.MURDER,    D.BNS_ERA);
      await ic(C.ROBBERY,   D.BNS_ERA);
      await ic(C.SNATCHING, D.BNS_ERA);

      // ARRESTS
      for (const c of [C.DACOITY, C.MURDER, C.ROBBERY, C.NDPS, C.ARMS, C.SNATCHING].filter(Boolean)) {
        await ia(c, D.TODAY, { caseType: 'FIR' });
      }
      await ia(C.HURT,      D.TODAY,    { caseType: 'KALANDAR' });
      await ia(C.OTHER_IPC, D.YESTERDAY,{ caseType: 'KALANDAR' });
      await ia(C.SNATCHING, D.YESTERDAY,{ caseType: 'FIR' });
      await ia(C.MVT,       D.YESTERDAY,{ caseType: 'FIR' });
      await ia(C.DACOITY,   D.Y1_FORT, { caseType: 'FIR' });
      await ia(C.MURDER,    D.Y1_FORT, { caseType: 'FIR' });
      await ia(C.ROBBERY,   D.YTD,     { caseType: 'FIR' });

      // PCR CALLS
      for (const d of [D.TODAY, D.TODAY, D.YESTERDAY, D.D7, D.Y1_FORT]) {
        await insertPcr(ps, d); nPcr++;
      }

      // MISSING PERSONS
      await insertMissing(ps, D.TODAY,     { type: 'ADULT', status: 'PENDING', gender: 'MALE' });    nMiss++;
      await insertMissing(ps, D.YESTERDAY, { type: 'ADULT', status: 'PENDING', gender: 'FEMALE' });  nMiss++;
      await insertMissing(ps, D.D7,        { type: 'CHILD', status: 'PENDING', gender: 'MALE',   age: 12 }); nMiss++;
      await insertMissing(ps, D.FORT_MID,  { type: 'CHILD', status: 'PENDING', gender: 'FEMALE', age: 15 }); nMiss++;
      await insertMissing(ps, D.Y1_FORT,   { type: 'ADULT', status: 'TRACED',  gender: 'MALE' });    nMiss++;
      await insertMissing(ps, D.YTD,       { type: 'ADULT', status: 'PENDING', gender: 'FEMALE' });  nMiss++;

      // UIDB
      await insertUidb(ps, D.TODAY,     { identified: false }); nUidb++;
      await insertUidb(ps, D.YESTERDAY, { identified: false }); nUidb++;
      await insertUidb(ps, D.D7,        { identified: true  }); nUidb++;

    } catch (err) {
      console.error(`  ✗ ${ps.ps_name}: ${err.message}`);
    }
  }

  console.log('\n─── COMPLETE ───');
  console.log(`PS:      ${selected.length}  (${byDist.size} districts)`);
  console.log(`Users:   ${userCount} attempted`);
  console.log(`Cases:   ${nCase}`);
  console.log(`Arrests: ${nArrest}`);
  console.log(`PCR:     ${nPcr}`);
  console.log(`Missing: ${nMiss}`);
  console.log(`UIDB:    ${nUidb}`);
  console.log(`Total:   ${nCase + nArrest + nPcr + nMiss + nUidb} records`);
  process.exit(0);
}

seedAllDistricts().catch(err => { console.error('Fatal:', err); process.exit(1); });
