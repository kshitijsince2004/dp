/**
 * PHAROS Report Builder — Reportable Fields Configuration
 * =========================================================
 * This is the SINGLE SOURCE OF TRUTH for the dynamic report builder.
 *
 * Rules:
 * 1. Every field that can be queried/exported MUST be declared here.
 * 2. The query engine whitelists against this config — no user-supplied
 *    field/table name reaches the DB unless it exists here.
 * 3. `is_pii: true` fields are only surfaced to roles at or above `pii_min_role`.
 * 4. `operators` defines exactly which filter operators are valid for each field type.
 *
 * Operator reference (used in filter specs):
 *   Text:    EQ | NOT_EQ | CONTAINS | STARTS_WITH | ENDS_WITH | IS_EMPTY | IS_NOT_EMPTY
 *   Date:    EQ | BEFORE | AFTER | BETWEEN | LAST_N_DAYS | THIS_WEEK | THIS_MONTH | THIS_YEAR
 *   Number:  EQ | GT | GTE | LT | LTE | BETWEEN
 *   Enum:    IN | NOT_IN | EQ
 *   Boolean: IS_TRUE | IS_FALSE
 *   Time:    BETWEEN | EQ
 *
 * Field grouping (`group` key):
 * Fields that share a `group` value are collapsed into ONE checkbox in the
 * Excel Export Manager UI (see CustomExcelBuilder.jsx) — selecting the group
 * auto-includes every member field as its own column in the actual export.
 * Group display labels live in GROUP_LABELS below, keyed by `TABLE.groupKey`.
 * Grouping mirrors the `section` groupings already used by field_registry
 * for the dynamic record-entry forms (see backend/seeds/01_fields.js) —
 * repeater-backed sections (accused/victim/arrested persons, property) and
 * the large conditional Acts & Sections cluster are intentionally NOT
 * included here yet (multi-row export needs a separate design).
 */

