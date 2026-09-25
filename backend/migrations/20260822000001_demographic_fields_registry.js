/**
 * Migration 20260822000001: Add demographic fields (social_category, education, financial_status)
 * to field_registry for all person roles:
 *   CASE   → complainant, victim, accused
 *   ARREST → arrested person
 *   MISSING → missing person
 *
 * These appear automatically in DynamicForm.jsx via the dynamic schema system — no frontend
 * code changes needed. Pattern matches existing per-person fields (e.g. *_qualification).
 *
 * Unlocks: STAT_23 (SC/ST breakdown), STAT_20 (caste + education bands).
 */

const LEVELS = {
  visible: ['PS', 'DISTRICT', 'HQ'],
  editable: ['PS'],
  introduced: 'PS',
};

const SOCIAL_OPTIONS = [
  { value: 'GEN',       label_en: 'General',                           label_hi: 'सामान्य (General)' },
  { value: 'OBC',       label_en: 'OBC (Other Backward Class)',         label_hi: 'अन्य पिछड़ा वर्ग (OBC)' },
  { value: 'SC',        label_en: 'SC (Scheduled Caste)',              label_hi: 'अनुसूचित जाति (SC)' },
  { value: 'ST',        label_en: 'ST (Scheduled Tribe)',              label_hi: 'अनुसूचित जनजाति (ST)' },
  { value: 'EWS',       label_en: 'EWS (Economically Weaker Section)', label_hi: 'आर्थिक रूप से कमजोर वर्ग (EWS)' },
  { value: 'OTHERS',    label_en: 'Others',                            label_hi: 'अन्य' },
  { value: 'NOT_KNOWN', label_en: 'Not Known / Not Disclosed',         label_hi: 'ज्ञात नहीं / प्रकट नहीं' },
];

const EDUCATION_OPTIONS = [
  { value: 'HIGH_SCHOOL',  label_en: 'High School',  label_hi: 'हाई स्कूल (High School)' },
  { value: 'INTERMEDIATE', label_en: 'Intermediate', label_hi: 'इंटरमीडिएट (Intermediate)' },
  { value: 'GRADUATE',     label_en: 'Graduate',     label_hi: 'स्नातक (Graduate)' },
  { value: 'ILLITERATE',   label_en: 'Illiterate',   label_hi: 'निरक्षर (Illiterate)' },
  { value: 'DROPOUT',      label_en: 'Dropout',      label_hi: 'ड्रॉपआउट (Dropout)' },
  { value: 'NOT_KNOWN',    label_en: 'Not Known',    label_hi: 'ज्ञात नहीं (Not Known)' },
];

const FINANCIAL_OPTIONS = [
  { value: 'BPL',     label_en: 'Below Poverty Line (BPL)', label_hi: 'गरीबी रेखा से नीचे (BPL)' },
  { value: 'LOWER',   label_en: 'Lower',                    label_hi: 'निम्न' },
  { value: 'MIDDLE',  label_en: 'Middle',                   label_hi: 'मध्यम' },
  { value: 'UPPER',   label_en: 'Upper',                    label_hi: 'उच्च' },
  { value: 'UNKNOWN', label_en: 'Unknown',                  label_hi: 'अज्ञात' },
];

/**
 * Each entry describes a set of 3 demographic fields for one person role.
 * sort_order is set just after the *_qualification field for each section.
 */
