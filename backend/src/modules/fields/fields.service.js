import { db } from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';

// applicable_record_types is stored as JSON text e.g. '["CASE","ARREST"]'
// We use a LIKE on the quoted value so "CASE" won't accidentally match "CASES"
const typeFilter = (query, record_type) =>
  query.whereRaw('applicable_record_types LIKE ?', [`%"${record_type}"%`]);

const SECTION_TITLES = {
  general_info: { en: 'General Information', hi: 'सामान्य जानकारी' },
  identity: { en: 'Identity', hi: 'पहचान' },
  incident_details: { en: 'Incident Details', hi: 'घटना विवरण' },
  complainant_accused_info: { en: 'Complainant & Accused', hi: 'शिकायतकर्ता और आरोपी' },
  investigation_officer: { en: 'Investigation Officer', hi: 'जांच अधिकारी' },
  property_status: { en: 'Property & Status', hi: 'संपत्ति और स्थिति' },
  intranet_flags: { en: 'Intranet Flags', hi: 'इंट्रानेट झंडे' },
  offence_info: { en: 'Offence Information', hi: 'अपराध जानकारी' },
  arrestee_info: { en: 'Arrested Person Details', hi: 'गिरफ्तार व्यक्ति विवरण' },
  custody_status: { en: 'Custody Status', hi: 'हिरासत स्थिति' },
  procedure_slips: { en: 'Procedure & Slips', hi: 'प्रक्रिया और पर्ची' },
  informant_contact: { en: 'Informant & Contact', hi: 'सूचनाकर्ता और संपर्क' },
  complaint_details: { en: 'Complaint Details', hi: 'शिकायत विवरण' },
  response_io: { en: 'Response & IO', hi: 'प्रतिक्रिया और जांच अधिकारी' },
  arrival_geo: { en: 'Arrival & Location', hi: 'पहुंचना और स्थान' },
  person_details: { en: 'Person Details', hi: 'व्यक्ति विवरण' },
  location_particulars: { en: 'Location Particulars', hi: 'स्थान विशेष' },
  physical_bio: { en: 'Physical Description', hi: 'शारीरिक हुलिया' },
  contacts_assigned: { en: 'Contacts & Assigned IO', hi: 'संपर्क और आवंटित जांच अधिकारी' },
  discovery_details: { en: 'Discovery Details', hi: 'खोज विवरण' },
  corpse_desc: { en: 'Body Description', hi: 'शव विवरण' },
  officer_informant: { en: 'Officer & Informant', hi: 'अधिकारी और सूचनाकर्ता' },
  zipnet_status: { en: 'ZIPNET & Status', hi: 'जिपनेट और स्थिति' },
  linked_case: { en: 'Linked Case', hi: 'संबंधित मामला' },
  classification: { en: 'Classification', hi: 'वर्गीकरण' },
  gist: { en: 'Call Gist', hi: 'कॉल का विवरण' },
  category: { en: 'Category', hi: 'श्रेणी' },
  stolen_property: { en: 'Stolen Property', hi: 'चोरी की गई संपत्ति' },
  recovered_property: { en: 'Recovered Property', hi: 'बरामद संपत्ति' },
};

function sectionTitle(sec) {
  const t = SECTION_TITLES[sec];
  if (t) return t;
  // Convert snake_case to Title Case as fallback
  const titleEn = sec.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { en: titleEn, hi: titleEn };
}

export const getFields = async (record_type, is_active) => {
  let query = db('field_registry').select('*').orderBy('sort_order', 'asc');

  if (record_type) {
    query = typeFilter(query, record_type);
  }

  if (is_active !== undefined) {
    query = query.where('is_active', is_active === 'true' || is_active === true);
  }

  return await query;
};