// Roles ordered from least to most privileged for PII gating
export const ROLE_ORDER = ['HC', 'SHO', 'ACP', 'DISTRICT_OFFICER', 'JCP', 'SCP', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

// Allowed base tables (record_type values) for the query engine whitelist
export const ALLOWED_TABLES = ['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'];

// Allowed joined view specs — each defines the tables and the join key
export const ALLOWED_JOINS = {
  'CASE+ARREST': {
    tables: ['CASE', 'ARREST'],
    join_on: {
      left: { table: 'CASE', field: 'fir_no' },         // records.data->>'fir_no'
      right: { table: 'ARREST', field: 'linked_fir_dd_no' } // records.data->>'linked_fir_dd_no'
    },
    label_en: 'FIR + Arrests',
    label_hi: 'एफआईआर + गिरफ्तारियां'
  },
  'CASE+MISSING': {
    tables: ['CASE', 'MISSING'],
    join_on: {
      left: { table: 'CASE', field: 'gd_no' },           // records.data->>'gd_no'
      right: { table: 'MISSING', field: 'dd_no' }         // records.data->>'dd_no'
    },
    label_en: 'FIR + Missing Persons (DD Ref)',
    label_hi: 'एफआईआर + लापता व्यक्ति (डीडी संदर्भ)'
  }
};

// Operators grouped by field type
const TEXT_OPS = ['EQ', 'NOT_EQ', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'IS_EMPTY', 'IS_NOT_EMPTY'];
const DATE_OPS = ['EQ', 'BEFORE', 'AFTER', 'BETWEEN', 'LAST_N_DAYS', 'THIS_WEEK', 'THIS_MONTH', 'THIS_YEAR'];
const TIME_OPS = ['EQ', 'BETWEEN'];
const NUM_OPS  = ['EQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'];
const ENUM_OPS = ['IN', 'NOT_IN', 'EQ'];
const BOOL_OPS = ['IS_TRUE', 'IS_FALSE', 'EQ'];
const TEXTAREA_OPS = ['CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'];
const YES_NO_OPTIONS = ['Yes', 'No'];

// Shared crime head options (single source — referenced by CASE, ARREST, PCR_CALL)
const CRIME_HEAD_OPTIONS = [
  'Simple Hurt','Other IPC','Other BNS','Other SLL','Kidnapping','Pick Pocketing','Gambling Act',
  'Cruelty by Husband','Simple Accident','Narcotics Drugs & Psychotropic Substances Act',
  'Robbery','Snatching','Murder','Delhi Excise Act','Att. to Murder','Burglary','Arms Act',
  'Other Theft','House Theft','Night Burglary','Rape','Copyright Act','Cheating',
  'Fatal Accident','Child Labour Act 1986','Att. to Culpable Homicide not Amounting to Murder',
  'Dowry Prohibition Act 1961','Electricity Theft','Information Technology Act 2000',
  'Grievous Hurt','Electricity Act 2003','Other Act','Eve Teasing',
  'Trade & Merchandise Marks Act, 1958','Mobile Phone Theft','M.O. Women','Theft In Shop',
  'POCSO Act 2012','Wild Life (Protection) Act 1972','Mischief','Day Burglary',
  'Encroachment on Govt. Land','Servant Theft','Ext. For Ransom','Extortion',
  'Counterfeiting','Criminal Breach of Trust','Criminal Intimidation','Threatening',
  'Environment (Protection) Act 1986','Affray','Arson','Abetment of Suicide',
  'Juvenile Justice Act 2015','Adultery',
  'The Delhi Prevention of Touting and Malpractices Against Tourists Ordinance Act 2010',
  'Att. to Commit Suicide','Acid Attack','Explosive Act 1884','Acid Attack Attempt',
  "Immoral Traffic(Prev.) Act, 1956",'Trespass','Delhi Police Act 1978',
  'Culpable Homicide not Amounting to Murder','Fire Incident','Dowry Death',
  'Organised Crime','Maharashtra Control of Organised Crime Act 1999',
  'Misappropriation of property & cruelty by inlaws','Forgery',
  'Receiver of Stolen Property','Explosive Substances Act 1908','Foreigners Act 1946',
  'Juvenile Justice Act 2000','Miscarriage Etc.','Prevention of Atrocities SC/ST Act 1989',
  'House/Criminal Trespass','Abduction','Protection of Women Domestic Violence Act 2005',
  'Dacoity','Concealment of birth','Riot','Offence against Public Servant','Stereo Theft',
  'wrongful Confinement/restraint','Public Nuisance','National Security Act 1980',
  'Impersonation','Assault on Public Servant','Passport Act 1967','Terrorist Act',
  'Prevention of Damage of Public Property Act 1984','M.V. Theft','Drugging/ Poisoning',
  'Escape from Police Custody','Civil Rights Act','Election Offences',
  'Drugs and Cosmetics Act 1940','Offences Relating to religion',
  'Essential Commodities Act 1955','Central Motor Vehicles Rules 1989',
  'Motor Vehicle Act,1988','Prevention of Corruption Act 1988','Cycle Theft',
  'M.V. Accessories Theft','Un-Natural Death / Inquest Report','Cattle Theft',
  'Unlawful Activities (Prevention) Act 1967','Unnatural Offences(SODOMY)'
];

/**
 * Field definitions per record_type.
 *
 * Each entry:
 * {
 *   key:         string  — exact field_key stored in records.data JSONB
 *   label_en:    string
 *   label_hi:    string
 *   data_type:   'text'|'date'|'time'|'number'|'enum'|'boolean'|'textarea'
 *   operators:   string[]  — allowed filter operators
 *   options?:    string[]  — for enum fields, the allowed values
 *   is_pii:      boolean   — if true, only visible to pii_min_role and above
 *   pii_min_role?: string  — defaults to 'DISTRICT_OFFICER'
 *   is_db_col:   boolean   — true if stored in a real column (not JSONB); used by query builder
 *   db_col?:     string    — actual column name when is_db_col=true
 *   join_key?:   boolean   — marks this field as used in cross-table joins
 *   wh_col?:     string    — warehouse fact-table column name (WAREHOUSE query mode).
 *                            OMITTED on purpose for newly-added granular group fields below —
 *                            the warehouse fact tables don't have columns for them yet, so
 *                            queryEngine.js automatically falls back to the LIVE (JSONB) path
 *                            for any request that selects a field with no wh_col. Correct data,
 *                            just skips the warehouse fast-path for that request.
 *   group?:      string    — groups this field under one collapsed checkbox in the export UI
 *                            (see GROUP_LABELS below for the display label)
 * }
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers to generate repetitive sub-field blocks (mirrors backend/seeds/01_fields.js's
// generatePersonFields/generateAddressFields, scoped down to what the report builder needs)
// ─────────────────────────────────────────────────────────────────────────────

/** A full "person" address block: 11 present-address fields + perm-same + 10 permanent fields (22 total). */
function personAddressFieldSet(prefix, labelPrefix, group, isPii) {
  const presentSuffixes = [
    ['house_no', 'House No.'], ['street', 'Street'], ['colony', 'Colony'],
    ['city_town_village', 'City / Town / Village'], ['tehsil_block_mandal', 'Tehsil / Block / Mandal'],
    ['present_address', 'Present Address'], ['country', 'Country'], ['state', 'State'],
    ['district', 'District'], ['police_station', 'Police Station'], ['pincode', 'Pincode'],
  ];
  const permSuffixes = presentSuffixes.filter(([s]) => s !== 'present_address');

  const mk = (key, label, opts = {}) => ({
    key, label_en: label, label_hi: label,
    data_type: opts.data_type || 'text', operators: opts.operators || TEXT_OPS,
    ...(opts.options ? { options: opts.options } : {}),
    is_pii: isPii, ...(isPii ? { pii_min_role: 'DISTRICT_OFFICER' } : {}),
    is_db_col: false, group,
  });

  const fields = presentSuffixes.map(([suffix, label]) => mk(`${prefix}_${suffix}`, `${labelPrefix} ${label}`));
  fields.push(mk(`${prefix}_perm_same`, `${labelPrefix} Permanent Address Same as Present?`, { data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS }));
  fields.push(...permSuffixes.map(([suffix, label]) => mk(`${prefix}_perm_${suffix}`, `${labelPrefix} Permanent ${label}`)));
  return fields;
}

/** A plain (non-person) address block: 10 fields, no perm variant — for occurrence/intimation-style locations. */
function plainAddressFieldSet(prefix, labelPrefix, group) {
  const suffixes = [
    ['house_no', 'House No.'], ['street', 'Street'], ['colony', 'Colony'],
    ['city_town_village', 'City / Town / Village'], ['tehsil_block_mandal', 'Tehsil / Block / Mandal'],
    ['country', 'Country'], ['state', 'State'], ['district', 'District'],
    ['police_station', 'Police Station'], ['pincode', 'Pincode'],
  ];
  return suffixes.map(([suffix, label]) => ({
    key: `${prefix}_${suffix}`, label_en: `${labelPrefix} ${label}`, label_hi: `${labelPrefix} ${label}`,
    data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group,
  }));
}

/** Personal-info sub-fields for a person entity (16 fields: name parts, contact, DOB, etc). */
function personalInfoFieldSet(prefix, labelPrefix, group, isPii = true) {
  const fields = [
    ['npr', 'NPR No.', 'text', TEXT_OPS],
    ['first_name', 'First Name', 'text', TEXT_OPS],
    ['middle_name', 'Middle Name', 'text', TEXT_OPS],
    ['last_name', 'Last Name', 'text', TEXT_OPS],
    ['nickname', 'Alias', 'text', TEXT_OPS],
    ['gender', 'Gender', 'enum', ENUM_OPS, ['Male', 'Female', 'Transgender', 'Unknown']],
    ['marital_status', 'Marital Status', 'enum', ENUM_OPS, ['Married', 'Unmarried', 'Divorced', 'Widowed', 'Single', 'Unknown']],
    ['relation_type', 'Relation Type', 'enum', ENUM_OPS, ['Father', 'Mother', 'Husband', 'Wife', 'Guardian', 'Other']],
    ['relative_name', 'Relative Name', 'text', TEXT_OPS],
    ['mobile_country_code', 'Mobile Country Code', 'text', TEXT_OPS],
    ['mobile', 'Mobile No.', 'text', TEXT_OPS],
    ['qualification', 'Qualification', 'enum', ENUM_OPS, ['Uneducated', '10th', '10+2', 'Graduate', 'Post-Graduate']],
    ['dob', 'Date of Birth', 'date', DATE_OPS],
    ['age_year', 'Age (Years)', 'number', NUM_OPS],
    ['age_month', 'Age (Months)', 'number', NUM_OPS],
    ['birth_year', 'Year of Birth', 'number', NUM_OPS],
  ];
  return fields.map(([suffix, label, data_type, operators, options]) => ({
    key: `${prefix}_${suffix}`, label_en: `${labelPrefix} ${label}`, label_hi: `${labelPrefix} ${label}`,
    data_type, operators, ...(options ? { options } : {}),
    is_pii: isPii, ...(isPii ? { pii_min_role: 'DISTRICT_OFFICER' } : {}),
    is_db_col: false, group,
  }));
}

/** IO Rank/PIS/Mobile — io_name usually already exists per table and just gets tagged with the group separately. */
function ioInfoExtraFields(group) {
  return [
    { key: 'io_rank',   label_en: 'IO Rank',        label_hi: 'IO Rank',        data_type: 'enum', operators: ENUM_OPS,
      options: ['Constable', 'Head Constable', 'Assistant Sub Inspector', 'Sub Inspector', 'Inspector', 'Deputy Superintendent of Police', 'Superintendent of Police'],
      is_pii: false, is_db_col: false, group },
    { key: 'io_pis',    label_en: 'PIS No. of IO',  label_hi: 'PIS No. of IO',  data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'io_mobile', label_en: 'IO Mobile No.',  label_hi: 'IO Mobile No.',  data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
  ];
}

/** Shared "Physical Description" sub-fields (used by both MISSING and UIDB). */
function physicalDescriptionExtraFields(group) {
  return [
    { key: 'height', label_en: 'Height', label_hi: 'Height', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'built', label_en: 'Build', label_hi: 'Build', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'complexion', label_en: 'Complexion', label_hi: 'Complexion', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'upper_dress_color', label_en: 'Upper Dress Colour', label_hi: 'Upper Dress Colour', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'lower_dress_color', label_en: 'Lower Dress Colour', label_hi: 'Lower Dress Colour', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'face', label_en: 'Face', label_hi: 'Face', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'hair', label_en: 'Hair', label_hi: 'Hair', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'moustache', label_en: 'Moustache', label_hi: 'Moustache', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
    { key: 'beard', label_en: 'Beard', label_hi: 'Beard', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group },
  ];
}

export const REPORTABLE_FIELDS = {

  // ─────────────────────────────────────────────────────────────────────────
  // Shared system-level columns (available to all record types)
  // These map to real DB columns, not JSONB fields
  // ─────────────────────────────────────────────────────────────────────────
  _SYSTEM: [
    { key: '_record_date',   label_en: 'Record Date',    label_hi: 'रिकॉर्ड दिनांक',   data_type: 'date',   operators: DATE_OPS, is_pii: false, is_db_col: true, db_col: 'records.record_date', wh_col: 'record_date' },
    { key: '_status',        label_en: 'Workflow Status',label_hi: 'वर्कफ़्लो स्थिति',  data_type: 'enum',   operators: ENUM_OPS, is_pii: false, is_db_col: true, db_col: 'records.current_status', wh_col: 'workflow_status',
      options: ['DRAFT','PENDING_SHO','DISTRICT_REVIEW','HQ_RECEIVED','ARCHIVED','SENT_BACK','COMPILED'] },
    { key: '_created_at',    label_en: 'Created At',     label_hi: 'बनाने की तिथि',    data_type: 'date',   operators: DATE_OPS, is_pii: false, is_db_col: true, db_col: 'records.created_at', wh_col: 'source_updated_at' },
    { key: '_ps_id',         label_en: 'Police Station', label_hi: 'पुलिस स्टेशन',    data_type: 'text',   operators: ENUM_OPS, is_pii: false, is_db_col: true, db_col: 'records.ps_id', wh_col: 'ps_id' },
    { key: '_district_id',   label_en: 'District',       label_hi: 'जिला',              data_type: 'text',   operators: ENUM_OPS, is_pii: false, is_db_col: true, db_col: 'records.district_id', wh_col: 'district_id' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // FIR Master (record_type = 'CASE')
  // ─────────────────────────────────────────────────────────────────────────
  CASE: [
    { key: 'fir_no',              label_en: 'FIR Number',           label_hi: 'एफआईआर संख्या',          data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, join_key: true, wh_col: 'fir_no', group: 'general_info' },
    { key: 'fir_date',            label_en: 'FIR Date',             label_hi: 'एफआईआर दिनांक',          data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'fir_date', group: 'general_info' },
    { key: 'gd_no',               label_en: 'DD / GD Number',       label_hi: 'डीडी/जीडी संख्या',       data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, join_key: true, wh_col: 'gd_no', group: 'general_info' },
    { key: 'gd_date',             label_en: 'DD Date',              label_hi: 'डीडी दिनांक',            data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_date', group: 'general_info' },
    { key: 'gd_time',             label_en: 'DD Time',              label_hi: 'डीडी समय',              data_type: 'time',    operators: TIME_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_time', group: 'general_info' },
    { key: 'beat_no',             label_en: 'Beat No.',             label_hi: 'बीट नंबर',              data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'beat_no', group: 'general_info' },
    { key: 'occurrence_date',     label_en: 'Date of Occurrence',   label_hi: 'घटना की तिथि',          data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'occurrence_date' },
    { key: 'occurrence_place',    label_en: 'Place of Occurrence',  label_hi: 'घटना का स्थान',         data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'occurrence_place' },
    { key: 'local_head',          label_en: 'Crime Head',           label_hi: 'अपराध शीर्ष',           data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: CRIME_HEAD_OPTIONS, wh_col: 'local_head' },
    { key: 'act_name',            label_en: 'Act / Law',            label_hi: 'अधिनियम',               data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'act_name' },
    { key: 'sections',            label_en: 'Sections',             label_hi: 'धाराएं',                data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'sections' },
    { key: 'brief_facts',         label_en: 'Brief Facts',          label_hi: 'संक्षिप्त विवरण',        data_type: 'textarea',operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, wh_col: 'brief_facts' },
    { key: 'complainant_name',    label_en: 'Complainant Name',     label_hi: 'शिकायतकर्ता का नाम',    data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'complainant_name', group: 'complainant_personal_info' },
    { key: 'complainant_address', label_en: 'Complainant Address',  label_hi: 'शिकायतकर्ता का पता',   data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'complainant_address', group: 'complainant_address_detail' },
    { key: 'accused_name',        label_en: 'Accused Name',         label_hi: 'आरोपी का नाम',          data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'accused_name' },
    { key: 'accused_address',     label_en: 'Accused Address',      label_hi: 'आरोपी का पता',          data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'accused_address' },
    { key: 'io_name',             label_en: 'Name of IO',           label_hi: 'जांच अधिकारी',          data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name', group: 'io_info' },
    { key: 'io_pis',              label_en: 'PIS No. of IO',        label_hi: 'जांच अधिकारी PIS',      data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_pis', group: 'io_info' },
    { key: 'io_mobile',           label_en: 'IO Mobile No.',        label_hi: 'जांच अधिकारी मोबाइल',  data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_mobile', group: 'io_info' },
    { key: 'property_description',label_en: 'Property Description', label_hi: 'संपत्ति विवरण',         data_type: 'textarea',operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, wh_col: 'property_description' },
    { key: 'property_status',     label_en: 'Property Status',      label_hi: 'संपत्ति स्थिति',        data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: ['Stolen','Recovered','NA'], wh_col: 'property_status' },
    { key: 'status',              label_en: 'Case Status',          label_hi: 'मामले की स्थिति',       data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false,
      options: ['Open','Chargesheeted','Closed','Charge Sheet','PIR-JCL','Untraced','Pending','Cancellation','Quashed','Closure Report','Released U/S 189 BNSS'], wh_col: 'case_status' },
    { key: 'remarks',             label_en: 'Remarks',              label_hi: 'टिप्पणियां',             data_type: 'textarea',operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, wh_col: 'remarks' },
    { key: 'cctns_flag',          label_en: 'CCTNS Flag',           label_hi: 'सीसीटीएनएस झंडा',       data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'cctns_flag' },
    { key: 'zero_fir_flag',       label_en: 'Zero FIR',             label_hi: 'जीरो एफआईआर',           data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'zero_fir_flag' },
    { key: 'heinous_offence',     label_en: 'Heinous Offence',      label_hi: 'जघन्य अपराध',           data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'heinous_offence' },

    // ── IO Info (new sub-field) ──────────────────────────────────────────
    ...ioInfoExtraFields('io_info').filter(f => f.key === 'io_rank'), // io_pis/io_mobile already exist above

    // ── Complainant Personal Info group (17 fields) ──────────────────────
    ...personalInfoFieldSet('complainant', 'Complainant', 'complainant_personal_info'),
    { key: 'complainant_same_as_victim', label_en: 'Complainant Same as Victim?', label_hi: 'Complainant Same as Victim?', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'complainant_personal_info' },

    // ── Complainant Address group (22 fields) ────────────────────────────
    ...personAddressFieldSet('complainant', 'Complainant', 'complainant_address_detail', true),

    // ── Occurrence Info group (18 fields) ────────────────────────────────
    { key: 'occurrence_time_type', label_en: 'Occurrence Time Type', label_hi: 'Occurrence Time Type', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_from_date_time', label_en: 'Occurrence From Date/Time', label_hi: 'Occurrence From Date/Time', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_to_date_time', label_en: 'Occurrence To Date/Time', label_hi: 'Occurrence To Date/Time', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'info_received_at_ps_date_time', label_en: 'Info Received at PS Date/Time', label_hi: 'Info Received at PS Date/Time', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'organised_crime', label_en: 'Organised Crime', label_hi: 'Organised Crime', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_house_no', label_en: 'Occurrence House No.', label_hi: 'Occurrence House No.', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_street', label_en: 'Occurrence Street', label_hi: 'Occurrence Street', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_colony', label_en: 'Occurrence Colony', label_hi: 'Occurrence Colony', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_city_town_village', label_en: 'Occurrence City / Town / Village', label_hi: 'Occurrence City / Town / Village', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_tehsil_block_mandal', label_en: 'Occurrence Tehsil / Block / Mandal', label_hi: 'Occurrence Tehsil / Block / Mandal', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_country', label_en: 'Occurrence Country', label_hi: 'Occurrence Country', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_landmark', label_en: 'Occurrence Landmark', label_hi: 'Occurrence Landmark', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_district', label_en: 'Occurrence District', label_hi: 'Occurrence District', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_police_station', label_en: 'Occurrence Police Station', label_hi: 'Occurrence Police Station', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_pincode', label_en: 'Occurrence Pincode', label_hi: 'Occurrence Pincode', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_latitude', label_en: 'Occurrence Latitude', label_hi: 'Occurrence Latitude', data_type: 'number', operators: NUM_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'occurrence_longitude', label_en: 'Occurrence Longitude', label_hi: 'Occurrence Longitude', data_type: 'number', operators: NUM_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },
    { key: 'area_of_crime', label_en: 'Area of Crime', label_hi: 'Area of Crime', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'occurrence_info' },

    // ── Vehicle Details group (9 fields) ─────────────────────────────────
    { key: 'vehicle_no', label_en: 'Vehicle No.', label_hi: 'Vehicle No.', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'vehicle_details' },
    { key: 'vehicle_type', label_en: 'Vehicle Type', label_hi: 'Vehicle Type', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'vehicle_details' },
    { key: 'vehicle_make', label_en: 'Vehicle Make', label_hi: 'Vehicle Make', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'vehicle_details' },
    { key: 'vehicle_model', label_en: 'Vehicle Model', label_hi: 'Vehicle Model', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'vehicle_details' },
    { key: 'vehicle_color', label_en: 'Vehicle Colour', label_hi: 'Vehicle Colour', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'vehicle_details' },
    { key: 'vehicle_chassis_no', label_en: 'Vehicle Chassis No.', label_hi: 'Vehicle Chassis No.', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'vehicle_details' },
    { key: 'vehicle_engine_no', label_en: 'Vehicle Engine No.', label_hi: 'Vehicle Engine No.', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'vehicle_details' },
    { key: 'cd_uploaded_24h', label_en: 'CD Uploaded within 24h', label_hi: 'CD Uploaded within 24h', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'vehicle_details' },
    { key: 'footage_collected', label_en: 'Footage Collected', label_hi: 'Footage Collected', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'vehicle_details' },

    // ── Investigation Details group (2 fields) ───────────────────────────
    { key: 'disposal_type', label_en: 'Disposal Type', label_hi: 'Disposal Type', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'investigation_details' },
    { key: 'rc_no', label_en: 'RC No.', label_hi: 'RC No.', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'investigation_details' },

    // ── Financial / Fraud Details group (2 fields) ───────────────────────
    { key: 'cheated_amount', label_en: 'Cheated Amount', label_hi: 'Cheated Amount', data_type: 'number', operators: NUM_OPS, is_pii: false, is_db_col: false, group: 'financial_fraud' },
    { key: 'modus_operandi', label_en: 'Modus Operandi', label_hi: 'Modus Operandi', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, group: 'financial_fraud' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // Arrest Master (record_type = 'ARREST')
  // ─────────────────────────────────────────────────────────────────────────
  ARREST: [
    { key: 'linked_fir_dd_no',   label_en: 'Linked FIR / DD No.',  label_hi: 'संबंधित एफआईआर/डीडी',  data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, join_key: true, wh_col: 'linked_fir_dd_no' },
    { key: 'act_name',           label_en: 'Act / Law Name',        label_hi: 'अधिनियम का नाम',       data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'act_name' },
    { key: 'sections',           label_en: 'Sections',              label_hi: 'धाराएं',               data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'sections' },
    { key: 'crime_head',         label_en: 'Crime Head',            label_hi: 'अपराध शीर्ष',          data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: CRIME_HEAD_OPTIONS, wh_col: 'crime_head' },
    { key: 'arrested_name',      label_en: 'Arrested Person Name',  label_hi: 'गिरफ्तार व्यक्ति',     data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'arrested_name' },
    { key: 'arrested_address',   label_en: 'Arrested Person Address',label_hi: 'गिरफ्तार का पता',    data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'arrested_address' },
    { key: 'arrest_date',        label_en: 'Date of Arrest',        label_hi: 'गिरफ्तारी तिथि',       data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'arrest_date' },
    { key: 'arrest_place',       label_en: 'Place of Arrest',       label_hi: 'गिरफ्तारी स्थान',      data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'arrest_place' },
    { key: 'status',             label_en: 'Arrestee Status',       label_hi: 'हिरासत की स्थिति',     data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false,
      options: ['judicial_custody','police_custody','bail','released','others'], wh_col: 'custody_status' },
    { key: 'io_name',            label_en: 'Arresting Officer',     label_hi: 'गिरफ्तार अधिकारी',    data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name', group: 'io_info' },
    { key: 'nafis_prepared',     label_en: 'NAFIS Prepared',        label_hi: 'नाफिस तैयार',          data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'nafis_prepared' },
    { key: 'dossier_prepared',   label_en: 'Dossier Prepared',      label_hi: 'डोजियर तैयार',         data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'dossier_prepared' },
    { key: 'heinous_offence',    label_en: 'Heinous Offence',      label_hi: 'जघन्य अपराध',           data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'heinous_offence' },

    // ── IO Info group (add rank/pis/mobile — io_name already tagged above) ──
    ...ioInfoExtraFields('io_info'),

    // ── Intimation Address group (10 fields) ─────────────────────────────
    ...plainAddressFieldSet('intimation', 'Intimation', 'intimation_address'),

    // ── Special Scheme group (7 fields) ──────────────────────────────────
    { key: 'scheme', label_en: 'Scheme', label_hi: 'Scheme', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'special_scheme' },
    { key: 'integrated_pi', label_en: 'Integrated PI', label_hi: 'Integrated PI', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'special_scheme' },
    { key: 'group_patrolling', label_en: 'Group Patrolling', label_hi: 'Group Patrolling', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'special_scheme' },
    { key: 'cycle_patrolling', label_en: 'Cycle Patrolling', label_hi: 'Cycle Patrolling', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'special_scheme' },
    { key: 'by_antisnatching_team', label_en: 'By Anti-Snatching Team', label_hi: 'By Anti-Snatching Team', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'special_scheme' },
    { key: 'by_prahari', label_en: 'By Prahari', label_hi: 'By Prahari', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'special_scheme' },
    { key: 'by_eyes_ears_scheme_members', label_en: 'By Eyes & Ears Scheme Members', label_hi: 'By Eyes & Ears Scheme Members', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'special_scheme' },

    // ── Custody Status Details group (2 fields) ──────────────────────────
    { key: 'other_status_reason', label_en: 'Other Status Reason', label_hi: 'Other Status Reason', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, group: 'custody_status_detail' },
    { key: 'recovery', label_en: 'Recovery', label_hi: 'Recovery', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, group: 'custody_status_detail' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // PCR / Kalandra Master (record_type = 'PCR_CALL')
  // ─────────────────────────────────────────────────────────────────────────
  PCR_CALL: [
    { key: 'gd_no',              label_en: 'GD Entry Number',       label_hi: 'जीडी प्रविष्टि संख्या', data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_no', group: 'general_info' },
    { key: 'gd_date',            label_en: 'GD Entry Date',         label_hi: 'जीडी दिनांक',          data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_date', group: 'general_info' },
    { key: 'gd_time',            label_en: 'GD Entry Time',         label_hi: 'जीडी समय',             data_type: 'time',    operators: TIME_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_time', group: 'general_info' },
    { key: 'call_head',          label_en: 'PCR Call Category',     label_hi: 'पीसीआर कॉल श्रेणी',   data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: CRIME_HEAD_OPTIONS, wh_col: 'call_head' },
    { key: 'caller_name',        label_en: 'Caller / Complainant Name', label_hi: 'कॉलर का नाम',    data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'caller_name', group: 'informant_contact' },
    { key: 'caller_mobile',      label_en: 'Caller Mobile',         label_hi: 'कॉलर मोबाइल',          data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'caller_mobile', group: 'informant_contact' },
    { key: 'call_gist',          label_en: 'PCR Dispatch Call Gist',label_hi: 'पीसीआर कॉल विवरण',    data_type: 'textarea',operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, wh_col: 'call_gist' },
    { key: 'io_name',            label_en: 'Responding Officer (IO)',label_hi: 'प्रतिसाद अधिकारी',   data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name', group: 'io_info' },
    { key: 'arrival_time',       label_en: 'Arrival Time',          label_hi: 'पहुंचने का समय',        data_type: 'time',    operators: TIME_OPS, is_pii: false, is_db_col: false, wh_col: 'arrival_time', group: 'pcr_incident_details' },
    { key: 'status',             label_en: 'Final Call Status',     label_hi: 'अंतिम कॉल स्थिति',    data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false,
      options: ['attended','pending','fir_registered','no_cognizable'], wh_col: 'call_status' },

    // ── IO Info group ─────────────────────────────────────────────────────
    ...ioInfoExtraFields('io_info'),

    // ── Incident Details group (adds to arrival_time above) ──────────────
    { key: 'occurrence_place', label_en: 'Place of Occurrence', label_hi: 'Place of Occurrence', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'pcr_incident_details' },
    { key: 'latitude', label_en: 'Latitude', label_hi: 'Latitude', data_type: 'number', operators: NUM_OPS, is_pii: false, is_db_col: false, group: 'pcr_incident_details' },
    { key: 'longitude', label_en: 'Longitude', label_hi: 'Longitude', data_type: 'number', operators: NUM_OPS, is_pii: false, is_db_col: false, group: 'pcr_incident_details' },

    // ── Informant Contact group (adds to caller_name/caller_mobile above) ─
    { key: 'pcr_no', label_en: 'PCR No.', label_hi: 'PCR No.', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'informant_contact' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // Missing Person Master (record_type = 'MISSING')
  // ─────────────────────────────────────────────────────────────────────────
  MISSING: [
    { key: 'dd_no',              label_en: 'DD / FIR Reference No.',label_hi: 'डीडी/एफआईआर संदर्भ',  data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, join_key: true, wh_col: 'dd_no', group: 'general_info' },
    { key: 'dd_date',            label_en: 'Reference Entry Date',  label_hi: 'संदर्भ दिनांक',         data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'dd_date', group: 'general_info' },
    { key: 'missing_name',       label_en: 'Missing Person Name',   label_hi: 'लापता व्यक्ति का नाम',  data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'missing_name', group: 'person_details' },
    { key: 'age',                label_en: 'Age / Approx. Age',     label_hi: 'आयु',                   data_type: 'number',  operators: NUM_OPS,  is_pii: false, is_db_col: false, wh_col: 'age', group: 'person_details' },
    { key: 'gender',             label_en: 'Gender',                label_hi: 'लिंग',                  data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: ['Male','Female','Other'], wh_col: 'gender', group: 'person_details' },
    { key: 'major_minor',        label_en: 'Major / Minor',         label_hi: 'वयस्क / नाबालिग',      data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: ['Major','Minor'], wh_col: 'major_minor', group: 'person_details' },
    { key: 'missing_date',       label_en: 'Date Missing / Recovered',label_hi: 'लापता/मिला दिनांक',  data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'missing_date', group: 'person_details' },
    { key: 'missing_place',      label_en: 'Last Seen Location',    label_hi: 'अंतिम बार देखा स्थान', data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'missing_place', group: 'person_details' },
    { key: 'physical_description',label_en: 'Physical Description', label_hi: 'शारीरिक हुलिया',        data_type: 'textarea',operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, wh_col: 'physical_description', group: 'physical_description' },
    { key: 'informant_name',     label_en: 'Complainant / Informant Name', label_hi: 'सूचनादाता नाम', data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'informant_name', group: 'contacts_assigned' },
    { key: 'informant_mobile',   label_en: 'Informant Contact',     label_hi: 'सूचनादाता मोबाइल',    data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'informant_mobile', group: 'contacts_assigned' },
    { key: 'io_name',            label_en: 'Assigned IO',           label_hi: 'आवंटित जांच अधिकारी', data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name', group: 'io_info' },
    { key: 'zipnet_no',          label_en: 'ZIPNET No.',            label_hi: 'जिपनेट संख्या',        data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'zipnet_no', group: 'contacts_assigned' },
    { key: 'status',             label_en: 'Current Log Status',    label_hi: 'वर्तमान स्थिति',        data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false,
      options: ['Missing','Traced','Closed','Found','Searching','Identified','Not Identified'], wh_col: 'missing_status' },

    // ── IO Info group (add rank/pis/mobile) ──────────────────────────────
    ...ioInfoExtraFields('io_info'),

    // ── Person Details group (2 new — mp_known, missing_relation_type) ───
    { key: 'mp_known', label_en: 'Missing Person Known?', label_hi: 'Missing Person Known?', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'person_details' },
    { key: 'missing_relation_type', label_en: 'Relation Type', label_hi: 'Relation Type', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'person_details' },

    // ── Missing Address group (17 fields, hand-authored irregular layout) ─
    { key: 'mp_house_no', label_en: 'Missing Person House No.', label_hi: 'Missing Person House No.', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_street', label_en: 'Missing Person Street', label_hi: 'Missing Person Street', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_colony', label_en: 'Missing Person Colony', label_hi: 'Missing Person Colony', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_city_town_village', label_en: 'Missing Person City / Town / Village', label_hi: 'Missing Person City / Town / Village', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_state', label_en: 'Missing Person State', label_hi: 'Missing Person State', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_district', label_en: 'Missing Person District', label_hi: 'Missing Person District', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_pincode', label_en: 'Missing Person Pincode', label_hi: 'Missing Person Pincode', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_address', label_en: 'Missing Person Address (Full)', label_hi: 'Missing Person Address (Full)', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'missing_address', label_en: 'Missing Address (Legacy)', label_hi: 'Missing Address (Legacy)', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_perm_same', label_en: 'Permanent Address Same as Present?', label_hi: 'Permanent Address Same as Present?', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'missing_address' },
    { key: 'mp_perm_house_no', label_en: 'Missing Person Permanent House No.', label_hi: 'Missing Person Permanent House No.', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_perm_street', label_en: 'Missing Person Permanent Street', label_hi: 'Missing Person Permanent Street', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_perm_colony', label_en: 'Missing Person Permanent Colony', label_hi: 'Missing Person Permanent Colony', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_perm_city_town_village', label_en: 'Missing Person Permanent City / Town / Village', label_hi: 'Missing Person Permanent City / Town / Village', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_perm_state', label_en: 'Missing Person Permanent State', label_hi: 'Missing Person Permanent State', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_perm_district', label_en: 'Missing Person Permanent District', label_hi: 'Missing Person Permanent District', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },
    { key: 'mp_perm_pincode', label_en: 'Missing Person Permanent Pincode', label_hi: 'Missing Person Permanent Pincode', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'missing_address' },

    // ── Physical Description group (9 new — physical_description tagged above) ─
    ...physicalDescriptionExtraFields('physical_description'),

    // ── Contacts Assigned group (1 new — informant_relation) ─────────────
    { key: 'informant_relation', label_en: 'Informant Relation', label_hi: 'Informant Relation', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'contacts_assigned' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // UIDB Master (record_type = 'UIDB')
  // ─────────────────────────────────────────────────────────────────────────
  UIDB: [
    { key: 'dd_no',              label_en: 'DD Number',             label_hi: 'डीडी संख्या',           data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'dd_no' },
    { key: 'found_date',         label_en: 'Discovery Date',        label_hi: 'खोज दिनांक',            data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'found_date', group: 'corpse_desc' },
    { key: 'found_place',        label_en: 'Place Body Found',      label_hi: 'शव मिलने का स्थान',    data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'found_place', group: 'corpse_desc' },
    { key: 'gender',             label_en: 'Gender',                label_hi: 'लिंग',                  data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: ['Male','Female','Unknown'], wh_col: 'gender' },
    { key: 'approx_age',         label_en: 'Estimated Age',         label_hi: 'अनुमानित आयु',          data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'approx_age', group: 'corpse_desc' },
    { key: 'description',        label_en: 'Physical Description',  label_hi: 'शारीरिक हुलिया',        data_type: 'textarea',operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, wh_col: 'description', group: 'physical_description' },
    { key: 'io_name',            label_en: 'IO Name',               label_hi: 'जांच अधिकारी',          data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name', group: 'io_info' },
    { key: 'informant_name',     label_en: 'Informant Name',        label_hi: 'सूचनादाता नाम',         data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'informant_name', group: 'contacts_assigned' },
    { key: 'zipnet_no',          label_en: 'ZIPNET No.',            label_hi: 'जिपनेट संख्या',         data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'zipnet_no', group: 'contacts_assigned' },
    { key: 'identified',         label_en: 'Body Identified',       label_hi: 'शव पहचाना गया',         data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'identified', group: 'corpse_desc' },
    { key: 'status',             label_en: 'Current Status / Mortuary Remarks', label_hi: 'वर्तमान स्थिति', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'uidb_status' },
    { key: 'heinous_offence',    label_en: 'Heinous Offence',      label_hi: 'जघन्य अपराध',           data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'heinous_offence' },

    // ── IO Info group ─────────────────────────────────────────────────────
    ...ioInfoExtraFields('io_info'),

    // ── Contacts Assigned group (1 new — informant_relation) ─────────────
    { key: 'informant_relation', label_en: 'Informant Relation', label_hi: 'Informant Relation', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'contacts_assigned' },

    // ── Corpse / Deceased Details group (22 new, adds to found_date/found_place/approx_age/identified above) ─
    { key: 'deceased_name', label_en: 'Deceased Name (if identified)', label_hi: 'Deceased Name', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_house_no', label_en: 'Deceased House No.', label_hi: 'Deceased House No.', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_street', label_en: 'Deceased Street', label_hi: 'Deceased Street', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_colony', label_en: 'Deceased Colony', label_hi: 'Deceased Colony', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_city_town_village', label_en: 'Deceased City / Town / Village', label_hi: 'Deceased City / Town / Village', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_state', label_en: 'Deceased State', label_hi: 'Deceased State', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_district', label_en: 'Deceased District', label_hi: 'Deceased District', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_pincode', label_en: 'Deceased Pincode', label_hi: 'Deceased Pincode', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_address', label_en: 'Deceased Address (Full)', label_hi: 'Deceased Address (Full)', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_same', label_en: 'Deceased Permanent Address Same as Present?', label_hi: 'Deceased Permanent Address Same as Present?', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_house_no', label_en: 'Deceased Permanent House No.', label_hi: 'Deceased Permanent House No.', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_street', label_en: 'Deceased Permanent Street', label_hi: 'Deceased Permanent Street', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_colony', label_en: 'Deceased Permanent Colony', label_hi: 'Deceased Permanent Colony', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_city_town_village', label_en: 'Deceased Permanent City / Town / Village', label_hi: 'Deceased Permanent City / Town / Village', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_state', label_en: 'Deceased Permanent State', label_hi: 'Deceased Permanent State', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_district', label_en: 'Deceased Permanent District', label_hi: 'Deceased Permanent District', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_pincode', label_en: 'Deceased Permanent Pincode', label_hi: 'Deceased Permanent Pincode', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'deceased_perm_address', label_en: 'Deceased Permanent Address (Full)', label_hi: 'Deceased Permanent Address (Full)', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'corpse_desc' },
    { key: 'found_time', label_en: 'Time Body Found', label_hi: 'Time Body Found', data_type: 'time', operators: TIME_OPS, is_pii: false, is_db_col: false, group: 'corpse_desc' },
    { key: 'found_latitude', label_en: 'Found Latitude', label_hi: 'Found Latitude', data_type: 'number', operators: NUM_OPS, is_pii: false, is_db_col: false, group: 'corpse_desc' },
    { key: 'found_longitude', label_en: 'Found Longitude', label_hi: 'Found Longitude', data_type: 'number', operators: NUM_OPS, is_pii: false, is_db_col: false, group: 'corpse_desc' },
    { key: 'identification_marks', label_en: 'Identification Marks', label_hi: 'Identification Marks', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, group: 'corpse_desc' },

    // ── Physical Description group (9 new, adds to description above) ────
    ...physicalDescriptionExtraFields('physical_description'),

    // ── Inquest Details group (5 new) ─────────────────────────────────────
    { key: 'cause_of_death', label_en: 'Cause of Death', label_hi: 'Cause of Death', data_type: 'textarea', operators: TEXTAREA_OPS, is_pii: false, is_db_col: false, group: 'inquest_details' },
    { key: 'deceased_relative_name', label_en: 'Deceased Relative Name', label_hi: 'Deceased Relative Name', data_type: 'text', operators: TEXT_OPS, is_pii: true, pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, group: 'inquest_details' },
    { key: 'deceased_relation_type', label_en: 'Deceased Relation Type', label_hi: 'Deceased Relation Type', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'inquest_details' },
    { key: 'filed_by_acp_sdm', label_en: 'Filed by ACP/SDM', label_hi: 'Filed by ACP/SDM', data_type: 'enum', operators: ENUM_OPS, options: YES_NO_OPTIONS, is_pii: false, is_db_col: false, group: 'inquest_details' },
    { key: 'filed_by_acp_sdm_date', label_en: 'Filed by ACP/SDM Date', label_hi: 'Filed by ACP/SDM Date', data_type: 'date', operators: DATE_OPS, is_pii: false, is_db_col: false, group: 'inquest_details' },
  ],
};

/**
 * Human-readable group display labels, keyed by `TABLE.groupKey`.
 * field_registry has no populated section_label_en/label_hi (all null in the
 * seed), so these were authored fresh — Hindi labels are placeholders equal
 * to English pending translation review.
 */
export const GROUP_LABELS = {
  'CASE.general_info': { label_en: 'General Info', label_hi: 'General Info' },
  'CASE.io_info': { label_en: 'IO Info', label_hi: 'IO Info' },
  'CASE.complainant_personal_info': { label_en: 'Complainant Personal Info', label_hi: 'Complainant Personal Info' },
  'CASE.complainant_address_detail': { label_en: 'Complainant Address', label_hi: 'Complainant Address' },
  'CASE.occurrence_info': { label_en: 'Occurrence Info', label_hi: 'Occurrence Info' },
  'CASE.vehicle_details': { label_en: 'Vehicle Details', label_hi: 'Vehicle Details' },
  'CASE.investigation_details': { label_en: 'Investigation Details', label_hi: 'Investigation Details' },
  'CASE.financial_fraud': { label_en: 'Financial / Fraud Details', label_hi: 'Financial / Fraud Details' },

  'ARREST.io_info': { label_en: 'IO Info', label_hi: 'IO Info' },
  'ARREST.intimation_address': { label_en: 'Intimation Address', label_hi: 'Intimation Address' },
  'ARREST.special_scheme': { label_en: 'Special Scheme', label_hi: 'Special Scheme' },
  'ARREST.custody_status_detail': { label_en: 'Custody Status Details', label_hi: 'Custody Status Details' },

  'PCR_CALL.general_info': { label_en: 'General Info', label_hi: 'General Info' },
  'PCR_CALL.io_info': { label_en: 'IO Info', label_hi: 'IO Info' },
  'PCR_CALL.pcr_incident_details': { label_en: 'Incident Details', label_hi: 'Incident Details' },
  'PCR_CALL.informant_contact': { label_en: 'Informant Contact', label_hi: 'Informant Contact' },

  'MISSING.general_info': { label_en: 'General Info', label_hi: 'General Info' },
  'MISSING.io_info': { label_en: 'IO Info', label_hi: 'IO Info' },
  'MISSING.person_details': { label_en: 'Person Details', label_hi: 'Person Details' },
  'MISSING.missing_address': { label_en: 'Missing Person Address', label_hi: 'Missing Person Address' },
  'MISSING.physical_description': { label_en: 'Physical Description', label_hi: 'Physical Description' },
  'MISSING.contacts_assigned': { label_en: 'Contacts Assigned', label_hi: 'Contacts Assigned' },

  'UIDB.io_info': { label_en: 'IO Info', label_hi: 'IO Info' },
  'UIDB.corpse_desc': { label_en: 'Deceased / Corpse Details', label_hi: 'Deceased / Corpse Details' },
  'UIDB.physical_description': { label_en: 'Physical Description', label_hi: 'Physical Description' },
  'UIDB.inquest_details': { label_en: 'Inquest Details', label_hi: 'Inquest Details' },
  'UIDB.contacts_assigned': { label_en: 'Contacts Assigned', label_hi: 'Contacts Assigned' },
};

/**
 * Build a flat whitelist Set for O(1) lookup: "TABLE.fieldKey"
 * Used by the query engine to validate every user-supplied field.
 */
export function buildWhitelist() {
  const set = new Set();
  // System fields
  for (const f of REPORTABLE_FIELDS._SYSTEM) {
    set.add(`_SYSTEM.${f.key}`);
    // Also allow on any table
    for (const table of ALLOWED_TABLES) {
      set.add(`${table}.${f.key}`);
    }
  }
  // Per-table fields
  for (const [table, fields] of Object.entries(REPORTABLE_FIELDS)) {
    if (table === '_SYSTEM') continue;
    for (const f of fields) {
      set.add(`${table}.${f.key}`);
    }
  }
  return set;
}

/**
 * Get the definition for a field, given table and key.
 * Returns null if not found (query engine should reject it).
 */
export function getFieldDef(table, key) {
  // Check system fields first
  const systemField = REPORTABLE_FIELDS._SYSTEM.find(f => f.key === key);
  if (systemField) return { ...systemField, table: '_SYSTEM' };
  // Check table-specific
  const tableFields = REPORTABLE_FIELDS[table];
  if (!tableFields) return null;
  const field = tableFields.find(f => f.key === key);
  return field ? { ...field, table } : null;
}

/**
 * Filter fields for a given user role — removes PII fields below pii_min_role threshold.
 */
export function filterFieldsForRole(fields, userRole) {
  const userRoleIdx = ROLE_ORDER.indexOf(userRole);
  return fields.filter(f => {
    if (!f.is_pii) return true;
    const minRoleIdx = ROLE_ORDER.indexOf(f.pii_min_role || 'DISTRICT_OFFICER');
    return userRoleIdx >= minRoleIdx;
  });
}
