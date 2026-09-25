import fs from 'fs';

const caseFieldsPath = '../config/fields/case.json';
const caseFields = JSON.parse(fs.readFileSync(caseFieldsPath, 'utf8'));

const newCaseFields = [
  {
    field_key: "sent_to_court_date",
    label_en: "Date sent to court",
    label_hi: "न्यायालय भेजने की तिथि",
    field_type: "date",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "sent_to_court_date" },
    show_when: { field: "case_status", value_in: ["CHARGE SHEET", "POLICE INVESTIGATION REPORT(PIR-JCL)"] },
    editable_by_roles: ["SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "court_details",
    is_active: true
  },
  {
    field_key: "court_case_no",
    label_en: "Court case number",
    label_hi: "न्यायालय केस संख्या",
    field_type: "text",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "court_case_no" },
    show_when: { field: "sent_to_court_date", not_null: true },
    editable_by_roles: ["SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "court_details",
    is_active: true
  },
  {
    field_key: "court_name",
    label_en: "Court name",
    label_hi: "न्यायालय का नाम",
    field_type: "select",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "court_name" },
    options: [
      { value: "MM", label_en: "Metropolitan Magistrate (MM)" },
      { value: "CMM", label_en: "Chief Metropolitan Magistrate (CMM)" },
      { value: "ACMM", label_en: "Addl. Chief Metropolitan Magistrate (ACMM)" },
      { value: "SESSION", label_en: "Sessions Court" },
      { value: "HC", label_en: "High Court" },
      { value: "OTHER", label_en: "Other" }
    ],
    show_when: { field: "sent_to_court_date", not_null: true },
    editable_by_roles: ["SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "court_details",
    is_active: true
  },
  {
    field_key: "court_disposal_type",
    label_en: "Court disposal",
    label_hi: "न्यायालय निपटान",
    field_type: "select",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "court_disposal_type" },
    options: [
      { value: "CONVICTED", label_en: "Convicted" },
      { value: "ACQUITTED", label_en: "Acquitted" },
      { value: "COMPOUNDED", label_en: "Compounded" },
      { value: "DISCHARGED", label_en: "Discharged" },
      { value: "PENDING_TRIAL", label_en: "Pending trial" }
    ],
    show_when: { field: "sent_to_court_date", not_null: true },
    editable_by_roles: ["SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "court_details",
    is_active: true
  },
  {
    field_key: "court_disposal_date",
    label_en: "Date of court disposal",
    label_hi: "न्यायालय निपटान तिथि",
    field_type: "date",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "court_disposal_date" },
    show_when: { field: "court_disposal_type", not_in: ["PENDING_TRIAL", null] },
    editable_by_roles: ["SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "court_details",
    is_active: true
  },
  {
    field_key: "registered_on_direction",
    label_en: "Registered on Direction",
    label_hi: "निर्देश पर दर्ज",
    field_type: "boolean",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "registered_on_direction" },
    editable_by_roles: ["HC", "SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "general",
    is_active: true
  },
  {
    field_key: "direction_authority",
    label_en: "Direction Authority",
    label_hi: "निर्देश प्राधिकारी",
    field_type: "text",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "direction_authority" },
    show_when: { field: "registered_on_direction", equals: true },
    editable_by_roles: ["HC", "SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "general",
    is_active: true
  },
  {
    field_key: "cheating_amount",
    label_en: "Cheating / Fraud Amount (Rs.)",
    label_hi: "धोखाधड़ी राशि",
    field_type: "number",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "cheating_amount" },
    editable_by_roles: ["HC", "SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "property",
    is_active: true
  },
  {
    field_key: "modus_operandi",
    label_en: "Modus Operandi",
    label_hi: "अपराध का तरीका (MO)",
    field_type: "text",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "modus_operandi" },
    editable_by_roles: ["HC", "SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "general",
    is_active: true
  },
  {
    field_key: "burglary_mo_cd",
    label_en: "Burglary Means of Entry",
    label_hi: "सेंधमारी प्रवेश विधि",
    field_type: "select",
    record_types: ["CASE"],
    storage: { table: "fir_details", column: "burglary_mo_cd" },
    editable_by_roles: ["HC", "SHO", "DISTRICT_OFFICER", "SYSTEM_ADMIN"],
    section: "general",
    is_active: true
  }
];

for (const nf of newCaseFields) {
  const existingIdx = caseFields.findIndex(f => f.field_key === nf.field_key);
  if (existingIdx >= 0) {
    caseFields[existingIdx] = nf;
  } else {
    caseFields.push(nf);
  }
}

fs.writeFileSync(caseFieldsPath, JSON.stringify(caseFields, null, 2), 'utf8');
console.log(`Updated case.json! Total fields: ${caseFields.length}`);

// Common / Person fields:
const commonFieldsPath = '../config/fields/common.json';
if (fs.existsSync(commonFieldsPath)) {
  const commonFields = JSON.parse(fs.readFileSync(commonFieldsPath, 'utf8'));
  const newPersonFields = [
    {
      field_key: "social_category",
      label_en: "Social Category / Caste",
      label_hi: "सामाजिक श्रेणी",
      field_type: "select",
      record_types: ["CASE", "ARREST", "MISSING", "UIDB"],
      storage: { table: "persons", column: "social_category" },
      options: [
        { value: "SC", label_en: "Scheduled Caste (SC)" },
        { value: "ST", label_en: "Scheduled Tribe (ST)" },
        { value: "OBC", label_en: "Other Backward Class (OBC)" },
        { value: "GEN", label_en: "General" },
        { value: "UNKNOWN", label_en: "Unknown" }
      ],
      is_active: true
    },
    {
      field_key: "education",
      label_en: "Education",
      label_hi: "शिक्षा",
      field_type: "select",
      record_types: ["CASE", "ARREST", "MISSING", "UIDB"],
      storage: { table: "persons", column: "education" },
      options: [
        { value: "ILLITERATE", label_en: "Illiterate" },
        { value: "SCHOOL_DROPOUT", label_en: "School Dropout" },
        { value: "UP_TO_10TH", label_en: "Up to 10th" },
        { value: "UP_TO_12TH", label_en: "Up to 12th" },
        { value: "GRADUATE", label_en: "Graduate" },
        { value: "PROFESSIONAL", label_en: "Professional" },
        { value: "UNKNOWN", label_en: "Unknown" }
      ],
      is_active: true
    },
    {
      field_key: "financial_status",
      label_en: "Financial Status",
      label_hi: "वित्तीय स्थिति",
      field_type: "select",
      record_types: ["CASE", "ARREST", "MISSING", "UIDB"],
      storage: { table: "persons", column: "financial_status" },
      options: [
        { value: "BPL", label_en: "Below Poverty Line (BPL)" },
        { value: "LOWER", label_en: "Lower" },
        { value: "MIDDLE", label_en: "Middle" },
        { value: "UPPER", label_en: "Upper" },
        { value: "UNKNOWN", label_en: "Unknown" }
      ],
      is_active: true
    }
  ];

  for (const np of newPersonFields) {
    const existingIdx = commonFields.findIndex(f => f.field_key === np.field_key);
    if (existingIdx >= 0) {
      commonFields[existingIdx] = np;
    } else {
      commonFields.push(np);
    }
  }

  fs.writeFileSync(commonFieldsPath, JSON.stringify(commonFields, null, 2), 'utf8');
  console.log(`Updated common.json! Total fields: ${commonFields.length}`);
}
