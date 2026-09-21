// ─── Named-range / cascade wiring constants (used by template-builder.service.js) ───────

// Field keys whose option lists are too long for an inline Excel formula (>40 items or
// strings that would exceed 255 chars). Template builder writes these to the hidden
// _Lookups sheet and references them via named ranges.
export const NAMED_RANGE_FIELD_KEYS = new Set([
  'ipc_sections', 'excise_sections', 'arms_sections', 'gambling_sections', 'sections',
  'ipc_major_head', 'excise_major_head', 'arms_major_head', 'gambling_major_head',
  'local_head', 'crime_head', 'beat_no',
  'theft_minor_head', 'murder_minor_head', 'hurt_minor_head', 'cheating_minor_head',
  'robbery_minor_head', 'excise_possession_minor_head', 'excise_sale_minor_head',
  'excise_smuggling_minor_head', 'arms_possession_minor_head', 'arms_use_minor_head',
  'gambling_house_minor_head', 'gambling_public_minor_head',
  'property_major_category',
  'district', 'police_station',
]);

// Field keys that use INDIRECT()-based cascade validation (the parent's selected value
// is used to look up the named range for the child's options at run-time in Excel).
export const INDIRECT_CASCADE_FIELDS = new Set(['property_minor_category']);

// Prefix applied to every named range written to _Lookups.
// Must be a valid Excel name segment (alphanumeric/underscore only).
export const NR_PREFIX = 'OPT_';

// ────────────────────────────────────────────────────────────────────────────────────────

// Geo/demographic lists come from the ONE source module (WP11 — see
// backend/src/config/geoData.js: nationality via i18n-nationality, India states/districts
// via the reviewed LGD snapshot in config/ref-data/). Re-exported under the names this
// module's consumers (import.parse.js, import.controller.js, template-builder.service.js)
// have always used.
import {
  NATIONALITY_OPTS, INDIA_STATES, ALL_INDIA_DISTRICTS, INDIA_COUNTRY, DELHI_STATE,
} from '../../config/geoData.js';

export const COUNTRY_OPTS = NATIONALITY_OPTS;
export const STATE_OPTS = INDIA_STATES;
export { ALL_INDIA_DISTRICTS };

// POLICE districts (Delhi Police operational districts, hierarchy-derived naming) — used
// ONLY by the record-level `district` column (which police district owns the record) and
// the occurrence address (Delhi-scoped by decision D-A). Person/present/permanent ADDRESS
// `*_district` fields are INDIA-scoped and cascade from their sibling state via the LGD
// snapshot instead — never this list.
export const DISTRICT_OPTS = [
  "South District (SD)", "South East District (SED)", "New Delhi District (NDD)",
  "South West District (SWD)", "West District (WD)", "Outer District (OD)",
  // (RND) matches the field_registry option value the interactive form stores — was (ROH)
  "Dwarka District (DW)", "North West District (NWD)", "Rohini District (RND)",
  "Outer North District (OND)", "Central District (CD)", "North District (ND)",
  "East District (ED)", "North East District (NED)", "Shahdara District (SHD)"
];

const getPersonFieldsList = (prefix, labelPrefixEn, labelPrefixHi) => {
  return [
    { field_key: `${prefix}_npr`, label_en: `${labelPrefixEn} NPR No.`, label_hi: `${labelPrefixHi} एनपीआर संख्या`, required: false, hint: 'NPR Number' },
    { field_key: `${prefix}_first_name`, label_en: `${labelPrefixEn} First Name`, label_hi: `${labelPrefixHi} पहला नाम`, required: true, hint: 'First Name' },
    { field_key: `${prefix}_middle_name`, label_en: `${labelPrefixEn} Middle Name`, label_hi: `${labelPrefixHi} मध्यम नाम`, required: false, hint: 'Middle Name' },
    { field_key: `${prefix}_last_name`, label_en: `${labelPrefixEn} Last Name`, label_hi: `${labelPrefixHi} अंतिम नाम`, required: false, hint: 'Last Name' },
    { field_key: `${prefix}_nickname`, label_en: `${labelPrefixEn} Alias`, label_hi: `${labelPrefixHi} उपनाम`, required: false, hint: 'Nickname or alias' },
    { field_key: `${prefix}_gender`, label_en: `${labelPrefixEn} Gender`, label_hi: `${labelPrefixHi} लिंग`, required: false, options: ['Male', 'Female', 'Transgender', 'Unknown'] },
    { field_key: `${prefix}_social_category`, label_en: `${labelPrefixEn} Social Category`, label_hi: `${labelPrefixHi} सामाजिक श्रेणी`, required: false, options: ['SC', 'ST', 'OBC', 'GEN', 'UNKNOWN'] },
    { field_key: `${prefix}_education`, label_en: `${labelPrefixEn} Education`, label_hi: `${labelPrefixHi} शिक्षा`, required: false, options: ['ILLITERATE', 'SCHOOL_DROPOUT', 'UP_TO_10TH', 'UP_TO_12TH', 'GRADUATE', 'PROFESSIONAL', 'UNKNOWN'] },
    { field_key: `${prefix}_financial_status`, label_en: `${labelPrefixEn} Financial Status`, label_hi: `${labelPrefixHi} वित्तीय स्थिति`, required: false, options: ['BPL', 'LOWER', 'MIDDLE', 'UPPER', 'UNKNOWN'] },
    { field_key: `${prefix}_relation_type`, label_en: `${labelPrefixEn} Relation Type`, label_hi: `${labelPrefixHi} संबंध का प्रकार`, required: false, options: ['Father', 'Mother', 'Husband', 'Wife', 'Guardian', 'Other'] },
    { field_key: `${prefix}_relative_name`, label_en: `${labelPrefixEn} Relative Name`, label_hi: `${labelPrefixHi} रिश्तेदार का नाम`, required: false, hint: 'Father\'s or Husband\'s Name' },
    { field_key: `${prefix}_mobile_country_code`, label_en: `${labelPrefixEn} Mobile Country Code`, label_hi: `${labelPrefixHi} मोबाइल देश कोड`, required: false, hint: 'e.g. +91' },
    { field_key: `${prefix}_mobile`, label_en: `${labelPrefixEn} Mobile No.`, label_hi: `${labelPrefixHi} मोबाइल नंबर`, required: false, hint: '10-digit mobile number' },
    // { field_key: `${prefix}_qualification`, label_en: `${labelPrefixEn} Qualification`, label_hi: `${labelPrefixHi} योग्यता`, required: false, options: ['Uneducated', '10th', '10+2', 'Graduate', 'Post-Graduate'] },
    { field_key: `${prefix}_dob`, label_en: `${labelPrefixEn} Date of Birth`, label_hi: `${labelPrefixHi} जन्म तिथि`, required: false, hint: 'dd-mm-yyyy' },
    { field_key: `${prefix}_age_year`, label_en: `${labelPrefixEn} Age (Years)`, label_hi: `${labelPrefixHi} आयु (वर्ष)`, required: false, hint: 'Age in years' },
    { field_key: `${prefix}_birth_year`, label_en: `${labelPrefixEn} Year of Birth`, label_hi: `${labelPrefixHi} जन्म का वर्ष`, required: false, hint: 'e.g. 1995' },
    { field_key: `${prefix}_house_no`, label_en: `${labelPrefixEn} House No.`, label_hi: `${labelPrefixHi} मकान संख्या`, required: false, hint: 'House Number' },
    { field_key: `${prefix}_street`, label_en: `${labelPrefixEn} Street`, label_hi: `${labelPrefixHi} गली / सड़क`, required: false, hint: 'Street name' },
    { field_key: `${prefix}_colony`, label_en: `${labelPrefixEn} Colony`, label_hi: `${labelPrefixHi} कॉलोनी`, required: false, hint: 'Colony name' },
    { field_key: `${prefix}_city_town_village`, label_en: `${labelPrefixEn} Village / City / Town`, label_hi: `${labelPrefixHi} गांव / शहर / नगर`, required: false, hint: 'Village/City' },
    { field_key: `${prefix}_tehsil_block_mandal`, label_en: `${labelPrefixEn} Tehsil / Block / Mandal`, label_hi: `${labelPrefixHi} तहसील / ब्लॉक / मंडल`, required: false, hint: 'Tehsil' },
    { field_key: `${prefix}_present_address`, label_en: `${labelPrefixEn} Full Present Address`, label_hi: `${labelPrefixHi} वर्तमान पता`, required: false, hint: 'Full residential address' },
    { field_key: `${prefix}_country`, label_en: `${labelPrefixEn} Nationality`, label_hi: `${labelPrefixHi} राष्ट्रीयता`, required: false, options: COUNTRY_OPTS },
    { field_key: `${prefix}_state`, label_en: `${labelPrefixEn} State`, label_hi: `${labelPrefixHi} राज्य`, required: false, options: STATE_OPTS },
    // Person ADDRESS districts are India-scoped (WP11): the full-India superset backs the
    // dropdown, and Excel's state→district cascade narrows it per the selected state.
    { field_key: `${prefix}_district`, label_en: `${labelPrefixEn} District`, label_hi: `${labelPrefixHi} जिला`, required: false, options: ALL_INDIA_DISTRICTS },
    { field_key: `${prefix}_police_station`, label_en: `${labelPrefixEn} Police Station`, label_hi: `${labelPrefixHi} पुलिस स्टेशन (PS)`, required: false, hint: 'Police Station' },
    { field_key: `${prefix}_pincode`, label_en: `${labelPrefixEn} Pin Code`, label_hi: `${labelPrefixHi} पिन कोड`, required: false, hint: '6-digit PIN code' }
  ];
};

