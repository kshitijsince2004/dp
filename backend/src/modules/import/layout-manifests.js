// Data-driven known-layout fingerprints for T9 (parse-time layout version detection,
// docs/import-ux-study/03-TRIAGE-MATRIX.md). Pure data — no workbook/worksheet logic, no
// import.parse.js dependency (avoids a circular import: parse.js imports FROM here, so this
// file must never import anything back from parse.js). Fingerprint matching itself
// (buildColumnMap, thresholds, accept/reject) lives in import.parse.js's classifyLayout, which
// already owns worksheet/column resolution — this file only answers "what known layouts
// exist for this record type, and what column set does each one define per sheet role".
//
// To register a NEW known layout (e.g. a second historical template version discovered
// later): add another entry to V0_SIMPLE_PROPERTY-style below (or a new sibling const) and
// push it into getKnownLayouts()'s returned array — no other code changes anywhere in the
// import module.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// sheet name (exactly as it appears in scripts/template-baseline.manifest.json, the same
// structural source template-regression.js's regression gate compares against) -> sheet ROLE,
// per record type. Deliberately a separate small map rather than importing import.parse.js's
// own SHEET_ALIASES (which would create the circular import this file's header comment rules
// out) — the baseline manifest's sheet names are fixed/frozen (P3), so this mapping is just as
// stable as SHEET_ALIASES itself.
const BASELINE_SHEET_ROLE = {
  CASE: {
    'General Information': 'parent', 'Victim Information': 'victim', 'Act and Sections': 'act',
    'Accused Detail': 'accused', 'Property Details': 'property',
  },
  ARREST: {
    'General Info': 'parent', 'Act and Sections': 'act', 'Person Arrested Detail': 'person',
    'Property Details': 'property',
  },
  KALANDRA: {
    'General Info': 'parent', 'Act and Sections': 'act', 'Arrested Person': 'person',
    // No Property Details sheet exists in the KALANDRA template at all (verified against
    // template-baseline.manifest.json — only 3 sheets) even though readWorkbook's
    // SHEET_FIELD_LISTS.KALANDRA declares a 'property' role (reusing arrestPropertyFields) —
    // that role simply never resolves a worksheet for KALANDRA and is skipped everywhere,
    // fingerprinting included.
  },
  UIDB: { 'General Info': 'parent', 'Act and Sections': 'act' },
  MISSING: { 'Import Template': 'parent' },
};

let _baselineCache = null;
function loadBaselineManifest() {
  if (_baselineCache) return _baselineCache;
  const p = path.join(__dirname, '..', '..', '..', 'scripts', 'template-baseline.manifest.json');
  _baselineCache = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _baselineCache;
}

/** Builds the 'current' layout's { role: Set<field_key> } for one record type directly from
 * the live template-baseline manifest — so 'current' can never silently drift from the real
 * emitted template (it's the exact same file template-regression.js's `check` mode compares
 * against). Returns null when the baseline manifest has no entry / no role mapping for this
 * type (PCR_CALL — not in scripts/template-regression.js's TYPES list at all, since its
 * template is 100% registry-generated with no curated sheet roles to fingerprint). */
function currentLayoutFromBaseline(recordType) {
  const baseline = loadBaselineManifest();
  const sheets = baseline[recordType];
  const roleMap = BASELINE_SHEET_ROLE[recordType];
  if (!sheets || !roleMap) return null;
  const byRole = {};
  for (const [sheetName, role] of Object.entries(roleMap)) {
    const sheet = sheets[sheetName];
    if (!sheet) continue;
    byRole[role] = new Set(sheet.columns.map((c) => c.key).filter(Boolean));
  }
  return byRole;
}