export const getFormFields = async (record_type) => {
  const fields = await typeFilter(
    db('field_registry').select('*').andWhere('is_active', true).orderBy('sort_order', 'asc'),
    record_type
  );

  const grouped = {};
  const normalizedType = record_type.toUpperCase();

  const mappedFields = fields.map(field => {
    let sec = field.section || 'general_info';
    let sort_order = field.sort_order;

    if (normalizedType === 'ARREST') {
      if (field.field_key === 'act_name' || field.field_key === 'sections') {
        sec = 'offence_info';
      } else if (field.field_key === 'status') {
        sec = 'custody_status';
        sort_order = 429;
      }
    } else if (normalizedType === 'UIDB') {
      if (field.field_key === 'act_name' || field.field_key === 'sections') {
        sec = 'general_info';
        sort_order = field.field_key === 'act_name' ? 5.1 : 5.2;
      } else if (field.field_key === 'status') {
        sec = 'general_info';
        sort_order = 5.3;
      } else if ([
        'height', 'built', 'complexion', 'face', 'hair', 'moustache', 'beard',
        'upper_dress_color', 'lower_dress_color', 'zipnet_no', 'identified'
      ].includes(field.field_key)) {
        sec = 'corpse_desc';
      } else if (['informant_name', 'informant_mobile'].includes(field.field_key)) {
        sec = 'inquest_details';
      }
    }

    return { ...field, section: sec, sort_order };
  });

  // Re-sort by sort_order
  mappedFields.sort((a, b) => a.sort_order - b.sort_order);

  for (const field of mappedFields) {
    const sec = field.section;
    if (!grouped[sec]) {
      const t = sectionTitle(sec);
      grouped[sec] = { section: sec, title_en: t.en, title_hi: t.hi, fields: [] };
    }
    grouped[sec].fields.push(field);
  }

  return Object.values(grouped);
};

export const createField = async (fieldData) => {
  const id = uuidv4();
  const [newField] = await db('field_registry').insert({
    id,
    ...fieldData
  }).returning('*');
  return newField;
};

export const updateField = async (id, fieldData) => {
  const [updatedField] = await db('field_registry')
    .where({ id })
    .update(fieldData)
    .returning('*');

  if (!updatedField) throw new Error('Field not found');
  return updatedField;
};

export const toggleFieldStatus = async (id, is_active) => {
  const [updatedField] = await db('field_registry')
    .where({ id })
    .update({ is_active })
    .returning('*');

  if (!updatedField) throw new Error('Field not found');
  return updatedField;
};

// --- Lookup Table Services ---

export const getActs = async () => {
  return await db('excel_acts').select('act_cd', 'act_long').orderBy('act_long', 'asc');
};

export const getSectionsForAct = async (act_cd) => {
  return await db('excel_sections')
    .where({ act_sec_cd: String(act_cd) })
    .select('section_code', 'section', 'section_desc', 'pnsh_gt_7yrs')
    .orderBy('section_code', 'asc');
};

export const getMajorHeads = async () => {
  return await db('excel_major_heads').select('major_head_code', 'major_head').orderBy('major_head', 'asc');
};

export const getMinorHeadsForMajorHead = async (major_head_code) => {
  return await db('excel_minor_heads')
    .where({ major_head_code: parseInt(major_head_code, 10) })
    .select('minor_head_cd', 'minor_head')
    .orderBy('minor_head', 'asc');
};

export const getPropertyCategories = async () => {
  return await db('excel_property_types').select('parent_srno', 'parent_cd', 'code_type', 'parent_type', 'major_property').orderBy('code_type', 'asc');
};

export const getPropertyItemsForCategory = async (parent_cd) => {
  return await db('excel_other_property_items')
    .where({ parent_cd: parseInt(parent_cd, 10) })
    .select('property_cd', 'property_type_srno', 'property')
    .orderBy('property', 'asc');
};

export const getBeats = async (ps_cd) => {
  let query = db('excel_beats').select('beat_cd', 'beat_name', 'ps_cd');
  if (ps_cd) {
    query = query.where({ ps_cd: String(ps_cd) });
  }
  return await query.orderBy('beat_name', 'asc');
};