const getAddressFieldsList = (prefix, labelPrefixEn, labelPrefixHi) => {
  return [
    { field_key: `${prefix}_house_no`, label_en: `${labelPrefixEn} House No.`, label_hi: `${labelPrefixHi} मकान संख्या`, required: false, hint: 'House Number' },
    { field_key: `${prefix}_street`, label_en: `${labelPrefixEn} Street`, label_hi: `${labelPrefixHi} गली / सड़क`, required: false, hint: 'Street name' },
    { field_key: `${prefix}_colony`, label_en: `${labelPrefixEn} Colony`, label_hi: `${labelPrefixHi} कॉलोनी`, required: false, hint: 'Colony name' },
    { field_key: `${prefix}_city_town_village`, label_en: `${labelPrefixEn} Village / City / Town`, label_hi: `${labelPrefixHi} गांव / शहर / नगर`, required: false, hint: 'Village/City' },
    { field_key: `${prefix}_tehsil_block_mandal`, label_en: `${labelPrefixEn} Tehsil / Block / Mandal`, label_hi: `${labelPrefixHi} तहसील / ब्लॉक / मंडल`, required: false, hint: 'Tehsil' },
    { field_key: `${prefix}_country`, label_en: `${labelPrefixEn} Nationality`, label_hi: `${labelPrefixHi} राष्ट्रीयता`, required: false, options: COUNTRY_OPTS },
    { field_key: `${prefix}_state`, label_en: `${labelPrefixEn} State`, label_hi: `${labelPrefixHi} राज्य`, required: false, options: STATE_OPTS },
    // Same India-scope rule as getPersonFieldsList above. The OCCURRENCE call site overrides
    // this back to the police-district list (occurrence is Delhi-scoped by decision D-A).
    { field_key: `${prefix}_district`, label_en: `${labelPrefixEn} District`, label_hi: `${labelPrefixHi} जिला`, required: false, options: ALL_INDIA_DISTRICTS },
    { field_key: `${prefix}_police_station`, label_en: `${labelPrefixEn} Police Station`, label_hi: `${labelPrefixHi} पुलिस स्टेशन (PS)`, required: false, hint: 'Police Station' },
    { field_key: `${prefix}_pincode`, label_en: `${labelPrefixEn} Pin Code`, label_hi: `${labelPrefixHi} पिन कोड`, required: false, hint: '6-digit PIN code' }
  ];
};

export const caseGeneralFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'e.g. FIR-220/2026' },
  { field_key: 'fir_date', label_en: 'FIR Date', label_hi: 'प्राथमिकी (FIR) तिथि', required: true, hint: 'dd-mm-yyyy' },
  { field_key: 'district', label_en: 'District', label_hi: 'जिला', required: true, hint: 'e.g. New Delhi District (NDD)' },
  { field_key: 'police_station', label_en: 'Police Station', label_hi: 'थाना', required: true, hint: 'e.g. Parliament Street' },
  // #E (2026-07-20): only CCTNS + Zero FIR registrations carry crime heads (act/section/local_head);
  // other registration types are RELAXED. local_head is required ONLY when case_type is one of those
  // two — show_when gates BOTH visibility and the required check (import.validate.js honors show_when
  // before requiredness). case_type lives on this same (parent) sheet, so no cross-sheet plumbing.
  { field_key: 'local_head', label_en: 'Local Head', label_hi: 'स्थानीय शीर्ष', required: true, hint: 'e.g. Theft / Larceny', show_when: { field: 'case_type', value: ['cctns(manual FIR)', 'zero FIR'] } },
  { field_key: 'heinous_offence', label_en: 'Heinous Offence', label_hi: 'जघन्य अपराध', required: false, options: ['Yes', 'No'] },
  { field_key: 'under_section', label_en: 'Under Section', label_hi: 'धारा के अंतर्गत', required: false, hint: 'e.g. Section 379 IPC' },
  { field_key: 'case_type', label_en: 'Case Type', label_hi: 'मामले का प्रकार', required: true, hint: 'cctns(manual FIR) / eTheft / eMVT / NCRP / zero FIR' },
  //{ field_key: 'sid_number', label_en: 'SID Number', label_hi: 'एसआईडी संख्या', required: false, hint: 'e.g. SID-889021' },
  { field_key: 'cctns_number', label_en: 'CCTNS Number', label_hi: 'सीसीटीएनएस संख्या', required: false, hint: 'e.g. CCTNS-202699104' },
  { field_key: 'beat_number', label_en: 'Beat Number', label_hi: 'बीट संख्या', required: false, hint: 'e.g. Beat No. 4' },
  { field_key: 'occurrence_date', label_en: 'Occurrence Date', label_hi: 'घटना की तिथि', required: false, hint: 'dd-mm-yyyy' },
  { field_key: 'occurrence_time', label_en: 'Occurrence Time', label_hi: 'घटना का समय', required: false, hint: 'HH:MM' },
  { field_key: 'brief_facts', label_en: 'Brief Facts of Case', label_hi: 'मामले के संक्षिप्त तथ्य', required: false, hint: 'Incident narrative' },
  
  ...getPersonFieldsList('complainant', 'Complainant', 'शिकायतकर्ता').filter(f => f.field_key !== 'complainant_npr'&& f.field_key !== 'complainant_present_address'&& f.field_key !== 'complainant_birth_year'&& f.field_key !== 'complainant_dob'),
  { field_key: 'complainant_perm_same', label_en: 'Is Complainant Permanent Same As Present Address?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: false, options: ['Yes', 'No'] },
  ...getAddressFieldsList('complainant_perm', 'Complainant Permanent Address', 'शिकायतकर्ता का स्थायी पता'),
  // Occurrence is Delhi-scoped (D-A): no country/state columns, and its district is the
  // Delhi POLICE district list (drives the district→police-station cascade), never the
  // India address superset the shared helper now defaults to.
  ...getAddressFieldsList('occurrence', 'Place of Occurrence Address', 'घटनास्थल का पता विवरण')
    .filter(f => f.field_key !== 'occurrence_country' && f.field_key !== 'occurrence_state')
    .map(f => f.field_key === 'occurrence_district' ? { ...f, options: DISTRICT_OPTS } : f),
  { field_key: 'occurrence_landmark', label_en: 'Place of Occurrence Landmark', label_hi: 'घटनास्थल का मार्ग-चिह्न', required: false, hint: 'Landmark' },

  // 2026-07-16 (WP10, explicit user-approved template exception): IO detail columns
  // (name/rank/mobile) removed — the single PIS-number column below is resolved against
  // investigating_officers (batch's target PS) at import validation; unknown PIS = ERROR.
  { field_key: 'io_pis', label_en: 'IO ID (PIS No.)', label_hi: 'जांच अधिकारी आईडी (पीआईएस नंबर)', required: false, hint: 'PIS number of a registered IO, e.g. 28080214' },
  { field_key: 'date_of_arrest', label_en: 'Date Of Arrest', label_hi: 'गिरफ्तारी की तिथि', required: false, hint: 'dd-mm-yyyy' },
  { field_key: 'case_status', label_en: 'Status', label_hi: 'स्थिति', required: false },
  { field_key: 'disposal_type', label_en: 'Disposal Type', label_hi: 'निपटान प्रकार', required: false },
  { field_key: 'rc_no', label_en: 'RC No.', label_hi: 'आरसी संख्या', required: false, hint: 'e.g. RC-123/2026' }
];

export const caseActSectionFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'Must match General Information FIR Number' },
  // #E (2026-07-20): act/sections/crime_head relaxed to required:false at row-level — crime heads
  // are only mandatory for CCTNS + Zero FIR registrations. This sheet has no case_type column (it's
  // a child sheet keyed by fir_no), so the case_type-conditional enforcement lives at the
  // composed-row level in import.validate.js (gated on the parent's case_type there).
  { field_key: 'act', label_en: 'Act', label_hi: 'अधिनियम', required: false, hint: 'e.g. IPC / BNS (required for CCTNS / Zero FIR)' },
  { field_key: 'sections', label_en: 'Sections', label_hi: 'धाराएं', required: false, hint: 'e.g. Sec 379/411 (required for CCTNS / Zero FIR)' },
  { field_key: 'crime_head', label_en: 'Crime Head', label_hi: 'अपराध शीर्ष', required: false, hint: 'e.g. Burglary / Snatching (required for CCTNS / Zero FIR)' },
  { field_key: 'minor_head', label_en: 'Minor Head', label_hi: 'लघु शीर्ष', required: false, hint: 'e.g. Cycle Theft / Dowry Death' }
];

