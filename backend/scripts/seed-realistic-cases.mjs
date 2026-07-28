import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import db from '../src/config/db.js';
import { v4 as uuidv4 } from 'uuid';

function getRandomDate(startStr, endStr) {
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const randomTime = start + Math.random() * (end - start);
  const d = new Date(randomTime);
  return d.toISOString().split('T')[0];
}

async function seedRealisticData() {
  console.log('--- SEEDING COMPREHENSIVE REALISTIC DELHI POLICE DATA ---');

  const defaultUser = await db('users').first('id');
  const userId = defaultUser ? defaultUser.id : null;

  // Fetch all PS nodes with district_id and sub_div_id
  const psNodes = await db('hierarchy_nodes as ps')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'ps.parent_id')
    .leftJoin('hierarchy_nodes as dist', 'dist.id', 'sd.parent_id')
    .where('ps.node_type', 'PS')
    .select('ps.id as ps_id', 'ps.name as ps_name', 'sd.id as sub_div_id', 'dist.id as district_id');

  if (psNodes.length === 0) {
    console.error('No PS hierarchy nodes found!');
    process.exit(1);
  }

  console.log(`Found ${psNodes.length} Police Stations in DB.`);

  const sourceSystems = ['MANUAL', 'E_THEFT', 'E_MVT', 'NCRP'];

  const crimeTypes = [
    { head_id: 1, name: 'Dacoity', acts: '310(2) BNS', brief: 'Armed dacoity at jeweler shop. 4 armed robbers barged in, looted gold ornaments worth 8 Lakhs.', heinous: true },
    { head_id: 2, name: 'Murder', acts: '103(1) BNS', brief: 'Fatal stabbing during street quarrel near market. Victim succumbed to knife injuries at RML Hospital.', heinous: true },
    { head_id: 3, name: 'Att. Murder', acts: '109 BNS', brief: 'Firing by motorcycle-borne miscreants following personal enmity. Victim injured in shoulder.', heinous: true },
    { head_id: 4, name: 'Robbery', acts: '309(4) BNS', brief: 'Snatching of gold chain & wallet at knifepoint near subway passage.', heinous: true },
    { head_id: 5, name: 'Riots', acts: '189(2)/191 BNS', brief: 'Unlawful assembly and stone pelting between two local groups following property dispute.', heinous: false },
    { head_id: 6, name: 'Kid. For Ransom', acts: '140(2) BNS', brief: 'Kidnapping of businessman son demanding ransom of Rs 25 Lakhs.', heinous: true },
    { head_id: 7, name: 'Rape', acts: '64 BNS', brief: 'Sexual assault on victim under pretext of marriage.', heinous: true },
    { head_id: 9, name: 'Snatching', acts: '304(2) BNS', brief: 'Snatching of iPhone 15 Pro by bike-borne miscreants while victim was walking on pavement.', heinous: false },
    { head_id: 10, name: 'Hurt', acts: '115(2) BNS', brief: 'Voluntarily causing hurt with iron rod during road rage incident.', heinous: false },
    { head_id: 12, name: 'Burglary', acts: '305/331(4) BNS', brief: 'House breaking and burglary during night hours. Cash Rs 85,000 and silver utensils stolen.', heinous: false },
    { head_id: 16, name: 'MV Theft', acts: '303(2) BNS', brief: 'Theft of Hyundai Creta No. DL-3C-CC-9876 parked outside residential house.', heinous: false },
    { head_id: 17, name: 'Servant Theft', acts: '306 BNS', brief: 'Theft of cash Rs 1.2 Lakhs and wrist watch by domestic help.', heinous: false },
    { head_id: 18, name: 'House Theft', acts: '305 BNS', brief: 'Theft of laptop and camera from unlocked ground floor apartment.', heinous: false },
    { head_id: 19, name: 'Other Theft', acts: '303(2) BNS', brief: 'Theft of copper cable wire from DMRC construction site.', heinous: false },
    { head_id: 28, name: 'M.O. Women', acts: '74 BNS', brief: 'Assault and criminal force to woman with intent to outrage modesty.', heinous: false },
    { head_id: 29, name: 'Kidnapping', acts: '137(2) BNS', brief: 'Kidnapping of minor girl from school bus stand.', heinous: false },
    { head_id: 31, name: 'Fatal Accident', acts: '106(1) BNS', brief: 'Fatal road accident involving speeding truck and scooter near main GT road junction.', heinous: false },
    { head_id: 32, name: 'Simple Accident', acts: '281/125(a) BNS', brief: 'Grievous injury road accident involving car and auto rickshaw.', heinous: false },
    { head_id: 34, name: 'Arms Act', acts: '25/54/59 Arms Act', brief: 'Seizure of countrymade pistol (Katta) with 2 live cartridges during beat patrolling.', heinous: false },
    { head_id: 35, name: 'Excise Act', acts: '33/58 Excise Act', brief: 'Illegal transportation of 40 cartons of illicit liquor in private vehicle.', heinous: false },
    { head_id: 36, name: 'Gambling Act', acts: '12 Gambling Act', brief: 'Public gambling and stake money recovery of Rs 35,000 during raid.', heinous: false },
    { head_id: 37, name: 'NDPS Act', acts: '20/61/85 NDPS Act', brief: 'Seizure of 180 grams Ganja from drug peddler.', heinous: false },
    { head_id: 38, name: 'Cheating', acts: '318(4) BNS', brief: 'Online cyber fraud of Rs 95,000 via phishing link on mobile.', heinous: false },
    { head_id: 41, name: 'POCSO Act', acts: '6 POCSO Act', brief: 'Case registered under POCSO Act regarding harassment of minor.', heinous: false },
    { head_id: 43, name: 'Cruelty by Husband', acts: '85 BNS', brief: 'Dowry harassment and physical cruelty by husband and in-laws.', heinous: false },
    { head_id: 44, name: 'Dowry Death', acts: '80 BNS', brief: 'Unnatural death of married woman within 7 years of marriage.', heinous: true }
  ];

  const complainants = [
    'Rajesh Kumar Sharma', 'Anita Verma', 'Sanjay Gupta', 'Mohd. Aslam',
    'Harpreet Singh', 'Pooja Malhotra', 'Virender Tyagi', 'Sunil Dutt',
    'Deepak Johri', 'Meena Kumari', 'Rakesh Oberoi', 'Gurpreet Kaur'
  ];

  const accusedList = [
    { name: 'Ramesh @ Kalu', age: 24, status: 'J/C' },
    { name: 'Vicky @ Chhotu', age: 22, status: 'P/C' },
    { name: 'Mohd. Sajid', age: 29, status: 'Bail' },
    { name: 'Deepak Kumar @ Tillu', age: 27, status: 'J/C' },
    { name: 'Rahul Singh @ Monu', age: 21, status: 'Notice 35(1) BNSS' },
    { name: 'Amit Kumar @ Golu', age: 26, status: 'J/C' },
    { name: 'Sonu @ Takla', age: 31, status: 'P/C' }
  ];

  const ios = [
    'SI Rakesh Kumar', 'ASI Jitender Singh', 'Insp. Satish Kumar',
    'SI Naresh Chand', 'ASI Anil Verma', 'SI Pardeep Kumar'
  ];

  let recordCount = 0;
  let firCount = 0;
  let arrestCount = 0;

  for (const psNode of psNodes) {
    const distId = psNode.district_id || '21a9ac25-5dfa-4fd7-acff-7ac8ac39b488';
    const subDivId = psNode.sub_div_id || null;

    // For EVERY police station, iterate over EVERY crime type to ensure full matrix coverage
    for (const crime of crimeTypes) {
      const datesForHead = [
        '2026-07-28', // Cutoff Today
        '2026-07-27', // Yesterday
        getRandomDate('2026-01-01', '2026-07-26'), // YTD 2026
        getRandomDate('2025-01-01', '2025-07-28')  // YTD 2025
      ];

      for (const dStr of datesForHead) {
        const sourceSys = sourceSystems[Math.floor(Math.random() * sourceSystems.length)];
        const firNum = Math.floor(Math.random() * 450) + 1;
        const legacyRef = `FIR-${firNum}/${dStr.split('-')[0]}`;
        const recordId = uuidv4();
        const isWorkedOut = Math.random() > 0.3; // 70% worked out

        // 1. Insert Record
        await db('records').insert({
          id: recordId,
          record_type: 'CASE',
          ps_id: psNode.ps_id,
          district_id: distId,
          sub_div_id: subDivId,
          legacy_ref: legacyRef,
          source_system: sourceSys,
          registration_date: dStr,
          record_date: dStr,
          created_by: userId,
          created_at: `${dStr}T10:30:00Z`,
          updated_at: `${dStr}T10:30:00Z`
        });
        recordCount++;

        // 2. Insert FIR details
        const comp = complainants[Math.floor(Math.random() * complainants.length)];
        const io = ios[Math.floor(Math.random() * ios.length)];
        const briefText = `${crime.brief} Complainant: ${comp}. IO: ${io}.`;

        await db('fir_details').insert({
          record_id: recordId,
          ps_id: psNode.ps_id,
          fir_no: String(firNum),
          fir_date: dStr,
          is_worked_out: isWorkedOut,
          worked_out_date: isWorkedOut ? dStr : null,
          local_head_id: crime.head_id,
          brief_facts: briefText,
          created_at: `${dStr}T10:30:00Z`,
          updated_at: `${dStr}T10:30:00Z`
        });
        firCount++;

        // 3. Create Arrests if worked out
        if (isWorkedOut) {
          const arrestRecordId = uuidv4();
          const arresteePersonId = uuidv4();
          const acc = accusedList[Math.floor(Math.random() * accusedList.length)];

          await db('records').insert({
            id: arrestRecordId,
            record_type: 'ARREST',
            ps_id: psNode.ps_id,
            district_id: distId,
            sub_div_id: subDivId,
            legacy_ref: legacyRef,
            source_system: sourceSys,
            registration_date: dStr,
            record_date: dStr,
            created_by: userId,
            created_at: `${dStr}T15:00:00Z`,
            updated_at: `${dStr}T15:00:00Z`
          });

          await db('arrest_details').insert({
            record_id: arrestRecordId,
            case_type: 'FIR',
            case_status: 'INVESTIGATION',
            fir_no: String(firNum),
            fir_date: dStr,
            local_head_id: crime.head_id,
            arresting_officer_name: io,
            custody_status: acc.status,
            created_at: `${dStr}T15:00:00Z`,
            updated_at: `${dStr}T15:00:00Z`
          });

          await db('persons').insert({
            id: arresteePersonId,
            record_id: arrestRecordId,
            role: 'ACCUSED',
            name: acc.name,
            gender: 'MALE',
            age: acc.age,
            mobile: '9871234567',
            created_at: `${dStr}T15:00:00Z`,
            updated_at: `${dStr}T15:00:00Z`
          });

          await db('arrestee_details').insert({
            person_id: arresteePersonId,
            arrest_date: dStr,
            arrest_time: '15:00:00',
            prev_involvement_count: Math.floor(Math.random() * 3),
            is_po: Math.random() < 0.1,
            created_at: `${dStr}T15:00:00Z`,
            updated_at: `${dStr}T15:00:00Z`
          });

          arrestCount++;
        }
      }
    }
  }

  console.log(`--- COMPREHENSIVE SEEDING COMPLETE ---`);
  console.log(`Seeded ${recordCount} records, ${firCount} FIR details, and ${arrestCount} arrest records.`);
  process.exit(0);
}

seedRealisticData().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
