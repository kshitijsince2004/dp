import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { publish } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';
import * as fieldsService from './fields.service.js';
import { ACT_GROUP_CODES, MINOR_HEAD_MAJOR_CODES } from './classificationSources.config.js';

const parseJsonField = (val) => {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    // Standard JSON format
    try { return JSON.parse(val); } catch (e) {}
    // PostgreSQL native array notation: {elem1,"elem2",...}
    if (val.startsWith('{') && val.endsWith('}')) {
      const inner = val.slice(1, -1);
      if (!inner.trim()) return [];
      return inner.split(',').map((s) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    return val;
  }
  return val;
};

function toTitleCase(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const SECTION_TITLES = {
  general_info:             { en: 'General Information',                    hi: 'सामान्य जानकारी' },
  basic_details:            { en: 'Basic Details',                          hi: 'बुनियादी विवरण' },
  incident_details:         { en: 'Incident Details',                       hi: 'घटना का विवरण' },
  investigation_details:    { en: 'Investigation Details',                  hi: 'जांच का विवरण' },
  complainant_accused_info: { en: 'Complainant & Accused',                  hi: 'शिकायतकर्ता और आरोपी' },
  investigation_officer:    { en: 'Investigating Officer',                  hi: 'जांच अधिकारी' },
  property_status:          { en: 'Property & Case Status',                 hi: 'संपत्ति और स्थिति' },
  intranet_flags:           { en: 'System Reference Flags',                 hi: 'प्रणाली संदर्भ झंडे' },
  linkages:                 { en: 'Case Linkage',                           hi: 'केस लिंकेज' },
  arrestee_info:            { en: 'Arrested Person Particulars',            hi: 'गिरफ्तार व्यक्ति का विवरण' },
  offence_info:             { en: 'Offence Classification',                 hi: 'अपराध वर्गीकरण' },
  procedure_slips:          { en: 'Procedural Slips',                       hi: 'प्रक्रियात्मक पर्ची' },
  custody_status:           { en: 'Custody Status',                         hi: 'हिरासत की स्थिति' },
  informant_contact:        { en: 'Informant Contact',                      hi: 'सूचना प्रदाता संपर्क' },
  complaint_details:        { en: 'Complaint Details',                      hi: 'शिकायत विवरण' },
  response_io:              { en: 'Responding Officers',                    hi: 'प्रतिक्रिया अधिकारी' },
  arrival_geo:              { en: 'Arrival & Geo-Location',                 hi: 'आगमन और भू-स्थान' },
  record_type_select:       { en: 'Register Type & References',             hi: 'पंजीकरण प्रकार' },
  physical_bio:             { en: 'Physical Description',                   hi: 'शारीरिक विवरण' },
  location_particulars:     { en: 'Location Particulars',                   hi: 'स्थान विवरण' },
  contacts_assigned:        { en: 'Contacts & Assigned IO',                 hi: 'संपर्क और IO' },
  person_details:           { en: 'Person Details',                         hi: 'व्यक्ति विवरण' },
  officer_informant:        { en: 'Officers & Informant',                   hi: 'अधिकारी और सूचना प्रदाता' },
  discovery_details:        { en: 'Discovery Details',                      hi: 'बरामदगी का विवरण' },
  corpse_desc:              { en: 'Corpse Description',                     hi: 'शव विवरण' },
  zipnet_status:            { en: 'ZIPNET & Status',                        hi: 'ज़िपनेट और स्थिति' },
  // ── New sections added from MUT Form spec ───────────────────────────────────
  arrest_details:           { en: 'Arrest Details',                         hi: 'गिरफ्तारी का विवरण' },
  special_scheme:           { en: 'If Arrested During Special Scheme',      hi: 'यदि विशेष योजना के दौरान गिरफ्तार' },
  missing_details:          { en: 'Missing Person Details',                 hi: 'लापता व्यक्ति का विवरण' },
  physical_description:     { en: 'Physical Description',                   hi: 'शारीरिक हुलिया' },
  uidb_details:             { en: 'If Filed by ACP/SDM',                    hi: 'यदि एसीपी/एसडीएम द्वारा दायर किया गया' },
  stolen_property:          { en: 'Stolen Property',                        hi: 'चोरी की गई संपत्ति' },
  recovered_property:       { en: 'Recovered Property',                     hi: 'बरामद संपत्ति' },
  complainant_personal_info: { en: 'Complainant Personal Information',      hi: 'शिकायतकर्ता की व्यक्तिगत जानकारी' },
  complainant_address:       { en: 'Complainant Address',                   hi: 'शिकायतकर्ता का पता' },
  accused_personal_info:     { en: 'Accused Personal Information',          hi: 'अभियुक्त की व्यक्तिगत जानकारी' },
  accused_address:           { en: 'Accused Address',                       hi: 'अभियुक्त का पता' },
  victim_personal_info:      { en: 'Victim Personal Information',           hi: 'पीड़ित की व्यक्तिगत जानकारी' },
  victim_address:            { en: 'Victim Address',                        hi: 'पीड़ित का पता' },
  arrested_personal_info:    { en: 'Arrested Person Personal Information',  hi: 'गिरफ्तार व्यक्ति की व्यक्तिगत जानकारी' },
  arrested_address:          { en: 'Arrested Person Address',               hi: 'गिरफ्तार व्यक्ति का पता' },
  occurrence_address:        { en: 'Place of Occurrence Address',           hi: 'घटनास्थल का पता' },
  property_details:          { en: 'Property Details',                      hi: 'संपत्ति का विवरण' },
  occurrence_info:           { en: 'Occurrence Information',                 hi: 'घटना की जानकारी' },
  // intimation_details:        { en: 'Intimation Details',                     hi: 'सूचना विवरण' },
  // intimation_address:        { en: 'Intimation Address',                     hi: 'सूचना का पता' },
};

const VALID_FIELD_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'DATETIME', 'SELECT', 'BOOLEAN', 'TIME', 'RADIO'];
const VALID_RECORD_TYPES = ['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'];

const REPEATER_SECTION_TITLES = {
  PERSON_ACCUSED:     { en: 'Accused Persons',     hi: 'अभियुक्त व्यक्ति' },
  PERSON_VICTIM:      { en: 'Victim Persons',       hi: 'पीड़ित व्यक्ति' },
  PERSON_COMPLAINANT: { en: 'Complainant Persons',  hi: 'शिकायतकर्ता' },
  PERSON_ARRESTED:    { en: 'Arrested Persons',     hi: 'गिरफ्तार व्यक्ति' },
  PERSON_MISSING:     { en: 'Missing Persons',      hi: 'लापता व्यक्ति' },
  PERSON_BODY:        { en: 'Bodies',               hi: 'शव' },
  PROPERTY:           { en: 'Properties Involved',  hi: 'सम्बंधित संपत्ति' },
};

function normalizeRecordType(t) {
  const u = t.toUpperCase();
  if (u === 'CASES') return 'CASE';
  if (u === 'ARRESTS') return 'ARREST';
  if (u === 'PCR' || u === 'PCR_CALLS') return 'PCR_CALL';
  if (u === 'MISSING_PERSONS' || u === 'MISSING_PERSON') return 'MISSING';
  return u;
}

// ── GET /fields/form/:record_type ─────────────────────────────────────────────
export const getFieldsForForm = async (req, res) => {
  const { record_type } = req.params;
  const caseType = req.query.caseType || req.query.case_type || null;
  const district_id = req.user.district_id || null;

  const normalizedType = normalizeRecordType(record_type);

  try {
    let query = db('field_registry')
      .where({ is_active: true })
      .orderBy('sort_order', 'asc');

    // Scope filter: always include global; include district fields if user belongs to one
    query = query.where(function () {
      this.where('scope_level', 'global');
      if (district_id) {
        this.orWhere({ scope_level: 'district', scope_id: district_id });
      }
    });

    const rawFields = await query;

    // Small local shaping helper — raw excel_* rows -> {value,label_en,label_hi} option shape,
    // using labelCol as both the value and the display label (matches the existing, established
    // convention for these per-act/per-crime fields, whose show_when clauses compare against the
    // human-readable label, not the underlying numeric code).
    const toValueLabel = (labelCol) => (r) => ({ value: r[labelCol], label_en: r[labelCol], label_hi: r[labelCol] });

    // 1. Acts — load dynamically from excel_acts and map to expected frontend keys
    const dbActs = await fieldsService.getActs();
    const actOptions = dbActs.map(act => {
      let value = act.act_long;
      let label_en = act.act_long;
      let label_hi = act.act_long;

      if (ACT_GROUP_CODES.IPC.includes(act.act_cd)) {
        value = 'IPC';
        label_en = 'IPC 1860';
        label_hi = 'भारतीय दंड संहिता (IPC 1860)';
      } else if (ACT_GROUP_CODES['Delhi Excise Act'].includes(act.act_cd)) {
        value = 'Delhi Excise Act';
        label_en = 'Delhi Excise Act';
        label_hi = 'दिल्ली उत्पाद शुल्क अधिनियम (Excise)';
      } else if (ACT_GROUP_CODES['Arms Act'].includes(act.act_cd)) {
        value = 'Arms Act';
        label_en = 'Arms Act, 1959';
        label_hi = 'आयुध अधिनियम (Arms Act)';
      } else if (ACT_GROUP_CODES['Gambling Act'].includes(act.act_cd)) {
        value = 'Gambling Act';
        label_en = 'Delhi Public Gambling Act';
        label_hi = 'दिल्ली सार्वजनिक जुआ अधिनियम (Gambling)';
      }

      return { value, label_en, label_hi };
    });

    const fallbackActs = [
      { value: 'BNS', label_en: 'BNS (Bharatiya Nyaya Sanhita)', label_hi: 'भारतीय न्याय संहिता (BNS)' },
      { value: 'BNSS', label_en: 'BNSS (Bharatiya Nagarik Suraksha Sanhita)', label_hi: 'भारतीय नागरिक सुरक्षा संहिता (BNSS)' },
      { value: 'CrPC', label_en: 'CrPC (Code of Criminal Procedure)', label_hi: 'दंड प्रक्रिया संहिता (CrPC)' },
      { value: 'Other Act', label_en: 'Other Act', label_hi: 'अन्य अधिनियम (Other Act)' }
    ];

    const finalActOptions = [];
    const seenActValues = new Set();
    for (const opt of actOptions) {
      if (!seenActValues.has(opt.value)) {
        seenActValues.add(opt.value);
        finalActOptions.push(opt);
      }
    }
    for (const opt of fallbackActs) {
      if (!seenActValues.has(opt.value)) {
        seenActValues.add(opt.value);
        finalActOptions.push(opt);
      }
    }

    // 2. Sections per Act — resolved via ACT_GROUP_CODES, no magic act codes inline.
    const ipcSectionOptions = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES.IPC)).map(toValueLabel('section'));
    const exciseSectionOptions = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Delhi Excise Act'])).map(toValueLabel('section'));
    const armsSectionOptions = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Arms Act'])).map(toValueLabel('section'));
    const gamblingSectionOptions = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Gambling Act'])).map(toValueLabel('section'));

    // For the general sections field (e.g. in UIDB or CASE), load sections for every act that has
    // a dedicated group above.
    const allGroupedActCodes = Object.values(ACT_GROUP_CODES).flat();
    const generalSectionOptions = (await fieldsService.getSectionsForActs(allGroupedActCodes)).map(toValueLabel('section'));

    // 3. Major Heads per Act — joins on major_head_code via excel_major_minor_mapping, filtered
    // by the real act_cd(s), no name-string matching.
    const ipcMajorHeadOptions = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES.IPC)).map(toValueLabel('major_head'));
    const exciseMajorHeadOptions = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Delhi Excise Act'])).map(toValueLabel('major_head'));
    const armsMajorHeadOptions = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Arms Act'])).map(toValueLabel('major_head'));
    const gamblingMajorHeadOptions = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Gambling Act'])).map(toValueLabel('major_head'));

    // 4. Minor Heads per crime-specific field_key — resolved via MINOR_HEAD_MAJOR_CODES (verified
    // major_head_code integers), not case-varying name matching. Codes with an empty array
    // (documented source-data gaps) correctly resolve to an empty option list.
    const minorHeadOptionsByFieldKey = {};
    for (const [fieldKey, majorHeadCodes] of Object.entries(MINOR_HEAD_MAJOR_CODES)) {
      const rows = await fieldsService.getMinorHeadsForMajorHeads(majorHeadCodes);
      minorHeadOptionsByFieldKey[fieldKey] = rows.map(toValueLabel('minor_head'));
    }

    // 5. Beats
    const beatOptions = (await fieldsService.getBeats()).map(toValueLabel('beat_name'));

    // 6. Local Heads
    const localHeadOptions = (await fieldsService.getLocalHeads()).map(toValueLabel('local_head'));

    // 7. Property Categories — numeric parent_cd as value, giving a stable join key into
    // /lookup/property-items/:parent_cd. property_minor_category's options are intentionally NOT
    // precomputed here (see field_key dispatch below) — its correct option set depends on a live
    // sibling selection among 10 categories, which cannot be flattened into one static list.
    const propertyCategoryOptions = (await fieldsService.getPropertyCategories())
      .map(c => ({ value: String(c.parent_cd), label_en: c.code_type, label_hi: c.code_type }))
      .sort((a, b) => a.label_en.localeCompare(b.label_en));

    // Filter by applicable_record_types (JS-side, handles both native array and JSON-string storage)
    const filteredFields = rawFields
      .filter((f) => {
        const types = (parseJsonField(f.applicable_record_types) || []).map(normalizeRecordType);
        return types.includes(normalizedType);
      })
      .map((f) => {
        let field_type = f.field_type;
        let options = parseJsonField(f.options);

        // Load lookup options from database dynamically
        if (f.field_key === 'act_name') {
          field_type = 'SELECT';
          options = finalActOptions;
        } else if (f.field_key === 'local_head' || f.field_key === 'crime_head') {
          field_type = 'SELECT';
          options = localHeadOptions;
        } else if (f.field_key === 'property_major_category') {
          field_type = 'SELECT';
          options = propertyCategoryOptions;
        } else if (f.field_key === 'property_minor_category') {
          // Options are inherently dependent on a live sibling selection (property_major_category)
          // and cannot be precomputed in this single-shot response — see depends_on/options_source
          // on the returned field object below.
          field_type = 'SELECT';
          options = [];
        } else if (f.field_key === 'beat_no') {
          field_type = 'SELECT';
          options = beatOptions;
        } else if (f.field_key === 'ipc_sections') {
          field_type = 'SELECT';
          options = ipcSectionOptions;
        } else if (f.field_key === 'excise_sections') {
          field_type = 'SELECT';
          options = exciseSectionOptions;
        } else if (f.field_key === 'arms_sections') {
          field_type = 'SELECT';
          options = armsSectionOptions;
        } else if (f.field_key === 'gambling_sections') {
          field_type = 'SELECT';
          options = gamblingSectionOptions;
        } else if (f.field_key === 'sections') {
          field_type = 'SELECT';
          options = generalSectionOptions;
        } else if (f.field_key === 'ipc_major_head') {
          field_type = 'SELECT';
          options = ipcMajorHeadOptions;
        } else if (f.field_key === 'excise_major_head') {
          field_type = 'SELECT';
          options = exciseMajorHeadOptions;
        } else if (f.field_key === 'arms_major_head') {
          field_type = 'SELECT';
          options = armsMajorHeadOptions;
        } else if (f.field_key === 'gambling_major_head') {
          field_type = 'SELECT';
          options = gamblingMajorHeadOptions;
        } else if (Object.prototype.hasOwnProperty.call(minorHeadOptionsByFieldKey, f.field_key)) {
          field_type = 'SELECT';
          options = minorHeadOptionsByFieldKey[f.field_key];
        }

        if (f.field_key === 'status') {
          if (normalizedType === 'CASE') {
            options = [
              { value: 'CHARGE SHEET', label_en: 'Charge Sheet', label_hi: 'आरोप पत्र' },
              { value: 'POLICE INVESTIGATION REPORT(PIR-JCL)', label_en: 'Police Investigation Report (PIR-JCL)', label_hi: 'पुलिस जांच रिपोर्ट (PIR-JCL)' },
              { value: 'UNTRACED', label_en: 'Untraced', label_hi: 'लापता/सुराग नहीं' },
              { value: 'PENDING', label_en: 'Pending', label_hi: 'लंबित' },
              { value: 'CANCELLATION', label_en: 'Cancellation', label_hi: 'रद्दीकरण' },
              { value: 'QUASHED', label_en: 'Quashed', label_hi: 'रद्द किया गया' },
              { value: 'CLOSURE REPORT', label_en: 'Closure Report', label_hi: 'क्लोजर रिपोर्ट' },
              { value: 'RELEASED U/S 189 BNSS', label_en: 'Released U/S 189 BNSS', label_hi: 'धारा 189 बीएनएसएस के तहत रिहा' },
              { value: 'TRANSFER', label_en: 'Transfer', label_hi: 'स्थानांतरण' }
            ];
          } else if (normalizedType === 'ARREST') {
            const isAgainstFir = caseType === 'against_fir';
            options = isAgainstFir ? [
              { value: 'JC', label_en: 'Judicial Custody', label_hi: 'न्यायिक हिरासत' },
              { value: 'PC', label_en: 'Police Custody', label_hi: 'पुलिस हिरासत' },
              { value: 'Bail', label_en: 'Bail', label_hi: 'जमानत' },
              { value: 'Bound Down', label_en: 'Bound Down', label_hi: 'Bound Down' },
              { value: 'Release', label_en: 'Release', label_hi: 'रिहा' },
              { value: 'Lockup', label_en: 'Lockup', label_hi: 'जेल' },
              { value: '35(3) BNS Notice', label_en: '35(3) BNS Notice', label_hi: '35(3) BNS Notice' }
            ] : [
              { value: 'JC', label_en: 'Judicial Custody', label_hi: 'न्यायिक हिरासत' },
              { value: 'Bound Down', label_en: 'Bound Down', label_hi: 'Bound Down' },
              { value: 'Lockup', label_en: 'Lockup', label_hi: 'जेल' },
              { value: 'Fine', label_en: 'Fine', label_hi: 'Fine' }
            ];
          } else if (normalizedType === 'PCR_CALL') {
            options = [
              { value: 'Action Taken', label_en: 'Action Taken', label_hi: 'कार्रवाई की गई' },
              { value: 'Pending', label_en: 'Pending', label_hi: 'लंबित' },
              { value: 'Referred', label_en: 'Referred', label_hi: 'स संदर्भित' },
              { value: 'Closed', label_en: 'Closed', label_hi: 'बंद' }
            ];
          } else if (normalizedType === 'MISSING') {
            options = [
              { value: 'Un-traced', label_en: 'Un-traced', label_hi: 'लापता/सुराग नहीं' },
              { value: 'Traced', label_en: 'Traced', label_hi: 'पता लगाया गया' },
              { value: 'Referred', label_en: 'Referred', label_hi: 'स संदर्भित' },
              { value: 'Closed', label_en: 'Closed', label_hi: 'बंद' }
            ];
          } else if (normalizedType === 'UIDB') {
            options = [
              { value: 'Referred to district hospital', label_en: 'Referred to district hospital', label_hi: 'जिला अस्पताल को संदर्भित' },
              { value: 'Identified', label_en: 'Identified', label_hi: 'पहचाना गया' },
              { value: 'body claimed', label_en: 'Body Claimed', label_hi: 'शव पर दावा किया गया' },
              { value: 'Unidentified', label_en: 'Unidentified', label_hi: 'अज्ञात' },
              { value: 'held in mortuary', label_en: 'Held in Mortuary', label_hi: 'मुर्दाघर में रखा गया' }
            ];
          }
        }

        let section = f.section || 'general_info';
        let sort_order = f.sort_order;

        if (normalizedType === 'ARREST') {
          if (f.field_key === 'act_name' || f.field_key === 'sections') {
            section = 'offence_info';
          } else if (f.field_key === 'status') {
            section = 'custody_status';
            sort_order = 429;
          }
        } else if (normalizedType === 'MISSING') {
          if (f.field_key === 'status') {
            section = 'general_info';
            sort_order = 10.6;
          } else if (f.section === 'general_info') {
            section = 'general_info';
            if (f.field_key === 'source') sort_order = 10.1;
            else if (f.field_key === 'gd_no') sort_order = 10.2;
            else if (f.field_key === 'missing_type') sort_order = 10.3;
            else if (f.field_key === 'pcr_call_flag') sort_order = 10.4;
            else if (f.field_key === 'operator_name') sort_order = 10.5;
          } else if (f.section === 'person_details') {
            section = 'person_details';
            sort_order = 20.0 + f.sort_order * 0.1;
          } else if (f.section === 'missing_address') {
            section = 'missing_address';
            sort_order = 30.0 + f.sort_order * 0.1;
          } else if (f.section === 'missing_physical') {
            section = 'missing_physical';
            sort_order = 40.0 + f.sort_order * 0.1;
          } else if (f.section === 'contacts_assigned') {
            section = 'contacts_assigned';
            sort_order = 50.0 + f.sort_order * 0.1;
          } else if (f.section === 'investigation_officer') {
            section = 'investigation_officer';
            sort_order = 60.0 + f.sort_order * 0.1;
          }
        } else if (normalizedType === 'PCR_CALL') {
          if (f.field_key === 'occurrence_landmark') {
            section = 'incident_details';
            sort_order = 8.05;
          }
        } else if (normalizedType === 'UIDB') {
          if (f.field_key === 'uidb_no') {
            section = 'general_info';
            sort_order = 10.1;
          } else if (f.field_key === 'gd_no') {
            section = 'general_info';
            sort_order = 10.2;
          } else if (f.field_key === 'act_name') {
            section = 'general_info';
            sort_order = 10.3;
          } else if (f.field_key === 'sections') {
            section = 'general_info';
            sort_order = 10.4;
          } else if (f.field_key === 'status') {
            section = 'general_info';
            sort_order = 10.5;
          } else if ([
            'height', 'built', 'complexion', 'face', 'hair', 'moustache', 'beard',
            'upper_dress_color', 'lower_dress_color', 'description'
          ].includes(f.field_key)) {
            section = 'corpse_physical';
            sort_order = 25.0 + f.sort_order * 0.1;
          } else if ([
            'zipnet_no', 'identified', 'gender'
          ].includes(f.field_key) || f.section === 'corpse_desc') {
            section = 'corpse_desc';
            sort_order = 20.0 + f.sort_order * 0.1;
          } else if (['cause_of_death', 'deceased_relative_name', 'deceased_relation_type', 'filed_by_acp_sdm', 'filed_by_acp_sdm_date', 'informant_name', 'informant_relation', 'informant_mobile'].includes(f.field_key)) {
            section = 'inquest_details';
            if (f.field_key === 'cause_of_death') sort_order = 40.1;
            else if (f.field_key === 'deceased_relative_name') sort_order = 40.2;
            else if (f.field_key === 'deceased_relation_type') sort_order = 40.3;
            else if (f.field_key === 'filed_by_acp_sdm') sort_order = 40.4;
            else if (f.field_key === 'filed_by_acp_sdm_date') sort_order = 40.5;
            else if (f.field_key === 'informant_name') sort_order = 40.6;
            else if (f.field_key === 'informant_relation') sort_order = 40.7;
            else if (f.field_key === 'informant_mobile') sort_order = 40.8;
          } else if (['io_name', 'io_rank', 'io_pis', 'io_mobile'].includes(f.field_key)) {
            section = 'investigation_officer';
            if (f.field_key === 'io_name') sort_order = 50.1;
            else if (f.field_key === 'io_rank') sort_order = 50.2;
            else if (f.field_key === 'io_pis') sort_order = 50.3;
            else if (f.field_key === 'io_mobile') sort_order = 50.4;
          }
        }



        return {
          id: f.id,
          field_key: f.field_key,
          field_type: field_type,
          applicable_record_types: parseJsonField(f.applicable_record_types),
          label_en: f.label_en,
          label_hi: f.label_hi || f.label_en,
          placeholder_en: f.placeholder_en || null,
          placeholder_hi: f.placeholder_hi || null,
          options,
          validation_rules: parseJsonField(f.validation_rules),
          visible_to_levels: parseJsonField(f.visible_to_levels),
          editable_by_levels: parseJsonField(f.editable_by_levels),
          introduced_at_level: f.introduced_at_level,
          readonly: f.readonly || false,
          full_width: f.full_width || false,
          show_when: parseJsonField(f.show_when) || null,
          depends_on: f.depends_on || null,
          options_source: f.options_source || null,
          section,
          repeater_entity: f.repeater_entity || null,
          section_label_en: f.section_label_en || null,
          section_label_hi: f.section_label_hi || null,
          sort_order,
          scope_level: f.scope_level || 'global',
          created_by: f.created_by || null,
        };
      });

    // Re-sort to respect overridden sort_orders
    filteredFields.sort((a, b) => a.sort_order - b.sort_order);

    let sections = [];

    if (normalizedType === 'CASE') {
      sections = [
        {
          section: 'acts_and_sections',
          title_en: 'Acts & Sections',
          title_hi: 'अधिनियम और धाराएं',
          is_repeater: false,
          fields: filteredFields.filter(f =>
            ['general_info', 'incident_details', 'offence_info'].includes(f.section) &&
            !['occurrence_place', 'brief_facts'].includes(f.field_key) &&
            !f.repeater_entity
          )
        },
        {
          section: 'occurrence_info',
          title_en: 'Occurrence',
          title_hi: 'घटना',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'occurrence_info' && !f.repeater_entity)
        },
        {
          section: 'complainant_info',
          title_en: 'Complainant',
          title_hi: 'शिकायतकर्ता',
          is_repeater: false,
          sub_tabs: [
            {
              id: 'personal',
              title_en: 'Personal Information',
              title_hi: 'व्यक्तिगत जानकारी',
              fields: filteredFields.filter(f => ['complainant_personal_info', 'complainant_accused_info'].includes(f.section) && !f.repeater_entity)
            },
            {
              id: 'address',
              title_en: 'Address',
              title_hi: 'पता',
              fields: filteredFields.filter(f => f.section === 'complainant_address' && !f.repeater_entity)
            }
          ]
        },
        {
          section: 'fir_contents',
          title_en: 'FIR Contents',
          title_hi: 'प्राथमिकी विवरण',
          is_repeater: false,
          fields: filteredFields.filter(f => f.field_key === 'brief_facts')
        },
        {
          section: 'victim_info',
          title_en: 'Victim Information',
          title_hi: 'पीड़ित का विवरण',
          is_repeater: true,
          entity_type: 'person',
          person_type: 'PERSON_VICTIM',
          sub_tabs: [
            {
              id: 'personal',
              title_en: 'Personal Information',
              title_hi: 'व्यक्तिगत जानकारी',
              fields: filteredFields.filter(f => f.repeater_entity === 'PERSON_VICTIM' && f.section === 'victim_personal_info')
            },
            {
              id: 'address',
              title_en: 'Address',
              title_hi: 'पता',
              fields: filteredFields.filter(f => f.repeater_entity === 'PERSON_VICTIM' && f.section === 'victim_address')
            }
          ]
        },
        {
          section: 'accused_info',
          title_en: 'Accused',
          title_hi: 'आरोपी',
          is_repeater: true,
          entity_type: 'person',
          person_type: 'PERSON_ACCUSED',
          sub_tabs: [
            {
              id: 'personal',
              title_en: 'Personal Information',
              title_hi: 'व्यक्तिगत जानकारी',
              fields: filteredFields.filter(f => f.repeater_entity === 'PERSON_ACCUSED' && f.section === 'accused_personal_info')
            },
            {
              id: 'address',
              title_en: 'Address',
              title_hi: 'पता',
              fields: filteredFields.filter(f => f.repeater_entity === 'PERSON_ACCUSED' && f.section === 'accused_address')
            }
          ]
        },
        {
          section: 'property_details',
          title_en: 'Property of Interest',
          title_hi: 'संबद्ध संपत्ति',
          is_repeater: true,
          entity_type: 'property',
          fields: filteredFields.filter(f => f.repeater_entity === 'PROPERTY' || f.section === 'property_details')
        },
        {
          section: 'action_taken',
          title_en: 'Action Taken',
          title_hi: 'की गई कार्रवाई',
          is_repeater: false,
          fields: filteredFields.filter(f => ['investigation_officer', 'investigation_details', 'action_taken'].includes(f.section) && !f.repeater_entity)
        }
      ];
    } else if (normalizedType === 'ARREST') {
      const isAgainstFir = caseType === 'against_fir';
      if (isAgainstFir) {
        sections.push({
          section: 'select_fir',
          title_en: 'Select FIR',
          title_hi: 'प्राथमिकी (FIR) चुनें',
          is_repeater: false,
          is_virtual: true,
          fields: [
            {
              field_key: 'selected_fir',
              field_type: 'SELECT',
              label_en: 'Select FIR Number',
              label_hi: 'प्राथमिकी (FIR) संख्या चुनें',
              validation_rules: { required: true },
              options: []
            }
          ]
        });
      }
      sections.push(
        {
          section: 'general_info',
          title_en: 'General Information',
          title_hi: 'सामान्य जानकारी',
          is_repeater: false,
          fields: filteredFields.filter(f => ['general_info', 'offence_info', 'incident_details'].includes(f.section) && !f.repeater_entity)
        },
        {
          section: 'arrested_info',
          title_en: 'Arrested',
          title_hi: 'गिरफ्तार व्यक्ति',
          is_repeater: true,
          entity_type: 'person',
          person_type: 'ARRESTED',
          sub_tabs: [
            {
              id: 'arrest_details',
              title_en: 'Arrest Details',
              title_hi: 'गिरफ्तारी का विवरण',
              fields: filteredFields.filter(f => f.repeater_entity === 'PERSON_ARRESTED' && f.section === 'arrest_details')
            },
            {
              id: 'person_particulars',
              title_en: 'Person Particulars',
              title_hi: 'विशेषताएं',
              fields: filteredFields.filter(f => f.repeater_entity === 'PERSON_ARRESTED' && f.section === 'arrested_personal_info')
            },
            {
              id: 'particular_details',
              title_en: 'Particular Details',
              title_hi: 'विशेष विवरण',
              fields: filteredFields.filter(f => f.repeater_entity === 'PERSON_ARRESTED' && f.section === 'arrestee_info')
            },
            {
              id: 'custody_status',
              title_en: 'Custody Status',
              title_hi: 'हिरासत की स्थिति',
              fields: filteredFields.filter(f => f.section === 'custody_status' && !f.repeater_entity)
            },
            {
              id: 'address',
              title_en: 'Address',
              title_hi: 'पता',
              fields: filteredFields.filter(f => f.repeater_entity === 'PERSON_ARRESTED' && f.section === 'arrested_address')
            }
          ]
        },
        {
          section: 'custody_status',
          title_en: 'Custody Status',
          title_hi: 'हिरासत की स्थिति',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'custody_status' && !f.repeater_entity)
        },
        {
          section: 'property_details',
          title_en: 'Property of Interest',
          title_hi: 'संबद्ध संपत्ति',
          is_repeater: true,
          entity_type: 'property',
          fields: filteredFields.filter(f => f.repeater_entity === 'PROPERTY' || f.section === 'property_details')
        },
        // {
        //   section: 'intimation_details',
        //   title_en: 'Intimation Details',
        //   title_hi: 'सूचना का विवरण',
        //   is_repeater: true,
        //   entity_type: 'person',
        //   person_type: 'INTIMATED',
        //   sub_tabs: [
        //     {
        //       id: 'personal',
        //       title_en: 'Personal Information',
        //       title_hi: 'व्यक्तिगत जानकारी',
        //       fields: filteredFields.filter(f => f.section === 'intimation_details')
        //     },
        //     {
        //       id: 'address',
        //       title_en: 'Address',
        //       title_hi: 'पता',
        //       fields: filteredFields.filter(f => f.section === 'intimation_address')
        //     }
        //   ]
        // },
        {
          section: 'procedure_slips',
          title_en: 'Procedural Slips',
          title_hi: 'प्रक्रियात्मक पर्ची',
          is_repeater: false,
          fields: filteredFields.filter(f => ['procedure_slips', 'procedural_slips'].includes(f.section) && !f.repeater_entity)
        },
        {
          section: 'investigation_officer',
          title_en: 'Investigating Officer',
          title_hi: 'जांच अधिकारी',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'investigation_officer' && !f.repeater_entity)
        }
      );
    } else if (normalizedType === 'MISSING') {
      sections = [
        {
          section: 'general_info',
          title_en: 'General Information',
          title_hi: 'सामान्य जानकारी',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'general_info' && !f.repeater_entity)
        },
        {
          section: 'person_details',
          title_en: 'Person Details',
          title_hi: 'व्यक्ति विवरण',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'person_details' && !f.repeater_entity)
        },
        {
          section: 'missing_address',
          title_en: 'Address Details',
          title_hi: 'पता विवरण',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'missing_address' && !f.repeater_entity)
        },
        {
          section: 'missing_physical',
          title_en: 'Physical Description',
          title_hi: 'शारीरिक हुलिया',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'missing_physical' && !f.repeater_entity)
        },
        {
          section: 'contacts_assigned',
          title_en: 'Informant Contact',
          title_hi: 'सूचना प्रदाता संपर्क',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'contacts_assigned' && !f.repeater_entity)
        },
        {
          section: 'investigation_officer',
          title_en: 'Investigating Officer',
          title_hi: 'जांच अधिकारी',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'investigation_officer' && !f.repeater_entity)
        }
      ];
    } else if (normalizedType === 'UIDB') {
      sections = [
        {
          section: 'general_info',
          title_en: 'General Information',
          title_hi: 'सामान्य जानकारी',
          is_repeater: false,
          fields: filteredFields.filter(f => ['general_info', 'incident_details'].includes(f.section) && !f.repeater_entity)
        },
        {
          section: 'corpse_desc',
          title_en: 'UIDB Details',
          title_hi: 'यूआईडीबी विवरण',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'corpse_desc' && !f.repeater_entity)
        },
        {
          section: 'corpse_physical',
          title_en: 'Physical Description',
          title_hi: 'शारीरिक हुलिया',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'corpse_physical' && !f.repeater_entity)
        },
        {
          section: 'inquest_details',
          title_en: 'Inquest Details',
          title_hi: 'पूछताछ विवरण',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'inquest_details' && !f.repeater_entity)
        },
        {
          section: 'investigation_officer',
          title_en: 'Investigating Officer',
          title_hi: 'जांच अधिकारी',
          is_repeater: false,
          fields: filteredFields.filter(f => f.section === 'investigation_officer' && !f.repeater_entity)
        }
      ];
    } else {
      // Group fields: repeater fields by repeater_entity, flat fields by section.
      // Order is preserved by first-occurrence (fields are already sorted by sort_order).
      const allSectionKeys = [];
      const sectionsMap = new Map();
      const repeaterMap = new Map();

      for (const f of filteredFields) {
        if (f.repeater_entity) {
          const key = f.repeater_entity;
          if (!repeaterMap.has(key)) {
            repeaterMap.set(key, { fields: [] });
            allSectionKeys.push({ key, type: 'repeater' });
          }
          repeaterMap.get(key).fields.push(f);
        } else {
          const secKey = f.section;
          if (!sectionsMap.has(secKey)) {
            sectionsMap.set(secKey, { fields: [], dbLabelEn: f.section_label_en, dbLabelHi: f.section_label_hi });
            allSectionKeys.push({ key: secKey, type: 'flat' });
          }
          sectionsMap.get(secKey).fields.push(f);
        }
      }

      sections = allSectionKeys.map(({ key, type }) => {
        if (type === 'flat') {
          const { fields, dbLabelEn, dbLabelHi } = sectionsMap.get(key);
          const hardcoded = SECTION_TITLES[key];
          return {
            section: key,
            title_en: dbLabelEn || hardcoded?.en || toTitleCase(key),
            title_hi: dbLabelHi || hardcoded?.hi || toTitleCase(key),
            is_repeater: false,
            fields,
          };
        } else {
          const { fields } = repeaterMap.get(key);
          const titleInfo = REPEATER_SECTION_TITLES[key] || { en: key, hi: key };
          const isPerson = key.startsWith('PERSON_');
          return {
            section: key.toLowerCase().replace(/_/g, '-'),
            title_en: titleInfo.en,
            title_hi: titleInfo.hi,
            is_repeater: true,
            entity_type: isPerson ? 'person' : 'property',
            person_type: isPerson ? key.replace('PERSON_', '') : null,
            fields,
          };
        }
      });
    }

    // Gather all assigned field IDs to find any unassigned flat fields
    const assignedIds = new Set();
    for (const sec of sections) {
      if (sec.sub_tabs) {
        for (const st of sec.sub_tabs) {
          if (st.fields) {
            for (const f of st.fields) assignedIds.add(f.id);
          }
        }
      }
      if (sec.fields) {
        for (const f of sec.fields) assignedIds.add(f.id);
      }
    }

    const unassignedFields = filteredFields.filter(f => !assignedIds.has(f.id) && !f.repeater_entity && f.created_by !== null);
    if (unassignedFields.length > 0) {
      const extraSectionsMap = new Map();
      for (const f of unassignedFields) {
        const secKey = f.section || 'district_custom';
        if (!extraSectionsMap.has(secKey)) {
          extraSectionsMap.set(secKey, {
            section: secKey,
            title_en: f.section_label_en || SECTION_TITLES[secKey]?.en || toTitleCase(secKey),
            title_hi: f.section_label_hi || SECTION_TITLES[secKey]?.hi || toTitleCase(secKey),
            is_repeater: false,
            fields: []
          });
        }
        extraSectionsMap.get(secKey).fields.push(f);
      }
      sections.push(...extraSectionsMap.values());
    }

    return res.status(200).json({ success: true, data: sections });
  } catch (error) {
    logger.error('getFieldsForForm failed', { record_type, error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /fields  (admin: list all; DCP: list own district) ────────────────────
export const listAllFields = async (req, res) => {
  const { role } = req.user;
  const district_id = req.user.district_id || null;
  const { record_type, is_active, scope } = req.query;

  try {
    let query = db('field_registry').select('*');

    if (role === 'DISTRICT_OFFICER') {
      if (scope === 'global') {
        // Read-only access to global fields for section discovery.
        // Write endpoints enforce ownership separately.
        query = query.where('scope_level', 'global');
      } else {
        // Default: only their own district-scoped fields
        query = query.where({ scope_level: 'district', scope_id: district_id });
      }
    } else if (scope === 'global') {
      query = query.where('scope_level', 'global');
    } else if (scope === 'district') {
      query = query.where('scope_level', 'district');
    }
    // default (no scope filter for HQ_ADMIN/SYSTEM_ADMIN): all fields

    if (record_type) {
      const norm = normalizeRecordType(record_type);
      // Works for both native PG array and JSON-string storage
      query = query.whereRaw(`applicable_record_types::text ILIKE ?`, [`%${norm}%`]);
    }

    if (is_active !== undefined) {
      query = query.where('is_active', is_active === 'true' || is_active === true);
    }

    const fields = await query
      .orderBy('scope_level', 'asc')
      .orderBy('section', 'asc')
      .orderBy('sort_order', 'asc');

    const formatted = fields.map((f) => ({
      ...f,
      applicable_record_types: parseJsonField(f.applicable_record_types),
      options: parseJsonField(f.options),
      validation_rules: parseJsonField(f.validation_rules),
    }));

    return res.status(200).json({ success: true, data: { fields: formatted, total: formatted.length } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /fields ──────────────────────────────────────────────────────────────
export const createRegistryField = async (req, res) => {
  const { role } = req.user;
  const district_id = req.user.district_id || null;
  const userId      = req.user.id || req.user.userId || null;
  const {
    field_key, label_en, label_hi, field_type,
    section, section_label_en, section_label_hi,
    applicable_record_types, options, validation_rules,
    is_required, sort_order,
  } = req.body;

  if (!field_key || !label_en || !field_type) {
    return res.status(400).json({ success: false, message: 'field_key, label_en, and field_type are required' });
  }
  if (!applicable_record_types?.length) {
    return res.status(400).json({ success: false, message: 'At least one applicable_record_type is required' });
  }
  if (!VALID_FIELD_TYPES.includes(field_type.toUpperCase())) {
    return res.status(400).json({ success: false, message: `field_type must be one of: ${VALID_FIELD_TYPES.join(', ')}` });
  }

  const normalizedKey = field_key.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!normalizedKey) {
    return res.status(400).json({ success: false, message: 'field_key must contain alphanumeric characters' });
  }

  const scope_level = role === 'DISTRICT_OFFICER' ? 'district' : 'global';
  const scope_id    = role === 'DISTRICT_OFFICER' ? district_id : null;

  if (role === 'DISTRICT_OFFICER' && !district_id) {
    return res.status(400).json({
      success: false,
      message: 'District scope could not be resolved. Please log out and log back in.',
    });
  }

  try {
    const existing = await db('field_registry').where('field_key', normalizedKey).first();
    if (existing) {
      return res.status(409).json({ success: false, message: `Field key "${normalizedKey}" already exists` });
    }

    const validationRulesObj = { ...(parseJsonField(validation_rules) || {}) };
    if (is_required) validationRulesObj.required = true;

    const targetSection = section || 'general_info';
    let repeater_entity = null;
    const siblingField = await db('field_registry')
      .where({ section: targetSection })
      .whereNotNull('repeater_entity')
      .first();
    if (siblingField) {
      repeater_entity = siblingField.repeater_entity;
    }

    const payload = {
      id: uuidv4(),
      field_key: normalizedKey,
      label_en,
      label_hi: label_hi || label_en,
      field_type: field_type.toUpperCase(),
      section: targetSection,
      section_label_en: section_label_en || null,
      section_label_hi: section_label_hi || null,
      applicable_record_types: applicable_record_types.map(normalizeRecordType),
      options: options?.length ? JSON.stringify(options) : null,
      validation_rules: Object.keys(validationRulesObj).length ? JSON.stringify(validationRulesObj) : null,
      visible_to_levels: ['PS', 'DISTRICT', 'HQ'],
      editable_by_levels: ['PS'],
      sort_order: sort_order ?? 0,
      is_active: true,
      scope_level,
      scope_id,
      created_by: userId,
      repeater_entity,
    };

    const [newField] = await db('field_registry').insert(payload).returning('*');

    try {
      await publish('field.created', {
        field_id: newField.id,
        field_key: normalizedKey,
        scope_level,
        scope_id,
        created_by: userId,
        ts: Date.now(),
      });
    } catch (_) { /* event bus optional — do not block response */ }

    return res.status(201).json({ success: true, message: 'Field created', data: newField });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PATCH /fields/:id ─────────────────────────────────────────────────────────
export const updateRegistryField = async (req, res) => {
  const { id } = req.params;
  const { role } = req.user;
  const district_id = req.user.district_id || null;
  const {
    label_en, label_hi, field_type,
    section, section_label_en, section_label_hi,
    applicable_record_types, options, validation_rules,
    is_required, sort_order,
  } = req.body;

  try {
    const existing = await db('field_registry').where({ id }).first();
    if (!existing) return res.status(404).json({ success: false, message: 'Field not found' });

    if (role === 'DISTRICT_OFFICER') {
      if (existing.scope_level !== 'district' || existing.scope_id !== district_id) {
        return res.status(403).json({ success: false, message: 'Cannot modify fields outside your district' });
      }
    }
    // HQ_ADMIN/SYSTEM_ADMIN can modify any field (allowed by router)

    const updates = {};
    if (label_en)                      updates.label_en = label_en;
    if (label_hi !== undefined)        updates.label_hi = label_hi;
    if (field_type)                    updates.field_type = field_type.toUpperCase();
    if (section) {
      updates.section = section;
      let repeater_entity = null;
      const siblingField = await db('field_registry')
        .where({ section })
        .whereNotNull('repeater_entity')
        .first();
      if (siblingField) {
        repeater_entity = siblingField.repeater_entity;
      }
      updates.repeater_entity = repeater_entity;
    }
    if (section_label_en !== undefined) updates.section_label_en = section_label_en;
    if (section_label_hi !== undefined) updates.section_label_hi = section_label_hi;
    if (applicable_record_types?.length) {
      updates.applicable_record_types = applicable_record_types.map(normalizeRecordType);
    }
    if (options !== undefined)         updates.options = options?.length ? JSON.stringify(options) : null;
    if (sort_order !== undefined)      updates.sort_order = sort_order;

    if (is_required !== undefined || validation_rules !== undefined) {
      const base = parseJsonField(existing.validation_rules) || {};
      if (validation_rules !== undefined) Object.assign(base, parseJsonField(validation_rules));
      if (is_required !== undefined)     base.required = !!is_required;
      updates.validation_rules = JSON.stringify(base);
    }

    const [updated] = await db('field_registry').where({ id }).update(updates).returning('*');

    try { await publish('field.updated', { field_id: id, ts: Date.now() }); } catch (_) {}

    return res.status(200).json({ success: true, message: 'Field updated', data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PATCH /fields/:id/toggle ──────────────────────────────────────────────────
export const toggleRegistryField = async (req, res) => {
  const { id } = req.params;
  const { role } = req.user;
  const district_id = req.user.district_id || null;

  try {
    const existing = await db('field_registry').where({ id }).first();
    if (!existing) return res.status(404).json({ success: false, message: 'Field not found' });

    if (role === 'DISTRICT_OFFICER') {
      if (existing.scope_level !== 'district' || existing.scope_id !== district_id) {
        return res.status(403).json({ success: false, message: 'Cannot modify fields outside your district' });
      }
    }

    const [updated] = await db('field_registry')
      .where({ id })
      .update({ is_active: !existing.is_active })
      .returning(['id', 'is_active']);

    return res.status(200).json({
      success: true,
      message: `Field ${updated.is_active ? 'activated' : 'deactivated'}`,
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- Excel Lookup Controllers ---
// Thin wrappers over fieldsService — no direct db access, no hardcoded table/column dispatch.

export const listActs = async (req, res) => {
  try {
    const rows = await fieldsService.getActs();
    const data = rows.map(r => ({ value: r.act_cd, label: r.act_long }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('listActs failed', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listSectionsForAct = async (req, res) => {
  const { act_cd } = req.params;
  try {
    const rows = await fieldsService.getSectionsForActs([act_cd]);
    const data = rows.map(r => ({ value: r.section_code, label: r.section, desc: r.section_desc, pnsh_gt_7yrs: r.pnsh_gt_7yrs }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('listSectionsForAct failed', { act_cd, error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listMajorHeads = async (req, res) => {
  try {
    const actNameRaw = req.query.act_name;
    const sectionCodesRaw = req.query.section_codes;
    let data = [];

    // section_codes (e.g. "43-302,43-376") comes from the specific (act, section) pairs the
    // user has actually registered in the Acts & Sections table — section_code already encodes
    // its parent act, so filtering by it alone is a precise per-pair match, unlike act_name
    // alone which pulls in every major head for the whole act regardless of which section.
    if (sectionCodesRaw) {
      const sectionCodes = sectionCodesRaw.split(',').map(s => s.trim()).filter(Boolean);
      if (sectionCodes.length > 0) {
        const mappings = await db('excel_major_minor_mapping')
          .whereIn('section_code', sectionCodes)
          .distinct('major_head_code');
        const majorCds = mappings.map(m => m.major_head_code);

        if (majorCds.length > 0) {
          data = await db('excel_major_heads')
            .whereIn('major_head_code', majorCds)
            .select('major_head as value', 'major_head as label')
            .orderBy('major_head', 'asc');
        }
      }

      const seen = new Set();
      const uniqueData = data.filter(item => {
        if (!item.value) return false;
        const val = item.value.trim();
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
      });
      return res.status(200).json({ success: true, data: uniqueData });
    }

    if (actNameRaw) {
      // Smart comma-split: rejoin year tokens (e.g. "DELHI EXCISE ACT, 2009" split by comma)
      const rawActNames = actNameRaw.split(',').map(a => a.trim()).filter(Boolean);
      const actNames = [];
      for (const item of rawActNames) {
        if (/^\d{4}$/.test(item) && actNames.length > 0) {
          actNames[actNames.length - 1] = `${actNames[actNames.length - 1]}, ${item}`;
        } else {
          actNames.push(item);
        }
      }

      const actCds = new Set();

      for (const name of actNames) {
        // 1. Try ACT_GROUP_CODES lookup first (fastest, verified codes)
        if (ACT_GROUP_CODES[name]) {
          for (const cd of ACT_GROUP_CODES[name]) actCds.add(cd);
          continue;
        }

        // 2. Try exact match against excel_acts.act_long
        const exactMatches = await db('excel_acts')
          .whereRaw('LOWER(act_long) = LOWER(?)', [name])
          .select('act_cd');
        if (exactMatches.length > 0) {
          exactMatches.forEach(a => actCds.add(a.act_cd));
          continue;
        }

        // 3. Try partial ILIKE match — search for meaningful keywords from the act name
        // Strip common generic words, parenthetical aliases like "(IPC)", punctuation
        const keywords = name
          .replace(/\(.*?\)/g, '')           // remove (IPC), (BNS) etc.
          .replace(/[^a-zA-Z0-9\s]/g, ' ')   // remove punctuation
          .split(/\s+/)
          .map(w => w.trim())
          .filter(w => w.length >= 3 && !['ACT', 'THE', 'AND', 'FOR', 'OF', 'IN', 'TO', 'OR'].includes(w.toUpperCase()));

        if (keywords.length > 0) {
          // Build an AND query: act_long must contain ALL significant keywords
          let query = db('excel_acts');
          for (const kw of keywords) {
            query = query.whereRaw('LOWER(act_long) LIKE ?', [`%${kw.toLowerCase()}%`]);
          }
          const kwMatches = await query.select('act_cd');
          if (kwMatches.length > 0) {
            kwMatches.forEach(a => actCds.add(a.act_cd));
            continue;
          }

          // 4. Fallback: OR query — any keyword matches
          let orQuery = db('excel_acts').where(function() {
            for (const kw of keywords) {
              this.orWhereRaw('LOWER(act_long) LIKE ?', [`%${kw.toLowerCase()}%`]);
            }
          });
          const orMatches = await orQuery.select('act_cd').limit(50);
          orMatches.forEach(a => actCds.add(a.act_cd));
        }
      }

      const actCdList = Array.from(actCds);
      if (actCdList.length > 0) {
        const mappings = await db('excel_major_minor_mapping')
          .whereIn('act_cd', actCdList)
          .distinct('major_head_code');
        const majorCds = mappings.map(m => m.major_head_code);

        if (majorCds.length > 0) {
          data = await db('excel_major_heads')
            .whereIn('major_head_code', majorCds)
            .select('major_head as value', 'major_head as label')
            .orderBy('major_head', 'asc');
        }
      }
    }

    // Fallback: if no acts requested, return all major heads
    if (!actNameRaw) {
      data = await db('excel_major_heads')
        .select('major_head as value', 'major_head as label')
        .orderBy('major_head', 'asc');
    }

    // Deduplicate by value
    const seen = new Set();
    const uniqueData = data.filter(item => {
      if (!item.value) return false;
      const val = item.value.trim();
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });

    return res.status(200).json({ success: true, data: uniqueData });
  } catch (error) {
    logger.error('listMajorHeads failed', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listMajorHeadsForSection = async (req, res) => {
  const { section_code } = req.params;
  try {
    const rows = await fieldsService.getMajorHeadsForSection(section_code);
    const data = rows.map(r => ({ value: r.major_head, label: r.major_head }));
    
    // Deduplicate major heads
    const seen = new Set();
    const uniqueData = data.filter(item => {
      if (!item.value) return false;
      const val = item.value.trim();
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });

    return res.status(200).json({ success: true, data: uniqueData });
  } catch (error) {
    logger.error('listMajorHeadsForSection failed', { section_code, error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listMinorHeadsForMajorHead = async (req, res) => {
  const { major_head_code } = req.params;
  try {
    let code = parseInt(major_head_code, 10);
    if (isNaN(code)) {
      // Resolve string name to numeric code
      const mh = await db('excel_major_heads')
        .where('major_head', 'ilike', major_head_code)
        .first();
      if (mh) {
        code = mh.major_head_code;
      }
    }

    if (isNaN(code)) {
      return res.status(200).json({ success: true, data: [] });
    }

    const rows = await fieldsService.getMinorHeadsForMajorHeads([code]);
    const data = rows.map(r => ({ value: r.minor_head, label: r.minor_head }));
    
    // Deduplicate minor heads
    const seen = new Set();
    const uniqueData = data.filter(item => {
      if (!item.value) return false;
      const val = item.value.trim();
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });

    return res.status(200).json({ success: true, data: uniqueData });
  } catch (error) {
    logger.error('listMinorHeadsForMajorHead failed', { major_head_code, error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listPropertyCategories = async (req, res) => {
  try {
    const rows = await fieldsService.getPropertyCategories();
    const data = rows
      .map(item => ({ value: item.parent_cd, label: item.code_type, parent_type: item.parent_type, major_property: item.major_property }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('listPropertyCategories failed', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listPropertyItems = async (req, res) => {
  const { parent_cd } = req.params;
  try {
    const raw = await fieldsService.getPropertyItemsForCategory(parent_cd);
    // The GENERIC branch (fieldsService) already returns {value,label} rows. The ARMS branch
    // returns raw column names for its three sub-lists, and the default (excel_other_property_items)
    // branch returns raw {property_cd,property} rows — both are shaped into {value,label} here.
    let data;
    if (raw?.type === 'ARMS') {
      data = {
        type: 'ARMS',
        made: raw.made.map(r => ({ value: r.arms_made_cd, label: r.arms_made })),
        categories: raw.categories.map(r => ({ value: r.arms_category_cd, label: r.arms_category })),
        fireArms: raw.fireArms.map(r => ({ value: r.fire_arms_cd, label: r.fire_arms, parent_id: r.arms_category_cd })),
        fireArmsSubtypes: raw.fireArmsSubtypes.map(r => ({ value: r.arms_subtype_cd, label: r.arms_subtype, parent_id: r.arms_type_cd })),
      };
    } else if (raw?.type === 'OTHER_PROPERTY') {
      data = {
        type: 'OTHER_PROPERTY',
        categories: raw.categories.map(r => ({ value: r.parent_cd, label: r.code_type })),
        items: raw.items.map(r => ({ value: r.property_cd, label: r.property, parent_id: r.parent_cd })),
      };
    } else if (Array.isArray(raw) && raw.length > 0 && 'property_cd' in raw[0]) {
      data = raw.map(r => ({ value: r.property_cd, label: r.property }));
    } else {
      data = raw;
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('listPropertyItems failed', { parent_cd, error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listBeats = async (req, res) => {
  const ps_cd = req.query.ps_cd || null;
  try {
    const rows = await fieldsService.getBeats(ps_cd);
    const data = rows.map(r => ({ value: r.beat_cd, label: r.beat_name, ps_cd: r.ps_cd }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('listBeats failed', { ps_cd, error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listLocalHeads = async (req, res) => {
  try {
    const rows = await fieldsService.getLocalHeads();
    const data = rows.map(r => ({ value: r.local_head_cd, label: r.local_head }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('listLocalHeads failed', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};