export const caseVictimFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'Must match General Information FIR Number' },
  
  // --- Victim Personal Details ---
  // { field_key: 'victim_npr', label_en: 'Victim NPR No.', label_hi: 'पीड़ित एनपीआर संख्या', required: false }, // ❌ Excluded
  { field_key: 'victim_first_name', label_en: 'Victim First Name', label_hi: 'पीड़ित पहला नाम', required: true, hint: 'First Name' },
  { field_key: 'victim_middle_name', label_en: 'Victim Middle Name', label_hi: 'पीड़ित मध्यम नाम', required: false }, // ❌ Excluded
  { field_key: 'victim_last_name', label_en: 'Victim Last Name', label_hi: 'पीड़ित अंतिम नाम', required: false },
  { field_key: 'victim_nickname', label_en: 'Victim Alias', label_hi: 'पीड़ित उपनाम', required: false }, // ❌ Excluded
  { field_key: 'victim_gender', label_en: 'Victim Gender', label_hi: 'पीड़ित लिंग', required: false, options: ['Male', 'Female', 'Transgender', 'Unknown'] },
  { field_key: 'victim_relation_type', label_en: 'Victim Relation Type', label_hi: 'पीड़ित संबंध का प्रकार', required: false, options: ['Father', 'Mother', 'Husband', 'Wife', 'Guardian', 'Other'] },
  { field_key: 'victim_relative_name', label_en: 'Victim Relative Name', label_hi: 'पीड़ित रिश्तेदार का नाम', required: false, hint: 'Father\'s or Husband\'s Name' },
  { field_key: 'victim_mobile_country_code', label_en: 'Victim Mobile Country Code', label_hi: 'पीड़ित मोबाइल देश कोड', required: false },
  { field_key: 'victim_mobile', label_en: 'Victim Mobile No.', label_hi: 'पीड़ित मोबाइल नंबर', required: false, hint: '10-digit mobile number' },
  //{ field_key: 'victim_qualification', label_en: 'Victim Qualification', label_hi: 'पीड़ित योग्यता', required: false, options: ['Uneducated', '10th', '10+2', 'Graduate', 'Post-Graduate'] },
  //{ field_key: 'victim_dob', label_en: 'Victim Date of Birth', label_hi: 'पीड़ित जन्म तिथि', required: false, hint: 'DD/MM/YYYY' },
  { field_key: 'victim_age_year', label_en: 'Victim Age (Years)', label_hi: 'पीड़ित आयु (वर्ष)', required: false },
  //{ field_key: 'victim_birth_year', label_en: 'Victim Year of Birth', label_hi: 'पीड़ित जन्म का वर्ष', required: false },
  
  // --- Victim Present Address ---
  { field_key: 'victim_house_no', label_en: 'Victim House No.', label_hi: 'पीड़ित मकान संख्या', required: false },
  { field_key: 'victim_street', label_en: 'Victim Street', label_hi: 'पीड़ित गली / सड़क', required: false },
  { field_key: 'victim_colony', label_en: 'Victim Colony', label_hi: 'पीड़ित कॉलोनी', required: false },
  { field_key: 'victim_city_town_village', label_en: 'Victim Village / City / Town', label_hi: 'पीड़ित गांव / शहर / नगर', required: false },
  { field_key: 'victim_tehsil_block_mandal', label_en: 'Victim Tehsil / Block / Mandal', label_hi: 'पीड़ित तहसील / ब्लॉक / मंडल', required: false },
  //{ field_key: 'victim_present_address', label_en: 'Victim Full Present Address', label_hi: 'पीड़ित वर्तमान पता', required: false },
  { field_key: 'victim_country', label_en: 'Victim Nationality', label_hi: 'पीड़ित राष्ट्रीयता', required: false, options: COUNTRY_OPTS },
  { field_key: 'victim_state', label_en: 'Victim State', label_hi: 'पीड़ित राज्य', required: false, options: STATE_OPTS },
  { field_key: 'victim_district', label_en: 'Victim District', label_hi: 'पीड़ित जिला', required: false, options: DISTRICT_OPTS },
  { field_key: 'victim_police_station', label_en: 'Victim Police Station', label_hi: 'पीड़ित पुलिस स्टेशन (PS)', required: false },
  { field_key: 'victim_pincode', label_en: 'Victim Pin Code', label_hi: 'पीड़ित पिन कोड', required: false },

  // --- Victim Permanent Address Toggle ---
  { field_key: 'victim_perm_same', label_en: 'Is Victim Permanent Address Same As Present?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: false, options: ['Yes', 'No'] },
  
  // You can also comment out individual permanent address fields from here if needed
  ...getAddressFieldsList('victim_perm', 'Victim Permanent Address', 'पीड़ित का स्थायी पता')
];


export const caseAccusedFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'Must match General Information FIR Number' },
  //{ field_key: 'accused_npr', label_en: 'Accused NPR No.', label_hi: 'अभियुक्त एनपीआर संख्या', required: false, hint: 'NPR Number' },
  ...getPersonFieldsList('accused', 'Accused', 'अभियुक्त')
    .filter(f => f.field_key !== 'accused_dob' && f.field_key !== 'accused_birth_year' && f.field_key !== 'accused_present_address' && f.field_key !== 'accused_npr')
    .map(f => f.field_key === 'accused_gender' ? { ...f, required: true } : f),
  { field_key: 'accused_perm_same', label_en: 'Is Accused Permanent Address Same As Present?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: false, options: ['Yes', 'No'] },
  ...getAddressFieldsList('accused_perm', 'Accused Permanent Address', 'अभियुक्त का स्थायी पता')
];

export const casePropertyFields = [
  { field_key: 'fir_no', label_en: 'FIR Number', label_hi: 'प्राथमिकी (FIR) संख्या', required: true, hint: 'Must match General Information FIR Number' },
  // property_major_category: no static options — template builder fetches live from DB (excel_property_types / excel_other_property_categories).
  // property_minor_category: uses INDIRECT() cascade in Excel — template builder writes OPT_<category_slug> named ranges on _Lookups sheet.
  { field_key: 'property_major_category', label_en: 'Property Major Category', label_hi: 'संपत्ति मुख्य श्रेणी', required: false },
  { field_key: 'property_minor_category', label_en: 'Type of property', label_hi: 'संपत्ति का प्रकार', required: false },
  { field_key: 'property_details', label_en: 'Property Details / Description', label_hi: 'संपत्ति का विवरण', required: false },
  { field_key: 'property_stolen_recovered', label_en: 'Property Stolen / Recovered', label_hi: 'संपत्ति चोरी / बरामद स्थिति', required: false, options: ['Stolen', 'Recovered', 'Involved', 'Seized'] },
  { field_key: 'property_value', label_en: 'Property Value in inr', label_hi: 'संपत्ति का मूल्य (INR में)', required: false }
];

export const arrestGeneralFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'Linked FIR / DD No.', label_hi: 'संबंधित एफआईआर / डीडी संख्या', required: true, hint: 'e.g. FIR-104/2026' },
  { field_key: 'fir_date', label_en: 'FIR Date', label_hi: 'प्राथमिकी (FIR) तिथि', required: false, hint: 'dd-mm-yyyy' },
  { field_key: 'local_head', label_en: 'Local Head', label_hi: 'स्थानीय शीर्ष', required: false, hint: 'e.g. Theft / Larceny' },
  { field_key: 'heinous_offence', label_en: 'Heinous Offence', label_hi: 'जघन्य अपराध', required: false, options: ['Yes', 'No'] },
  { field_key: 'district', label_en: 'District', label_hi: 'जिला', required: true, hint: 'e.g. New Delhi District (NDD)' },
  { field_key: 'police_station', label_en: 'Police Station', label_hi: 'थाना', required: true, hint: 'e.g. Parliament Street' },
  // 2026-07-16 (WP10): IO detail columns removed — single resolved PIS column, see CASE note.
  { field_key: 'io_pis', label_en: 'IO ID (PIS No.)', label_hi: 'जांच अधिकारी आईडी (पीआईएस नंबर)', required: false, hint: 'PIS number of a registered IO, e.g. 28080214' }
];

