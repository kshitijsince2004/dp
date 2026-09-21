import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { db } from '../src/config/db.js';
import { v4 as uuidv4 } from 'uuid';

async function seedAnalyticsDataset() {
  console.log('=== SEEDING COMPREHENSIVE MULTI-HIERARCHY ANALYTICS DATASET ===');

  const defaultUser = await db('users').first('id');
  const userId = defaultUser ? defaultUser.id : null;

  // Fetch CASE_ARREST link type ID
  const caseArrestLinkType = await db('link_type_registry').where('code', 'CASE_ARREST').first();
  if (!caseArrestLinkType) {
    console.error('Missing CASE_ARREST link type in registry!');
    process.exit(1);
  }
  const linkTypeId = caseArrestLinkType.id;

  // Fetch all PS nodes with district_id and sub_div_id
  const psNodes = await db('hierarchy_nodes as ps')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'ps.parent_id')
    .leftJoin('hierarchy_nodes as dist', 'dist.id', 'sd.parent_id')
    .where('ps.node_type', 'PS')
    .select('ps.id as ps_id', 'ps.name as ps_name', 'sd.id as sub_div_id', 'dist.id as district_id');

  if (psNodes.length === 0) {
    console.error('No PS hierarchy nodes found in hierarchy_nodes!');
    process.exit(1);
  }
  console.log(`Found ${psNodes.length} Police Stations.`);

  // Load Heinous & Non-Heinous Local Heads
  const heinousHeads = await db('ref.local_heads').where('crime_category', 'HEINOUS').select('local_head_cd', 'local_head');
  const nonHeinousHeads = await db('ref.local_heads').where('crime_category', '!=', 'HEINOUS').select('local_head_cd', 'local_head');

  const heinousList = heinousHeads.length ? heinousHeads : [
    { local_head_cd: 2, local_head: 'Murder' },
    { local_head_cd: 3, local_head: 'Att. to Murder' },
    { local_head_cd: 4, local_head: 'Robbery' },
    { local_head_cd: 7, local_head: 'Rape' },
    { local_head_cd: 1, local_head: 'Dacoity' },
    { local_head_cd: 6, local_head: 'Kid. For Ransom' }
  ];

  const nonHeinousList = nonHeinousHeads.length ? nonHeinousHeads.slice(0, 20) : [
    { local_head_cd: 10, local_head: 'Hurt' },
    { local_head_cd: 12, local_head: 'Burglary' },
    { local_head_cd: 16, local_head: 'MV Theft' },
    { local_head_cd: 18, local_head: 'House Theft' },
    { local_head_cd: 38, local_head: 'Cheating' },
    { local_head_cd: 101, local_head: 'Arms Act' },
    { local_head_cd: 102, local_head: 'Delhi Excise Act' },
    { local_head_cd: 103, local_head: 'Gambling Act' }
  ];

  const caseStatuses = [
    'INVESTIGATION', 'CHARGE SHEET', 'UNTRACED', 'PENDING',
    'CANCELLATION', 'CLOSURE REPORT', 'RELEASED U/S 189 BNSS', 'TRANSFER'
  ];

  const leftOutAccusedCatalog = [
    { name: 'Vicky @ Chhotu', relative: 'Rameshwar', age: 24, gender: 'MALE' },
    { name: 'Sonu @ Takla', relative: 'Mahesh Kumar', age: 29, gender: 'MALE' },
    { name: 'Mohd. Shahrukh @ Boxer', relative: 'Mohd. Alam', age: 27, gender: 'MALE' },
    { name: 'Deepak @ Tillu', relative: 'Sohan Lal', age: 22, gender: 'MALE' },
    { name: 'Praveen @ Pehelwan', relative: 'Satish', age: 31, gender: 'MALE' },
    { name: 'Anita Sharma @ Bhabhi', relative: 'Rajiv', age: 35, gender: 'FEMALE' }
  ];

  const arrestedPersonsMale = [
    { name: 'Ramesh Kumar @ Kalu', relative: 'Jagdish', age: 26, gender: 'MALE' },
    { name: 'Harish Rawat', relative: 'Trilochan', age: 32, gender: 'MALE' },
    { name: 'Anil Kumar @ Sonu', relative: 'Om Prakash', age: 28, gender: 'MALE' },
    { name: 'Mohit @ Monu', relative: 'Dharampal', age: 23, gender: 'MALE' },
    { name: 'Sanjay Verma', relative: 'Kishore', age: 34, gender: 'MALE' }
  ];

  const arrestedPersonsFemale = [
    { name: 'Pooja Devi @ Rani', relative: 'Suraj', age: 27, gender: 'FEMALE' },
    { name: 'Meena Kumari', relative: 'Sunil', age: 33, gender: 'FEMALE' },
    { name: 'Kavita Singh', relative: 'Brijesh', age: 25, gender: 'FEMALE' }
  ];

  const pcrCallHeads = ['Theft', 'Quarrel / Dispute', 'Suspicious Activity', 'Accident', 'Domestic Dispute', 'Noise Pollution'];

  const dateSchedule = [
    { date: '2026-09-19', times: ['05:30:00', '09:15:00', '11:45:00', '14:20:00', '17:10:00', '21:30:00'], weight: 5 },
    { date: '2026-09-18', times: ['06:00:00', '10:30:00', '13:00:00', '16:45:00', '19:15:00', '22:00:00'], weight: 4 },
    { date: '2026-09-17', times: ['08:00:00', '14:00:00', '20:00:00'], weight: 3 },
    { date: '2026-09-16', times: ['09:00:00', '15:00:00', '21:00:00'], weight: 3 },
    { date: '2026-09-15', times: ['07:30:00', '12:30:00', '18:30:00'], weight: 3 },
    { date: '2026-09-14', times: ['10:00:00', '16:00:00'], weight: 2 },
    { date: '2026-09-13', times: ['11:00:00', '17:00:00'], weight: 2 },
    { date: '2026-09-12', times: ['08:30:00', '14:30:00'], weight: 2 },
    { date: '2026-09-11', times: ['09:30:00', '15:30:00'], weight: 2 },
    { date: '2026-09-10', times: ['10:30:00', '16:30:00'], weight: 2 },
    { date: '2026-09-09', times: ['11:30:00', '17:30:00'], weight: 2 },
    { date: '2026-09-08', times: ['08:00:00', '13:00:00'], weight: 2 },
    { date: '2026-09-07', times: ['09:00:00', '14:00:00'], weight: 2 },
    { date: '2026-09-06', times: ['10:00:00', '15:00:00'], weight: 2 },
    { date: '2026-09-03', times: ['12:00:00'], weight: 2 },
    { date: '2026-09-01', times: ['10:00:00'], weight: 2 },
    { date: '2026-08-25', times: ['11:00:00'], weight: 2 },
    { date: '2026-08-15', times: ['10:00:00'], weight: 2 },
    { date: '2026-08-05', times: ['14:00:00'], weight: 2 },
  ];

  let totalCases = 0;
  let totalLinkedArrests = 0;
  let totalKalandras = 0;
  let totalLeftOut = 0;
  let totalPCR = 0;
  let totalMissing = 0;
  let totalUIDB = 0;

  const focusPsNodes = psNodes.filter(p => 
    p.ps_name.toLowerCase().includes('parliament') || 
    p.ps_name.toLowerCase().includes('connaught') ||
    p.ps_name.toLowerCase().includes('mandir') ||
    p.ps_name.toLowerCase().includes('chanakya') ||
    p.ps_name.toLowerCase().includes('tilak') ||
    p.ps_name.toLowerCase().includes('cyber') ||
    p.ps_name.toLowerCase().includes('kotwali') ||
    p.ps_name.toLowerCase().includes('karol')
  );

  const allTargetNodes = [...focusPsNodes, ...psNodes.filter(p => !focusPsNodes.includes(p))];
  console.log(`Targeting ${allTargetNodes.length} police stations across all districts.`);

  let globalFirSeq = 60000;

  for (let psIdx = 0; psIdx < allTargetNodes.length; psIdx++) {
    const psNode = allTargetNodes[psIdx];
    const isPrimaryStation = focusPsNodes.includes(psNode);
    const distId = psNode.district_id || 'c5fb9678-9600-4105-9074-f1100a54aeff';
    const subDivId = psNode.sub_div_id || null;

    for (const sched of dateSchedule) {
      const dStr = sched.date;
      const countForDate = isPrimaryStation ? sched.weight : Math.max(1, Math.floor(sched.weight / 2));

      for (let i = 0; i < countForDate; i++) {
        const timeStr = sched.times[i % sched.times.length] || '12:00:00';
        globalFirSeq++;
        const firNum = globalFirSeq;

        const caseRecordId = uuidv4();
        const isHeinous = Math.random() < 0.35; // 35% heinous
        const crimeHeadObj = isHeinous 
          ? heinousList[Math.floor(Math.random() * heinousList.length)]
          : nonHeinousList[Math.floor(Math.random() * nonHeinousList.length)];

        const isWorkedOut = Math.random() < 0.65; // 65% worked out
        const hasLeftOut = isHeinous && Math.random() < 0.6; // 60% of heinous cases have a left-out suspect

        // 1. Insert CASE record
        await db('records').insert({
          id: caseRecordId,
          record_type: 'CASE',
          ps_id: psNode.ps_id,
          district_id: distId,
          sub_div_id: subDivId,
          current_status: 'COMPILED',
          current_level: 'PS',
          legacy_ref: `FIR-${firNum}/${dStr.slice(0, 4)}`,
          source_system: 'MANUAL',
          registration_date: dStr,
          record_date: dStr,
          created_by: userId,
          created_at: `${dStr}T${timeStr}Z`,
          updated_at: `${dStr}T${timeStr}Z`
        });
        totalCases++;

        // 2. Insert FIR details
        const caseStatus = caseStatuses[Math.floor(Math.random() * caseStatuses.length)];
        await db('fir_details').insert({
          record_id: caseRecordId,
          ps_id: psNode.ps_id,
          fir_no: String(firNum),
          fir_year: parseInt(dStr.slice(0, 4), 10),
          fir_date: dStr,
          case_type: 'cctns(manual FIR)',
          is_worked_out: isWorkedOut,
          worked_out_date: isWorkedOut ? dStr : null,
          local_head_id: crimeHeadObj.local_head_cd,
          case_status: caseStatus,
          brief_facts: `${crimeHeadObj.local_head} incident reported at beat sector near market area. FIR No. ${firNum}/${dStr.slice(0, 4)}.`,
          created_at: `${dStr}T${timeStr}Z`,
          updated_at: `${dStr}T${timeStr}Z`
        });

        // 3. Insert ACCUSED person on CASE record
        const accusedPersonId = uuidv4();
        const accusedTemplate = hasLeftOut 
          ? leftOutAccusedCatalog[Math.floor(Math.random() * leftOutAccusedCatalog.length)]
          : arrestedPersonsMale[Math.floor(Math.random() * arrestedPersonsMale.length)];

        await db('persons').insert({
          id: accusedPersonId,
          record_id: caseRecordId,
          role: 'ACCUSED',
          name: accusedTemplate.name,
          relative_name: accusedTemplate.relative,
          relation_type: 'FATHER',
          gender: accusedTemplate.gender,
          age: accusedTemplate.age,
          mobile: '9876543210',
          created_at: `${dStr}T${timeStr}Z`,
          updated_at: `${dStr}T${timeStr}Z`
        });

        if (hasLeftOut && !isWorkedOut) {
          totalLeftOut++;
        }

        // 4. If Worked Out: Create linked ARREST record + CASE_ARREST link
        if (isWorkedOut) {
          const arrestRecordId = uuidv4();
          const arresteePersonId = uuidv4();
          const arresteeData = hasLeftOut
            ? arrestedPersonsMale[0]
            : accusedTemplate;

          await db('records').insert({
            id: arrestRecordId,
            record_type: 'ARREST',
            ps_id: psNode.ps_id,
            district_id: distId,
            sub_div_id: subDivId,
            current_status: 'COMPILED',
            current_level: 'PS',
            legacy_ref: `ARR-${firNum}/${dStr.slice(0, 4)}`,
            source_system: 'MANUAL',
            registration_date: dStr,
            record_date: dStr,
            created_by: userId,
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('arrest_details').insert({
            record_id: arrestRecordId,
            case_type: 'FIR',
            case_status: 'INVESTIGATION',
            fir_no: String(firNum),
            fir_date: dStr,
            local_head_id: crimeHeadObj.local_head_cd,
            arresting_officer_name: 'SI Harish Rawat',
            arresting_officer_rank: 'SI',
            custody_status: 'J/C',
            scheme_of_arrest: 'Anti-snatching',
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('persons').insert({
            id: arresteePersonId,
            record_id: arrestRecordId,
            role: 'ARRESTEE',
            name: arresteeData.name,
            relative_name: arresteeData.relative,
            relation_type: 'FATHER',
            gender: arresteeData.gender,
            age: arresteeData.age,
            mobile: '9876543210',
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('arrestee_details').insert({
            person_id: arresteePersonId,
            arrest_date: dStr,
            arrest_time: timeStr,
            prev_involvement_count: 1,
            is_po: false,
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          // Insert CASE_ARREST link in record_links
          await db('record_links').insert({
            id: uuidv4(),
            link_type_id: linkTypeId,
            source_record_id: caseRecordId,
            target_record_id: arrestRecordId,
            metadata: JSON.stringify({ linked_at: dStr, linked_by: 'seed_script' }),
            created_by: userId,
            created_at: `${dStr}T${timeStr}Z`
          });

          totalLinkedArrests++;
        }

        // 5. Standalone Arrests (Kalandra) - unlinked ARREST records (Male & Female)
        if (i % 2 === 0) {
          const kalandraRecordId = uuidv4();
          const kalandraPersonId = uuidv4();
          const isFemale = (i % 4 === 0);
          const kalandraPerson = isFemale
            ? arrestedPersonsFemale[Math.floor(Math.random() * arrestedPersonsFemale.length)]
            : arrestedPersonsMale[Math.floor(Math.random() * arrestedPersonsMale.length)];

          await db('records').insert({
            id: kalandraRecordId,
            record_type: 'ARREST',
            ps_id: psNode.ps_id,
            district_id: distId,
            sub_div_id: subDivId,
            current_status: 'COMPILED',
            current_level: 'PS',
            legacy_ref: `KAL-${Math.floor(Math.random() * 900) + 100}/${dStr.slice(0, 4)}`,
            source_system: 'MANUAL',
            registration_date: dStr,
            record_date: dStr,
            created_by: userId,
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('arrest_details').insert({
            record_id: kalandraRecordId,
            case_type: 'KALANDRA',
            case_status: 'PREVENTIVE',
            local_head_id: 101, // Arms Act / DP Act preventive
            arresting_officer_name: 'ASI Satish Kumar',
            arresting_officer_rank: 'ASI',
            custody_status: 'Notice 35(1) BNSS',
            scheme_of_arrest: 'Group Patrolling',
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('persons').insert({
            id: kalandraPersonId,
            record_id: kalandraRecordId,
            role: 'ARRESTEE',
            name: kalandraPerson.name,
            relative_name: kalandraPerson.relative,
            relation_type: 'FATHER',
            gender: kalandraPerson.gender,
            age: kalandraPerson.age,
            mobile: '9812345678',
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('arrestee_details').insert({
            person_id: kalandraPersonId,
            arrest_date: dStr,
            arrest_time: timeStr,
            prev_involvement_count: 0,
            is_po: false,
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          totalKalandras++;
        }

        // 6. PCR Calls
        if (i % 2 === 1) {
          const pcrRecordId = uuidv4();
          const callHead = pcrCallHeads[Math.floor(Math.random() * pcrCallHeads.length)];
          await db('records').insert({
            id: pcrRecordId,
            record_type: 'PCR_CALL',
            ps_id: psNode.ps_id,
            district_id: distId,
            sub_div_id: subDivId,
            current_status: 'COMPILED',
            current_level: 'PS',
            legacy_ref: `PCR-${Math.floor(Math.random() * 900) + 100}`,
            source_system: 'MANUAL',
            registration_date: dStr,
            record_date: dStr,
            created_by: userId,
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('pcr_call_details').insert({
            record_id: pcrRecordId,
            pcr_no: `PCR-${Math.floor(Math.random() * 9000) + 1000}`,
            gd_no: `${Math.floor(Math.random() * 50) + 1}A`,
            gd_date: dStr,
            gd_time: timeStr,
            call_head: callHead,
            call_gist: `PCR call regarding ${callHead} received and attended by local beat staff.`,
            action_taken: 'Attended & Resolved',
            final_call_status: 'CLOSED',
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });
          totalPCR++;
        }

        // 7. Missing & UIDB records
        if (i % 3 === 0) {
          const mspRecordId = uuidv4();
          const mspPersonId = uuidv4();
          await db('records').insert({
            id: mspRecordId,
            record_type: 'MISSING',
            ps_id: psNode.ps_id,
            district_id: distId,
            sub_div_id: subDivId,
            current_status: 'COMPILED',
            current_level: 'PS',
            legacy_ref: `MSP-${Math.floor(Math.random() * 900) + 100}`,
            source_system: 'MANUAL',
            registration_date: dStr,
            record_date: dStr,
            created_by: userId,
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('persons').insert({
            id: mspPersonId,
            record_id: mspRecordId,
            role: 'MISSING',
            name: 'Pankaj Kumar',
            gender: 'MALE',
            age: 19,
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('missing_person_details').insert({
            person_id: mspPersonId,
            missing_date: dStr,
            last_seen_place: 'Near railway station metro gate',
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });
          totalMissing++;

          const uidbRecordId = uuidv4();
          await db('records').insert({
            id: uidbRecordId,
            record_type: 'UIDB',
            ps_id: psNode.ps_id,
            district_id: distId,
            sub_div_id: subDivId,
            current_status: 'COMPILED',
            current_level: 'PS',
            legacy_ref: `UDB-${Math.floor(Math.random() * 900) + 100}`,
            source_system: 'MANUAL',
            registration_date: dStr,
            record_date: dStr,
            created_by: userId,
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });

          await db('uidb_details').insert({
            record_id: uidbRecordId,
            uidb_no: `UIDB-${dStr.slice(0, 4)}-${Math.floor(Math.random() * 9000) + 1000}`,
            gd_no: `${Math.floor(Math.random() * 30) + 1}B`,
            gd_date: dStr,
            found_date: dStr,
            found_time: timeStr,
            cause_of_death: 'Natural / Unknown',
            uidb_status: 'Unidentified',
            created_at: `${dStr}T${timeStr}Z`,
            updated_at: `${dStr}T${timeStr}Z`
          });
          totalUIDB++;
        }
      }
    }
  }

  console.log('=== SEEDING SUMMARY ===');
  console.log(`Cases Seeded: ${totalCases}`);
  console.log(`Linked Arrests in FIR: ${totalLinkedArrests}`);
  console.log(`Standalone Kalandras: ${totalKalandras}`);
  console.log(`Left Out Accused instances: ${totalLeftOut}`);
  console.log(`PCR Calls: ${totalPCR}`);
  console.log(`Missing Records: ${totalMissing}`);
  console.log(`UIDB Records: ${totalUIDB}`);
  console.log('=== SEEDING COMPLETE ===');
  process.exit(0);
}

seedAnalyticsDataset().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
