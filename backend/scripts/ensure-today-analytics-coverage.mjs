import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { db } from '../src/config/db.js';
import { v4 as uuidv4 } from 'uuid';

async function ensureCoverage() {
  console.log('=== ENSURING COMPREHENSIVE COVERAGE FOR ALL PS DASHBOARDS ON CURRENT DATES ===');

  const defaultUser = await db('users').first('id');
  const userId = defaultUser ? defaultUser.id : null;

  const caseArrestLink = await db('link_type_registry').where('code', 'CASE_ARREST').first();
  const linkTypeId = caseArrestLink.id;

  const psList = await db('hierarchy_nodes as ps')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'ps.parent_id')
    .leftJoin('hierarchy_nodes as dist', 'dist.id', 'sd.parent_id')
    .where('ps.node_type', 'PS')
    .select('ps.id as ps_id', 'ps.name as ps_name', 'sd.id as sub_div_id', 'dist.id as district_id');

  console.log(`Processing coverage for ${psList.length} police stations...`);

  let firSeq = 80000;

  const days = ['2026-09-19', '2026-09-18'];

  for (const ps of psList) {
    const distId = ps.district_id || 'c5fb9678-9600-4105-9074-f1100a54aeff';
    const subDivId = ps.sub_div_id || null;

    for (const dStr of days) {
      // 1. Heinous Case with Left-Out Accused (Murder / Robbery)
      const heinousLeftoutCaseId = uuidv4();
      firSeq++;
      await db('records').insert({
        id: heinousLeftoutCaseId,
        record_type: 'CASE',
        ps_id: ps.ps_id,
        district_id: distId,
        sub_div_id: subDivId,
        current_status: 'COMPILED',
        current_level: 'PS',
        legacy_ref: `FIR-${firSeq}/${dStr.slice(0, 4)}`,
        source_system: 'MANUAL',
        registration_date: dStr,
        record_date: dStr,
        created_by: userId,
        created_at: `${dStr}T09:30:00Z`,
        updated_at: `${dStr}T09:30:00Z`
      });

      await db('fir_details').insert({
        record_id: heinousLeftoutCaseId,
        ps_id: ps.ps_id,
        fir_no: String(firSeq),
        fir_year: parseInt(dStr.slice(0, 4), 10),
        fir_date: dStr,
        case_type: 'cctns(manual FIR)',
        is_worked_out: false,
        worked_out_date: null,
        local_head_id: 2, // Murder (HEINOUS)
        case_status: 'INVESTIGATION',
        brief_facts: `Heinous murder incident reported at sector market. Accused Vicky @ Chhotu absconding.`,
        created_at: `${dStr}T09:30:00Z`,
        updated_at: `${dStr}T09:30:00Z`
      });

      await db('persons').insert({
        id: uuidv4(),
        record_id: heinousLeftoutCaseId,
        role: 'ACCUSED',
        name: 'Vicky @ Chhotu',
        relative_name: 'Rameshwar',
        relation_type: 'FATHER',
        gender: 'MALE',
        age: 24,
        mobile: '9871234567',
        created_at: `${dStr}T09:30:00Z`,
        updated_at: `${dStr}T09:30:00Z`
      });

      // 2. Heinous Case Worked-Out with Linked Arrest
      const heinousWorkedCaseId = uuidv4();
      firSeq++;
      await db('records').insert({
        id: heinousWorkedCaseId,
        record_type: 'CASE',
        ps_id: ps.ps_id,
        district_id: distId,
        sub_div_id: subDivId,
        current_status: 'COMPILED',
        current_level: 'PS',
        legacy_ref: `FIR-${firSeq}/${dStr.slice(0, 4)}`,
        source_system: 'MANUAL',
        registration_date: dStr,
        record_date: dStr,
        created_by: userId,
        created_at: `${dStr}T14:15:00Z`,
        updated_at: `${dStr}T14:15:00Z`
      });

      await db('fir_details').insert({
        record_id: heinousWorkedCaseId,
        ps_id: ps.ps_id,
        fir_no: String(firSeq),
        fir_year: parseInt(dStr.slice(0, 4), 10),
        fir_date: dStr,
        case_type: 'cctns(manual FIR)',
        is_worked_out: true,
        worked_out_date: dStr,
        local_head_id: 4, // Robbery (HEINOUS)
        case_status: 'CHARGE SHEET',
        brief_facts: `Armed robbery at jewelry store. Accused Mohd. Shahrukh arrested with recovered jewelry.`,
        created_at: `${dStr}T14:15:00Z`,
        updated_at: `${dStr}T14:15:00Z`
      });

      await db('persons').insert({
        id: uuidv4(),
        record_id: heinousWorkedCaseId,
        role: 'ACCUSED',
        name: 'Mohd. Shahrukh',
        relative_name: 'Mohd. Alam',
        relation_type: 'FATHER',
        gender: 'MALE',
        age: 27,
        mobile: '9876543210',
        created_at: `${dStr}T14:15:00Z`,
        updated_at: `${dStr}T14:15:00Z`
      });

      const linkedArrestId = uuidv4();
      const arresteePersonId = uuidv4();
      await db('records').insert({
        id: linkedArrestId,
        record_type: 'ARREST',
        ps_id: ps.ps_id,
        district_id: distId,
        sub_div_id: subDivId,
        current_status: 'COMPILED',
        current_level: 'PS',
        legacy_ref: `ARR-${firSeq}/${dStr.slice(0, 4)}`,
        source_system: 'MANUAL',
        registration_date: dStr,
        record_date: dStr,
        created_by: userId,
        created_at: `${dStr}T15:30:00Z`,
        updated_at: `${dStr}T15:30:00Z`
      });

      await db('arrest_details').insert({
        record_id: linkedArrestId,
        case_type: 'FIR',
        case_status: 'CHARGE SHEET',
        fir_no: String(firSeq),
        fir_date: dStr,
        local_head_id: 4,
        arresting_officer_name: 'SI Harish Rawat',
        arresting_officer_rank: 'SI',
        custody_status: 'J/C',
        created_at: `${dStr}T15:30:00Z`,
        updated_at: `${dStr}T15:30:00Z`
      });

      await db('persons').insert({
        id: arresteePersonId,
        record_id: linkedArrestId,
        role: 'ARRESTEE',
        name: 'Mohd. Shahrukh',
        relative_name: 'Mohd. Alam',
        relation_type: 'FATHER',
        gender: 'MALE',
        age: 27,
        mobile: '9876543210',
        created_at: `${dStr}T15:30:00Z`,
        updated_at: `${dStr}T15:30:00Z`
      });

      await db('arrestee_details').insert({
        person_id: arresteePersonId,
        arrest_date: dStr,
        arrest_time: '15:30:00',
        prev_involvement_count: 2,
        is_po: false,
        created_at: `${dStr}T15:30:00Z`,
        updated_at: `${dStr}T15:30:00Z`
      });

      await db('record_links').insert({
        id: uuidv4(),
        link_type_id: linkTypeId,
        source_record_id: heinousWorkedCaseId,
        target_record_id: linkedArrestId,
        metadata: JSON.stringify({ linked_at: dStr }),
        created_by: userId,
        created_at: `${dStr}T15:30:00Z`
      });

      // 3. Standalone Kalandra (Male)
      const maleKalandraId = uuidv4();
      const malePersonId = uuidv4();
      await db('records').insert({
        id: maleKalandraId,
        record_type: 'ARREST',
        ps_id: ps.ps_id,
        district_id: distId,
        sub_div_id: subDivId,
        current_status: 'COMPILED',
        current_level: 'PS',
        legacy_ref: `KAL-M-${firSeq}`,
        source_system: 'MANUAL',
        registration_date: dStr,
        record_date: dStr,
        created_by: userId,
        created_at: `${dStr}T18:00:00Z`,
        updated_at: `${dStr}T18:00:00Z`
      });

      await db('arrest_details').insert({
        record_id: maleKalandraId,
        case_type: 'KALANDRA',
        case_status: 'PREVENTIVE',
        local_head_id: 101, // Arms Act / DP Act
        arresting_officer_name: 'ASI Satish Kumar',
        arresting_officer_rank: 'ASI',
        custody_status: 'Notice 35(1) BNSS',
        scheme_of_arrest: 'Anti-snatching',
        created_at: `${dStr}T18:00:00Z`,
        updated_at: `${dStr}T18:00:00Z`
      });

      await db('persons').insert({
        id: malePersonId,
        record_id: maleKalandraId,
        role: 'ARRESTEE',
        name: 'Ramesh Kumar @ Kalu',
        gender: 'MALE',
        age: 26,
        created_at: `${dStr}T18:00:00Z`,
        updated_at: `${dStr}T18:00:00Z`
      });

      await db('arrestee_details').insert({
        person_id: malePersonId,
        arrest_date: dStr,
        arrest_time: '18:00:00',
        created_at: `${dStr}T18:00:00Z`,
        updated_at: `${dStr}T18:00:00Z`
      });

      // 4. Standalone Kalandra (Female)
      const femaleKalandraId = uuidv4();
      const femalePersonId = uuidv4();
      await db('records').insert({
        id: femaleKalandraId,
        record_type: 'ARREST',
        ps_id: ps.ps_id,
        district_id: distId,
        sub_div_id: subDivId,
        current_status: 'COMPILED',
        current_level: 'PS',
        legacy_ref: `KAL-F-${firSeq}`,
        source_system: 'MANUAL',
        registration_date: dStr,
        record_date: dStr,
        created_by: userId,
        created_at: `${dStr}T20:30:00Z`,
        updated_at: `${dStr}T20:30:00Z`
      });

      await db('arrest_details').insert({
        record_id: femaleKalandraId,
        case_type: 'KALANDRA',
        case_status: 'PREVENTIVE',
        local_head_id: 102, // Delhi Excise Act
        arresting_officer_name: 'ASI Sunita Rani',
        arresting_officer_rank: 'ASI',
        custody_status: 'Bail',
        scheme_of_arrest: 'Kawach',
        created_at: `${dStr}T20:30:00Z`,
        updated_at: `${dStr}T20:30:00Z`
      });

      await db('persons').insert({
        id: femalePersonId,
        record_id: femaleKalandraId,
        role: 'ARRESTEE',
        name: 'Pooja Devi @ Rani',
        gender: 'FEMALE',
        age: 27,
        created_at: `${dStr}T20:30:00Z`,
        updated_at: `${dStr}T20:30:00Z`
      });

      await db('arrestee_details').insert({
        person_id: femalePersonId,
        arrest_date: dStr,
        arrest_time: '20:30:00',
        created_at: `${dStr}T20:30:00Z`,
        updated_at: `${dStr}T20:30:00Z`
      });
    }
  }

  console.log('=== COVERAGE ASSURANCE COMPLETE ===');
  process.exit(0);
}

ensureCoverage().catch(err => {
  console.error('Coverage assurance failed:', err);
  process.exit(1);
});
