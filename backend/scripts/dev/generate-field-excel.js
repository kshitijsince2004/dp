/**
 * Generates PHAROS-Fields.xlsx
 * Run: node backend/scripts/generate-field-excel.js
 *
 * Sheets produced:
 *   Overview        – seeded user accounts (table-view)
 *   Report Templates – seeded templates (table-view)
 *   CASE (FIR)      – all field_registry entries for record type CASE
 *   ARREST          – all field_registry entries for record type ARREST
 *   PCR_CALL        – all field_registry entries for record type PCR_CALL
 *   MISSING         – all field_registry entries for record type MISSING
 *   UIDB            – all field_registry entries for record type UIDB
 *
 * Layout for field-registry sheets (horizontal):
 *   Row 1 : Section name  (merged across all fields of that section, coloured)
 *   Row 2 : Field label EN
 *   Row 3 : field_key  (technical DB key inside records.data JSONB)
 *   Row 4 : field_type
 *   Row 5–9: blank sample-data rows (shows room for real records)
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Palette (ARGB) ────────────────────────────────────────────────────────────
const PAL = {
  CASE:      { section: 'FF1565C0', header: 'FF42A5F5', alt: 'FFE3F2FD', text: 'FFFFFFFF' },
  ARREST:    { section: 'FFC62828', header: 'FFEF5350', alt: 'FFFCE4EC', text: 'FFFFFFFF' },
  PCR_CALL:  { section: 'FF2E7D32', header: 'FF66BB6A', alt: 'FFE8F5E9', text: 'FFFFFFFF' },
  MISSING:   { section: 'FFE65100', header: 'FFFFA726', alt: 'FFFFF3E0', text: 'FFFFFFFF' },
  UIDB:      { section: 'FF6A1B9A', header: 'FFAB47BC', alt: 'FFF3E5F5', text: 'FFFFFFFF' },
  USERS:     { section: 'FF37474F', header: 'FF78909C', alt: 'FFECEFF1', text: 'FFFFFFFF' },
  TEMPLATES: { section: 'FF4E342E', header: 'FF8D6E63', alt: 'FFEFEBE9', text: 'FFFFFFFF' },
};

const TYPE_COLORS = {
  TEXT:     'FFFFF9C4',
  DATE:     'FFBBDEFB',
  TIME:     'FFBBDEFB',
  TEXTAREA: 'FFDCEDC8',
  SELECT:   'FFFCE4EC',
  RADIO:    'FFFCE4EC',
  NUMBER:   'FFE1BEE7',
  BOOLEAN:  'FFB2EBF2',
  SYSTEM:    'FFE0E0E0',
  AUTO_FILL: 'FFD7F0C2',
};

// ── Helper: apply border to a cell ───────────────────────────────────────────
function border(cell, style = 'thin') {
  cell.border = {
    top:    { style },
    left:   { style },
    bottom: { style },
    right:  { style },
  };
}

// ── Helper: freeze top N rows ────────────────────────────────────────────────
function freeze(ws, rows) {
  ws.views = [{ state: 'frozen', ySplit: rows }];
}

// ── USERS SHEET ───────────────────────────────────────────────────────────────
const USER_COLS = [
  { key: 'id',           header: 'ID',              width: 18 },
  { key: 'username',     header: 'Username',         width: 28 },
  { key: 'badge_no',     header: 'Badge No.',        width: 12 },
  { key: 'name_en',      header: 'Name (EN)',         width: 22 },
  { key: 'name_hi',      header: 'Name (HI)',         width: 22 },
  { key: 'role',         header: 'Role',             width: 18 },
  { key: 'station_id',   header: 'Station ID',       width: 28 },
  { key: 'district_id',  header: 'District ID',      width: 18 },
  { key: 'sub_div_id',   header: 'Sub-Division ID',  width: 20 },
  { key: 'is_active',    header: 'Active',           width: 10 },
  { key: 'password_hash',header: 'Password Hash',    width: 22 },
];

const USERS = [
  { id: 'U_HC001',  username: 'hc_parliament_street', badge_no: 'HC001',  name_en: 'Ramesh Kumar',      name_hi: 'रमेश कुमार',          role: 'HC',              station_id: 'PS_NDD_PARLIAMENTSTREET', district_id: 'DIST_NDD', sub_div_id: 'SUBDIV_DIST_NDD_1', is_active: true, password_hash: '<hashed>' },
  { id: 'U_SHO001', username: 'sho_parliament_street',badge_no: 'SHO001', name_en: 'Vikram Singh',      name_hi: 'विक्रम सिंह',         role: 'SHO',             station_id: 'PS_NDD_PARLIAMENTSTREET', district_id: 'DIST_NDD', sub_div_id: 'SUBDIV_DIST_NDD_1', is_active: true, password_hash: '<hashed>' },
  { id: 'U_ACP001', username: 'acp_parliament_street', badge_no: 'ACP001', name_en: 'Rakesh Yadav',     name_hi: 'राकेश यादव',          role: 'ACP',             station_id: '',                        district_id: 'DIST_NDD', sub_div_id: 'SUBDIV_DIST_NDD_1', is_active: true, password_hash: '<hashed>' },
  { id: 'U_DO001',  username: 'dcp_ndd',               badge_no: 'DO001',  name_en: 'Priya Sharma',     name_hi: 'प्रिया शर्मा',        role: 'DISTRICT_OFFICER', station_id: '',                       district_id: 'DIST_NDD', sub_div_id: '',                  is_active: true, password_hash: '<hashed>' },
  { id: 'U_HQ001',  username: 'hq_analyst',            badge_no: 'HQ001',  name_en: 'Anita Verma',      name_hi: 'अनिता वर्मा',         role: 'HQ_ANALYST',      station_id: '',                        district_id: '',         sub_div_id: '',                  is_active: true, password_hash: '<hashed>' },
  { id: 'U_HQ002',  username: 'hq_admin',              badge_no: 'HQ002',  name_en: 'Suresh Gupta',     name_hi: 'सुरेश गुप्ता',        role: 'HQ_ADMIN',        station_id: '',                        district_id: '',         sub_div_id: '',                  is_active: true, password_hash: '<hashed>' },
  { id: 'U_SA001',  username: 'system_admin',          badge_no: 'SA001',  name_en: 'System Admin',     name_hi: 'सिस्टम व्यवस्थापक',  role: 'SYSTEM_ADMIN',    station_id: '',                        district_id: '',         sub_div_id: '',                  is_active: true, password_hash: '<hashed>' },
  { id: 'U_HC002',  username: 'hc_adarsh_nagar',       badge_no: 'HC002',  name_en: 'Sunil Dutt',       name_hi: 'सुनील दत्त',          role: 'HC',              station_id: 'PS_NWD_ADARSHNAGAR',     district_id: 'DIST_NWD', sub_div_id: 'SUBDIV_DIST_NWD_0', is_active: true, password_hash: '<hashed>' },
  { id: 'U_DO002',  username: 'dcp_nwd',               badge_no: 'DO002',  name_en: 'North West DCP',   name_hi: 'उत्तर पश्चिम डीसीपी', role: 'DISTRICT_OFFICER', station_id: '',                       district_id: 'DIST_NWD', sub_div_id: '',                  is_active: true, password_hash: '<hashed>' },
];

// ── REPORT TEMPLATES SHEET ────────────────────────────────────────────────────
const TMPL_COLS = [
  { key: 'id',           header: 'ID',               width: 32 },
  { key: 'name_en',      header: 'Name (EN)',         width: 45 },
  { key: 'name_hi',      header: 'Name (HI)',         width: 38 },
  { key: 'record_types', header: 'Applicable Record Types', width: 22 },
  { key: 'levels',       header: 'Applicable Levels', width: 22 },
  { key: 'formats',      header: 'Output Formats',    width: 18 },
  { key: 'layout',       header: 'Layout',            width: 16 },
  { key: 'is_active',    header: 'Active',            width: 10 },
  { key: 'created_by',   header: 'Created By',        width: 14 },
];

const TEMPLATES = [
  {
    id: 'T_DAILY_24HR_DIARY',
    name_en: '24-Hour Daily Diary (Important Cases)',
    name_hi: '24 घंटे की दैनिक डायरी (महत्वपूर्ण मामले)',
    record_types: 'CASE',
    levels: 'DISTRICT, HQ',
    formats: 'PDF, EXCEL',
    layout: 'A4_PORTRAIT',
    is_active: true,
    created_by: 'U_SA001',
  },
  {
    id: 'T_DAILY_CRIME_STATEMENT',
    name_en: 'PS-wise Daily Crime Statement',
    name_hi: 'थानेवार दैनिक अपराध विवरण',
    record_types: 'CASE',
    levels: 'DISTRICT, HQ',
    formats: 'PDF, EXCEL',
    layout: 'A4_LANDSCAPE',
    is_active: true,
    created_by: 'U_SA001',
  },
];

// ── FIELD REGISTRY DATA ───────────────────────────────────────────────────────
// Mirrors seed.js fields array (options truncated to save column width)
// AUTO_FILL = set from logged-in user context, not entered manually
// SYSTEM    = auto-assigned by backend on record creation
const ALL_FIELDS = [
  // ── CASE ──────────────────────────────────────────────────────────────────
  { id:'C_AF1', field_key:'district',           field_type:'AUTO_FILL', record_type:'CASE',     label_en:'District (Auto-filled)',       section:'system_fields',            sort_order:-3 },
  { id:'C_AF2', field_key:'policeStation',      field_type:'AUTO_FILL', record_type:'CASE',     label_en:'Police Station (Auto-filled)', section:'system_fields',            sort_order:-2 },
  { id:'C_0',  field_key:'uid',                field_type:'SYSTEM',   record_type:'CASE',     label_en:'System UID (Auto-assigned)',   section:'system_fields',            sort_order:-1 },
  { id:'C_29', field_key:'case_type',           field_type:'SELECT',   record_type:'CASE', label_en:'Case Registration Type',       section:'general_info',             sort_order:0  },
  { id:'C_1',  field_key:'fir_no',              field_type:'TEXT',     record_type:'CASE', label_en:'FIR Number',                   section:'general_info',             sort_order:1  },
  { id:'C_2',  field_key:'fir_date',            field_type:'DATE',     record_type:'CASE', label_en:'FIR Date',                     section:'general_info',             sort_order:2  },
  { id:'C_3',  field_key:'gd_no',               field_type:'TEXT',     record_type:'CASE', label_en:'GD Number',                    section:'general_info',             sort_order:3  },
  { id:'C_4',  field_key:'gd_date',             field_type:'DATE',     record_type:'CASE', label_en:'GD Date',                      section:'general_info',             sort_order:4  },
  { id:'C_5',  field_key:'gd_time',             field_type:'TIME',     record_type:'CASE', label_en:'GD Time',                      section:'general_info',             sort_order:5  },
  { id:'C_6',  field_key:'beat_no',             field_type:'TEXT',     record_type:'CASE', label_en:'Beat No.',                     section:'general_info',             sort_order:6  },
  { id:'C_7',  field_key:'occurrence_date',     field_type:'DATE',     record_type:'CASE', label_en:'Date of Occurrence',           section:'incident_details',         sort_order:7  },
  { id:'C_26', field_key:'time_of_occurrence',  field_type:'TIME',     record_type:'CASE', label_en:'Time of Occurrence',           section:'incident_details',         sort_order:26 },
  { id:'C_8',  field_key:'occurrence_place',    field_type:'TEXT',     record_type:'CASE', label_en:'Place of Occurrence',          section:'incident_details',         sort_order:8  },
  { id:'C_9',  field_key:'local_head',          field_type:'SELECT',   record_type:'CASE', label_en:'Local Head (Crime)',           section:'incident_details',         sort_order:9  },
  { id:'C_10', field_key:'act_name',            field_type:'TEXT',     record_type:'CASE', label_en:'Act / Law Name',               section:'incident_details',         sort_order:10 },
  { id:'C_11', field_key:'sections',            field_type:'TEXT',     record_type:'CASE', label_en:'Sections',                     section:'incident_details',         sort_order:11 },
  { id:'C_12', field_key:'brief_facts',         field_type:'TEXTAREA', record_type:'CASE', label_en:'Brief Facts of the Case',      section:'incident_details',         sort_order:12 },
  { id:'C_13', field_key:'complainant_name',    field_type:'TEXT',     record_type:'CASE', label_en:'Complainant Name',             section:'complainant_info',         sort_order:13 },
  { id:'C_14', field_key:'complainant_address', field_type:'TEXT',     record_type:'CASE', label_en:'Complainant Address',          section:'complainant_info',         sort_order:14 },
  { id:'C_30', field_key:'complainant_parent_name', field_type:'TEXT', record_type:'CASE', label_en:'Complainant Parent Name',     section:'complainant_info',         sort_order:15 },
  { id:'C_35', field_key:'complainant_age',     field_type:'NUMBER',   record_type:'CASE', label_en:'Complainant Age',              section:'complainant_info',         sort_order:16 },
  { id:'C_17', field_key:'io_name',             field_type:'TEXT',     record_type:'CASE', label_en:'Name of IO',                   section:'investigation_officer',     sort_order:17 },
  { id:'C_18', field_key:'io_pis',              field_type:'TEXT',     record_type:'CASE', label_en:'PIS No. of IO',                section:'investigation_officer',     sort_order:18 },
  { id:'C_19', field_key:'io_mobile',           field_type:'NUMBER',     record_type:'CASE', label_en:'IO Mobile No.',                section:'investigation_officer',     sort_order:19 },
  { id:'C_33', field_key:'stolen_property',     field_type:'TEXTAREA', record_type:'CASE', label_en:'Property Description (Stolen)',section:'stolen_property',          sort_order:331},
  { id:'C_21', field_key:'property_status',     field_type:'SELECT',   record_type:'CASE', label_en:'Property Status',              section:'stolen_property',          sort_order:332},
  { id:'C_22', field_key:'status',              field_type:'SELECT',   record_type:'CASE', label_en:'Case Status',                  section:'stolen_property',          sort_order:333},
  { id:'C_23', field_key:'remarks',             field_type:'TEXTAREA', record_type:'CASE', label_en:'Remarks',                      section:'stolen_property',          sort_order:334},
  { id:'C_20', field_key:'property_description',field_type:'TEXTAREA', record_type:'CASE', label_en:'Property Description (Recovered)', section:'recovered_property',   sort_order:341},
  { id:'C_34', field_key:'recovered_property',  field_type:'TEXTAREA', record_type:'CASE', label_en:'Recovery Property',            section:'recovered_property',       sort_order:342},
  { id:'C_36', field_key:'recovered_property_status', field_type:'SELECT', record_type:'CASE', label_en:'Property Status (Recovered)', section:'recovered_property',    sort_order:343},
  { id:'C_37', field_key:'recovered_case_status', field_type:'SELECT', record_type:'CASE', label_en:'Case Status (Recovered)',     section:'recovered_property',       sort_order:344},
  { id:'C_38', field_key:'recovered_remarks',   field_type:'TEXTAREA', record_type:'CASE', label_en:'Remarks (Recovered)',          section:'recovered_property',       sort_order:345},

  // ── ARREST ────────────────────────────────────────────────────────────────
  { id:'A_AF1', field_key:'district',           field_type:'AUTO_FILL', record_type:'ARREST',  label_en:'District (Auto-filled)',       section:'system_fields',           sort_order:-3 },
  { id:'A_AF2', field_key:'policeStation',      field_type:'AUTO_FILL', record_type:'ARREST',  label_en:'Police Station (Auto-filled)', section:'system_fields',           sort_order:-2 },
  { id:'A_0',  field_key:'uid',                field_type:'SYSTEM',   record_type:'ARREST',   label_en:'System UID (Auto-assigned)',   section:'system_fields',            sort_order:-1 },
  { id:'A_1',  field_key:'linked_fir_dd_no',   field_type:'TEXT',     record_type:'ARREST', label_en:'Linked FIR / DD No.',         section:'general_info',    sort_order:1  },
  { id:'A_2',  field_key:'act_name',            field_type:'TEXT',     record_type:'ARREST', label_en:'Act / Law Name',              section:'offence_info',    sort_order:2  },
  { id:'A_3',  field_key:'sections',            field_type:'TEXT',     record_type:'ARREST', label_en:'Sections',                    section:'offence_info',    sort_order:3  },
  { id:'A_8',  field_key:'crime_head',          field_type:'SELECT',   record_type:'ARREST', label_en:'Crime Head',                  section:'offence_info',    sort_order:8  },
  { id:'A_4',  field_key:'arrested_name',       field_type:'TEXT',     record_type:'ARREST', label_en:'Name of Arrested Person',     section:'arrestee_info',   sort_order:4  },
  { id:'A_5',  field_key:'arrested_address',    field_type:'TEXT',     record_type:'ARREST', label_en:'Address of Arrested',         section:'arrestee_info',   sort_order:5  },
  { id:'A_26', field_key:'arrested_age',        field_type:'NUMBER',   record_type:'ARREST', label_en:'Age',                         section:'arrestee_info',   sort_order:6  },
  { id:'A_6',  field_key:'arrest_date',         field_type:'DATE',     record_type:'ARREST', label_en:'Date of Arrest',              section:'arrestee_info',   sort_order:6  },
  { id:'A_25', field_key:'arrest_time',         field_type:'TIME',     record_type:'ARREST', label_en:'Time of Arrest',              section:'arrestee_info',   sort_order:7  },
  { id:'A_7',  field_key:'arrest_place',        field_type:'TEXT',     record_type:'ARREST', label_en:'Place of Arrest',             section:'arrestee_info',   sort_order:7  },
  { id:'A_9',  field_key:'status',              field_type:'SELECT',   record_type:'ARREST', label_en:'Custody Status',              section:'custody_status',  sort_order:9  },
  { id:'A_10', field_key:'other_status_reason', field_type:'TEXT',     record_type:'ARREST', label_en:'Other Status Reason',         section:'custody_status',  sort_order:10 },
  { id:'A_14', field_key:'age_gender',          field_type:'TEXT',     record_type:'ARREST', label_en:'Age / Gender',                section:'arrest_details',  sort_order:14 },
  { id:'A_15', field_key:'nick_name',           field_type:'TEXT',     record_type:'ARREST', label_en:'Nick Name',                   section:'arrest_details',  sort_order:15 },
  { id:'A_16', field_key:'parents_name',        field_type:'TEXT',     record_type:'ARREST', label_en:'Parents Name',                section:'arrest_details',  sort_order:16 },
  { id:'A_17', field_key:'prev_involvement',    field_type:'SELECT',   record_type:'ARREST', label_en:'Prev. Involvement (Y/N)',     section:'arrest_details',  sort_order:17 },
  { id:'A_18', field_key:'recovery',            field_type:'TEXTAREA', record_type:'ARREST', label_en:'Recovery',                    section:'arrest_details',  sort_order:18 },
  { id:'A_19', field_key:'bc_or_not',           field_type:'SELECT',   record_type:'ARREST', label_en:'BC or Not',                   section:'arrest_details',  sort_order:19 },
  { id:'A_29', field_key:'is_po',               field_type:'SELECT',   record_type:'ARREST', label_en:'Is the person PO',            section:'arrest_details',  sort_order:24 },
  { id:'A_21', field_key:'io_details',          field_type:'TEXTAREA', record_type:'ARREST', label_en:'IO Details',                  section:'arrest_details',  sort_order:21 },
  { id:'A_22', field_key:'nafis_dossier',       field_type:'SELECT',   record_type:'ARREST', label_en:'NAFIS / Dossier (Y/N)',       section:'arrest_details',  sort_order:22 },
  { id:'A_23', field_key:'scheme',              field_type:'SELECT',   record_type:'ARREST', label_en:'Scheme (Special Scheme Arrest)', section:'special_scheme', sort_order:23 },
  { id:'A_11', field_key:'io_name',             field_type:'TEXT',     record_type:'ARREST', label_en:'Name of IO',                  section:'procedure_slips', sort_order:11 },
  { id:'A_12', field_key:'nafis_prepared',      field_type:'BOOLEAN',  record_type:'ARREST', label_en:'NAFIS Prepared',              section:'procedure_slips', sort_order:12 },
  { id:'A_13', field_key:'dossier_prepared',    field_type:'BOOLEAN',  record_type:'ARREST', label_en:'Dossier Prepared',            section:'procedure_slips', sort_order:13 },
  { id:'A_24', field_key:'arresting_officer',   field_type:'TEXT',     record_type:'ARREST', label_en:'Arresting Officer',           section:'procedure_slips', sort_order:24 },
  { id:'A_27', field_key:'arresting_officer_mobile', field_type:'NUMBER', record_type:'ARREST', label_en:'Contact of Arresting Officer', section:'procedure_slips', sort_order:25 },
  { id:'A_28', field_key:'io_mobile',           field_type:'NUMBER',     record_type:'ARREST', label_en:'Contact of IO',               section:'procedure_slips', sort_order:26 },

  // ── PCR_CALL ──────────────────────────────────────────────────────────────
  { id:'P_AF1', field_key:'district',          field_type:'AUTO_FILL', record_type:'PCR_CALL', label_en:'District (Auto-filled)',       section:'system_fields',            sort_order:-3 },
  { id:'P_AF2', field_key:'policeStation',     field_type:'AUTO_FILL', record_type:'PCR_CALL', label_en:'Police Station (Auto-filled)', section:'system_fields',            sort_order:-2 },
  { id:'P_0',  field_key:'uid',                field_type:'SYSTEM',   record_type:'PCR_CALL', label_en:'System UID (Auto-assigned)',   section:'system_fields',            sort_order:-1 },
  { id:'P_1',  field_key:'pcr_no',              field_type:'TEXT',     record_type:'PCR_CALL', label_en:'PCR Number',               section:'informant_contact',  sort_order:1  },
  { id:'P_2',  field_key:'gd_no',               field_type:'TEXT',     record_type:'PCR_CALL', label_en:'GD Number',                section:'informant_contact',  sort_order:2  },
  { id:'P_3',  field_key:'gd_date',             field_type:'DATE',     record_type:'PCR_CALL', label_en:'GD Date',                  section:'informant_contact',  sort_order:3  },
  { id:'P_4',  field_key:'gd_time',             field_type:'TIME',     record_type:'PCR_CALL', label_en:'GD Time',                  section:'informant_contact',  sort_order:4  },
  { id:'P_7',  field_key:'caller_name',         field_type:'TEXT',     record_type:'PCR_CALL', label_en:'Caller Name',              section:'informant_contact',  sort_order:7  },
  { id:'P_8',  field_key:'caller_mobile',       field_type:'NUMBER',     record_type:'PCR_CALL', label_en:'Caller Mobile',            section:'informant_contact',  sort_order:8  },
  { id:'P_5',  field_key:'call_head',           field_type:'SELECT',   record_type:'PCR_CALL', label_en:'Call Category (Head)',     section:'complaint_details',  sort_order:5  },
  { id:'P_6',  field_key:'call_gist',           field_type:'TEXTAREA', record_type:'PCR_CALL', label_en:'PCR Call Gist',            section:'complaint_details',  sort_order:6  },
  { id:'P_9',  field_key:'io_name',             field_type:'TEXT',     record_type:'PCR_CALL', label_en:'IO / EO Name',             section:'response_io',        sort_order:9  },
  { id:'P_11', field_key:'status',              field_type:'SELECT',   record_type:'PCR_CALL', label_en:'Status',                   section:'response_io',        sort_order:11 },
  { id:'P_10', field_key:'arrival_time',        field_type:'TIME',     record_type:'PCR_CALL', label_en:'Arrival Time',             section:'arrival_geo',        sort_order:10 },
  { id:'P_12', field_key:'occurrence_place',    field_type:'TEXT',     record_type:'PCR_CALL', label_en:'Place of Occurrence',      section:'arrival_geo',        sort_order:12 },

  // ── MISSING ───────────────────────────────────────────────────────────────
  { id:'MS_AF1', field_key:'district',         field_type:'AUTO_FILL', record_type:'MISSING',  label_en:'District (Auto-filled)',       section:'system_fields',            sort_order:-3 },
  { id:'MS_AF2', field_key:'policeStation',    field_type:'AUTO_FILL', record_type:'MISSING',  label_en:'Police Station (Auto-filled)', section:'system_fields',            sort_order:-2 },
  { id:'MS_0', field_key:'uid',                field_type:'SYSTEM',   record_type:'MISSING',  label_en:'System UID (Auto-assigned)',   section:'system_fields',            sort_order:-1 },
  { id:'MS_1', field_key:'dd_no',               field_type:'TEXT',     record_type:'MISSING', label_en:'DD Number',                section:'general_info',         sort_order:1  },
  { id:'MS_2', field_key:'dd_date',             field_type:'DATE',     record_type:'MISSING', label_en:'DD Date',                  section:'general_info',         sort_order:2  },
  { id:'MS_23',field_key:'missing_type',        field_type:'SELECT',   record_type:'MISSING', label_en:'Missing / Found Type',     section:'general_info',         sort_order:3  },
  { id:'MS_24',field_key:'pcr_call_flag',       field_type:'BOOLEAN',  record_type:'MISSING', label_en:'PCR Call (Y/N)',           section:'general_info',         sort_order:4  },
  { id:'MS_25',field_key:'operator_name',       field_type:'TEXT',     record_type:'MISSING', label_en:'Operator Name (MPS sent)', section:'general_info',         sort_order:5  },
  { id:'MS_3', field_key:'missing_name',        field_type:'TEXT',     record_type:'MISSING', label_en:'Name of Missing Person',   section:'person_details',       sort_order:3  },
  { id:'MS_4', field_key:'age',                 field_type:'NUMBER',   record_type:'MISSING', label_en:'Age',                      section:'person_details',       sort_order:4  },
  { id:'MS_5', field_key:'gender',              field_type:'SELECT',   record_type:'MISSING', label_en:'Gender',                   section:'person_details',       sort_order:5  },
  { id:'MS_6', field_key:'major_minor',         field_type:'RADIO',    record_type:'MISSING', label_en:'Major / Minor',            section:'person_details',       sort_order:6  },
  { id:'MS_15',field_key:'mp_address',          field_type:'TEXT',     record_type:'MISSING', label_en:'Address of Missing Person', section:'person_details',      sort_order:15 },
  { id:'MS_7', field_key:'missing_date',        field_type:'DATE',     record_type:'MISSING', label_en:'Date Missing Since',       section:'location_particulars', sort_order:7  },
  { id:'MS_8', field_key:'missing_place',       field_type:'TEXT',     record_type:'MISSING', label_en:'Last Seen Place',          section:'location_particulars', sort_order:8  },
  { id:'MS_9', field_key:'physical_description',field_type:'TEXTAREA', record_type:'MISSING', label_en:'Physical Description',     section:'physical_description', sort_order:0  },
  { id:'MS_16',field_key:'height',              field_type:'TEXT',     record_type:'MISSING', label_en:'Height',                   section:'physical_description', sort_order:16 },
  { id:'MS_17',field_key:'built',               field_type:'TEXT',     record_type:'MISSING', label_en:'Built',                    section:'physical_description', sort_order:17 },
  { id:'MS_18',field_key:'complexion',          field_type:'TEXT',     record_type:'MISSING', label_en:'Complexion',               section:'physical_description', sort_order:18 },
  { id:'MS_27',field_key:'upper_dress_color',   field_type:'TEXT',     record_type:'MISSING', label_en:'Upper Dress Color',        section:'physical_description', sort_order:19 },
  { id:'MS_28',field_key:'lower_dress_color',   field_type:'TEXT',     record_type:'MISSING', label_en:'Lower Dress Color',        section:'physical_description', sort_order:20 },
  { id:'MS_19',field_key:'mental_state',        field_type:'TEXT',     record_type:'MISSING', label_en:'Mental State',             section:'physical_description', sort_order:19 },
  { id:'MS_20',field_key:'face',                field_type:'TEXT',     record_type:'MISSING', label_en:'Face',                     section:'physical_description', sort_order:20 },
  { id:'MS_21',field_key:'hair',                field_type:'TEXT',     record_type:'MISSING', label_en:'Hair',                     section:'physical_description', sort_order:21 },
  { id:'MS_22',field_key:'moustache',           field_type:'TEXT',     record_type:'MISSING', label_en:'Moustache',                section:'physical_description', sort_order:22 },
  { id:'MS_26',field_key:'beard',               field_type:'TEXT',     record_type:'MISSING', label_en:'Beard',                    section:'physical_description', sort_order:23 },
  { id:'MS_10',field_key:'informant_name',      field_type:'TEXT',     record_type:'MISSING', label_en:'Informant Name',           section:'contacts_assigned',    sort_order:10 },
  { id:'MS_11',field_key:'informant_mobile',    field_type:'NUMBER',     record_type:'MISSING', label_en:'Informant Mobile',         section:'contacts_assigned',    sort_order:11 },
  { id:'MS_12',field_key:'io_name',             field_type:'TEXT',     record_type:'MISSING', label_en:'Assigned IO',              section:'contacts_assigned',    sort_order:12 },
  { id:'MS_13',field_key:'zipnet_no',           field_type:'ALPHANUMERIC',     record_type:'MISSING', label_en:'ZIPNET No.',               section:'contacts_assigned',    sort_order:13 },
  { id:'MS_14',field_key:'status',              field_type:'SELECT',   record_type:'MISSING', label_en:'Current Status',           section:'contacts_assigned',    sort_order:14 },

  // ── UIDB ──────────────────────────────────────────────────────────────────
  { id:'U_AF1', field_key:'district',          field_type:'AUTO_FILL', record_type:'UIDB',    label_en:'District (Auto-filled)',       section:'system_fields',            sort_order:-3 },
  { id:'U_AF2', field_key:'policeStation',     field_type:'AUTO_FILL', record_type:'UIDB',    label_en:'Police Station (Auto-filled)', section:'system_fields',            sort_order:-2 },
  { id:'U_0',  field_key:'uid',                field_type:'SYSTEM',   record_type:'UIDB',     label_en:'System UID (Auto-assigned)',   section:'system_fields',            sort_order:-1 },
  { id:'U_0B', field_key:'uidb_gazette_no',    field_type:'TEXT',     record_type:'UIDB',     label_en:'UIDB Gazette Number (Manual)',section:'general_info',             sort_order:0  },
  { id:'U_1',  field_key:'dd_no',               field_type:'TEXT',     record_type:'UIDB', label_en:'DD Number',                  section:'general_info',     sort_order:1  },
  { id:'U_14', field_key:'dd_date',             field_type:'DATE',     record_type:'UIDB', label_en:'DD Date',                    section:'general_info',     sort_order:2  },
  { id:'U_15', field_key:'inquest_sections',    field_type:'TEXT',     record_type:'UIDB', label_en:'Under Section (If inquest)', section:'general_info',     sort_order:3  },
  { id:'U_2',  field_key:'found_date',          field_type:'DATE',     record_type:'UIDB', label_en:'Date Body Found',            section:'discovery_details', sort_order:2  },
  { id:'U_3',  field_key:'found_place',         field_type:'TEXT',     record_type:'UIDB', label_en:'Place Body Found',           section:'discovery_details', sort_order:3  },
  { id:'U_16', field_key:'deceased_name',       field_type:'TEXT',     record_type:'UIDB', label_en:'Name of Deceased',           section:'corpse_desc',       sort_order:1  },
  { id:'U_17', field_key:'deceased_address',    field_type:'TEXT',     record_type:'UIDB', label_en:'Address of Deceased',        section:'corpse_desc',       sort_order:2  },
  { id:'U_4',  field_key:'gender',              field_type:'SELECT',   record_type:'UIDB', label_en:'Apparent Gender',            section:'corpse_desc',       sort_order:4  },
  { id:'U_5',  field_key:'approx_age',          field_type:'TEXT',     record_type:'UIDB', label_en:'Approximate Age',            section:'corpse_desc',       sort_order:5  },
  { id:'U_6',  field_key:'description',         field_type:'TEXTAREA', record_type:'UIDB', label_en:'Physical Description',       section:'corpse_desc',       sort_order:6  },
  { id:'U_18', field_key:'height',              field_type:'TEXT',     record_type:'UIDB', label_en:'Height',                     section:'physical_description', sort_order:1 },
  { id:'U_19', field_key:'built',               field_type:'TEXT',     record_type:'UIDB', label_en:'Built',                      section:'physical_description', sort_order:2 },
  { id:'U_20', field_key:'complexion',          field_type:'TEXT',     record_type:'UIDB', label_en:'Complexion',                 section:'physical_description', sort_order:3 },
  { id:'U_21', field_key:'face',                field_type:'TEXT',     record_type:'UIDB', label_en:'Face',                       section:'physical_description', sort_order:4 },
  { id:'U_22', field_key:'hair',                field_type:'TEXT',     record_type:'UIDB', label_en:'Hair',                       section:'physical_description', sort_order:5 },
  { id:'U_23', field_key:'beard',               field_type:'TEXT',     record_type:'UIDB', label_en:'Beard',                      section:'physical_description', sort_order:6 },
  { id:'U_24', field_key:'moustache',           field_type:'TEXT',     record_type:'UIDB', label_en:'Moustache',                  section:'physical_description', sort_order:7 },
  { id:'U_25', field_key:'upper_dress_color',   field_type:'TEXT',     record_type:'UIDB', label_en:'Upper Dress Color',          section:'physical_description', sort_order:8 },
  { id:'U_26', field_key:'lower_dress_color',   field_type:'TEXT',     record_type:'UIDB', label_en:'Lower Dress Color',          section:'physical_description', sort_order:9 },
  { id:'U_7',  field_key:'io_name',             field_type:'TEXT',     record_type:'UIDB', label_en:'Assigned IO',                section:'officer_informant',    sort_order:7  },
  { id:'U_27', field_key:'io_mobile',           field_type:'NUMBER',     record_type:'UIDB', label_en:'IO Contact No.',             section:'officer_informant',    sort_order:7  },
  { id:'U_8',  field_key:'informant_name',      field_type:'TEXT',     record_type:'UIDB', label_en:'Informant Name',             section:'officer_informant',    sort_order:8  },
  { id:'U_9',  field_key:'zipnet_no',           field_type:'ALPHANUMERIC',     record_type:'UIDB', label_en:'ZIPNET No.',                 section:'zipnet_status',        sort_order:9  },
  { id:'U_10', field_key:'identified',          field_type:'BOOLEAN',  record_type:'UIDB', label_en:'Body Identified',            section:'zipnet_status',        sort_order:10 },
  { id:'U_11', field_key:'status',              field_type:'TEXT',     record_type:'UIDB', label_en:'Current Status / Mortuary',  section:'zipnet_status',        sort_order:11 },
  { id:'U_12', field_key:'cause',               field_type:'TEXT',     record_type:'UIDB', label_en:'Cause',                      section:'uidb_details',         sort_order:12 },
  { id:'U_13', field_key:'uidb_physical_desc',  field_type:'TEXTAREA', record_type:'UIDB', label_en:'Physical Description (ACP)', section:'uidb_details',         sort_order:13 },
  { id:'U_28', field_key:'filed_by_acp_sdm_date', field_type:'DATE',  record_type:'UIDB', label_en:'Date Filed by ACP/SDM',      section:'uidb_details',         sort_order:13 },
];

// ── Nicely format section key → display label ─────────────────────────────────
function sectionLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Write a simple vertical table sheet (users / templates) ──────────────────
function writeTableSheet(wb, sheetName, cols, rows, palKey) {
  const pal = PAL[palKey];
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

  // Header row
  const hdr = ws.addRow(cols.map(c => c.header));
  hdr.height = 22;
  hdr.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: pal.header } };
    cell.font   = { bold: true, color: { argb: pal.text }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    border(cell);
  });

  // Data rows
  rows.forEach((row, i) => {
    const r = ws.addRow(cols.map(c => row[c.key] ?? ''));
    r.height = 18;
    const bg = i % 2 === 0 ? 'FFFFFFFF' : pal.alt;
    r.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.font = { size: 10 };
      border(cell, 'hair');
    });
  });
}

// ── Write a horizontal field-registry sheet ───────────────────────────────────
function writeFieldSheet(wb, sheetName, recordType, palKey) {
  const pal = PAL[palKey];
  const ws = wb.addWorksheet(sheetName);

  const fields = ALL_FIELDS
    .filter(f => f.record_type === recordType)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Group fields by section (preserve insertion order)
  const sections = {};
  fields.forEach(f => {
    if (!sections[f.section]) sections[f.section] = [];
    sections[f.section].push(f);
  });

  // ── Row 1: Title banner ──────────────────────────────────────────────────
  const totalCols = fields.length + 1; // +1 for the row-label column
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${sheetName}  —  field_registry fields stored inside records.data JSONB  (${fields.length} fields)`;
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: pal.section } };
  titleCell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  // ── Row 2: Section headers (merged per section) ──────────────────────────
  let col = 2; // column B onward (column A = row labels)
  const sectionStartCols = {};
  Object.entries(sections).forEach(([sec, flds]) => {
    sectionStartCols[sec] = col;
    const endCol = col + flds.length - 1;
    if (flds.length > 1) ws.mergeCells(2, col, 2, endCol);
    const cell = ws.getCell(2, col);
    cell.value = sectionLabel(sec);
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: pal.section } };
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    border(cell);
    col += flds.length;
  });
  // Row-label cell for row 2
  const secLabelCell = ws.getCell(2, 1);
  secLabelCell.value = 'SECTION →';
  secLabelCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: pal.section } };
  secLabelCell.font  = { bold: true, italic: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  secLabelCell.alignment = { vertical: 'middle', horizontal: 'center' };
  border(secLabelCell);
  ws.getRow(2).height = 28;

  // ── Row 3: Field label EN ────────────────────────────────────────────────
  const labelRow = [{ label: '📋 Field Label (EN)', bold: true, bg: pal.header, fg: pal.text }];
  fields.forEach(f => labelRow.push({ label: f.label_en, bold: false, bg: pal.header, fg: pal.text }));
  writeMetaRow(ws, 3, labelRow, 20);

  // ── Row 4: field_key ────────────────────────────────────────────────────
  const keyRow = [{ label: '🔑 field_key  (JSONB key)', bold: true, bg: 'FFE8EAF6', fg: 'FF1A237E' }];
  fields.forEach(f => keyRow.push({ label: f.field_key, bold: true, bg: 'FFE8EAF6', fg: 'FF1A237E', mono: true }));
  writeMetaRow(ws, 4, keyRow, 18);

  // ── Row 5: field_type ───────────────────────────────────────────────────
  const typeRow = [{ label: '🏷 field_type', bold: true, bg: 'FFF5F5F5', fg: '333333' }];
  fields.forEach(f => {
    const bg = TYPE_COLORS[f.field_type] ?? 'FFFFFFFF';
    typeRow.push({ label: f.field_type, bold: false, bg, fg: '222222' });
  });
  writeMetaRow(ws, 5, typeRow, 18);

  // ── Row 6: ID (registry id) ─────────────────────────────────────────────
  const idRow = [{ label: '🆔 Registry ID', bold: true, bg: 'FFF5F5F5', fg: '555555' }];
  fields.forEach(f => idRow.push({ label: f.id, bold: false, bg: 'FFF5F5F5', fg: '555555', italic: true }));
  writeMetaRow(ws, 6, idRow, 16);

  ws.getRow(6).height = 15;

  // ── Rows 7–12: blank sample data rows ───────────────────────────────────
  const sampleBg = ['FFFFFFFF', 'FFF9FBE7'];
  for (let r = 7; r <= 12; r++) {
    const sampleLabelCell = ws.getCell(r, 1);
    sampleLabelCell.value = `Record ${r - 6}`;
    sampleLabelCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    sampleLabelCell.font  = { bold: true, color: { argb: '555555' }, size: 9, italic: true };
    sampleLabelCell.alignment = { vertical: 'middle', horizontal: 'center' };
    border(sampleLabelCell, 'hair');

    for (let c = 2; c <= totalCols; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sampleBg[r % 2] } };
      border(cell, 'hair');
      cell.font = { size: 9, color: { argb: 'FFBDBDBD' } };
      cell.value = '';
    }
    ws.getRow(r).height = 18;
  }

  // ── Column A (row labels) ────────────────────────────────────────────────
  ws.getColumn(1).width = 26;

  // ── Column widths for field columns ─────────────────────────────────────
  let ci = 2;
  fields.forEach(f => {
    ws.getColumn(ci).width = Math.max(14, Math.min(f.label_en.length + 2, 28));
    ci++;
  });

  // ── Freeze top 6 rows ───────────────────────────────────────────────────
  ws.views = [{ state: 'frozen', ySplit: 6, xSplit: 1 }];
}

function writeMetaRow(ws, rowNum, cells, height = 18) {
  const row = ws.getRow(rowNum);
  row.height = height;
  cells.forEach((c, i) => {
    const cell = ws.getCell(rowNum, i + 1);
    cell.value = c.label;
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.bg } };
    cell.font  = {
      bold: c.bold ?? false,
      italic: c.italic ?? false,
      color: { argb: c.fg ?? '000000' },
      size: c.mono ? 9 : 10,
      name: c.mono ? 'Courier New' : 'Calibri',
    };
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'right' : 'center', wrapText: true };
    border(cell, 'hair');
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PHAROS — generate-field-excel.js';
  wb.created = new Date();
  wb.title = 'PHAROS Field Registry';

  // Table-view sheets
  writeTableSheet(wb, 'Users',             USER_COLS, USERS,     'USERS');
  writeTableSheet(wb, 'Report Templates',  TMPL_COLS, TEMPLATES, 'TEMPLATES');

  // Horizontal field sheets
  writeFieldSheet(wb, 'CASE (FIR)',  'CASE',     'CASE');
  writeFieldSheet(wb, 'ARREST',      'ARREST',   'ARREST');
  writeFieldSheet(wb, 'PCR_CALL',    'PCR_CALL', 'PCR_CALL');
  writeFieldSheet(wb, 'MISSING',     'MISSING',  'MISSING');
  writeFieldSheet(wb, 'UIDB',        'UIDB',     'UIDB');

  const outPath = path.join(__dirname, '..', '..', 'PHAROS-Fields.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅  Written → ${outPath}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