export const arrestActSectionFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'Linked FIR / DD No.', label_hi: 'संबंधित एफआईआर / डीडी संख्या', required: true, hint: 'Must match General Info sheet' },
  { field_key: 'act', label_en: 'Act', label_hi: 'अधिनियम', required: true, hint: 'e.g. IPC / BNS' },
  { field_key: 'sections', label_en: 'Sections', label_hi: 'धाराएं', required: true, hint: 'e.g. Sec 379/411' },
  { field_key: 'crime_head', label_en: 'Crime Head', label_hi: 'अपराध शीर्ष', required: true, hint: 'e.g. Burglary / Snatching' },
  { field_key: 'minor_head', label_en: 'Minor Head', label_hi: 'लघु शीर्ष', required: false, hint: 'e.g. Cycle Theft / Dowry Death' }
];

export const arrestPersonFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'Linked FIR / DD No.', label_hi: 'संबंधित एफआईआर / डीडी संख्या', required: true, hint: 'Must match General Info sheet' },
  { field_key: 'date_of_arrest', label_en: 'Date Of Arrest', label_hi: 'गिरफ्तारी की तिथि', required: true, hint: 'dd-mm-yyyy' },
  { field_key: 'time_of_arrest', label_en: 'Time Of Arrest', label_hi: 'गिरफ्तारी का समय', required: false, hint: 'HH:MM' },
  { field_key: 'arrest_place', label_en: 'Place of Arrest', label_hi: 'गिरफ्तारी का स्थान', required: false },
  { field_key: 'arrest_street', label_en: 'Street of Arrest', label_hi: 'गिरफ्तारी का गली / सड़क', required: false },
  { field_key: 'arrest_colony', label_en: 'Colony of Arrest', label_hi: 'गिरफ्तारी का कॉलोनी', required: false },
  { field_key: 'arrest_district', label_en: 'District of Arrest', label_hi: 'गिरफ्तारी का जिला', required: false },
  { field_key: 'arrest_landmark', label_en: 'Landmark of Arrest', label_hi: 'गिरफ्तारी का लैंडमार्क', required: false },
  ...getPersonFieldsList('arrested', 'Arrested Person', 'गिरफ्तार व्यक्ति')
    .filter(f => f.field_key !== 'arrested_dob' && f.field_key !== 'arrested_birth_year' && f.field_key !== 'arrested_npr' && f.field_key !== 'arrested_present_address')
    .map(f => f.field_key === 'arrested_gender' ? { ...f, required: true } : f),
  { field_key: 'arrested_perm_same', label_en: 'Is Permanent Address same as Present Address?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: true, options: ['Yes', 'No'] },
  //{ field_key: 'arrested_perm_address', label_en: 'Full Permanent Address', label_hi: 'स्थायी पता', required: false },
  ...getAddressFieldsList('arrested_perm', 'Arrested Person Permanent Address', 'गिरफ्तार व्यक्ति का स्थायी पता'),
  { field_key: 'nafis_prepared', label_en: 'NAFIS Prepared', label_hi: 'नाफिस तैयार किया गया', required: false, options: ['Yes', 'No'] },
  { field_key: 'dossier_prepared', label_en: 'Dossier Prepared', label_hi: 'डोजियर तैयार किया गया', required: false, options: ['Yes', 'No'] },
  { field_key: 'prev_involvement', label_en: 'Previous involvement', label_hi: 'पूर्व संलिप्तता', required: false, options: ['Yes', 'No'] },
  { field_key: 'bad_character', label_en: 'Bad Character (BC)', label_hi: 'बुरा चरित्र (BC)', required: false, options: ['Yes', 'No'] },
  { field_key: 'proclaimed_offender', label_en: 'Proclaimed Offender (PO)', label_hi: 'घोषित अपराधी (PO)', required: false, options: ['Yes', 'No'] },
  { field_key: 'verifying_officer_name', label_en: 'Arresting Officer Name', label_hi: 'गिरफ्तार करने वाले अधिकारी का नाम', required: false },
  { field_key: 'verifying_officer_rank', label_en: 'Arresting Officer Rank', label_hi: 'गिरफ्तार करने वाले अधिकारी का पद', required: false, options: ['Constable', 'Head Constable', 'Assistant Sub Inspector', 'Sub Inspector', 'Inspector', 'Deputy Superintendent of Police', 'Superintendent of Police'] },
  { field_key: 'status', label_en: 'Custody status', label_hi: 'हिरासत की स्थिति', required: false },
  { field_key: 'scheme_of_arrest', label_en: 'Scheme of arrest', label_hi: 'गिरफ्तारी की योजना', required: false },
  //{ field_key: 'kin_name', label_en: 'Relative Name', label_hi: 'रिश्तेदार का नाम', required: false },
  //{ field_key: 'kin_mobile', label_en: 'Mobile', label_hi: 'मोबाइल', required: false },
  //{ field_key: 'kin_relationship', label_en: 'Relationship', label_hi: 'संबंध', required: false },
  //{ field_key: 'photo_path', label_en: 'Mugshot Filename', label_hi: 'फोटो फाइल नाम', required: false }
];

export const arrestPropertyFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'Linked FIR / DD No.', label_hi: 'संबंधित एफआईआर / डीडी संख्या', required: true, hint: 'Must match General Info sheet' },
  // property_major_category: no static options — template builder fetches live from DB.
  // property_minor_category: uses INDIRECT() cascade in Excel.
  { field_key: 'property_major_category', label_en: 'Property Major Category', label_hi: 'संपत्ति मुख्य श्रेणी', required: false },
  { field_key: 'property_minor_category', label_en: 'Type of property', label_hi: 'संपत्ति का प्रकार', required: false },
  { field_key: 'property_details', label_en: 'Property Details / Description', label_hi: 'संपत्ति का विवरण', required: false },
  { field_key: 'property_stolen_recovered', label_en: 'Property Stolen / Recovered', label_hi: 'संपत्ति चोरी / बरामद स्थिति', required: false, options: ['Stolen', 'Recovered', 'Involved', 'Seized'] },
  { field_key: 'property_value', label_en: 'Property Value in inr', label_hi: 'संपत्ति का मूल्य (INR में)', required: false }
  // { field_key: 'property_phone_number', label_en: 'Phone Number', label_hi: 'फोन नंबर', required: false },
  // { field_key: 'phone_make', label_en: 'Phone Make / Brand', label_hi: 'फोन का ब्रांड', required: false },
  // { field_key: 'phone_model', label_en: 'Phone Model', label_hi: 'फोन का मॉडल', required: false },
  // { field_key: 'phone_imei', label_en: 'IMEI Number', label_hi: 'आईएमईआई नंबर', required: false },
  // { field_key: 'phone_color', label_en: 'Phone Color', label_hi: 'फोन का रंग', required: false }
];

// ─── KALANDRA (standalone / preventive arrest) ──────────────────────────────────────────
// Kalandra is the ARREST form's non-FIR case type (caseType='kalandra' in the frontend):
// same record shape, keyed by a DD number instead of a linked FIR, custody options
// JC / Bound Down / Lockup / Fine (fields.controller.js). Its import template reuses the
// ARREST sheet structures verbatim — only the key column is relabeled and FIR Date is
// dropped. Imported rows are stored as ARREST records tagged arrest_type='kalandra'.
const withFieldPatch = (fields, key, patch) =>
  fields.map(f => (f.field_key === key ? { ...f, ...patch } : f));

const KALANDRA_ACT_LINKED_PATCH = { label_en: 'Linked GD Number', label_hi: 'लिंक्ड जीडी संख्या', hint: 'Must match General Info sheet GD Number' };
const KALANDRA_PERSON_LINKED_PATCH = { label_en: 'Linked GD No.', label_hi: 'लिंक्ड जीडी संख्या', hint: 'Must match General Info sheet GD Number' };

export const kalandraGeneralFields = [
  { field_key: 'linked_fir_dd_no', label_en: 'GD Number', label_hi: 'जीडी संख्या', required: true, hint: 'e.g. GD-104/2026' },
  { field_key: 'gd_date', label_en: 'GD Date', label_hi: 'जीडी दिनांक', required: false, hint: 'dd-mm-yyyy' },
  { field_key: 'gd_time', label_en: 'GD Time', label_hi: 'जीडी समय', required: false, hint: 'HH:MM' },
  ...arrestGeneralFields.filter(f => f.field_key !== 'linked_fir_dd_no' && f.field_key !== 'fir_date')
];

export const kalandraActSectionFields = withFieldPatch(
  arrestActSectionFields, 'linked_fir_dd_no', KALANDRA_ACT_LINKED_PATCH
);

export const kalandraPersonFields = withFieldPatch(
  withFieldPatch(arrestPersonFields, 'linked_fir_dd_no', KALANDRA_PERSON_LINKED_PATCH),
  // Kalandra custody options differ from against-FIR arrests (no PC/Bail/Release/35(3))
  'status', { options: ['JC', 'Bound Down', 'Lockup', 'Fine', 'Apprehension'] }
);

