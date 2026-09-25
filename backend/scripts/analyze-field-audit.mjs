import fs from 'fs';
import path from 'path';

function analyzeFieldAudit() {
  const dbSchema = JSON.parse(fs.readFileSync('scripts/parsed-full-db-schema.json', 'utf8'));
  const scanResults = JSON.parse(fs.readFileSync('scripts/codebase-scan-results.json', 'utf8'));

  const expectedFields = [
    { target: 'case_type', expectedTable: 'fir_details', expectedCol: 'case_type' },
    { target: 'cd_uploaded_24h', expectedTable: 'fir_details', expectedCol: 'cd_uploaded_24h' },
    { target: 'footage_collected', expectedTable: 'fir_details', expectedCol: 'footage_collected' },
    { target: 'is_important', expectedTable: 'fir_details', expectedCol: 'is_important' },
    { target: 'organised_crime', expectedTable: 'fir_details', expectedCol: 'organised_crime' },
    { target: 'is_worked_out', expectedTable: 'fir_details', expectedCol: 'is_worked_out' },
    { target: 'local_head_id', expectedTable: 'fir_details', expectedCol: 'local_head_id' },
    { target: 'occurrence_from_datetime', expectedTable: 'fir_details', expectedCol: 'occurrence_from_datetime' },
    { target: 'registered_on_direction', expectedTable: 'fir_details', expectedCol: 'registered_on_direction' },
    { target: 'cheating_amount', expectedTable: 'fir_details', expectedCol: 'cheating_amount' },
    { target: 'modus_operandi', expectedTable: 'fir_details', expectedCol: 'modus_operandi' },
    { target: 'burglary_mo_cd', expectedTable: 'fir_details', expectedCol: 'burglary_mo_cd' },
    { target: 'social_category', expectedTable: 'persons', expectedCol: 'social_category' },
    { target: 'education', expectedTable: 'persons', expectedCol: 'education' },
    { target: 'home_state', expectedTable: 'locations', expectedCol: 'state' },
    { target: 'financial_status', expectedTable: 'persons', expectedCol: 'financial_status' },
    { target: 'is_bc', expectedTable: 'arrestee_details', expectedCol: 'is_bc' },
    { target: 'is_po', expectedTable: 'arrestee_details', expectedCol: 'is_po' },
    { target: 'arrest_date', expectedTable: 'arrestee_details', expectedCol: 'arrest_date' },
    { target: 'scheme_of_arrest', expectedTable: 'arrest_details', expectedCol: 'scheme_of_arrest' },
    { target: 'prev_involvement_count', expectedTable: 'arrestee_details', expectedCol: 'prev_involvement_count' },
    { target: 'quantity', expectedTable: 'record_properties', expectedCol: 'quantity' },
    { target: 'unit_cd', expectedTable: 'record_properties', expectedCol: 'unit_cd' },
    { target: 'recovery_date', expectedTable: 'record_properties', expectedCol: 'recovery_date' },
    { target: 'recovery_agency', expectedTable: 'record_properties', expectedCol: 'recovery_agency' },
    { target: 'vehicle_no', expectedTable: 'record_properties', expectedCol: 'vehicle_no' },
    { target: 'phone_imei', expectedTable: 'record_properties', expectedCol: 'phone_imei' },
    { target: 'injury_severity', expectedTable: 'victim_injury_details', expectedCol: 'injury_severity' },
    { target: 'reason_for_detention', expectedTable: 'arrest_details', expectedCol: 'reason_for_detention' },
    { target: 'court_status', expectedTable: 'fir_details', expectedCol: 'court_disposal_type' },
    { target: 'sent_to_court_date', expectedTable: 'fir_details', expectedCol: 'sent_to_court_date' },
    { target: 'disposal_type', expectedTable: 'fir_details', expectedCol: 'court_disposal_type' }
  ];

  console.log('=== FIELD AUDIT ANALYSIS ===');

  const rows = [];

  for (const f of expectedFields) {
    const tableCols = dbSchema[f.expectedTable] || {};
    const colExists = !!tableCols[f.expectedCol];

    const actualColFound = colExists ? f.expectedCol : (
      Object.keys(tableCols).find(c => c.toLowerCase() === f.expectedCol.toLowerCase()) ||
      (f.expectedTable === 'fir_details' && f.expectedCol === 'cd_uploaded_24h' && tableCols['cd_uploaded_24h'] ? 'cd_uploaded_24h' : null)
    );

    // Backend mapping check
    const backendMatches = (scanResults[f.target]?.matches || []).filter(m => m.file.startsWith('src/'));
    const frontendMatches = (scanResults[f.target]?.matches || []).filter(m => m.file.startsWith('../frontend/'));

    let action = '❌ MISSING';
    if (actualColFound) {
      if (backendMatches.length > 0 && frontendMatches.length > 0) {
        action = '✅ DONE';
      } else {
        action = '⚠️ PARTIAL';
      }
    } else {
      if (f.target.includes('court')) {
        action = '📋 PLAN';
      } else {
        action = '❌ MISSING';
      }
    }

    rows.push({
      field: f.target,
      foundAs: actualColFound || 'NONE',
      table: f.expectedTable,
      inDb: !!actualColFound,
      backendMatches: backendMatches.length,
      frontendMatches: frontendMatches.length,
      action
    });
  }

  console.table(rows);
  fs.writeFileSync('scripts/field-audit-analysis.json', JSON.stringify(rows, null, 2), 'utf8');
}

analyzeFieldAudit();
