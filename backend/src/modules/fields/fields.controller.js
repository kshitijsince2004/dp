import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { publish } from '../../events/eventBus.js';

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
  intimation_details:        { en: 'Intimation Details',                     hi: 'सूचना विवरण' },
  intimation_address:        { en: 'Intimation Address',                     hi: 'सूचना का पता' },
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

    // 1. Fetch Acts
    const dbActs = await db('excel_acts').select('act_long').distinct().orderBy('act_long', 'asc');
    const actOptions = dbActs.map(a => ({ value: a.act_long, label_en: a.act_long, label_hi: a.act_long }));

    // 2. Fetch Sections per Act
    const fetchSections = async (actCd) => {
      const rows = await db('excel_sections').where({ act_sec_cd: String(actCd) }).select('section').distinct().orderBy('section', 'asc');
      return rows.map(r => ({ value: r.section, label_en: r.section, label_hi: r.section }));
    };
    const ipcSectionOptions = await fetchSections(43); // IPC
    const armsSectionOptions = await fetchSections(4);  // Arms Act
    const exciseSectionOptions = await db('excel_sections').whereIn('act_sec_cd', ['3032', '3270']).select('section').distinct().orderBy('section', 'asc').then(rows => rows.map(r => ({ value: r.section, label_en: r.section, label_hi: r.section })));
    const gamblingSectionOptions = await db('excel_sections').whereIn('act_sec_cd', ['2612', '68']).select('section').distinct().orderBy('section', 'asc').then(rows => rows.map(r => ({ value: r.section, label_en: r.section, label_hi: r.section })));

    // For general sections field (e.g. in UIDB or CASE), load IPC + CrPC + BNSS sections
    const generalSectionOptions = await db('excel_sections')
      .whereIn('act_sec_cd', ['43', '4', '3032', '3270', '2612', '68', '44', '3256'])
      .select('section')
      .distinct()
      .limit(500)
      .orderBy('section', 'asc')
      .then(rows => rows.map(r => ({ value: r.section, label_en: r.section, label_hi: r.section })));

    // 3. Fetch Major Heads per Act
    const fetchMajorHeadsForAct = async (actCd) => {
      const rows = await db('excel_major_heads as mh')
        .join('excel_major_minor_mapping as m', 'mh.major_head_code', 'm.major_head_code')
        .where('m.act_cd', actCd)
        .select('mh.major_head')
        .distinct()
        .orderBy('mh.major_head', 'asc');
      return rows.map(r => ({ value: r.major_head, label_en: r.major_head, label_hi: r.major_head }));
    };
    const ipcMajorHeadOptions = await fetchMajorHeadsForAct(43);
    const armsMajorHeadOptions = await fetchMajorHeadsForAct(4);
    const exciseMajorHeadOptions = await db('excel_major_heads as mh')
      .join('excel_major_minor_mapping as m', 'mh.major_head_code', 'm.major_head_code')
      .whereIn('m.act_cd', [3032, 3270])
      .select('mh.major_head')
      .distinct()
      .orderBy('mh.major_head', 'asc')
      .then(rows => rows.map(r => ({ value: r.major_head, label_en: r.major_head, label_hi: r.major_head })));
    const gamblingMajorHeadOptions = await fetchMajorHeadsForAct(2612);

    // 4. Fetch Minor Heads per Major Head Name
    const fetchMinorHeads = async (majorHeadNames) => {
      const names = Array.isArray(majorHeadNames) ? majorHeadNames : [majorHeadNames];
      const mhs = await db('excel_major_heads').whereIn('major_head', names).select('major_head_code');
      const codes = mhs.map(m => m.major_head_code);
      if (codes.length === 0) return [];
      const rows = await db('excel_minor_heads').whereIn('major_head_code', codes).select('minor_head').distinct().orderBy('minor_head', 'asc');
      return rows.map(r => ({ value: r.minor_head, label_en: r.minor_head, label_hi: r.minor_head }));
    };
    const theftMinorHeadOptions = await fetchMinorHeads(['THEFT', 'Theft']);
    const murderMinorHeadOptions = await fetchMinorHeads(['MURDER (HOMICIDE)', 'Murder']);
    const hurtMinorHeadOptions = await fetchMinorHeads(['HURT', 'Hurt']);
    const cheatingMinorHeadOptions = await fetchMinorHeads(['CHEATING', 'Cheating']);
    const robberyMinorHeadOptions = await fetchMinorHeads(['ROBBERY', 'Robbery']);
    const excisePossessionMinorHeadOptions = await fetchMinorHeads(['POSSESSION', 'Possession']);
    const exciseSaleMinorHeadOptions = await fetchMinorHeads(['SALE', 'Sale']);
    const exciseSmugglingMinorHeadOptions = await fetchMinorHeads(['CUSTOMS (SMUGGLING)', 'Smuggling']);
    const armsPossessionMinorHeadOptions = await fetchMinorHeads(['POSSESSION OF ILLEGAL ARMS', 'Possession of illegal arms']);
    const armsUseMinorHeadOptions = await fetchMinorHeads(['USE OF ILLEGAL ARMS', 'Use of illegal arms']);
    const gamblingHouseMinorHeadOptions = await fetchMinorHeads(['GAMING HOUSE', 'Gaming House']);
    const gamblingPublicMinorHeadOptions = await fetchMinorHeads(['PUBLIC GAMBLING', 'Public Gambling']);

    // 5. Beats
    const dbBeats = await db('excel_beats').select('beat_name').distinct().orderBy('beat_name', 'asc');
    const beatOptions = dbBeats.map(b => ({ value: b.beat_name, label_en: b.beat_name, label_hi: b.beat_name }));

    // 6. Local Heads
    const dbLocalHeads = await db('excel_local_heads').select('local_head').distinct().orderBy('local_head', 'asc');
    const localHeadOptions = dbLocalHeads.map(lh => ({ value: lh.local_head, label_en: lh.local_head, label_hi: lh.local_head }));

    // 7. Property Categories & Items
    const dbPropCats = await db('excel_property_types').select('code_type').distinct().orderBy('code_type', 'asc');
    const dbOtherPropCats = await db('excel_other_property_categories').select('code_type').distinct().orderBy('code_type', 'asc');
    const propertyCategoryOptions = Array.from(new Set([...dbPropCats.map(c => c.code_type), ...dbOtherPropCats.map(c => c.code_type)])).sort().map(name => ({
      value: name,
      label_en: name,
      label_hi: name
    }));

    const dbPropItems = await db('excel_other_property_items').select('property').distinct().orderBy('property', 'asc');
    const propertyItemOptions = dbPropItems.map(item => ({ value: item.property, label_en: item.property, label_hi: item.property }));

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
          options = actOptions;
        } else if (f.field_key === 'local_head' || f.field_key === 'crime_head') {
          field_type = 'SELECT';
          options = localHeadOptions;
        } else if (f.field_key === 'property_major_category') {
          field_type = 'SELECT';
          options = propertyCategoryOptions;
        } else if (f.field_key === 'property_minor_category') {
          field_type = 'SELECT';
          options = propertyItemOptions;
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
        } else if (f.field_key === 'theft_minor_head') {
          field_type = 'SELECT';
          options = theftMinorHeadOptions;
        } else if (f.field_key === 'murder_minor_head') {
          field_type = 'SELECT';
          options = murderMinorHeadOptions;
        } else if (f.field_key === 'hurt_minor_head') {
          field_type = 'SELECT';
          options = hurtMinorHeadOptions;
        } else if (f.field_key === 'cheating_minor_head') {
          field_type = 'SELECT';
          options = cheatingMinorHeadOptions;
        } else if (f.field_key === 'robbery_minor_head') {
          field_type = 'SELECT';
          options = robberyMinorHeadOptions;
        } else if (f.field_key === 'excise_possession_minor_head') {
          field_type = 'SELECT';
          options = excisePossessionMinorHeadOptions;
        } else if (f.field_key === 'excise_sale_minor_head') {
          field_type = 'SELECT';
          options = exciseSaleMinorHeadOptions;
        } else if (f.field_key === 'excise_smuggling_minor_head') {
          field_type = 'SELECT';
          options = exciseSmugglingMinorHeadOptions;
        } else if (f.field_key === 'arms_possession_minor_head') {
          field_type = 'SELECT';
          options = armsPossessionMinorHeadOptions;
        } else if (f.field_key === 'arms_use_minor_head') {
          field_type = 'SELECT';
          options = armsUseMinorHeadOptions;
        } else if (f.field_key === 'gambling_house_minor_head') {
          field_type = 'SELECT';
          options = gamblingHouseMinorHeadOptions;
        } else if (f.field_key === 'gambling_public_minor_head') {
          field_type = 'SELECT';
          options = gamblingPublicMinorHeadOptions;
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
            options = [
              { value: 'police_custody', label_en: 'Police Custody', label_hi: 'पुलिस हिरासत' },
              { value: 'bail', label_en: 'Bail', label_hi: 'जमानत' },
              { value: 'judicial_custody', label_en: 'Judicial Custody', label_hi: 'न्यायिक हिरासत' },
              { value: 'released', label_en: 'Released', label_hi: 'रिहा' },
              { value: 'others', label_en: 'Others', label_hi: 'अन्य' }
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
          if (f.section === 'general_info') {
            section = 'general_info';
            if (f.field_key === 'source') sort_order = 10.1;
            else if (f.field_key === 'gd_no') sort_order = 10.2;
            else if (f.field_key === 'missing_type') sort_order = 10.3;
            else if (f.field_key === 'pcr_call_flag') sort_order = 10.4;
            else if (f.field_key === 'operator_name') sort_order = 10.5;
            else if (f.field_key === 'status') sort_order = 10.6;
          } else if (f.section === 'person_details') {
            section = 'person_details';
            sort_order = 20.0 + f.sort_order * 0.1;
          } else if (f.section === 'location_particulars') {
            section = 'location_particulars';
            sort_order = 30.0 + f.sort_order * 0.1;
          } else if (f.section === 'physical_description') {
            section = 'physical_description';
            sort_order = 40.0 + f.sort_order * 0.1;
          } else if (f.section === 'contacts_assigned') {
            section = 'contacts_assigned';
            sort_order = 50.0 + f.sort_order * 0.1;
          } else if (f.section === 'investigation_officer') {
            section = 'investigation_officer';
            sort_order = 60.0 + f.sort_order * 0.1;
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
            'upper_dress_color', 'lower_dress_color', 'zipnet_no', 'identified', 'gender'
          ].includes(f.field_key) || f.section === 'corpse_desc') {
            section = 'corpse_desc';
            sort_order = 20 + f.sort_order;
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
          section,
          repeater_entity: f.repeater_entity || null,
          section_label_en: f.section_label_en || null,
          section_label_hi: f.section_label_hi || null,
          sort_order,
          scope_level: f.scope_level || 'global',
        };
      });

    // Re-sort to respect overridden sort_orders
    filteredFields.sort((a, b) => a.sort_order - b.sort_order);

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

    const sections = allSectionKeys.map(({ key, type }) => {
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

    return res.status(200).json({ success: true, data: sections });
  } catch (error) {
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

    const payload = {
      id: uuidv4(),
      field_key: normalizedKey,
      label_en,
      label_hi: label_hi || label_en,
      field_type: field_type.toUpperCase(),
      section: section || 'general_info',
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
    if (section)                       updates.section = section;
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
      .returning('id, is_active');

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

export const listActs = async (req, res) => {
  try {
    const data = await db('excel_acts').select('act_cd as value', 'act_long as label').orderBy('act_long', 'asc');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listSectionsForAct = async (req, res) => {
  const { act_cd } = req.params;
  try {
    const data = await db('excel_sections')
      .where({ act_sec_cd: String(act_cd) })
      .select('section_code as value', 'section as label', 'section_desc as desc', 'pnsh_gt_7yrs')
      .orderBy('section_code', 'asc');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listMajorHeads = async (req, res) => {
  try {
    const data = await db('excel_major_heads').select('major_head_code as value', 'major_head as label').orderBy('major_head', 'asc');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listMinorHeadsForMajorHead = async (req, res) => {
  const { major_head_code } = req.params;
  try {
    const data = await db('excel_minor_heads')
      .where({ major_head_code: parseInt(major_head_code, 10) })
      .select('minor_head_cd as value', 'minor_head as label')
      .orderBy('minor_head', 'asc');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listPropertyCategories = async (req, res) => {
  try {
    const standard = await db('excel_property_types').select('parent_srno', 'parent_cd', 'code_type', 'parent_type', 'major_property');
    const others = await db('excel_other_property_categories').select('parent_srno', 'parent_cd', 'code_type', 'parent_type', 'major_property');
    
    const map = new Map();
    for (const item of [...standard, ...others]) {
      map.set(item.parent_cd, item);
    }
    const data = Array.from(map.values())
      .map(item => ({ value: item.parent_cd, label: item.code_type, parent_type: item.parent_type, major_property: item.major_property }))
      .sort((a, b) => a.label.localeCompare(b.label));
      
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listPropertyItems = async (req, res) => {
  const { parent_cd } = req.params;
  const pCd = parseInt(parent_cd, 10);
  try {
    let data = [];
    if (pCd === 4) { // ARMS AND AMMUNITION
      const made = await db('excel_arms_made').select('arms_made_cd as value', 'arms_made as label');
      const cats = await db('excel_arms_categories').select('arms_category_cd as value', 'arms_category as label');
      const fireArms = await db('excel_fire_arms').select('fire_arms_cd as value', 'fire_arms as label', 'arms_category_cd as parent_id');
      data = { type: 'ARMS', made, categories: cats, fireArms };
    } else if (pCd === 9) { // AUTOMOBILES
      data = await db('excel_automobiles').select('automobile_cd as value', 'automobile as label').orderBy('automobile', 'asc');
    } else if (pCd === 8) { // CURRENCY
      data = await db('excel_currency_types').select('currency_type_cd as value', 'currency_type as label').orderBy('currency_type', 'asc');
    } else if (pCd === 6) { // CULTURAL
      data = await db('excel_cultural_properties').select('cultural_prop_cd as value', 'cultural_prop as label').orderBy('cultural_prop', 'asc');
    } else if (pCd === 7) { // DOCUMENTS
      data = await db('excel_document_types').select('document_type_cd as value', 'document_type as label').orderBy('document_type', 'asc');
    } else if (pCd === 11) { // DRUGS
      data = await db('excel_drug_types').select('drug_type_cd as value', 'drug_type as label').orderBy('drug_type', 'asc');
    } else if (pCd === 12) { // ELECTRICAL
      data = await db('excel_electric_goods').select('electric_goods_cd as value', 'electric_goods as label').orderBy('electric_goods', 'asc');
    } else if (pCd === 13) { // EXPLOSIVES
      data = await db('excel_explosive_types').select('explosive_type_cd as value', 'explosive_type as label').orderBy('explosive_type', 'asc');
    } else if (pCd === 14) { // JEWELLERY
      data = await db('excel_jewelry_types').select('jewelry_type_cd as value', 'jewelry_type as label').orderBy('jewelry_type', 'asc');
    } else {
      data = await db('excel_other_property_items')
        .where({ parent_cd: pCd })
        .select('property_cd as value', 'property as label')
        .orderBy('property', 'asc');
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listBeats = async (req, res) => {
  const ps_cd = req.query.ps_cd || null;
  try {
    let query = db('excel_beats').select('beat_cd as value', 'beat_name as label', 'ps_cd');
    if (ps_cd) {
      query = query.where({ ps_cd: String(ps_cd) });
    }
    const data = await query.orderBy('beat_name', 'asc');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listLocalHeads = async (req, res) => {
  try {
    const data = await db('excel_local_heads').select('local_head_cd as value', 'local_head as label').orderBy('local_head', 'asc');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