// UIDB's "Act and Sections" sheet — mirrors caseActSectionFields/arrestActSectionFields.
// act_name/sections are real field_registry rows (their labels/options come from there);
// major_head/minor_head are synthetic canonical columns (same approach as CASE's 'crime_head'/
// 'minor_head') that the Excel cascade writes directly, matching the field names
// records.service.js's mergeConditionalFields already treats as canonical for every record
// type — this sidesteps needing the reader to fill in per-act conditional fields
// (ipc_major_head, theft_minor_head, ...) that the import path never merges on its own.
export const uidbActSectionFields = [
  { field_key: 'gd_no', label_en: 'GD Number', label_hi: 'जीडी संख्या', required: true, hint: 'Must match Import Template sheet GD Number' },
  { field_key: 'act_name', label_en: 'Act', label_hi: 'अधिनियम', required: false, hint: 'e.g. IPC / BNS' },
  { field_key: 'sections', label_en: 'Sections', label_hi: 'धाराएं', required: false, hint: 'e.g. Sec 302' },
  { field_key: 'major_head', label_en: 'Major Head', label_hi: 'मुख्य शीर्ष', required: false, hint: 'e.g. Murder / Theft' },
  { field_key: 'minor_head', label_en: 'Minor Head', label_hi: 'लघु शीर्ष', required: false, hint: 'e.g. Cycle Theft / Dowry Death' }
];

// Raw conditional per-act/per-crime-type fields that back the interactive form's
// show-only-the-matching-one behaviour — never meaningful as their own Excel columns
// (nothing merges them for imported rows), so they're excluded from UIDB's flat sheet.
export const UIDB_ACT_SECTION_EXCLUDE_KEYS = new Set([
  'act_name', 'sections', 'other_major_head', 'ipc_major_head', 'excise_major_head',
  'arms_major_head', 'gambling_major_head', 'theft_minor_head', 'murder_minor_head',
  'hurt_minor_head', 'cheating_minor_head', 'robbery_minor_head',
  'excise_possession_minor_head', 'excise_sale_minor_head', 'excise_smuggling_minor_head',
  'arms_possession_minor_head', 'arms_use_minor_head', 'gambling_house_minor_head',
  'gambling_public_minor_head', 'arms_minor_head', 'gambling_minor_head', 'other_minor_head',
]);