// v0-simple-property — reconstructed 2026-07-17 from backend/scripts/import-reliability/out/
// extracted/*.json (the 2026-07 import-reliability corpus study's 54 real filled templates:
// 14 ARREST, 13 CASE, 13 MISSING, 13 UIDB — no KALANDRA/PCR_CALL samples exist, so no v0 is
// defined for them below; they still get fingerprinted against 'current' alone via
// getKnownLayouts, which is enough to reject genuine garbage without a false "older version"
// claim). Every file of a given record type agreed EXACTLY on ONE alternate header set per
// sheet (verified directly off the extracted JSON, not sampled/guessed) — a real historical
// template snapshot. Its one product-relevant difference: a 6-column Property Details sheet
// (vs. the current 37-column type-specific layout). Smaller differences ride along for free
// (an older 4-column IO block — name/PIS/rank/mobile — instead of the current single io_pis
// lookup column; a few now-added fields like work_out/work_out_date, missing_fir_no/
// missing_fir_date, uidb_no don't exist yet in this snapshot) — harmless either way, since
// missing/extra columns elsewhere were already tolerated by buildColumnMap's content-based
// matching; only the Property drift was ever a fingerprinting-relevant gap.
const V0_SIMPLE_PROPERTY = {
  CASE: {
    parent: ['fir_no', 'fir_date', 'district', 'police_station', 'local_head', 'heinous_offence', 'case_type', 'beat_number', 'occurrence_date', 'occurrence_time', 'brief_facts', 'complainant_first_name', 'complainant_middle_name', 'complainant_last_name', 'complainant_nickname', 'complainant_gender', 'complainant_relation_type', 'complainant_relative_name', 'complainant_mobile_country_code', 'complainant_mobile', 'complainant_age_year', 'complainant_house_no', 'complainant_street', 'complainant_colony', 'complainant_city_town_village', 'complainant_tehsil_block_mandal', 'complainant_country', 'complainant_state', 'complainant_district', 'complainant_police_station', 'complainant_pincode', 'complainant_perm_same', 'complainant_perm_house_no', 'complainant_perm_street', 'complainant_perm_colony', 'complainant_perm_city_town_village', 'complainant_perm_tehsil_block_mandal', 'complainant_perm_country', 'complainant_perm_state', 'complainant_perm_district', 'complainant_perm_police_station', 'complainant_perm_pincode', 'occurrence_house_no', 'occurrence_street', 'occurrence_colony', 'occurrence_city_town_village', 'occurrence_tehsil_block_mandal', 'occurrence_district', 'occurrence_police_station', 'occurrence_pincode', 'occurrence_landmark', 'io_name', 'io_pis', 'io_mobile', 'case_status', 'disposal_type', 'rc_no'],
    victim: ['fir_no', 'victim_first_name', 'victim_middle_name', 'victim_last_name', 'victim_nickname', 'victim_gender', 'victim_relation_type', 'victim_relative_name', 'victim_mobile_country_code', 'victim_mobile', 'victim_age_year', 'victim_house_no', 'victim_street', 'victim_colony', 'victim_city_town_village', 'victim_tehsil_block_mandal', 'victim_country', 'victim_state', 'victim_district', 'victim_police_station', 'victim_pincode', 'victim_perm_same', 'victim_perm_house_no', 'victim_perm_street', 'victim_perm_colony', 'victim_perm_city_town_village', 'victim_perm_tehsil_block_mandal', 'victim_perm_country', 'victim_perm_state', 'victim_perm_district', 'victim_perm_police_station', 'victim_perm_pincode'],
    act: ['fir_no', 'act', 'sections', 'crime_head', 'minor_head'],
    accused: ['fir_no', 'accused_first_name', 'accused_middle_name', 'accused_last_name', 'accused_nickname', 'accused_gender', 'accused_marital_status', 'accused_relation_type', 'accused_relative_name', 'accused_mobile_country_code', 'accused_mobile', 'accused_qualification', 'accused_age_year', 'accused_house_no', 'accused_street', 'accused_colony', 'accused_city_town_village', 'accused_tehsil_block_mandal', 'accused_country', 'accused_state', 'accused_district', 'accused_police_station', 'accused_pincode', 'accused_perm_same', 'accused_perm_house_no', 'accused_perm_street', 'accused_perm_colony', 'accused_perm_city_town_village', 'accused_perm_tehsil_block_mandal', 'accused_perm_country', 'accused_perm_state', 'accused_perm_district', 'accused_perm_police_station', 'accused_perm_pincode'],
    property: ['fir_no', 'property_major_category', 'property_minor_category', 'property_details', 'property_stolen_recovered', 'property_value'],
  },
  ARREST: {
    parent: ['linked_fir_dd_no', 'fir_date', 'local_head', 'heinous_offence', 'district', 'police_station', 'date_of_arrest', 'time_of_arrest', 'io_name', 'io_pis', 'io_rank', 'io_mobile'],
    act: ['linked_fir_dd_no', 'act', 'sections', 'crime_head', 'minor_head'],
    person: ['linked_fir_dd_no', 'date_of_arrest', 'time_of_arrest', 'arrested_first_name', 'arrested_middle_name', 'arrested_last_name', 'arrested_nickname', 'arrested_gender', 'arrested_relation_type', 'arrested_relative_name', 'arrested_mobile_country_code', 'arrested_mobile', 'arrested_age_year', 'arrested_house_no', 'arrested_street', 'arrested_colony', 'arrested_city_town_village', 'arrested_tehsil_block_mandal', 'arrested_country', 'arrested_state', 'arrested_district', 'arrested_police_station', 'arrested_pincode', 'arrested_perm_same', 'arrested_perm_house_no', 'arrested_perm_street', 'arrested_perm_colony', 'arrested_perm_city_town_village', 'arrested_perm_tehsil_block_mandal', 'arrested_perm_country', 'arrested_perm_state', 'arrested_perm_district', 'arrested_perm_police_station', 'arrested_perm_pincode', 'nafis_prepared', 'dossier_prepared', 'prev_involvement', 'bad_character', 'proclaimed_offender', 'verifying_officer_name', 'verifying_officer_rank', 'status', 'scheme_of_arrest'],
    property: ['linked_fir_dd_no', 'property_major_category', 'property_details', 'property_stolen_recovered', 'property_value', 'property_minor_category'],
  },
  MISSING: {
    parent: ['source', 'gd_no', 'gd_date', 'gd_time', 'missing_type', 'status', 'mp_known', 'missing_name', 'mp_house_no', 'mp_street', 'mp_colony', 'mp_city_town_village', 'mp_state', 'mp_district', 'mp_pincode', 'mp_perm_same', 'mp_perm_house_no', 'mp_perm_street', 'mp_perm_colony', 'mp_perm_city_town_village', 'mp_perm_state', 'mp_perm_district', 'mp_perm_pincode', 'gender', 'age', 'major_minor', 'missing_date', 'missing_place', 'Mental State', 'physical_description', 'informant_name', 'informant_relation', 'informant_mobile', 'zipnet_no', 'height', 'built', 'complexion', 'upper_dress_color', 'lower_dress_color', 'face', 'hair', 'moustache', 'beard', 'io_name', 'io_rank', 'io_pis', 'io_mobile'],
  },
  UIDB: {
    parent: ['gd_no', 'gd_date', 'gd_time', 'status', 'identified', 'deceased_name', 'deceased_house_no', 'deceased_street', 'deceased_colony', 'deceased_city_town_village', 'deceased_state', 'deceased_district', 'deceased_pincode', 'deceased_perm_same', 'deceased_perm_house_no', 'deceased_perm_street', 'deceased_perm_colony', 'deceased_perm_city_town_village', 'deceased_perm_state', 'deceased_perm_district', 'deceased_perm_pincode', 'found_date', 'found_place', 'found_time', 'found_latitude', 'found_longitude', 'approx_age', 'description', 'identification_marks', 'gender', 'height', 'built', 'complexion', 'upper_dress_color', 'lower_dress_color', 'face', 'hair', 'moustache', 'beard', 'informant_name', 'informant_relation', 'informant_mobile', 'zipnet_no', 'cause_of_death', 'deceased_relative_name', 'deceased_relation_type', 'filed_by_acp_sdm', 'filed_by_acp_sdm_date', 'io_name', 'io_rank', 'io_pis', 'io_mobile'],
    act: ['gd_no', 'act_name', 'sections', 'major_head', 'minor_head'],
  },
};

/** Public entry: known layouts for a record type, as `[{ id, label, sheets: {role: Set} }, ...]`
 * — 'current' always first (built live off the baseline manifest), then any hardcoded
 * historical layout this type has evidence for. Returns `[]` for a type with NO layout
 * coverage at all (PCR_CALL) — callers (import.parse.js's classifyLayout) treat an empty list
 * as "don't fingerprint this type", never as "everything about it is unknown". */
export function getKnownLayouts(recordType) {
  const current = currentLayoutFromBaseline(recordType);
  if (!current) return [];
  const layouts = [{ id: 'current', label: 'the current template', sheets: current }];
  const v0 = V0_SIMPLE_PROPERTY[recordType];
  if (v0) {
    const sheets = {};
    for (const [role, keys] of Object.entries(v0)) sheets[role] = new Set(keys);
    layouts.push({ id: 'v0-simple-property', label: 'an older template version', sheets });
  }
  return layouts;
}
