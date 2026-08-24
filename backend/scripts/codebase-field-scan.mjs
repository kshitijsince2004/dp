import fs from 'fs';
import path from 'path';

const FIELD_SEARCH_TARGETS = [
  { group: 'A', name: 'case_type', patterns: ['case_type', 'efir', 'e_fir', 'e-fir', 'zero_fir', 'ZERO_FIR', 'manual_fir', 'MANUAL'] },
  { group: 'A', name: 'is_important', patterns: ['is_important', 'important_case', 'isImportant', 'important'] },
  { group: 'A', name: 'organised_crime', patterns: ['organised_crime', 'organized_crime', 'gang_crime', 'organisedCrime'] },
  { group: 'A', name: 'cd_uploaded_24h', patterns: ['cd_upload', 'footage', 'cctv', 'crime_diary', 'cd_submit', 'cd_24', 'cd_uploaded_24h'] },
  { group: 'A', name: 'is_worked_out', patterns: ['is_worked_out', 'worked_out', 'workedOut', 'solved', 'detection'] },
  { group: 'A', name: 'local_head_id', patterns: ['local_head', 'localHead', 'crime_head', 'crimeHead', 'head_id'] },
  { group: 'A', name: 'occurrence_datetime', patterns: ['occurrence_from_datetime', 'occurrence_to_datetime', 'incident_time', 'occurrence_location_id'] },
  { group: 'A', name: 'registered_on_direction', patterns: ['registered_on_direction', 'court_directed', 'direction_authority', 'suo_motu', 'suo_moto'] },
  { group: 'A', name: 'cheating_amount', patterns: ['cheating_amount', 'fraud_amount', 'amount_cheated', 'financial_fraud'] },
  { group: 'A', name: 'modus_operandi', patterns: ['modus_operandi', 'modus', 'operandi', 'mo_type', 'crime_method'] },
  { group: 'A', name: 'burglary_mo', patterns: ['burglary_mo', 'entry_method', 'means_adopted', 'breaking', 'scaling'] },
  { group: 'B', name: 'social_category', patterns: ['social_category', 'caste', 'sc_st', 'schedule', 'obc', 'category'] },
  { group: 'B', name: 'education', patterns: ['education', 'literate', 'illiterate', 'qualification', 'schooling'] },
  { group: 'B', name: 'home_state', patterns: ['home_state', 'perm_state', 'permanent_address', 'native_state', 'domicile'] },
  { group: 'B', name: 'financial_status', patterns: ['financial_status', 'income', 'bpl', 'below_poverty', 'economic'] },
  { group: 'C', name: 'is_bc', patterns: ['is_bc', 'bad_character', 'badCharacter', 'bc_list', 'history_sheeter'] },
  { group: 'C', name: 'is_po', patterns: ['is_po', 'proclaimed', 'po_list', 'absconding'] },
  { group: 'C', name: 'arrest_date', patterns: ['arrest_date', 'date_of_arrest', 'arrestDate', 'detained_on'] },
  { group: 'C', name: 'arrest_schemes', patterns: ['scheme', 'patrolling', 'prahari', 'antisnatching', 'eyes_ears', 'integrated_pi'] },
  { group: 'C', name: 'prev_involvement', patterns: ['prev_involvement', 'prior_involvement', 'previous_case', 'history_count', 'criminal_history'] },
  { group: 'D', name: 'quantity_unit', patterns: ['quantity', 'unit_cd', 'to_kg', 'kg_factor', 'drug_weight'] },
  { group: 'D', name: 'recovery_date', patterns: ['recovery_date', 'recovered_on', 'date_of_recovery', 'recovery_datetime'] },
  { group: 'D', name: 'recovery_agency', patterns: ['recovery_agency', 'recovered_by', 'by_police', 'by_public', 'abandoned'] },
  { group: 'D', name: 'vehicle_no', patterns: ['vehicle_no', 'vehicle_number', 'reg_no', 'registration_no', 'number_plate'] },
  { group: 'D', name: 'phone_imei', patterns: ['phone_imei', 'imei', 'phone_make', 'phone_model', 'mobile_make', 'handset'] },
  { group: 'E', name: 'court_fields', patterns: ['sent_to_court_date', 'court_case_no', 'court_name', 'court_disposal_type', 'court_disposal_date', 'court_disposal', 'court_hearings'] },
  { group: 'F', name: 'injury_severity', patterns: ['injury_severity', 'hospitalized', 'hospital_name', 'fatal', 'grievous', 'hurt_type'] },
  { group: 'G', name: 'missing_person_state', patterns: ['perm_location_id', 'present_location_id', 'missing_details', 'missing_person_details'] }
];

function getAllFiles(dir, exts = ['.js', '.jsx', '.json']) {
  let files = [];
  try {
    const list = fs.readdirSync(dir);
    for (const f of list) {
      const fullPath = path.join(dir, f);
      if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files = files.concat(getAllFiles(fullPath, exts));
      } else if (exts.includes(path.extname(f))) {
        files.push(fullPath);
      }
    }
  } catch {}
  return files;
}

const backendFiles = getAllFiles('./src').concat(getAllFiles('./config'));
const frontendFiles = getAllFiles('../frontend/src');
const allFiles = [...backendFiles, ...frontendFiles];

console.log(`Scanning ${allFiles.length} files for ${FIELD_SEARCH_TARGETS.length} field targets...`);

const report = {};

for (const target of FIELD_SEARCH_TARGETS) {
  report[target.name] = {
    group: target.group,
    matches: []
  };

  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of target.patterns) {
          if (line.includes(pattern)) {
            report[target.name].matches.push({
              file: file.replace(/\\/g, '/'),
              line: i + 1,
              snippet: line.trim().slice(0, 120),
              pattern
            });
            break;
          }
        }
      }
    } catch {}
  }
}

fs.writeFileSync('scripts/codebase-scan-results.json', JSON.stringify(report, null, 2), 'utf8');
console.log('Codebase scan finished! Saved to scripts/codebase-scan-results.json');