export const uidbGeneralFields = [
  // --- General Information (general_info) ---
  { field_key: 'gd_no', label_en: 'GD Number', label_hi: 'जीडी संख्या', required: true, section: 'general_info', hint: 'e.g. 12A' },
  { field_key: 'gd_date', label_en: 'GD Date', label_hi: 'जीडी दिनांक', required: false, section: 'general_info', hint: 'dd-mm-yyyy' },
  { field_key: 'gd_time', label_en: 'GD Time', label_hi: 'जीडी समय', required: false, section: 'general_info', hint: 'HH:MM' },
  { field_key: 'status', label_en: 'Current Status / Mortuary Remarks', label_hi: 'वर्तमान स्थिति', required: false, options: ['Referred to district hospital', 'Identified', 'Body Claimed', 'Unidentified', 'Held in Mortuary'], section: 'general_info' },

  // --- Corpse Details (corpse_desc) ---
  { field_key: 'identified', label_en: 'Body Identified', label_hi: 'शव की पहचान हुई', required: true, options: ['True', 'False'], section: 'corpse_desc' },
  { field_key: 'deceased_name', label_en: 'Name of Deceased', label_hi: 'मृतक का नाम', required: true, section: 'corpse_desc' },
  { field_key: 'deceased_house_no', label_en: 'Deceased Present House No.', label_hi: 'मृतक का मकान संख्या', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_street', label_en: 'Deceased Present Street', label_hi: 'मृतक का गली / सड़क', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_colony', label_en: 'Deceased Present Colony', label_hi: 'मृतक का कॉलोनी', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_city_town_village', label_en: 'Deceased Present Village / City / Town', label_hi: 'मृतक का गांव / शहर / नगर', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_state', label_en: 'Deceased Present State', label_hi: 'मृतक का राज्य', required: false, options: STATE_OPTS, section: 'corpse_desc' },
  { field_key: 'deceased_district', label_en: 'Deceased Present District', label_hi: 'मृतक का जिला', required: false, options: DISTRICT_OPTS, section: 'corpse_desc' },
  { field_key: 'deceased_pincode', label_en: 'Deceased Present Pin Code', label_hi: 'मृतक का पिन कोड', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_perm_same', label_en: 'Is Permanent Address same as Present Address?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: true, options: ['Yes', 'No'], section: 'corpse_desc' },
  { field_key: 'deceased_perm_house_no', label_en: 'Deceased Permanent House No.', label_hi: 'मृतक का स्थायी मकान संख्या', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_perm_street', label_en: 'Deceased Permanent Street', label_hi: 'मृतक का स्थायी गली / सड़क', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_perm_colony', label_en: 'Deceased Permanent Colony', label_hi: 'मृतक का स्थायी कॉलोनी', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_perm_city_town_village', label_en: 'Deceased Permanent Village / City / Town', label_hi: 'मृतक का स्थायी गांव / शहर / नगर', required: false, section: 'corpse_desc' },
  { field_key: 'deceased_perm_state', label_en: 'Deceased Permanent State', label_hi: 'मृतक का स्थायी राज्य', required: false, options: STATE_OPTS, section: 'corpse_desc' },
  { field_key: 'deceased_perm_district', label_en: 'Deceased Permanent District', label_hi: 'मृतक का स्थायी जिला', required: false, options: DISTRICT_OPTS, section: 'corpse_desc' },
  { field_key: 'deceased_perm_pincode', label_en: 'Deceased Permanent Pin Code', label_hi: 'मृतक का स्थायी पिन कोड', required: false, section: 'corpse_desc' },
  { field_key: 'found_date', label_en: 'Date Body Found', label_hi: 'शव मिलने की तिथि', required: false, section: 'corpse_desc' },
  { field_key: 'found_place', label_en: 'Place Body Found', label_hi: 'शव मिलने का स्थान', required: false, section: 'corpse_desc' },
  { field_key: 'found_time', label_en: 'Time Body Found', label_hi: 'शव मिलने का समय', required: false, section: 'corpse_desc' },
  { field_key: 'found_latitude', label_en: 'Place Body Found Latitude', label_hi: 'शव मिलने का स्थान अक्षांश', required: false, section: 'corpse_desc' },
  { field_key: 'found_longitude', label_en: 'Place Body Found Longitude', label_hi: 'शव मिलने का स्थान रेखांश', required: false, section: 'corpse_desc' },
  { field_key: 'approx_age', label_en: 'Approximate Age', label_hi: 'अनुमानित उम्र', required: true, section: 'corpse_desc' },
  { field_key: 'description', label_en: 'Physical Description', label_hi: 'शारीरिक हुलिया', required: false, section: 'corpse_desc' },
  { field_key: 'identification_marks', label_en: 'Identification Marks', label_hi: 'पहचान चिन्ह', required: false, section: 'corpse_desc' },

  // --- Physical Description / Person Details (person_details) ---
  { field_key: 'gender', label_en: 'Gender', label_hi: 'लिंग', required: false, options: ['Male', 'Female', 'Transgender', 'Unknown'], section: 'person_details' },
  { field_key: 'height', label_en: 'Height', label_hi: 'कद', required: false, section: 'person_details' },
  { field_key: 'built', label_en: 'Built', label_hi: 'शरीर की बनावट', required: false, section: 'person_details' },
  { field_key: 'complexion', label_en: 'Complexion', label_hi: 'रंग', required: false, section: 'person_details' },
  { field_key: 'upper_dress_color', label_en: 'Upper Dress Color', label_hi: 'ऊपरी पोशाक का रंग', required: false, section: 'person_details' },
  { field_key: 'lower_dress_color', label_en: 'Lower Dress Color', label_hi: 'निचली पोशाक का रंग', required: false, section: 'person_details' },
  { field_key: 'face', label_en: 'Face', label_hi: 'चेहरा', required: false, section: 'person_details' },
  { field_key: 'hair', label_en: 'Hair', label_hi: 'बाल', required: false, section: 'person_details' },
  { field_key: 'moustache', label_en: 'Moustache', label_hi: 'मूंछ', required: false, section: 'person_details' },
  { field_key: 'beard', label_en: 'Beard', label_hi: 'दाढ़ी', required: false, section: 'person_details' },

  // --- Informant & Contact Details (contacts_assigned) ---
  { field_key: 'informant_name', label_en: 'Informant Name', label_hi: 'सूचना देने वाले का नाम', required: false, section: 'contacts_assigned' },
  { field_key: 'informant_relation', label_en: 'Relation with Deceased', label_hi: 'मृतक से संबंध', required: false, options: ['Father', 'Mother', 'Husband', 'Wife', 'Brother', 'Sister', 'Son', 'Daughter', 'Guardian', 'Friend', 'Neighbor', 'Other'], section: 'contacts_assigned' },
  { field_key: 'informant_mobile', label_en: 'Informant Mobile', label_hi: 'सूचना देने वाले का मोबाइल', required: false, section: 'contacts_assigned' },
  { field_key: 'zipnet_no', label_en: 'ZIPNET No.', label_hi: 'जिपनेट संख्या', required: false, section: 'contacts_assigned' },

  // --- Inquest Details (inquest_details) ---
  { field_key: 'cause_of_death', label_en: 'Cause of Death', label_hi: 'मौत का कारण', required: false, section: 'inquest_details' },
  { field_key: 'cause_of_death_other', label_en: 'Cause of Death (Specify)', label_hi: 'मृत्यु का कारण (विवरण)', required: false, section: 'inquest_details' },
  { field_key: 'deceased_relative_name', label_en: 'Relative Name', label_hi: 'रिश्तेदार का नाम', required: false, section: 'inquest_details' },
  { field_key: 'deceased_relation_type', label_en: 'Relation with Deceased', label_hi: 'मृतक से संबंध', required: false, section: 'inquest_details' },
  { field_key: 'filed_by_acp_sdm', label_en: 'Inquest Filed by ACP / SDM', label_hi: 'एसीपी / एसडीएम द्वारा दायर पूछताछ', required: false, section: 'inquest_details' },
  { field_key: 'filed_by_acp_sdm_date', label_en: 'Date of Filed by ACP/SDM', label_hi: 'एसीपी / एसडीएम द्वारा दायर करने की तिथि', required: false, section: 'inquest_details' },

  // --- IO Details (investigation_officer) ---
  // 2026-07-16 (WP10): IO detail columns removed — single resolved PIS column, see CASE note.
  { field_key: 'io_pis', label_en: 'IO ID (PIS No.)', label_hi: 'जांच अधिकारी आईडी (पीआईएस नंबर)', required: false, section: 'investigation_officer', hint: 'PIS number of a registered IO, e.g. 28080214' }
];

export const missingGeneralFields = [
  { field_key: 'source', label_en: 'Source of Information', label_hi: 'जानकारी का स्रोत', required: false, section: 'general_info' },
  { field_key: 'gd_no', label_en: 'GD Number', label_hi: 'जीडी संख्या', required: true, section: 'general_info', hint: 'e.g. 12A' },
  { field_key: 'gd_date', label_en: 'GD Date', label_hi: 'जीडी दिनांक', required: false, section: 'general_info', hint: 'dd-mm-yyyy' },
  { field_key: 'gd_time', label_en: 'GD Time', label_hi: 'जीडी समय', required: false, section: 'general_info', hint: 'HH:MM' },
  { field_key: 'missing_type', label_en: 'Missing / Found Type', label_hi: 'लापता / मिला प्रकार', required: false, options: ['Missing', 'Found'], section: 'general_info' },
  { field_key: 'status', label_en: 'Status', label_hi: 'स्थिति', required: false, options: ['Un-traced', 'Traced', 'Referred', 'Closed'], section: 'general_info' },
  { field_key: 'mp_known', label_en: 'Is Missing Person Identified / Known?', label_hi: 'क्या लापता व्यक्ति की पहचान हुई है?', required: false, options: ['Yes', 'No'], section: 'person_details' },
  { field_key: 'missing_name', label_en: 'Name of Missing Person', label_hi: 'लापता व्यक्ति का नाम', required: true, section: 'person_details' },
  { field_key: 'mp_house_no', label_en: 'Present House No.', label_hi: 'मकान संख्या', required: false, section: 'person_details' },
  { field_key: 'mp_street', label_en: 'Present Street', label_hi: 'गली / सड़क', required: false, section: 'person_details' },
  { field_key: 'mp_colony', label_en: 'Present Colony', label_hi: 'कॉलोनी', required: false, section: 'person_details' },
  { field_key: 'mp_city_town_village', label_en: 'Present Village / City / Town', label_hi: 'गांव / शहर / नगर', required: false, section: 'person_details' },
  { field_key: 'mp_state', label_en: 'Present State', label_hi: 'राज्य', required: false, options: STATE_OPTS, section: 'person_details' },
  { field_key: 'mp_district', label_en: 'Present District', label_hi: 'जिला', required: false, options: DISTRICT_OPTS, section: 'person_details' },
  { field_key: 'mp_pincode', label_en: 'Present Pin Code', label_hi: 'पिन कोड', required: false, section: 'person_details' },
  //{ field_key: 'mp_address', label_en: 'Present Full Address', label_hi: 'वर्तमान पता (विस्तृत)', required: false, section: 'person_details' },
  { field_key: 'mp_perm_same', label_en: 'Is Permanent Address same as Present Address?', label_hi: 'क्या स्थायी पता वर्तमान पते के समान है?', required: false, options: ['Yes', 'No'], section: 'person_details' },
  { field_key: 'mp_perm_house_no', label_en: 'Permanent House No.', label_hi: 'स्थायी मकान संख्या', required: false, section: 'person_details' },
  { field_key: 'mp_perm_street', label_en: 'Permanent Street', label_hi: 'स्थायी गली / सड़क', required: false, section: 'person_details' },
  { field_key: 'mp_perm_colony', label_en: 'Permanent Colony', label_hi: 'स्थायी कॉलोनी', required: false, section: 'person_details' },
  { field_key: 'mp_perm_city_town_village', label_en: 'Permanent Village / City / Town', label_hi: 'स्थायी गांव / शहर / नगर', required: false, section: 'person_details' },
  { field_key: 'mp_perm_state', label_en: 'Permanent State', label_hi: 'स्थायी राज्य', required: false, options: STATE_OPTS, section: 'person_details' },
  { field_key: 'mp_perm_district', label_en: 'Permanent District', label_hi: 'स्थायी जिला', required: false, options: DISTRICT_OPTS, section: 'person_details' },
  { field_key: 'mp_perm_pincode', label_en: 'Permanent Pin Code', label_hi: 'स्थायी पिन कोड', required: false, section: 'person_details' },
  //{ field_key: 'missing_address', label_en: 'Full Permanent Address', label_hi: 'स्थायी पता विवरण', required: false, section: 'person_details' },
  { field_key: 'gender', label_en: 'Gender', label_hi: 'लिंग', required: false, options: ['Male', 'Female', 'Transgender', 'Unknown'], section: 'person_details' },
  { field_key: 'age', label_en: 'Age', label_hi: 'उम्र', required: true, section: 'person_details' },
  { field_key: 'major_minor', label_en: 'Major / Minor', label_hi: 'वयस्क / अवयस्क', required: false, options: ['Major', 'Minor'], hint: 'select: Major, Minor', section: 'person_details' },
  { field_key: 'missing_date', label_en: 'Date of Missing/Found', label_hi: 'लापता/प्राप्त होने की तिथि', required: true, section: 'person_details' },
  { field_key: 'missing_place', label_en: 'Last Seen/Found Place', label_hi: 'अंतिम बार देखे जाने का स्थान', required: false, section: 'person_details' },
  { field_key: 'Mental State', label_en: 'Mental State', label_hi: 'मानसिक स्थिति', required: false, section: 'person_details' },
  { field_key: 'physical_description', label_en: 'Physical Description', label_hi: 'शारीरिक हुलिया', required: false, section: 'person_details' },
  //{ field_key: 'operator_name', label_en: 'Operator Name to Whom MPS', label_hi: 'ऑपरेटर का नाम जिसे एमपीएस भेजा गया', required: false, section: 'general_info' },
  { field_key: 'informant_name', label_en: 'Informant Name', label_hi: 'सूचना देने वाले का नाम', required: false, section: 'contacts_assigned' },
  { field_key: 'informant_relation', label_en: 'Relation with Missing Person', label_hi: 'लापता व्यक्ति से संबंध', required: false, options: ['Father', 'Mother', 'Husband', 'Wife', 'Brother', 'Sister', 'Son', 'Daughter', 'Guardian', 'Friend', 'Neighbor', 'Other'], section: 'contacts_assigned' },
  { field_key: 'informant_mobile', label_en: 'Informant Mobile', label_hi: 'सूचना देने वाले का मोबाइल', required: false, section: 'contacts_assigned' },
  { field_key: 'zipnet_no', label_en: 'ZIPNET No.', label_hi: 'जिपनेट संख्या', required: false, section: 'contacts_assigned' },
  { field_key: 'height', label_en: 'Height', label_hi: 'कद', required: false, section: 'person_details' },
  { field_key: 'built', label_en: 'Built', label_hi: 'शरीर की बनावट', required: false, section: 'person_details' },
  { field_key: 'complexion', label_en: 'Complexion', label_hi: 'रंग', required: false, section: 'person_details' },
  //{ field_key: 'missing_relation_type', label_en: 'Relation Type', label_hi: 'संबंध का प्रकार', required: false, options: ['Father', 'Mother', 'Husband', 'Wife', 'Guardian', 'Other'], section: 'person_details' },
  { field_key: 'upper_dress_color', label_en: 'Upper Dress Color', label_hi: 'ऊपरी पोशाक का रंग', required: false, section: 'person_details' },
  { field_key: 'lower_dress_color', label_en: 'Lower Dress Color', label_hi: 'निचली पोशाक का रंग', required: false, section: 'person_details' },
  { field_key: 'face', label_en: 'Face', label_hi: 'चेहरा', required: false, section: 'person_details' },
  { field_key: 'hair', label_en: 'Hair', label_hi: 'बाल', required: false, section: 'person_details' },
  { field_key: 'moustache', label_en: 'Moustache', label_hi: 'मूंछ', required: false, section: 'person_details' },
  { field_key: 'beard', label_en: 'Beard', label_hi: 'दाढ़ी', required: false, section: 'person_details' },
  // 2026-07-16 (WP10): IO detail columns removed — single resolved PIS column, see CASE note.
  { field_key: 'io_pis', label_en: 'IO ID (PIS No.)', label_hi: 'जांच अधिकारी आईडी (पीआईएस नंबर)', required: false, section: 'investigation_officer', hint: 'PIS number of a registered IO, e.g. 28080214' }
];

// ─── Registry-driven template inclusion ─────────────────────────────────────────────────
// The template no longer shows ONLY the fields hand-listed above. Every active field_registry
// row applicable to a record type is auto-added to its template (appended at the end of the
// right sheet, with its registry label/options) UNLESS it is excluded below.
//
// How to control what appears in the Excel template:
//   • Remove a field that auto-appeared        → add its field_key to TEMPLATE_EXCLUDE_KEYS.
//   • Re-order / re-label / re-hint a field    → add or edit it in the field lists above
//     (a field listed above is always included and placed exactly where the list says;
//      the exclude sets below only govern fields NOT listed above).
//   • Add a brand-new field                    → nothing to do; it flows in from field_registry.

// Fields that exist only to power the interactive form's conditional show/hide behaviour
// (per-act sections / per-crime minor heads). The flat act/sections/crime_head/minor_head
// cascade columns replace all of these in Excel, so they are structurally excluded for
// every record type — do not remove entries from this set to "add" them; they would never
// be merged on import (same rationale as UIDB_ACT_SECTION_EXCLUDE_KEYS below).
export const CONDITIONAL_FORM_FIELD_KEYS = new Set([
  'act_name', 'other_act_name',
  'ipc_sections', 'excise_sections', 'arms_sections', 'gambling_sections', 'other_sections',
  'ipc_major_head', 'excise_major_head', 'arms_major_head', 'gambling_major_head', 'other_major_head',
  'theft_minor_head', 'murder_minor_head', 'hurt_minor_head', 'cheating_minor_head',
  'robbery_minor_head', 'excise_possession_minor_head', 'excise_minor_head',
  'excise_sale_minor_head', 'excise_smuggling_minor_head',
  'arms_minor_head', 'arms_possession_minor_head', 'arms_use_minor_head',
  'gambling_minor_head', 'gambling_house_minor_head', 'gambling_public_minor_head',
  'other_minor_head',
]);

// Per-record-type template excludes. Seeded ("grandfathered") from every field_registry row
// that existed when registry-driven inclusion was introduced but was not part of the template,
// so the generated files stayed byte-for-byte identical on the day of the switch.
// DELETE a key from here to let that field flow into the template automatically.
export const TEMPLATE_EXCLUDE_KEYS = {
  CASE: new Set([
    // general / occurrence info never wired into the template
    'occurrence_time_type', 'type_of_information', 'occurrence_from_date_time',
    'occurrence_to_date_time', 'info_received_at_ps_date_time', 'organised_crime',
    'complaint_no', 'gd_no', 'source_reference',
    'occurrence_latitude', 'occurrence_longitude', 'area_of_crime', 'beat_no',
    'occurrence_place', 'occurrence_state', 'occurrence_country', 'complainant_name', 'status', 'is_important',
    // financial fraud / vehicle sections never wired into the template
    'cheated_amount', 'modus_operandi',
    'vehicle_no', 'vehicle_type', 'vehicle_make', 'vehicle_model', 'vehicle_color',
    'vehicle_chassis_no', 'vehicle_engine_no', 'cd_uploaded_24h', 'footage_collected',
    // property sub-fields (phone/arms details) — property sheet uses the generic columns
    'property_phone_number', 'phone_make', 'phone_model', 'phone_imei', 'phone_color',
    'phone_status', 'prop_fire_arms_type', 'prop_arms_made', 'prop_other_subtype',
    // deliberately dropped person fields (were commented out / .filter()-ed above)
    'complainant_npr', 'complainant_same_as_victim', 'complainant_dob',
    'complainant_birth_year', 'complainant_present_address',
    'accused_npr', 'accused_dob', 'accused_birth_year', 'accused_present_address',
    'victim_npr', 'victim_qualification', 'victim_dob', 'victim_birth_year',
    'victim_present_address',
    // 2026-07-16 WP10: IO detail columns removed from the template (single io_pis column
    // remains, resolved to records.io_id at validation) — excluded so the still-active
    // registry rows don't auto-append them back as new columns.
    'io_rank', 'io_name', 'io_mobile',
    // 2026-07-16 Integration 3 WP0 review: registry-driven auto-append now correctly
    // recognises these (a schema-rename bug was silently hiding them). Excluded here per
    // explicit user decision, not oversight — see docs/new-db-integration/03-import.md:
    // major_heads/minor_heads duplicate the per-section major_head/minor_head already on
    // the Act and Sections sheet; io_id is resolved from the existing io_name/io_pis
    // curated columns at import time instead of asking for a raw FK; transfer_to has no
    // import workflow yet.
    'major_heads', 'minor_heads', 'io_id', 'transfer_to',
    // 2026-07-16 Integration 3 WP4: system-set raw-preservation fields for legacy leniency
    // (docs/new-db-integration/03-import.md C6) — import.validate.js stamps these directly on
    // the composed payload when a legacy row's local_head/beat can't be resolved; never an
    // officer-filled template cell.
    'local_head_raw', 'beat_raw',
    // 2026-07-17: gd_date/gd_time became CASE-applicable in the registry (the interactive
    // CASE form's GD composite was silently losing them on draft reload — they now persist
    // to fir_details.gd_date/gd_time). Excluded here for the same reason as ARREST's entry
    // below: the frozen CASE template never had GD Date/Time columns, and auto-append must
    // not add them (P3).
    'gd_date', 'gd_time',
  ]),
  ARREST: new Set([
    // general info variants not used by the arrest template
    'case_type', 'fir_no', 'gd_no', 'arrest_date', 'complainant_name',
    'other_status_reason', 'recovery', 'nafis_dossier', 'case_status',
    'arresting_officer', 'arresting_officer_mobile',
    // NOTE (2026-07-20): 'arrest_place' and 'listed_criminal' (BC) REMOVED from this exclude set.
    // arrest_place is a real curated column in arrestPersonFields (was double-listed here, harmless
    // but confusing). listed_criminal (storage arrestee.is_bc) parallels proclaimed_offender
    // (is_po, already in the template) — it was reported "not coming after import" because it was
    // excluded and thus never collected; now it's a template column like its is_po sibling.
    // 2026-07-16 Integration 3 WP0 review — same rationale as CASE above.
    'major_heads', 'minor_heads', 'io_id',
    // 2026-07-16 WP10: IO detail columns removed — same rationale as CASE above.
    'io_name', 'io_rank', 'io_mobile',
    // 2026-07-16 Integration 3 WP3: both added to field_registry this integration to close a
    // real gap (a schema column with no storage destination — see
    // docs/new-db-integration/03-import.md). arrest_time is the template's time_of_arrest
    // column under its real registry key (import-key-bridge.config.js renames at import time
    // — excluding it here stops it from ALSO auto-appending as a second, duplicate column).
    // is_dd_based is a synthetic composer-set flag (which template/parent-key-field was used),
    // never an officer-filled cell — same registry-column marks it readonly/not
    // visible/editable on the interactive form too.
    'arrest_time', 'is_dd_based',
    // 2026-07-16 Integration 3 WP4: same rationale as CASE's local_head_raw/beat_raw above
    // (beat_raw doesn't apply to ARREST — beat_no itself is CASE-only).
    'local_head_raw',
    // gd_date/gd_time (also added this integration, for KALANDRA/UIDB/MISSING) are already
    // explicit curated columns on kalandraGeneralFields — excluding them from ARREST's
    // auto-include set stops them duplicating there AND stops them spontaneously appearing
    // as new, unrequested columns on the regular (non-Kalandra) ARREST template, which never
    // asked for a GD date/time and has fir_date as its own date-of-record instead.
    'gd_date', 'gd_time',
    // intimation section never wired into the template
    'intimation_date_time', 'intimated_relative_name', 'intimated_relative_relation',
    'intimation_mode', 'intimation_house_no', 'intimation_street', 'intimation_colony',
    'intimation_city_town_village', 'intimation_tehsil_block_mandal', 'intimation_country',
    'intimation_state', 'intimation_district', 'intimation_police_station', 'intimation_pincode',
    // property sub-fields (phone/arms details)
    'property_phone_number', 'phone_make', 'phone_model', 'phone_imei', 'phone_color',
    'phone_status', 'prop_fire_arms_type', 'prop_arms_made', 'prop_other_subtype',
    // deliberately dropped person fields (were commented out / .filter()-ed above)
    'arrested_npr', 'nick_name', 'arrested_dob', 'arrested_birth_year',
    'arrested_present_address', 'arrested_perm_address',
    'kin_name', 'kin_mobile', 'kin_relationship', 'photo_path',
    // 2026-07-20 (#C): the 6 LEGACY per-scheme boolean fields (section special_scheme) were
    // superseded by the single scheme_of_arrest dropdown. They're is_active:false in config but
    // drifted to is_active:true in the DB, so autoIncludedRegistryFields was appending all 6 as
    // extra ARREST template columns beside scheme_of_arrest (reported: "scheme_of_arrest present
    // as columns instead of dropdown"). Excluded here permanently — independent of the is_active
    // drift — so a re-activation can never re-leak them into the template.
    'integrated_pi', 'group_patrolling', 'cycle_patrolling', 'by_antisnatching_team',
    'by_prahari', 'by_eyes_ears_scheme_members',
  ]),
  UIDB: new Set([
    'deceased_address', 'deceased_perm_address', 'local_head', 'heinous_offence', 'case_status', 'missing_relation_type',
    // 2026-07-16 Integration 3 WP0 review — same rationale as CASE above.
    'major_heads', 'minor_heads', 'io_id',
    // 2026-07-16 WP10: IO detail columns removed — same rationale as CASE above.
    'io_name', 'io_rank', 'io_mobile',
    // 2026-07-16 Integration 3 WP4 — same rationale as CASE's local_head_raw above.
    'local_head_raw',
  ]),
  MISSING: new Set([
    'mp_address', 'missing_address', 'operator_name', 'case_status', 'missing_relation_type',
    // 2026-07-16 Integration 3 WP0 review: io_id resolved from existing IO columns at
    // import time, not asked as a raw FK; case_registered is redundant with whether
    // missing_fir_no is filled in — no separate boolean needed.
    'io_id', 'case_registered',
    // 2026-07-16 WP10: IO detail columns removed — same rationale as CASE above.
    'io_name', 'io_rank', 'io_mobile',
  ]),
  // 2026-07-16 WP10: PCR_CALL's template is generated by the generic registry-driven branch
  // (no curated list) — with the IO detail columns removed everywhere else, the same three
  // are excluded here so the generic branch (which now respects isTemplateExcluded) matches;
  // io_pis stays as PCR_CALL's single IO column, resolved the same way. io_id same as above.
  PCR_CALL: new Set([
    'io_name', 'io_rank', 'io_mobile', 'io_id',
  ]),
};

// Fields whose field_registry.validation_rules.required is true but which the bulk-import
// flow deliberately does NOT enforce as required — the record still imports (DRAFT/PS) and
// gets completed later via the interactive form. Consulted by both template generation
// (header coloring/hint "[Required]" prefix) and import validation (WP4's
// SUBMIT_REQUIREMENTS_PENDING vs REQUIRED_MISSING split). User decision 2026-07-16: covers
// work_out_date (ruling 23a addendum) and missing_fir_no/missing_fir_date (populated once
// the linked CASE is created/imported and linkResolver resolves it — see
// docs/new-db-integration/03-import.md).
export const IMPORT_OPTIONAL_REQUIRED_KEYS = new Set([
  'work_out_date', 'missing_fir_no', 'missing_fir_date',
]);

export const CASE_SHEETS_CONFIG = {
  general: caseGeneralFields.map(f => f.field_key),
  victim: caseVictimFields.map(f => f.field_key),
  act_section: caseActSectionFields.map(f => f.field_key),
  accused: caseAccusedFields.map(f => f.field_key),
  property: casePropertyFields.map(f => f.field_key)
};

export const ARREST_SHEETS_CONFIG = {
  general: arrestGeneralFields.map(f => f.field_key),
  act_section: arrestActSectionFields.map(f => f.field_key),
  person: arrestPersonFields.map(f => f.field_key),
  property: arrestPropertyFields.map(f => f.field_key)
};

export const UIDB_SHEETS_CONFIG = {
  general: uidbGeneralFields.map(f => f.field_key),
  act_section: uidbActSectionFields.map(f => f.field_key)
};

export const MISSING_SHEETS_CONFIG = {
  general: missingGeneralFields.map(f => f.field_key)
};

export const KALANDRA_SHEETS_CONFIG = {
  general: kalandraGeneralFields.map(f => f.field_key),
  act_section: kalandraActSectionFields.map(f => f.field_key),
  person: kalandraPersonFields.map(f => f.field_key)
};

// ─── T1 keystone sets (03-TRIAGE-MATRIX.md, architect ruling under D1) ──────────────────
// Single source of truth (FIX 2a, 2026-07) — previously import.validate.js and
// import.parse.js each hand-maintained their own copy (KEYSTONE_FIELDS / GHOST_ROW_KEYSTONE_
// COLUMNS respectively), free to drift; they had in fact drifted (MISSING's set differed).
// field_key -> always required, ERROR in BOTH modes, independent of field_registry/curated
// `required`. KALANDRA reuses ARREST's set minus fir_date (Kalandra has no FIR date field at
// all — GD Number is its own linked_fir_dd_no keystone, already in the shared ARREST set).
//
// PCR_CALL is deliberately empty here, NOT populated with a "call date/time" field: the
// matrix's PCR_CALL keystone is already enforced structurally, unconditionally, by the
// composed-level RECORD_DATE_MISSING check (getRecordDate('PCR_CALL') -> rowData.gd_date) —
// no row-level field exists to promote. `gd_no` (the template's single "GD Number, Date &
// Time" column) is the closest candidate but is a free-text identifier column, not a
// date-typed field, and is currently registry-optional; promoting it to a hard ERROR-in-
// both-modes keystone would be a real requiredness change beyond what the matrix specifies.
// Flagged for architect review rather than improvised — see the Wave report.
export const KEYSTONE_FIELDS = {
  CASE: new Set(['fir_no', 'fir_date']),
  ARREST: new Set(['linked_fir_dd_no', 'date_of_arrest', 'arrested_first_name']),
  // KALANDRA reuses ARREST's person sheet verbatim (still has date_of_arrest, arrested_first_name)
  // — only fir_date is dropped (kalandraGeneralFields filters it out; GD Number is the keystone
  // in linked_fir_dd_no's place, already shared with ARREST).
  KALANDRA: new Set(['linked_fir_dd_no', 'date_of_arrest', 'arrested_first_name']),
  MISSING: new Set(['missing_name']),
  UIDB: new Set(['found_date', 'found_place']),
  PCR_CALL: new Set(),
};

// MISSING's date keystone is an OR-group (missing_date OR gd_date/"date reported" — either
// satisfies), not a flat per-field requirement — kept separate from KEYSTONE_FIELDS (which
// assumes one field = one requirement) both for the row-level required check
// (import.validate.js's validateRowFields) and for deriving the parse-time ghost-row keystone
// signal (import.parse.js) — a row carrying ONLY an OR-group field still reads as real data.
export const OR_GROUP_KEYSTONES = {
  MISSING: [{
    fields: ['missing_date', 'gd_date'],
    label: 'Date Missing Since / GD Date',
    message: 'Either "Date Missing Since" or "GD Date" is required for a Missing Person record.',
  }],
};

// Derived, not hand-copied: every field_key that counts as a "this row has real data"
// signal for the ghost-row skip (import.parse.js) — the keystone set plus every OR-group
// field, per record type. Replaces the old separate GHOST_ROW_KEYSTONE_COLUMNS hand-copy.
export const keystoneColumnsFor = (recordType) => {
  const cols = new Set(KEYSTONE_FIELDS[recordType] || []);
  for (const group of OR_GROUP_KEYSTONES[recordType] || []) {
    for (const f of group.fields) cols.add(f);
  }
  return cols;
};