const PERSON_CONFIGS = [
  // ── CASE: Complainant ─────────────────────────────────────────────────────
  {
    prefix: 'complainant',
    section: 'complainant_personal_info',
    record_types: ['CASE', 'MISSING'],
    storage_role: 'COMPLAINANT',
    repeater_entity: null,
    base_sort: 408.6,   // after complainant_qualification (408.5)
    labels: {
      social: { en: 'Complainant Social Category', hi: 'शिकायतकर्ता सामाजिक श्रेणी' },
      education: { en: 'Complainant Education', hi: 'शिकायतकर्ता शिक्षा' },
      financial: { en: 'Complainant Financial Status', hi: 'शिकायतकर्ता वित्तीय स्थिति' },
    },
  },
  // ── CASE: Victim ──────────────────────────────────────────────────────────
  {
    prefix: 'victim',
    section: 'victim_personal_info',
    record_types: ['CASE'],
    storage_role: 'VICTIM',
    repeater_entity: 'PERSON_VICTIM',
    base_sort: 468.6,   // after victim_qualification (468.5)
    labels: {
      social: { en: 'Victim Social Category', hi: 'पीड़ित सामाजिक श्रेणी' },
      education: { en: 'Victim Education', hi: 'पीड़ित शिक्षा' },
      financial: { en: 'Victim Financial Status', hi: 'पीड़ित वित्तीय स्थिति' },
    },
  },
  // ── CASE: Accused ─────────────────────────────────────────────────────────
  {
    prefix: 'accused',
    section: 'accused_personal_info',
    record_types: ['CASE'],
    storage_role: 'ACCUSED',
    repeater_entity: 'PERSON_ACCUSED',
    base_sort: 438.6,   // after accused_qualification (438.5)
    labels: {
      social: { en: 'Accused Social Category', hi: 'आरोपी सामाजिक श्रेणी' },
      education: { en: 'Accused Education', hi: 'आरोपी शिक्षा' },
      financial: { en: 'Accused Financial Status', hi: 'आरोपी वित्तीय स्थिति' },
    },
  },
  // ── ARREST: Arrested Person ───────────────────────────────────────────────
  {
    prefix: 'arrested',
    section: 'arrested_personal_info',
    record_types: ['ARREST'],
    storage_role: 'ARRESTEE',
    repeater_entity: 'PERSON_ARRESTED',
    base_sort: 408.6,   // after arrested_qualification (408.5)
    labels: {
      social: { en: 'Arrested Person Social Category', hi: 'गिरफ्तार व्यक्ति सामाजिक श्रेणी' },
      education: { en: 'Arrested Person Education', hi: 'गिरफ्तार व्यक्ति शिक्षा' },
      financial: { en: 'Arrested Person Financial Status', hi: 'गिरफ्तार व्यक्ति वित्तीय स्थिति' },
    },
  },
  // ── MISSING: Missing Person ───────────────────────────────────────────────
  {
    prefix: 'mp',
    section: 'person_details',
    record_types: ['MISSING'],
    storage_role: 'MISSING',
    repeater_entity: null,
    base_sort: 21.9,    // after missing_relation_type (21.8)
    labels: {
      social: { en: 'Missing Person Social Category', hi: 'लापता व्यक्ति सामाजिक श्रेणी' },
      education: { en: 'Missing Person Education', hi: 'लापता व्यक्ति शिक्षा' },
      financial: { en: 'Missing Person Financial Status', hi: 'लापता व्यक्ति वित्तीय स्थिति' },
    },
  },
];

export async function up(knex) {
  const crypto = await import('crypto');

  function makeChecksum(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
  }

  const rows = [];

  for (const cfg of PERSON_CONFIGS) {
    const base = {
      record_types: JSON.stringify(cfg.record_types),
      field_type: 'SELECT',
      section: cfg.section,
      section_labels: null,
      options_source: null,
      depends_on: null,
      show_when: null,
      validation_rules: JSON.stringify({ required: false }),
      visible_to_levels: JSON.stringify(LEVELS.visible),
      editable_by_levels: JSON.stringify(LEVELS.editable),
      introduced_at_level: LEVELS.introduced,
      repeater_entity: cfg.repeater_entity,
      full_width: false,
      readonly: false,
      is_active: true,
      scope_level: 'global',
      scope_id: null,
    };

    // social_category
    const socialKey = `${cfg.prefix}_social_category`;
    const socialRow = {
      ...base,
      field_key: socialKey,
      labels: JSON.stringify({ en: cfg.labels.social.en, hi: cfg.labels.social.hi }),
      storage: JSON.stringify({ entity: 'person', role: cfg.storage_role, column: 'social_category' }),
      options: JSON.stringify(SOCIAL_OPTIONS),
      sort_order: cfg.base_sort,
    };
    socialRow.checksum = makeChecksum(socialRow);
    rows.push(socialRow);

    // education
    const eduKey = `${cfg.prefix}_education`;
    const eduRow = {
      ...base,
      field_key: eduKey,
      labels: JSON.stringify({ en: cfg.labels.education.en, hi: cfg.labels.education.hi }),
      storage: JSON.stringify({ entity: 'person', role: cfg.storage_role, column: 'education' }),
      options: JSON.stringify(EDUCATION_OPTIONS),
      sort_order: cfg.base_sort + 0.1,
    };
    eduRow.checksum = makeChecksum(eduRow);
    rows.push(eduRow);

    // financial_status
    const finKey = `${cfg.prefix}_financial_status`;
    const finRow = {
      ...base,
      field_key: finKey,
      labels: JSON.stringify({ en: cfg.labels.financial.en, hi: cfg.labels.financial.hi }),
      storage: JSON.stringify({ entity: 'person', role: cfg.storage_role, column: 'financial_status' }),
      options: JSON.stringify(FINANCIAL_OPTIONS),
      sort_order: cfg.base_sort + 0.2,
    };
    finRow.checksum = makeChecksum(finRow);
    rows.push(finRow);
  }

  // Remove the generic (wrongly-sectioned) root fields added by the previous migration
  await knex('field_registry')
    .whereIn('field_key', ['social_category', 'education', 'financial_status'])
    .delete();

  // Insert per-person fields, skip if already present (idempotent)
  for (const row of rows) {
    const existing = await knex('field_registry').where('field_key', row.field_key).first();
    if (!existing) {
      await knex('field_registry').insert(row);
    } else {
      await knex('field_registry').where('field_key', row.field_key).update(row);
    }
  }
}

export async function down(knex) {
  const keysToRemove = PERSON_CONFIGS.flatMap(cfg => [
    `${cfg.prefix}_social_category`,
    `${cfg.prefix}_education`,
    `${cfg.prefix}_financial_status`,
  ]);
  await knex('field_registry').whereIn('field_key', keysToRemove).delete();
}
