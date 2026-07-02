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
 * }
 */
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
    { key: 'fir_no',              label_en: 'FIR Number',           label_hi: 'एफआईआर संख्या',          data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, join_key: true, wh_col: 'fir_no' },
    { key: 'fir_date',            label_en: 'FIR Date',             label_hi: 'एफआईआर दिनांक',          data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'fir_date' },
    { key: 'gd_no',               label_en: 'DD / GD Number',       label_hi: 'डीडी/जीडी संख्या',       data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, join_key: true, wh_col: 'gd_no' },
    { key: 'gd_date',             label_en: 'DD Date',              label_hi: 'डीडी दिनांक',            data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_date' },
    { key: 'gd_time',             label_en: 'DD Time',              label_hi: 'डीडी समय',              data_type: 'time',    operators: TIME_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_time' },
    { key: 'beat_no',             label_en: 'Beat No.',             label_hi: 'बीट नंबर',              data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'beat_no' },
    { key: 'occurrence_date',     label_en: 'Date of Occurrence',   label_hi: 'घटना की तिथि',          data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'occurrence_date' },
    { key: 'occurrence_place',    label_en: 'Place of Occurrence',  label_hi: 'घटना का स्थान',         data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'occurrence_place' },
    { key: 'local_head',          label_en: 'Crime Head',           label_hi: 'अपराध शीर्ष',           data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: CRIME_HEAD_OPTIONS, wh_col: 'local_head' },
    { key: 'act_name',            label_en: 'Act / Law',            label_hi: 'अधिनियम',               data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'act_name' },
    { key: 'sections',            label_en: 'Sections',             label_hi: 'धाराएं',                data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'sections' },
    { key: 'brief_facts',         label_en: 'Brief Facts',          label_hi: 'संक्षिप्त विवरण',        data_type: 'textarea',operators: ['CONTAINS','IS_EMPTY','IS_NOT_EMPTY'], is_pii: false, is_db_col: false, wh_col: 'brief_facts' },
    { key: 'complainant_name',    label_en: 'Complainant Name',     label_hi: 'शिकायतकर्ता का नाम',    data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'complainant_name' },
    { key: 'complainant_address', label_en: 'Complainant Address',  label_hi: 'शिकायतकर्ता का पता',   data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'complainant_address' },
    { key: 'accused_name',        label_en: 'Accused Name',         label_hi: 'आरोपी का नाम',          data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'accused_name' },
    { key: 'accused_address',     label_en: 'Accused Address',      label_hi: 'आरोपी का पता',          data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'accused_address' },
    { key: 'io_name',             label_en: 'Name of IO',           label_hi: 'जांच अधिकारी',          data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name' },
    { key: 'io_pis',              label_en: 'PIS No. of IO',        label_hi: 'जांच अधिकारी PIS',      data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_pis' },
    { key: 'io_mobile',           label_en: 'IO Mobile No.',        label_hi: 'जांच अधिकारी मोबाइल',  data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_mobile' },
    { key: 'property_description',label_en: 'Property Description', label_hi: 'संपत्ति विवरण',         data_type: 'textarea',operators: ['CONTAINS','IS_EMPTY','IS_NOT_EMPTY'], is_pii: false, is_db_col: false, wh_col: 'property_description' },
    { key: 'property_status',     label_en: 'Property Status',      label_hi: 'संपत्ति स्थिति',        data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: ['Stolen','Recovered','NA'], wh_col: 'property_status' },
    { key: 'status',              label_en: 'Case Status',          label_hi: 'मामले की स्थिति',       data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false,
      options: ['Open','Chargesheeted','Closed','Charge Sheet','PIR-JCL','Untraced','Pending','Cancellation','Quashed','Closure Report','Released U/S 189 BNSS'], wh_col: 'case_status' },
    { key: 'remarks',             label_en: 'Remarks',              label_hi: 'टिप्पणियां',             data_type: 'textarea',operators: ['CONTAINS','IS_EMPTY','IS_NOT_EMPTY'], is_pii: false, is_db_col: false, wh_col: 'remarks' },
    { key: 'cctns_flag',          label_en: 'CCTNS Flag',           label_hi: 'सीसीटीएनएस झंडा',       data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'cctns_flag' },
    { key: 'zero_fir_flag',       label_en: 'Zero FIR',             label_hi: 'जीरो एफआईआर',           data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'zero_fir_flag' },
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
    { key: 'io_name',            label_en: 'Arresting Officer',     label_hi: 'गिरफ्तार अधिकारी',    data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name' },
    { key: 'nafis_prepared',     label_en: 'NAFIS Prepared',        label_hi: 'नाफिस तैयार',          data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'nafis_prepared' },
    { key: 'dossier_prepared',   label_en: 'Dossier Prepared',      label_hi: 'डोजियर तैयार',         data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'dossier_prepared' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // PCR / Kalandra Master (record_type = 'PCR_CALL')
  // ─────────────────────────────────────────────────────────────────────────
  PCR_CALL: [
    { key: 'gd_no',              label_en: 'GD Entry Number',       label_hi: 'जीडी प्रविष्टि संख्या', data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_no' },
    { key: 'gd_date',            label_en: 'GD Entry Date',         label_hi: 'जीडी दिनांक',          data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_date' },
    { key: 'gd_time',            label_en: 'GD Entry Time',         label_hi: 'जीडी समय',             data_type: 'time',    operators: TIME_OPS, is_pii: false, is_db_col: false, wh_col: 'gd_time' },
    { key: 'call_head',          label_en: 'PCR Call Category',     label_hi: 'पीसीआर कॉल श्रेणी',   data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: CRIME_HEAD_OPTIONS, wh_col: 'call_head' },
    { key: 'caller_name',        label_en: 'Caller / Complainant Name', label_hi: 'कॉलर का नाम',    data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'caller_name' },
    { key: 'caller_mobile',      label_en: 'Caller Mobile',         label_hi: 'कॉलर मोबाइल',          data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'caller_mobile' },
    { key: 'call_gist',          label_en: 'PCR Dispatch Call Gist',label_hi: 'पीसीआर कॉल विवरण',    data_type: 'textarea',operators: ['CONTAINS','IS_EMPTY','IS_NOT_EMPTY'], is_pii: false, is_db_col: false, wh_col: 'call_gist' },
    { key: 'io_name',            label_en: 'Responding Officer (IO)',label_hi: 'प्रतिसाद अधिकारी',   data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name' },
    { key: 'arrival_time',       label_en: 'Arrival Time',          label_hi: 'पहुंचने का समय',        data_type: 'time',    operators: TIME_OPS, is_pii: false, is_db_col: false, wh_col: 'arrival_time' },
    { key: 'status',             label_en: 'Final Call Status',     label_hi: 'अंतिम कॉल स्थिति',    data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false,
      options: ['attended','pending','fir_registered','no_cognizable'], wh_col: 'call_status' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // Missing Person Master (record_type = 'MISSING')
  // ─────────────────────────────────────────────────────────────────────────
  MISSING: [
    { key: 'dd_no',              label_en: 'DD / FIR Reference No.',label_hi: 'डीडी/एफआईआर संदर्भ',  data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, join_key: true, wh_col: 'dd_no' },
    { key: 'dd_date',            label_en: 'Reference Entry Date',  label_hi: 'संदर्भ दिनांक',         data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'dd_date' },
    { key: 'missing_name',       label_en: 'Missing Person Name',   label_hi: 'लापता व्यक्ति का नाम',  data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'missing_name' },
    { key: 'age',                label_en: 'Age / Approx. Age',     label_hi: 'आयु',                   data_type: 'number',  operators: NUM_OPS,  is_pii: false, is_db_col: false, wh_col: 'age' },
    { key: 'gender',             label_en: 'Gender',                label_hi: 'लिंग',                  data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: ['Male','Female','Other'], wh_col: 'gender' },
    { key: 'major_minor',        label_en: 'Major / Minor',         label_hi: 'वयस्क / नाबालिग',      data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: ['Major','Minor'], wh_col: 'major_minor' },
    { key: 'missing_date',       label_en: 'Date Missing / Recovered',label_hi: 'लापता/मिला दिनांक',  data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'missing_date' },
    { key: 'missing_place',      label_en: 'Last Seen Location',    label_hi: 'अंतिम बार देखा स्थान', data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'missing_place' },
    { key: 'physical_description',label_en: 'Physical Description', label_hi: 'शारीरिक हुलिया',        data_type: 'textarea',operators: ['CONTAINS','IS_EMPTY','IS_NOT_EMPTY'], is_pii: false, is_db_col: false, wh_col: 'physical_description' },
    { key: 'informant_name',     label_en: 'Complainant / Informant Name', label_hi: 'सूचनादाता नाम', data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'informant_name' },
    { key: 'informant_mobile',   label_en: 'Informant Contact',     label_hi: 'सूचनादाता मोबाइल',    data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'informant_mobile' },
    { key: 'io_name',            label_en: 'Assigned IO',           label_hi: 'आवंटित जांच अधिकारी', data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name' },
    { key: 'zipnet_no',          label_en: 'ZIPNET No.',            label_hi: 'जिपनेट संख्या',        data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'zipnet_no' },
    { key: 'status',             label_en: 'Current Log Status',    label_hi: 'वर्तमान स्थिति',        data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false,
      options: ['Missing','Traced','Closed','Found','Searching','Identified','Not Identified'], wh_col: 'missing_status' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // UIDB Master (record_type = 'UIDB')
  // ─────────────────────────────────────────────────────────────────────────
  UIDB: [
    { key: 'dd_no',              label_en: 'DD Number',             label_hi: 'डीडी संख्या',           data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'dd_no' },
    { key: 'found_date',         label_en: 'Discovery Date',        label_hi: 'खोज दिनांक',            data_type: 'date',    operators: DATE_OPS, is_pii: false, is_db_col: false, wh_col: 'found_date' },
    { key: 'found_place',        label_en: 'Place Body Found',      label_hi: 'शव मिलने का स्थान',    data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'found_place' },
    { key: 'gender',             label_en: 'Gender',                label_hi: 'लिंग',                  data_type: 'enum',    operators: ENUM_OPS, is_pii: false, is_db_col: false, options: ['Male','Female','Unknown'], wh_col: 'gender' },
    { key: 'approx_age',         label_en: 'Estimated Age',         label_hi: 'अनुमानित आयु',          data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'approx_age' },
    { key: 'description',        label_en: 'Physical Description',  label_hi: 'शारीरिक हुलिया',        data_type: 'textarea',operators: ['CONTAINS','IS_EMPTY','IS_NOT_EMPTY'], is_pii: false, is_db_col: false, wh_col: 'description' },
    { key: 'io_name',            label_en: 'IO Name',               label_hi: 'जांच अधिकारी',          data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'officer_name' },
    { key: 'informant_name',     label_en: 'Informant Name',        label_hi: 'सूचनादाता नाम',         data_type: 'text',    operators: TEXT_OPS, is_pii: true,  pii_min_role: 'DISTRICT_OFFICER', is_db_col: false, wh_col: 'informant_name' },
    { key: 'zipnet_no',          label_en: 'ZIPNET No.',            label_hi: 'जिपनेट संख्या',         data_type: 'text',    operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'zipnet_no' },
    { key: 'identified',         label_en: 'Body Identified',       label_hi: 'शव पहचाना गया',         data_type: 'boolean', operators: BOOL_OPS, is_pii: false, is_db_col: false, wh_col: 'identified' },
    { key: 'status',             label_en: 'Current Status / Mortuary Remarks', label_hi: 'वर्तमान स्थिति', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, wh_col: 'uidb_status' },
  ],
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
