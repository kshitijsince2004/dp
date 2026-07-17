import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import db from '../../config/db.js';
import { logger } from '../../utils/logger.js';
import {
  CASE_SHEETS_CONFIG,
  ARREST_SHEETS_CONFIG,
  STATE_OPTS,
  caseGeneralFields,
  caseVictimFields,
  caseActSectionFields,
  caseAccusedFields,
  casePropertyFields,
  arrestGeneralFields,
  arrestActSectionFields,
  arrestPersonFields,
  arrestPropertyFields,
  NAMED_RANGE_FIELD_KEYS,
  INDIRECT_CASCADE_FIELDS,
  NR_PREFIX,
} from './import-fields.config.js';
import { autoIncludedRegistryFields, normalizeRegistryRow } from './registry-sync.util.js';
import { DISTRICTS_BY_STATE, ALL_INDIA_DISTRICTS } from '../../config/geoData.js';
import * as fieldsService from '../fields/fields.service.js';
import { ACT_GROUP_CODES, MINOR_HEAD_MAJOR_CODES } from '../fields/classificationSources.config.js';
import DataValidationsXform from 'exceljs/lib/xlsx/xform/sheet/data-validations-xform.js';
import exceljsUtils from 'exceljs/lib/utils/utils.js';

// ── ExcelJS data-validation optimiser patch (ExcelJS 3.10.0) ──────────────────────────────
// ExcelJS writes one <dataValidation> per cell, then merges alike cells into rectangular
// ranges. Its stock optimiser (optimiseDataValidations) has two problems for our per-cell
// cascade writes:
//   1. It sorts cell addresses as TEXT, so "B10" sorts before "B5". Combined with a downward
//      merge that does NOT skip already-merged cells, a fully-identical column (e.g. the Act
//      column, every row = OPT_ACTS_LIST) gets emitted as OVERLAPPING ranges — we observed
//      "B5:B500" and "B10:B500" both written. Overlapping data-validation ranges are an
//      invalid-content defect: desktop Excel silently repairs it (dropping validations on
//      some builds), and Excel-online / LibreOffice strip them outright → empty dropdowns.
//   2. The per-row cascade formulas ($B5, $B6, …) never merge, leaving ~1,500 single-cell
//      validations that bloat the file and slow load.
// This patched optimiser sorts NUMERICALLY (column-major, then row) and makes both the
// downward and rightward growth skip cells that were already claimed, so every run collapses
// into exactly one non-overlapping range. It is otherwise a faithful re-implementation of the
// stock algorithm, so the emitted sqref/formulae are identical in shape to what Excel itself
// produces on save.
function patchedOptimiseDataValidations(model) {
  const parse = (address) => {
    const m = /^([A-Z]+)(\d+)$/.exec(address);
    if (!m) return null;
    let col = 0;
    for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
    return { col, row: parseInt(m[2], 10) };
  };
  const encode = (col, row) => {
    let s = '';
    let n = col;
    while (n > 0) { const t = (n - 1) % 26; s = String.fromCharCode(t + 65) + s; n = (n - t - 1) / 26; }
    return `${s}${row}`;
  };
  const deepEqual = (a, b) => {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  };

  const cells = [];
  for (const address of Object.keys(model)) {
    const pos = parse(address);
    if (!pos) continue; // ignore any pre-existing range keys — nothing in our model uses them
    cells.push({ address, col: pos.col, row: pos.row, dv: model[address], marked: false });
  }
  const byAddr = {};
  cells.forEach((c) => { byAddr[c.address] = c; });
  cells.sort((a, b) => a.col - b.col || a.row - b.row);

  const alive = (col, row) => {
    const c = byAddr[encode(col, row)];
    return c && !c.marked ? c : null;
  };

  const out = [];
  for (const cell of cells) {
    if (cell.marked) continue;
    // grow downward through unclaimed, identical cells
    let height = 1;
    while (true) {
      const n = alive(cell.col, cell.row + height);
      if (n && deepEqual(n.dv, cell.dv)) height++;
      else break;
    }
    // grow rightward only while every cell of the current height matches and is unclaimed
    let width = 1;
    while (true) {
      let ok = true;
      for (let i = 0; i < height; i++) {
        const n = alive(cell.col + width, cell.row + i);
        if (!n || !deepEqual(n.dv, cell.dv)) { ok = false; break; }
      }
      if (ok) width++; else break;
    }
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const n = byAddr[encode(cell.col + j, cell.row + i)];
        if (n) n.marked = true;
      }
    }
    const sqref = (height > 1 || width > 1)
      ? `${cell.address}:${encode(cell.col + width - 1, cell.row + height - 1)}`
      : cell.address;
    out.push({ ...cell.dv, sqref });
  }
  return out;
}

// Replace the xform's render with one that uses the patched optimiser. Serialization below is
// a verbatim copy of ExcelJS 3.10.0's DataValidationsXform.render body.
DataValidationsXform.prototype.render = function render(xmlStream, model) {
  const optimizedModel = patchedOptimiseDataValidations(model);
  if (optimizedModel.length) {
    xmlStream.openNode('dataValidations', { count: optimizedModel.length });
    optimizedModel.forEach((value) => {
      xmlStream.openNode('dataValidation');
      if (value.type !== 'any') {
        xmlStream.addAttribute('type', value.type);
        if (value.operator && value.type !== 'list' && value.operator !== 'between') {
          xmlStream.addAttribute('operator', value.operator);
        }
        if (value.allowBlank) xmlStream.addAttribute('allowBlank', '1');
      }
      if (value.showInputMessage) xmlStream.addAttribute('showInputMessage', '1');
      if (value.promptTitle) xmlStream.addAttribute('promptTitle', value.promptTitle);
      if (value.prompt) xmlStream.addAttribute('prompt', value.prompt);
      if (value.showErrorMessage) xmlStream.addAttribute('showErrorMessage', '1');
      if (value.errorStyle) xmlStream.addAttribute('errorStyle', value.errorStyle);
      if (value.errorTitle) xmlStream.addAttribute('errorTitle', value.errorTitle);
      if (value.error) xmlStream.addAttribute('error', value.error);
      xmlStream.addAttribute('sqref', value.sqref);
      (value.formulae || []).forEach((formula, index) => {
        xmlStream.openNode(`formula${index + 1}`);
        if (value.type === 'date') xmlStream.writeText(exceljsUtils.dateToExcel(new Date(formula)));
        else xmlStream.writeText(formula);
        xmlStream.closeNode();
      });
      xmlStream.closeNode();
    });
    xmlStream.closeNode();
  }
};

function slugify(text) {
  return text.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
}

function colLetterToNum(letter) {
  let num = 0;
  for (let i = 0; i < letter.length; i++) {
    num = num * 26 + (letter.charCodeAt(i) - 64);
  }
  return num;
}

function numToColLetter(num) {
  let letter = "";
  while (num > 0) {
    let temp = (num - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    num = (num - temp - 1) / 26;
  }
  return letter;
}

function parseRange(rangeStr) {
  const [start, end] = rangeStr.split(':');
  const startColLetter = start.match(/[A-Z]+/)[0];
  const startRow = parseInt(start.match(/\d+/)[0], 10);
  const endColLetter = end.match(/[A-Z]+/)[0];
  const endRow = parseInt(end.match(/\d+/)[0], 10);
  
  return {
    startCol: colLetterToNum(startColLetter),
    startRow,
    endCol: colLetterToNum(endColLetter),
    endRow
  };
}

// Maps backend field section to spreadsheet sheet and section label. Exported (FIX 7, 2026-07)
// so import.parse.js's roleForAutoField can consult the SAME authoritative mapping instead of
// only a best-effort heuristic guess at which sheet role an auto-included field lands on —
// adding this export changes NO emitted template bytes (nothing here writes to the workbook
// differently; template-regression.js's byte-parity gate is the proof, re-run after this
// change). Do not otherwise modify this map or its private usage below.
export const CASE_SECTION_MAP = {
  general_info: { sheet: 'General Information', label: 'General Information' },
  incident_details: { sheet: 'General Information', label: 'General Information' },
  investigation_officer: { sheet: 'General Information', label: 'IO Details' },
  investigation_details: { sheet: 'General Information', label: 'Action Taken' },
  occurrence_info: { sheet: 'General Information', label: 'Place of Occurrence Address' },
  occurrence_address: { sheet: 'General Information', label: 'Place of Occurrence Address' },
  complainant_personal_info: { sheet: 'General Information', label: 'Complainant Personal Details' },
  complainant_personal_details: { sheet: 'General Information', label: 'Complainant Personal Details' },
  complainant_address: { sheet: 'General Information', label: 'Complainant Present Address' },
  complainant_perm_address: { sheet: 'General Information', label: 'Complainant Permanent Address' },
  
  victim_personal_info: { sheet: 'Victim Information', label: 'Victim Personal Details' },
  victim_personal_details: { sheet: 'Victim Information', label: 'Victim Personal Details' },
  victim_address: { sheet: 'Victim Information', label: 'Victim Present Address' },
  victim_perm_address: { sheet: 'Victim Information', label: 'Victim Permanent Address' },
  
  act_section: { sheet: 'Act and Sections', label: 'Act and Sections' },
  offence_info: { sheet: 'Act and Sections', label: 'Act and Sections' },
  
  accused_personal_info: { sheet: 'Accused Detail', label: 'Accused Personal details' },
  accused_personal_details: { sheet: 'Accused Detail', label: 'Accused Personal details' },
  accused_address: { sheet: 'Accused Detail', label: 'Accused Present Address' },
  accused_perm_address: { sheet: 'Accused Detail', label: 'Accused Permanent Address' },
  
  property_details: { sheet: 'Property Details', label: 'Property Details' },
  stolen_property: { sheet: 'Property Details', label: 'Property Details' },
  recovered_property: { sheet: 'Property Details', label: 'Property Details' }
};

export const ARREST_SECTION_MAP = {
  general_info: { sheet: 'General Info', label: 'General Information' },
  incident_details: { sheet: 'General Info', label: 'General Information' },
  arrest_details: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  arrested_info: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  arrestee_info: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  investigation_officer: { sheet: 'General Info', label: 'IO Details' },
  
  act_section: { sheet: 'Act and Sections', label: 'Act and Sections' },
  offence_info: { sheet: 'Act and Sections', label: 'Act and Sections' },
  
  arrested_personal_info: { sheet: 'Person Arrested Detail', label: 'Arrested Person Personal Details' },
  arrested_address: { sheet: 'Person Arrested Detail', label: 'Arrested Person Present Address' },
  arrested_perm_address: { sheet: 'Person Arrested Detail', label: 'Arrested Person Permanent Address' },
  custody_status: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  special_scheme: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  procedure_slips: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  verification_kin_details: { sheet: 'Person Arrested Detail', label: 'Particular Details' },
  
  property_details: { sheet: 'Property Details', label: 'Property Details' },
  stolen_property: { sheet: 'Property Details', label: 'Property Details' },
  recovered_property: { sheet: 'Property Details', label: 'Property Details' }
};

// Generates validation hints
const getHint = (field) => {
  const reqStr = field.validation_rules?.required ? '[Required] ' : '';
  if (field.field_type === 'SELECT' || field.field_type === 'RADIO') {
    let options = [];
    try {
      options = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
    } catch (e) {}
    const optList = Array.isArray(options) ? options.map(o => (o && typeof o === 'object') ? o.value : o).join(', ') : '';
    return `${reqStr}select: ${optList}`;
  }
  if (field.field_type === 'DATE') {
    return `${reqStr}date (dd-mm-yyyy)`;
  }
  if (field.field_type === 'TIME') {
    return `${reqStr}time (HH:MM)`;
  }
  if (field.field_type === 'NUMBER') {
    return `${reqStr}number`;
  }
  return `${reqStr}${field.field_type.toLowerCase()}`;
};

// Deterministic mapping of a hidden field-key (Row 1) to its section-header label.
// Used to rebuild the Row-2 section headers cleanly after all column insert/delete ops,
// because insert/delete corrupt the stored merge ranges (ExcelJS model.merges is unreliable).
// Returns null to mean "carry forward the previous column's section" (used for temporal
// fields, label-only columns, and anything that belongs with the block before it).
const ADDR_TOKENS = ['house_no', 'street', 'colony', 'city_town_village', 'tehsil_block_mandal', 'country', 'state', 'district', 'police_station', 'pincode', 'present_address', 'landmark'];
const PARTICULAR_KEYS = new Set(['nafis_prepared', 'dossier_prepared', 'prev_involvement', 'previous_involvement', 'bad_character', 'proclaimed_offender', 'verifying_officer_name', 'verifying_officer_rank', 'status', 'scheme_of_arrest', 'search_slip_prepared', 'address_verified', 'kin_name', 'kin_mobile', 'kin_relationship', 'photo_path', 'arresting_officer', 'arresting_officer_mobile', 'listed_criminal']);

const sectionLabelForKey = (key, recordType, isParentSheet) => {
  if (!key) return null; // carry forward (label-only column)

  // "Is Permanent Address same as Present?" toggle is keyed complainant_perm_same on every
  // person sheet — carry forward so it doesn't leak a "Complainant" label onto victim/accused.
  if (key.endsWith('_perm_same')) return null;

  if (key === 'fir_no' || key === 'linked_fir_dd_no') {
    return isParentSheet ? 'General Information' : 'Case Reference';
  }

  if (key === 'act' || key === 'sections') return 'Act and Sections';
  if (['case_status', 'disposal_type', 'rc_no'].includes(key)) return 'Action Taken';
  if (key === 'crime_head') return 'Major / Minor Head';

  for (const [prefix, label] of [['complainant', 'Complainant'], ['victim', 'Victim'], ['accused', 'Accused'], ['arrested', 'Arrested Person']]) {
    if (key.startsWith(prefix + '_')) {
      if (key.startsWith(prefix + '_perm')) return `${label} Permanent Address`;
      const rest = key.slice(prefix.length + 1);
      if (ADDR_TOKENS.some(t => rest === t) || rest.includes('address')) return `${label} Present Address`;
      return `${label} Personal Details`;
    }
  }

  if (key.startsWith('occurrence_')) {
    const rest = key.slice('occurrence_'.length);
    if (ADDR_TOKENS.some(t => rest === t)) return 'Place of Occurrence Address';
    // occurrence_date/time/place → stay in General Information
    if (isParentSheet) return recordType === 'CASE' ? 'General Information' : 'General Info';
    return null;
  }

  if (key.startsWith('io_')) return 'IO Details';

  if (['date_of_arrest', 'time_of_arrest', 'arrest_date', 'arrest_place', 'arrest_street', 'arrest_colony', 'arrest_district', 'arrest_landmark'].includes(key)) {
    if (['ARREST', 'KALANDRA'].includes(recordType)) {
      return isParentSheet ? 'Arrest Details' : 'Arrest Detail';
    }
    if (isParentSheet) return recordType === 'CASE' ? 'General Information' : 'General Info';
    return null;
  }

  if (key.startsWith('property_') || key.startsWith('phone_')) return 'Property Details';

  if (PARTICULAR_KEYS.has(key)) return 'Particular Details';

  if (isParentSheet) {
    return recordType === 'CASE' ? 'General Information' : 'General Info';
  }
  return null;
};

// ────────────────────────────────────────────────────────────────────────────────────────
// Live-lookup helpers — called by buildTemplate() to fetch all option lists from DB.
// Returns a map: fieldKey → [{value, label}] for every SELECT field that has DB-driven options.
// Also returns _propItemsByCategory (categoryLabel → [{value,label}]) and _propCategoryLabels.
// ────────────────────────────────────────────────────────────────────────────────────────
async function buildLiveLookups(recordType) {
  // Mirrors the option-precompute block in fields.controller.js/getFieldsForForm.
  // Using the same fieldsService.* calls ensures the Excel template shows
  // exactly the same options as the interactive form.
  const toOpt = (labelCol) => (r) => ({ value: r[labelCol], label: r[labelCol] });

  // Get all Acts and group Sections per Act dynamically
  const allActs = await fieldsService.getActs();

  // The interactive form (fields.controller.js getFieldsForForm) appends these fallback
  // acts on top of excel_acts — the new criminal codes and the catch-all. Mirror that here
  // so the Act dropdown offers everything the form does. act_cd: null → they simply have
  // no sections mapping (the dependent Sections cell stays free-text, same as other
  // section-less acts).
  const FALLBACK_ACTS = ['Other Act'];
  const knownActNames = new Set(allActs.map(a => String(a.act_long).trim().toLowerCase()));
  for (const name of FALLBACK_ACTS) {
    if (!knownActNames.has(name.toLowerCase())) {
      allActs.push({ act_cd: null, act_long: name });
    }
  }
  const dbSections = await db('ref.sections')
    .select('act_sec_cd', 'section')
    .distinct()
    .orderBy('section', 'asc');

  const sectionsByActCd = {};
  for (const row of dbSections) {
    if (!row.act_sec_cd) continue;
    const cd = String(row.act_sec_cd);
    if (!sectionsByActCd[cd]) {
      sectionsByActCd[cd] = [];
    }
    sectionsByActCd[cd].push({ value: row.section, label: row.section });
  }

  // Sections per act group
  const ipcSections       = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES.IPC)).map(toOpt('section'));
  const exciseSections    = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Delhi Excise Act'])).map(toOpt('section'));
  const armsSections      = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Arms Act'])).map(toOpt('section'));
  const gamblingSections  = (await fieldsService.getSectionsForActs(ACT_GROUP_CODES['Gambling Act'])).map(toOpt('section'));
  const allGroupCodes     = Object.values(ACT_GROUP_CODES).flat();
  const allSections       = (await fieldsService.getSectionsForActs(allGroupCodes)).map(toOpt('section'));

  // Major heads per act group
  const ipcMajorHeads     = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES.IPC)).map(toOpt('major_head'));
  const exciseMajorHeads  = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Delhi Excise Act'])).map(toOpt('major_head'));
  const armsMajorHeads    = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Arms Act'])).map(toOpt('major_head'));
  const gamblingMajorHeads = (await fieldsService.getMajorHeadsForActs(ACT_GROUP_CODES['Gambling Act'])).map(toOpt('major_head'));

  // Minor heads per crime-specific field_key (kept for any field_registry rows that still
  // reference these specific keys directly)
  const minorHeadsByKey = {};
  for (const [fk, codes] of Object.entries(MINOR_HEAD_MAJOR_CODES)) {
    const rows = await fieldsService.getMinorHeadsForMajorHeads(codes);
    minorHeadsByKey[fk] = rows.map(toOpt('minor_head'));
  }

  // Every major head's minor heads, DB-driven and not limited to the 6 hand-picked
  // crime types above — powers the generic INDIRECT() cascade on the minor_head column
  // (see createLookupsSheet / third pass in buildTemplate).
  const allMinorHeadRows = await fieldsService.getAllMinorHeadsByMajorHead();
  const minorHeadsByMajorLabel = {};
  for (const row of allMinorHeadRows) {
    if (!minorHeadsByMajorLabel[row.major_head]) minorHeadsByMajorLabel[row.major_head] = [];
    minorHeadsByMajorLabel[row.major_head].push({ value: row.minor_head, label: row.minor_head });
  }

  // Beats and local heads
  const beats      = (await fieldsService.getBeats()).map(toOpt('beat_name'));
  const localHeads = (await fieldsService.getLocalHeads()).map(toOpt('local_head'));

  // Districts and Police Stations (local hierarchy — used as fallback / all-districts list)
  const districts = await db('hierarchy_nodes')
    .where({ node_type: 'DISTRICT', is_active: true })
    .select('id as district_id', 'name as district_name')
    .orderBy('name', 'asc');
  const subDivs = await db('hierarchy_nodes')
    .where({ node_type: 'SUB_DIV', is_active: true })
    .select('id as subdiv_id', 'parent_id as district_id');
  const psRows = await db('hierarchy_nodes')
    .where({ node_type: 'PS', is_active: true })
    .select('name as ps_name', 'parent_id')
    .orderBy('name', 'asc');
  const districtOpts = districts.map(d => ({ value: d.district_name, label: d.district_name }));
  const psOpts = psRows.map(p => ({ value: p.ps_name, label: p.ps_name }));

  // PS grouped by district, for the district → police_station cascade (mirrors the
  // interactive form's DISTRICTS_AND_STATIONS filtering in FieldRenderer.jsx, but DB-driven).
  // PS hang off a SUB_DIVISION, which hangs off a DISTRICT — but a few (Crime Branch, EOW,
  // Special Cell, ...) attach straight to their DISTRICT node with no SUB_DIVISION in between.
  // Keyed by the exact district_name string used in districtOpts above, so the Excel
  // VLOOKUP key (the District cell's own dropdown value) always resolves.
  const subDivToDistrict = new Map(subDivs.map(s => [s.subdiv_id, s.district_id]));
  const districtIdToName = new Map(districts.map(d => [d.district_id, d.district_name]));
  const psByDistrict = {};
  for (const p of psRows) {
    const districtId = subDivToDistrict.get(p.parent_id) || (districtIdToName.has(p.parent_id) ? p.parent_id : null);
    const districtName = districtId ? districtIdToName.get(districtId) : null;
    if (!districtName) continue;
    if (!psByDistrict[districtName]) psByDistrict[districtName] = [];
    psByDistrict[districtName].push({ value: p.ps_name, label: p.ps_name });
  }
  for (const list of Object.values(psByDistrict)) list.sort((a, b) => a.label.localeCompare(b.label));
  // State→district cascade data (WP11): resurrected from the reviewed LGD snapshot
  // (config/ref-data/india_states_districts.json via geoData.js) — the old `state_districts`
  // table this cascade was originally built on died in the DB restructure; the snapshot is
  // its replacement. Shape matches what every consumer below already expects
  // ({state_name, district_name} pairs).
  const sdRows = Object.entries(DISTRICTS_BY_STATE).flatMap(([state_name, districts]) =>
    districts.map((district_name) => ({ state_name, district_name }))
  );

  // Build a case-insensitive normalization map from DB state name → STATE_OPTS display name.
  // This ensures the VLOOKUP key in the lookup table exactly matches what the user selects
  // from the state dropdown (which shows STATE_OPTS labels). Excel VLOOKUP is case-insensitive,
  // but spaces/punctuation differences (e.g. 'ANDHRA  PRADESH' vs 'Andhra Pradesh') would
  // still fail, so we normalize to the canonical STATE_OPTS string.
  const stateNormMap = {}; // normalized_key → STATE_OPTS display name
  const normalize = (s) => s.toUpperCase().replace(/\s+/g, ' ').trim();
  for (const opt of STATE_OPTS) {
    stateNormMap[normalize(opt)] = opt;
  }

  const districtsByState = {}; // STATE_OPTS display name → [district_name, ...]
  for (const r of sdRows) {
    const rawState = r.state_name.trim();
    // Map to the STATE_OPTS display name; fall back to the raw DB value if unmatched
    const displayState = stateNormMap[normalize(rawState)] || rawState;
    if (!districtsByState[displayState]) districtsByState[displayState] = [];
    districtsByState[displayState].push(r.district_name.trim());
  }

  // Property categories — use code_type as value/label (the human-readable category name)
  const propCategoryRows = await fieldsService.getPropertyCategories();
  const propCategories = propCategoryRows
    .map(c => ({ value: c.code_type, label: c.code_type, parent_cd: c.parent_cd }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Property items per category, for the INDIRECT cascade named ranges
  const propItemsByCategory = {};
  for (const cat of propCategories) {
    try {
      const raw = await fieldsService.getPropertyItemsForCategory(cat.parent_cd);
      let items = [];
      if (raw && raw.type === 'ARMS') {
        // Flatten arms: made names + all fire_arms names into one list
        items = [
          ...(raw.made || []).map(r => ({ value: r.arms_made, label: r.arms_made })),
          ...(raw.fireArms || []).map(r => ({ value: r.fire_arms, label: r.fire_arms })),
        ];
      } else if (Array.isArray(raw) && raw.length > 0 && 'property_cd' in raw[0]) {
        // Default branch (excel_other_property_items) — raw {property_cd, property}
        items = raw.map(r => ({ value: r.property, label: r.property }));
      } else if (Array.isArray(raw)) {
        // GENERIC branches return {value: <numeric code>, label: <display name>} — the
        // Excel cell must show (and store) the NAME, not the code, so use the label on
        // both sides. (Leaving the code as value made e.g. DRUGS/NARCOTIC DRUGS render
        // as 392/393/394… in the Type of property dropdown.)
        items = raw.map(r => {
          const name = (r && typeof r === 'object') ? (r.label ?? r.value) : r;
          return { value: name, label: name };
        });
      }
      propItemsByCategory[cat.label] = items;
    } catch (err) {
      logger.error(`buildLiveLookups: failed to fetch items for category ${cat.label}`, { err });
      propItemsByCategory[cat.label] = [];
    }
  }

  // Every section's major heads, act-aware. excel_major_minor_mapping keys rows by
  // (act_cd, composite "<act_cd>-<label>" section_code), and neither key is reliable
  // alone: labels drift in case/punctuation ("66f" vs "66F", "9A" vs "9-A"), ~120 rows'
  // act_cd disagrees with their composite's prefix, and some acts exist twice (IT Act:
  // 2625 with sections, 3293 without — mapping rows point at both). Resolve each row in
  // JS — exact composite match first, then normalized-label match under the composite's
  // prefix act, the row's act_cd, and finally same-named alias acts. The workbook cascade
  // looks up "<act_long>|<section label>" (see createLookupsSheet), so heads are scoped
  // per (act, section): sections sharing a label across acts no longer bleed heads into
  // each other. Pairs without a specific mapping fall back to the act-level union of
  // heads, then to the full major-head list, so the dropdown is never empty.
  const mappingRows = await db('ref.major_minor_mapping as m')
    .join('ref.major_heads as mh', 'm.major_head_code', 'mh.major_head_code')
    .select('m.act_cd', 'm.section_code', 'mh.major_head');
  const allSectionRows = await db('ref.sections')
    .select('section_code', 'act_sec_cd', 'section')
    .whereNotNull('act_sec_cd')
    .whereNotNull('section');

  const normLabel = (s) => String(s).toUpperCase().replace(/[^A-Z0-9()]/g, '');
  // Loose tier drops parentheses too: the mapping writes "66f" where the section sheet
  // has "66(F)". Only consulted when every strict candidate failed, because stripping
  // parens can collide ("12(1)" vs "121") — a strict match must always win.
  const normLabelLoose = (s) => normLabel(s).replace(/[()]/g, '');
  const SEP = '\u0000';

  // (act, normalized label) → canonical spellings; composite code → its (act, norm) key
  const labelsByActNorm = new Map();
  const labelsByActNormLoose = new Map();
  const compositeToActNorm = new Map();
  for (const r of allSectionRows) {
    const act = String(r.act_sec_cd);
    const key = act + SEP + normLabel(r.section);
    if (!labelsByActNorm.has(key)) labelsByActNorm.set(key, new Set());
    labelsByActNorm.get(key).add(r.section);
    const looseKey = act + SEP + normLabelLoose(r.section);
    if (!labelsByActNormLoose.has(looseKey)) labelsByActNormLoose.set(looseKey, new Set());
    labelsByActNormLoose.get(looseKey).add(r.section);
    if (r.section_code) compositeToActNorm.set(String(r.section_code).trim().toUpperCase(), key);
  }

  // Duplicate act rows: a mapping-referenced act with no sections of its own is aliased
  // (by normalized-name prefix) to same-named acts that DO have sections, e.g. 3293
  // "INFORMATION TECHNOLOGY (AMENDMENT) ACT 2008" → 2625 IT ACT 2000 / 3274.
  const actsWithSections = new Set(allSectionRows.map((r) => String(r.act_sec_cd)));
  const normActName = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^THE/, '');
  const actAliases = new Map();
  for (const a of allActs) {
    if (a.act_cd == null || actsWithSections.has(String(a.act_cd))) continue;
    const prefix = normActName(a.act_long).slice(0, 15);
    if (prefix.length < 10) continue;
    const aliases = allActs
      .filter((b) => b.act_cd != null && actsWithSections.has(String(b.act_cd)) &&
                     normActName(b.act_long).startsWith(prefix))
      .map((b) => String(b.act_cd));
    if (aliases.length > 0) actAliases.set(String(a.act_cd), aliases);
  }

  const majorHeadsByActSection = new Map(); // "<act><SEP><canonical label>" → [head labels]
  const actLevelHeadSets = new Map();       // act → Set(head labels)
  const addActHead = (act, head) => {
    if (!actLevelHeadSets.has(act)) actLevelHeadSets.set(act, new Set());
    actLevelHeadSets.get(act).add(head);
  };
  const attachTo = (index, actNormKey, head) => {
    const labels = index.get(actNormKey);
    if (!labels) return false;
    const act = actNormKey.slice(0, actNormKey.indexOf(SEP));
    for (const label of labels) {
      const k = act + SEP + label;
      if (!majorHeadsByActSection.has(k)) majorHeadsByActSection.set(k, []);
      const list = majorHeadsByActSection.get(k);
      if (!list.includes(head)) list.push(head);
    }
    addActHead(act, head);
    return true;
  };

  for (const m of mappingRows) {
    if (!m.section_code || !m.major_head) continue;
    const raw = String(m.section_code).trim();
    const code = raw.toUpperCase();
    const dash = raw.indexOf('-');
    const prefixAct = dash > 0 ? raw.slice(0, dash) : null;
    const rawLabel = dash >= 0 ? raw.slice(dash + 1) : raw;
    const rowAct = m.act_cd != null ? String(m.act_cd) : null;

    // Candidate acts in trust order: the composite's prefix, the row's act_cd, then
    // same-named alias acts of either.
    const candActs = [];
    for (const src of [prefixAct, rowAct]) {
      if (src && !candActs.includes(src)) candActs.push(src);
    }
    for (const src of [prefixAct, rowAct]) {
      for (const alias of (src && actAliases.get(src)) || []) {
        if (!candActs.includes(alias)) candActs.push(alias);
      }
    }

    let attached = false;
    const exact = compositeToActNorm.get(code);
    if (exact) {
      attached = attachTo(labelsByActNorm, exact, m.major_head);
    } else {
      for (const act of candActs) {
        if (attachTo(labelsByActNorm, act + SEP + normLabel(rawLabel), m.major_head)) { attached = true; break; }
      }
      if (!attached) {
        for (const act of candActs) {
          if (attachTo(labelsByActNormLoose, act + SEP + normLabelLoose(rawLabel), m.major_head)) { attached = true; break; }
        }
      }
    }
    if (!attached) {
      // Section missing from excel_sections under every spelling/alias (source-data
      // gap) — still count the head toward the act-level fallback list of every act
      // the row plausibly belongs to.
      for (const src of new Set([prefixAct, rowAct].filter(Boolean))) {
        for (const act of (actsWithSections.has(src) ? [src] : (actAliases.get(src) || []))) {
          addActHead(act, m.major_head);
        }
      }
    }
  }
  for (const list of majorHeadsByActSection.values()) list.sort((a, b) => a.localeCompare(b));
  const actLevelMajorHeads = new Map();
  for (const [act, set] of actLevelHeadSets) {
    actLevelMajorHeads.set(act, [...set].sort((a, b) => a.localeCompare(b)));
  }
  const allMajorHeadLabels = [...new Set(
    (await db('ref.major_heads').whereNotNull('major_head').orderBy('major_head', 'asc'))
      .map((r) => r.major_head)
  )];

  // Status options — record-type-specific (each template covers only one record type)
  const statusOptionsByType = {
    CASE:  ['CHARGE SHEET', 'POLICE INVESTIGATION REPORT(PIR-JCL)', 'UNTRACED', 'PENDING',
             'CANCELLATION', 'QUASHED', 'CLOSURE REPORT', 'RELEASED U/S 189 BNSS', 'TRANSFER'],
    // Union of the interactive form's custody-status values (fields.controller.js status
    // dispatch: against_fir list + non-FIR list) — the template is one flat column, so it
    // must accept every value the form can store.
    ARREST: ['JC', 'PC', 'Bail', 'Bound Down', 'Release', 'Lockup', '35(3) BNS Notice', 'Fine'],
  };
  const statusOpts = (statusOptionsByType[recordType] || []).map(v => ({ value: v, label: v }));

  return {
    ipc_sections:                ipcSections,
    excise_sections:             exciseSections,
    arms_sections:               armsSections,
    gambling_sections:           gamblingSections,
    sections:                    allSections,
    ipc_major_head:              ipcMajorHeads,
    excise_major_head:           exciseMajorHeads,
    arms_major_head:             armsMajorHeads,
    gambling_major_head:         gamblingMajorHeads,
    ...minorHeadsByKey,
    beat_no:                     beats,
    local_head:                  localHeads,
    crime_head:                  localHeads, // same source as local_head
    property_major_category:     propCategories,
    property_minor_category:     [], // options are per-category; handled via INDIRECT cascade
    status:                      statusOpts,
    district:                    districtOpts,
    police_station:              psOpts,
    // Private fields consumed by createLookupsSheet
    _psByDistrict:               psByDistrict,
    _propItemsByCategory:        propItemsByCategory,
    _propCategoryLabels:         propCategories.map(c => c.label),
    _minorHeadsByMajorLabel:     minorHeadsByMajorLabel,
    _minorHeadMajorLabels:       Object.keys(minorHeadsByMajorLabel),
    _majorHeadsByActSection:     majorHeadsByActSection,
    _actLevelMajorHeads:         actLevelMajorHeads,
    _allMajorHeadLabels:         allMajorHeadLabels,
    _allActs:                    allActs,
    _sectionsByActCd:            sectionsByActCd,
    // State-wise district cascade
    _districtsByState:           districtsByState,
    _stateNames:                 Object.keys(districtsByState),
  };
}

// ────────────────────────────────────────────────────────────────────────────────────────
// Creates a veryHidden _Lookups worksheet and registers named ranges in the workbook
// for every option list that is too long for an inline formula.
// ExcelJS 3.10 API (verified): definedNames.add(rangeRef, namedRangeName) — range first.
// Returns: { namedRangeMap: {fieldKey → namedRangeName}, slugToNR: {categorySlug → namedRangeName} }
// ────────────────────────────────────────────────────────────────────────────────────────
function createLookupsSheet(workbook, liveLookups, { preserveExisting = false } = {}) {
  // preserveExisting: append after any columns already on _Lookups instead of rebuilding it.
  // Required for the UIDB/MISSING flow, where addSheetToWorkbook has already written long
  // option lists (states, districts…) to _Lookups and referenced them by DIRECT cell range —
  // removing the sheet here would leave those dropdowns pointing at whatever list lands in
  // the same column of the rebuilt sheet (observed: Deceased State showing IPC sections).
  let ws = workbook.getWorksheet('_Lookups');
  if (ws && !preserveExisting) {
    workbook.removeWorksheet(ws.id);
    ws = null;
  }
  if (!ws) ws = workbook.addWorksheet('_Lookups');
  try { ws.state = 'veryHidden'; } catch (_) { ws.state = 'hidden'; }

  const namedRangeMap = {};  // fieldKey → named range name
  const slugToNR = {};       // category label slug → named range name (for INDIRECT formula)
  let col = 1;
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, c) => {
    if (cell.value !== null && cell.value !== undefined && cell.value !== '') col = Math.max(col, c + 1);
  });

  // Writes one option list to the _Lookups sheet and registers a named range.
  // nrName: the exact name to register (must match what INDIRECT() will reference).
  function writeList(fieldKey, options, nrName) {
    if (!options || options.length === 0) return;
    const values = options.map(o => (o && typeof o === 'object' ? o.value : String(o)));
    // Row 1: header label (= named range name, for human readers viewing the sheet)
    ws.getCell(1, col).value = nrName;
    values.forEach((v, i) => { ws.getCell(i + 2, col).value = v; });
    const colLetter = numToColLetter(col);
    const rangeRef  = `'_Lookups'!$${colLetter}$2:$${colLetter}$${values.length + 1}`;
    try {
      workbook.definedNames.add(rangeRef, nrName);
    } catch (err) {
      logger.error(`createLookupsSheet: failed to register named range ${nrName}`, { err });
    }
    namedRangeMap[fieldKey] = nrName;
    col++;
  }

  // 1. Write named ranges for all NAMED_RANGE_FIELD_KEYS fields
  const FIELD_KEY_TO_LIVE = {
    ipc_sections:                liveLookups.ipc_sections,
    excise_sections:             liveLookups.excise_sections,
    arms_sections:               liveLookups.arms_sections,
    gambling_sections:           liveLookups.gambling_sections,
    sections:                    liveLookups.sections,
    ipc_major_head:              liveLookups.ipc_major_head,
    excise_major_head:           liveLookups.excise_major_head,
    arms_major_head:             liveLookups.arms_major_head,
    gambling_major_head:         liveLookups.gambling_major_head,
    local_head:                  liveLookups.local_head,
    crime_head:                  liveLookups.crime_head,
    beat_no:                     liveLookups.beat_no,
    property_major_category:     liveLookups.property_major_category,
    district:                    liveLookups.district,
    police_station:              liveLookups.police_station,
    // minor heads
    ...Object.fromEntries(
      Object.keys(MINOR_HEAD_MAJOR_CODES).map(k => [k, liveLookups[k] || []])
    ),
  };
  for (const [fk, opts] of Object.entries(FIELD_KEY_TO_LIVE)) {
    writeList(fk, opts, NR_PREFIX + fk.toUpperCase());
  }

  // 2. Write one named range per property category (for the INDIRECT cascade) stacked vertically
  const propItemsCol = col;
  col++; // reserve column for property type lists
  const propCatToTypeNRRows = [];
  let currentPropRow = 2;

  ws.getCell(1, propItemsCol).value = 'PROP_TYPE_VALS';

  for (const catLabel of (liveLookups._propCategoryLabels || [])) {
    const items = (liveLookups._propItemsByCategory || {})[catLabel] || [];
    if (items.length === 0) continue;
    
    const values = items.map(o => (o && typeof o === 'object' ? o.value : String(o)));
    const startRow = currentPropRow;
    const endRow = currentPropRow + values.length - 1;
    
    values.forEach((v, idx) => {
      ws.getCell(startRow + idx, propItemsCol).value = v;
    });
    
    const colLetter = numToColLetter(propItemsCol);
    const rangeRef = `'_Lookups'!$${colLetter}$${startRow}:$${colLetter}$${endRow}`;
    const slug = catLabel.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const nrName = `${NR_PREFIX}PROP_CAT_${slug}`;
    
    try {
      workbook.definedNames.add(rangeRef, nrName);
    } catch (err) {
      logger.error(`createLookupsSheet: failed to register named range ${nrName}`, { err });
    }
    
    propCatToTypeNRRows.push([catLabel, nrName]);
    slugToNR[slug] = nrName;
    currentPropRow = endRow + 1;
  }

  if (propCatToTypeNRRows.length > 0) {
    const labelCol = col;
    const nrCol = col + 1;
    propCatToTypeNRRows.forEach((row, i) => {
      ws.getCell(i + 1, labelCol).value = row[0];
      ws.getCell(i + 1, nrCol).value = row[1];
    });
    const labelLetter = numToColLetter(labelCol);
    const nrLetter = numToColLetter(nrCol);
    const tableRef = `'_Lookups'!$${labelLetter}$1:$${nrLetter}$${propCatToTypeNRRows.length}`;
    try {
      workbook.definedNames.add(tableRef, 'PROP_CAT_TO_TYPE_NR');
    } catch (err) {
      logger.error('createLookupsSheet: failed to register PROP_CAT_TO_TYPE_NR', { err });
    }
    col += 2;
  }

  // 3. Write one named range per major head (for the minor_head INDIRECT cascade) —
  // every major head that has minor heads in excel_minor_heads, not just the 6 hand-picked
  // crime types in MINOR_HEAD_MAJOR_CODES. Major head labels can contain characters
  // (parentheses, commas, periods, slashes...) that a chain of Excel SUBSTITUTE() calls
  // can't reliably fold back into the same slug the JS side derived (adjacent special
  // chars collapse to one underscore in JS but not in nested SUBSTITUTE). So instead of
  // recomputing the slug inside the workbook, we also write an explicit "major head label
  // -> named range name" lookup table and have the cascade VLOOKUP into it.
  const majorHeadToNRRows = [];
  for (const majorLabel of (liveLookups._minorHeadMajorLabels || [])) {
    const items = (liveLookups._minorHeadsByMajorLabel || {})[majorLabel] || [];
    if (items.length === 0) continue;
    const slug = majorLabel.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const nrName = `${NR_PREFIX}MH_${slug}`;
    writeList(`__minorhead_${majorLabel}`, items, nrName);
    majorHeadToNRRows.push([majorLabel, nrName]);
  }
  if (majorHeadToNRRows.length > 0) {
    const labelCol = col;
    const nrCol = col + 1;
    majorHeadToNRRows.forEach((row, i) => {
      ws.getCell(i + 1, labelCol).value = row[0];
      ws.getCell(i + 1, nrCol).value = row[1];
    });
    const labelLetter = numToColLetter(labelCol);
    const nrLetter = numToColLetter(nrCol);
    const tableRef = `'_Lookups'!$${labelLetter}$1:$${nrLetter}$${majorHeadToNRRows.length}`;
    try {
      workbook.definedNames.add(tableRef, 'MAJOR_HEAD_TO_MINOR_NR');
    } catch (err) {
      logger.error('createLookupsSheet: failed to register MAJOR_HEAD_TO_MINOR_NR', { err });
    }
    col += 2;
  }

  // 4. Section→Major-head cascade, act-aware. One stacked column stores every DISTINCT
  // head set once (deduped by content); SECTION_TO_MAJOR_NR maps "<act_long>|<section
  // label>" — exactly the string the DV formula concatenates from the act and section
  // cells ($act5&"|"&$sec5; COM-verified that Excel 2021 accepts the concatenated lookup
  // key as a DV list source) — to the named range holding that pair's head set. Pairs
  // without a specific mapping fall back to the act-level union of heads, then to the
  // full major-head list, so the Major-head dropdown is never empty. IFERROR must still
  // never be used in the DV formula (see the optimiser-patch comment at the top).
  const secMajorCol = col;
  col++; // reserve column for the stacked head-set values
  ws.getCell(1, secMajorCol).value = 'SEC_MAJOR_VALS';
  let currentSecMHRow = 2;
  const headSetSigToNR = new Map();
  let headSetSeq = 0;
  const headSetNR = (values) => {
    if (!values || values.length === 0) return null;
    const sig = values.join('\u0000');
    if (headSetSigToNR.has(sig)) return headSetSigToNR.get(sig);
    const startRow = currentSecMHRow;
    values.forEach((v, idx) => { ws.getCell(startRow + idx, secMajorCol).value = v; });
    const endRow = startRow + values.length - 1;
    currentSecMHRow = endRow + 1;
    const colLetter = numToColLetter(secMajorCol);
    const nrName = `${NR_PREFIX}SECMH_${++headSetSeq}`;
    try {
      workbook.definedNames.add(`'_Lookups'!$${colLetter}$${startRow}:$${colLetter}$${endRow}`, nrName);
    } catch (err) {
      logger.error(`createLookupsSheet: failed to register named range ${nrName}`, { err });
      return null;
    }
    headSetSigToNR.set(sig, nrName);
    return nrName;
  };

  const pairHeads = liveLookups._majorHeadsByActSection || new Map();
  const actLevelHeads = liveLookups._actLevelMajorHeads || new Map();
  const allHeadsNR = headSetNR(liveLookups._allMajorHeadLabels || []);
  const sectionToMHNRRows = [];
  for (const act of (liveLookups._allActs || [])) {
    if (act.act_cd == null) continue;
    const cd = String(act.act_cd);
    const sections = (liveLookups._sectionsByActCd || {})[cd] || [];
    if (sections.length === 0) continue;
    const actNR = actLevelHeads.has(cd) ? headSetNR(actLevelHeads.get(cd)) : null;
    for (const s of sections) {
      const label = (s && typeof s === 'object') ? s.value : String(s);
      const specific = pairHeads.get(cd + '\u0000' + label);
      const nr = (specific && specific.length > 0 ? headSetNR(specific) : null) || actNR || allHeadsNR;
      const key = `${act.act_long}|${label}`;
      // VLOOKUP cannot match lookup values longer than 255 characters
      if (!nr || key.length > 255) continue;
      sectionToMHNRRows.push([key, nr]);
    }
  }

  if (sectionToMHNRRows.length > 0) {
    const labelCol = col;
    const nrCol = col + 1;
    sectionToMHNRRows.forEach((row, i) => {
      ws.getCell(i + 1, labelCol).value = row[0];
      ws.getCell(i + 1, nrCol).value = row[1];
    });
    const labelLetter = numToColLetter(labelCol);
    const nrLetter = numToColLetter(nrCol);
    const tableRef = `'_Lookups'!$${labelLetter}$1:$${nrLetter}$${sectionToMHNRRows.length}`;
    try {
      workbook.definedNames.add(tableRef, 'SECTION_TO_MAJOR_NR');
    } catch (err) {
      logger.error('createLookupsSheet: failed to register SECTION_TO_MAJOR_NR', { err });
    }
    col += 2;
  }

  // 5. Write dynamic list of all Acts
  const actNames = (liveLookups._allActs || []).map(r => r.act_long);
  writeList('__all_acts_list', actNames.map(name => ({ value: name, label: name })), 'OPT_ACTS_LIST');

  // 7. Write one named range per state's districts (for the state→district INDIRECT cascade).
  // Each state gets OPT_STATE_DIST_<SLUG> mapping to its sorted district list.
  // A lookup table STATE_TO_DISTRICT_NR maps state_name → named range name (VLOOKUP target).
  // OPT_INDIA_DISTRICTS (the full-India superset) is the cascade's IFERROR fallback for
  // ADDRESS district cells — state empty or 'Other UT/State' still gets a usable list
  // (WP11; the police-district OPT_DISTRICT list is wrong for a person's home address).
  writeList('__india_districts', ALL_INDIA_DISTRICTS.map((d) => ({ value: d, label: d })), 'OPT_INDIA_DISTRICTS');
  const stateToDistNRRows = [];
  const districtsByState = liveLookups._districtsByState || {};
  for (const stateName of (liveLookups._stateNames || [])) {
    const distList = districtsByState[stateName] || [];
    if (distList.length === 0) continue;
    const slug = stateName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
    const nrName = `OPT_STATE_DIST_${slug}`;
    writeList(`__state_dist_${slug}`, distList.map(d => ({ value: d, label: d })), nrName);
    stateToDistNRRows.push([stateName, nrName]);
  }
  if (stateToDistNRRows.length > 0) {
    const labelCol = col;
    const nrCol = col + 1;
    stateToDistNRRows.forEach((row, i) => {
      ws.getCell(i + 1, labelCol).value = row[0];
      ws.getCell(i + 1, nrCol).value = row[1];
    });
    const labelLetter = numToColLetter(labelCol);
    const nrLetter = numToColLetter(nrCol);
    const tableRef = `'_Lookups'!$${labelLetter}$1:$${nrLetter}$${stateToDistNRRows.length}`;
    try {
      workbook.definedNames.add(tableRef, 'STATE_TO_DISTRICT_NR');
    } catch (err) {
      logger.error('createLookupsSheet: failed to register STATE_TO_DISTRICT_NR', { err });
    }
    col += 2;
  }

  // 6. Write Act Sections stacked vertically in a single column
  const actSectionsCol = col;
  col++; // reserve column for act sections
  const actToSecNRRows = [];
  let currentSecRow = 2;

  ws.getCell(1, actSectionsCol).value = 'ACT_SECTIONS_VALS';

  for (const act of (liveLookups._allActs || [])) {
    const cd = String(act.act_cd);
    const items = (liveLookups._sectionsByActCd || {})[cd] || [];
    if (items.length === 0) continue;
    
    const values = items.map(o => (o && typeof o === 'object' ? o.value : String(o)));
    const startRow = currentSecRow;
    const endRow = currentSecRow + values.length - 1;
    
    values.forEach((v, idx) => {
      ws.getCell(startRow + idx, actSectionsCol).value = v;
    });
    
    const colLetter = numToColLetter(actSectionsCol);
    const rangeRef = `'_Lookups'!$${colLetter}$${startRow}:$${colLetter}$${endRow}`;
    const nrName = `${NR_PREFIX}ACT_${cd}`;
    
    try {
      workbook.definedNames.add(rangeRef, nrName);
    } catch (err) {
      logger.error(`createLookupsSheet: failed to register named range ${nrName}`, { err });
    }
    
    actToSecNRRows.push([act.act_long, nrName]);
    currentSecRow = endRow + 1;
  }

  if (actToSecNRRows.length > 0) {
    const labelCol = col;
    const nrCol = col + 1;
    actToSecNRRows.forEach((row, i) => {
      ws.getCell(i + 1, labelCol).value = row[0];
      ws.getCell(i + 1, nrCol).value = row[1];
    });
    const labelLetter = numToColLetter(labelCol);
    const nrLetter = numToColLetter(nrCol);
    const tableRef = `'_Lookups'!$${labelLetter}$1:$${nrLetter}$${actToSecNRRows.length}`;
    try {
      workbook.definedNames.add(tableRef, 'ACT_TO_SECTIONS_NR');
    } catch (err) {
      logger.error('createLookupsSheet: failed to register ACT_TO_SECTIONS_NR', { err });
    }
    col += 2;
  }

  // 7. Write one named range per district's PS list (for the district → police_station
  // cascade). Same stacked-column + lookup-table shape as the Act → Sections block above.
  const districtPSCol = col;
  col++; // reserve column for the stacked PS-name values
  ws.getCell(1, districtPSCol).value = 'DIST_PS_VALS';
  const districtToPSRows = [];
  let currentDistPSRow = 2;

  for (const [distLabel, items] of Object.entries(liveLookups._psByDistrict || {})) {
    if (!items || items.length === 0) continue;

    const values = items.map(o => (o && typeof o === 'object' ? o.value : String(o)));
    const startRow = currentDistPSRow;
    const endRow = currentDistPSRow + values.length - 1;

    values.forEach((v, idx) => {
      ws.getCell(startRow + idx, districtPSCol).value = v;
    });

    const colLetter = numToColLetter(districtPSCol);
    const rangeRef = `'_Lookups'!$${colLetter}$${startRow}:$${colLetter}$${endRow}`;
    const slug = distLabel.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const nrName = `${NR_PREFIX}PS_${slug}`;

    try {
      workbook.definedNames.add(rangeRef, nrName);
    } catch (err) {
      logger.error(`createLookupsSheet: failed to register named range ${nrName}`, { err });
    }

    districtToPSRows.push([distLabel, nrName]);
    currentDistPSRow = endRow + 1;
  }

  if (districtToPSRows.length > 0) {
    const labelCol = col;
    const nrCol = col + 1;
    districtToPSRows.forEach((row, i) => {
      ws.getCell(i + 1, labelCol).value = row[0];
      ws.getCell(i + 1, nrCol).value = row[1];
    });
    const labelLetter = numToColLetter(labelCol);
    const nrLetter = numToColLetter(nrCol);
    const tableRef = `'_Lookups'!$${labelLetter}$1:$${nrLetter}$${districtToPSRows.length}`;
    try {
      workbook.definedNames.add(tableRef, 'DISTRICT_TO_PS_NR');
    } catch (err) {
      logger.error('createLookupsSheet: failed to register DISTRICT_TO_PS_NR', { err });
    }
    col += 2;
  }

  return {
    namedRangeMap,
    slugToNR,
    hasMinorHeadCascade: majorHeadToNRRows.length > 0,
    hasSectionMajorCascade: sectionToMHNRRows.length > 0,
    hasDistrictPSCascade: districtToPSRows.length > 0,
    hasStateDistrictCascade: stateToDistNRRows.length > 0,
  };
}


// ── WP7 (Integration 3) — invisible-only Excel-level hardening (D4/P3.1 sign-off: enforcement
// changes are approved as long as no visible column/order/label/dropdown-option moves) ────────
//
// Deliberately implemented as a POST-PROCESSING PASS over the fully-built workbook rather than
// threaded into each of the ~14 dataValidation call sites above. Those sites carry real,
// deliberate nuance — e.g. every cascade/INDIRECT-dependent list (sections, major/minor head,
// district-by-state, PS-by-district, property-minor-category) explicitly sets
// `showErrorMessage: false` so a not-yet-resolved dependent cell isn't flagged as invalid while
// an officer is still filling the row left-to-right — and this file's own header comment
// documents how fragile the merge-optimiser is around per-cell dataValidation object identity.
// Operating on the finished workbook sidesteps all of that: it only ever (a) adds a brand-new
// dataValidation/numFmt to a cell that has NONE today (DATE/TIME/NUMBER/text-length fields never
// receive one anywhere above — only SELECT/RADIO columns do), or (b) patches
// `showErrorMessage`/`errorTitle`/`error` onto an EXISTING list validation only where the
// creating site left `showErrorMessage` unset entirely (`undefined`) — every cascade-dependent
// site sets it explicitly (`true` or `false`), so that is a reliable, non-guessy signal for
// "this dropdown's validity doesn't depend on a sibling cell."
//
// Deliberately NOT touched here (see docs/new-db-integration/03-import.md WP7 entry for the
// full reasoning): `allowBlank` on any EXISTING list validation is left exactly as today
// (`true`, universally) — changing it to `!required` per the plan's original wording risks
// blocking legitimate "tab past a not-yet-fillable required cell mid-row" workflows on
// cascade-dependent columns (district/PS, act/section/major/minor), and unlike showErrorMessage
// this genuinely needs a real-Excel check this headless environment cannot perform (same
// caution as G5 below). `allowBlank: !required` IS applied to the brand-new validations this
// pass adds (DATE/NUMBER-bounds/textLength), since those have no prior established behavior to
// disrupt. Sheet protection (`worksheet.protect()`) is skipped entirely for the same reason —
// G5's explicit escape hatch.
export function buildFieldMetaMap(fieldsList, allFields) {
  const map = new Map();
  for (const f of fieldsList || []) {
    if (!f || !f.field_key || map.has(f.field_key)) continue;
    const registryMatch = f.field_type ? f : (allFields || []).find((af) => af.field_key === f.field_key);
    map.set(f.field_key, {
      field_type: registryMatch ? registryMatch.field_type : null,
      required: f.required === true || (registryMatch && registryMatch.required === true),
    });
  }
  return map;
}

const FIR_LIKE_KEYS = new Set(['fir_no', 'linked_fir_dd_no', 'gd_no', 'rc_no']);
const isMobileKey = (k) => k === 'mobile' || k.endsWith('_mobile');
const isPincodeKey = (k) => k === 'pincode' || k.endsWith('_pincode');
const isAgeKey = (k) => k === 'age' || k.endsWith('_age');
const VALUE_LIKE_KEYS = new Set(['property_value', 'prop_other_value', 'estimated_value']);

export function applyFieldLevelHardening(workbook, fieldMetaByKey) {
  workbook.worksheets.forEach((ws) => {
    if (ws.name === '_Lookups') return;
    const row1 = ws.getRow(1);
    const colKeys = {};
    row1.eachCell({ includeEmpty: true }, (cell, c) => {
      if (cell.value) colKeys[c] = String(cell.value).trim();
    });

    for (const [colStr, key] of Object.entries(colKeys)) {
      const col = Number(colStr);
      const meta = fieldMetaByKey.get(key);
      if (!meta) continue;
      const { field_type, required } = meta;

      // Column-level numFmt — safe regardless of any per-cell dataValidation state.
      if (field_type === 'DATE') {
        ws.getColumn(col).numFmt = 'dd-mm-yyyy';
      } else if (field_type === 'TIME') {
        ws.getColumn(col).numFmt = 'hh:mm';
      } else if (FIR_LIKE_KEYS.has(key) || isPincodeKey(key)) {
        // Forces text storage — stops Excel silently mangling "123/2025" into a date serial
        // (the headline bug this hardening pass exists to fix) or eating a pincode's leading
        // zero the moment the cell is typed into.
        ws.getColumn(col).numFmt = '@';
      }

      for (let r = 5; r <= 1000; r++) {
        const cell = ws.getCell(r, col);
        const dv = cell.dataValidation;

        if (!dv) {
          if (field_type === 'DATE') {
            cell.dataValidation = {
              type: 'date', operator: 'greaterThan', allowBlank: !required,
              formulae: ['1900-01-01'],
              showErrorMessage: true, errorStyle: 'stop',
              errorTitle: 'Invalid date', error: 'Enter a valid date (dd-mm-yyyy) after 01-01-1900.',
            };
          } else if (isAgeKey(key) && field_type === 'NUMBER') {
            cell.dataValidation = {
              type: 'whole', operator: 'between', allowBlank: !required,
              formulae: [0, 120],
              showErrorMessage: true, errorStyle: 'stop',
              errorTitle: 'Invalid age', error: 'Age must be a whole number between 0 and 120.',
            };
          } else if (VALUE_LIKE_KEYS.has(key) && field_type === 'NUMBER') {
            cell.dataValidation = {
              type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: !required,
              formulae: [0],
              showErrorMessage: true, errorStyle: 'stop',
              errorTitle: 'Invalid value', error: 'Value must be zero or greater.',
            };
          } else if (isMobileKey(key)) {
            cell.dataValidation = {
              type: 'textLength', operator: 'equal', allowBlank: !required,
              formulae: [10],
              showErrorMessage: true, errorStyle: 'stop',
              errorTitle: 'Invalid mobile number', error: 'Mobile number must be exactly 10 digits.',
            };
          } else if (isPincodeKey(key)) {
            cell.dataValidation = {
              type: 'textLength', operator: 'equal', allowBlank: !required,
              formulae: [6],
              showErrorMessage: true, errorStyle: 'stop',
              errorTitle: 'Invalid pincode', error: 'Pincode must be exactly 6 digits.',
            };
          }
        } else if (dv.type === 'list' && dv.showErrorMessage === undefined) {
          dv.showErrorMessage = true;
          dv.errorStyle = 'stop';
          dv.errorTitle = 'Invalid value';
          dv.error = 'Please choose a value from the dropdown list.';
        }
      }
    }
  });
}

// WP0 found (deferred to WP7): the checked-in base workbooks leave 1+ fully-empty ghost
// columns at some sheets' tails (e.g. ARREST/Person Arrested Detail cols 49-55 right after
// scheme_of_arrest) — pre-existing, not something the column-management loop above creates,
// and confirmed present on unmodified base files too. Trims only columns at the TRUE tail
// (repeatedly re-checking the CURRENT last column) whose Row-1 field_key is empty — this can
// never touch an internal/populated column, and can never invalidate an earlier cascade
// formula (those only ever reference real, non-trailing columns, which this never shifts:
// deleteColumnAt only shifts columns AT/AFTER the deleted index, and the deleted index is
// always the sheet's current last column). Only the base-workbook path (CASE/ARREST) needs
// this — `addSheetToWorkbook`'s from-scratch sheets are built directly from a real fieldsList,
// so they cannot have a trailing null-key column by construction.
export function trimTrailingEmptyColumns(workbook) {
  workbook.worksheets.forEach((worksheet) => {
    if (worksheet.name === '_Lookups') return;
    let lastReal = 0;
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, c) => {
      const v = cell.value;
      if (v !== null && v !== undefined && String(v).trim() !== '') lastReal = Math.max(lastReal, c);
    });
    // worksheet.columnCount is a high-water mark that does NOT shrink when deleteColumnAt
    // clears a cell's value back to null (verified directly against ExcelJS — the Cell object
    // stays registered) — so it must be captured ONCE, up front, as the trim count; re-reading
    // it inside a loop condition would never decrease and spin forever (this is exactly what
    // the first version of this function did). Every column from lastReal+1 to the captured
    // count is empty by definition (lastReal is the true last non-empty Row-1 cell), so
    // repeatedly deleting at the SAME fixed index (lastReal + 1) is safe — each call just
    // shifts another empty column into that position from the right.
    const trimCount = worksheet.columnCount - lastReal;
    for (let i = 0; i < trimCount; i++) {
      TemplateBuilderService.deleteColumnAt(worksheet, lastReal + 1);
    }
  });
}

export class TemplateBuilderService {
  static async buildTemplate(recordType, lang = 'en') {
    const filename = recordType === 'CASE'
      ? 'CASE_Import_Template_Final.xlsx'
      : 'ARREST_Import_Template_Final.xlsx';

    let templatePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(process.cwd(), '..', filename);
    }
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Base template file not found. Tried: ${path.join(process.cwd(), filename)} and ${path.join(process.cwd(), '..', filename)}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // Wipe every data validation inherited from the base .xlsx. All real dropdowns are
    // (re)written below from live DB data, so anything already in the file is stale — and
    // after the column deletes/inserts below, a leftover can end up on the WRONG column
    // (e.g. the base Property sheet's status list surfacing as a dropdown on Property
    // Value, or a hardcoded "Vehicle,Mobile Phone,…" list below row 500 on Category).
    workbook.worksheets.forEach(ws => {
      if (ws.dataValidations && ws.dataValidations.model) {
        ws.dataValidations.model = {};
      }
    });

    // ── Fetch live lookups from DB ────────────────────────────────────────────────
    let liveLookups = {};
    let namedRangeMap = {};
    let slugToNR = {};
    let hasMinorHeadCascade = false;
    let hasDistrictPSCascade = false;
    let hasStateDistrictCascade = false;
    try {
      liveLookups = await buildLiveLookups(recordType);
      ({ namedRangeMap, slugToNR, hasMinorHeadCascade, hasDistrictPSCascade, hasStateDistrictCascade } = createLookupsSheet(workbook, liveLookups));
    } catch (err) {
      logger.error('buildTemplate: failed to build live lookups (dropdowns will be static)', { err: err.message });
    }

    const allowedKeys = new Set(
      recordType === 'CASE'
        ? Object.values(CASE_SHEETS_CONFIG).flat()
        : Object.values(ARREST_SHEETS_CONFIG).flat()
    );

    const activeRegistryFields = (await db('field_registry')
      .where('is_active', true)
      .orWhereIn('field_key', Array.from(allowedKeys))
      .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'field_key', order: 'asc' }])).map(normalizeRegistryRow);

    // Registry-driven auto-inclusion: active registry fields applicable to this record
    // type that the curated config lists don't mention and that aren't excluded. They are
    // processed AFTER all curated fields and appended at the end of their sheet, so the
    // curated column layout never shifts. (See registry-sync.util.js / import-fields.config.js.)
    const autoFields = autoIncludedRegistryFields(recordType, activeRegistryFields, allowedKeys);
    const autoKeys = new Set(autoFields.map(f => f.field_key));
    const includedKeys = new Set([...allowedKeys, ...autoKeys]);

    const typeFields = activeRegistryFields.filter(f => {
      if (allowedKeys.has(f.field_key)) return true;
      try {
        const types = typeof f.applicable_record_types === 'string'
          ? JSON.parse(f.applicable_record_types)
          : f.applicable_record_types;
        return Array.isArray(types) && types.includes(recordType);
      } catch (e) {
        return false;
      }
    });

    typeFields.push(
      { field_key: 'act', field_type: 'SELECT', section: 'act_section', label_en: 'Act', label_hi: 'अधिनियम' },
      { field_key: 'minor_head', field_type: 'SELECT', section: 'act_section', label_en: 'Minor Head', label_hi: 'लघु शीर्ष' },
      { field_key: 'district', field_type: 'SELECT', section: 'general_info', label_en: 'District', label_hi: 'जिला' },
      { field_key: 'police_station', field_type: 'SELECT', section: 'general_info', label_en: 'Police Station', label_hi: 'थाना' }
    );

    if (recordType === 'ARREST') {
      typeFields.push(
        { field_key: 'date_of_arrest', field_type: 'DATE', section: 'arrest_details', label_en: 'Date Of Arrest', label_hi: 'गिरफ्तारी की तिथि' },
        { field_key: 'time_of_arrest', field_type: 'TIME', section: 'arrest_details', label_en: 'Time Of Arrest', label_hi: 'गिरफ्तारी का समय' }
      );
    }

    // Clean up columns from the base workbook on the fly if they are not in allowedKeys
    workbook.worksheets.forEach(worksheet => {
      if (worksheet.name === '_Lookups') return; // Do not touch our hidden lookup sheet!
      
      // If CASE general sheet, clear the misplaced disposal_type key in Row 1 so it gets deleted and relocated
      if (recordType === 'CASE' && worksheet.name === 'General Information') {
        const row1 = worksheet.getRow(1);
        row1.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (cell.value === 'disposal_type') {
            cell.value = null;
          }
        });
      }

      let colIdxToDelete = -1;
      do {
        colIdxToDelete = -1;
        const row1 = worksheet.getRow(1);
        
        let lastAllowedCol = -1;
        row1.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (cell.value && includedKeys.has(String(cell.value).trim())) {
            lastAllowedCol = Math.max(lastAllowedCol, colNumber);
          }
        });

        row1.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = cell.value ? String(cell.value).trim() : '';
          // A KEYED column not in the template contract is removed wherever it sits — the
          // old `colNumber <= lastAllowedCol` guard let stale keyed columns SURVIVE at the
          // sheet tail (found in WP10: the base workbook's io_rank/io_mobile sat after the
          // last allowed key, so removing them from the curated lists didn't remove the
          // physical columns). Empty-key deletion stays restricted to the allowed range —
          // tail empties are trimTrailingEmptyColumns' job, and interior behavior is
          // unchanged.
          if (val && !includedKeys.has(val)) {
            colIdxToDelete = colNumber;
          } else if (!val && colNumber <= lastAllowedCol) {
            colIdxToDelete = colNumber;
          }
        });
        if (colIdxToDelete !== -1) {
          TemplateBuilderService.deleteColumnAt(worksheet, colIdxToDelete);
        }
      } while (colIdxToDelete !== -1);
    });

    // Ensure local_head is present on Act and Sections sheet - REMOVED

    const filteredTypeFields = typeFields.filter(f => allowedKeys.has(f.field_key));
    const sectionMap = recordType === 'CASE' ? CASE_SECTION_MAP : ARREST_SECTION_MAP;
    const parentSheetLabel = recordType === 'CASE'
      ? { sheet: 'General Information', label: 'General Information' }
      : { sheet: 'General Info', label: 'General Information' };

    // Curated fields first (identical to the historical pass), then registry auto-included
    // fields — by then every curated column exists, so autos append cleanly at the end.
    for (const field of [...filteredTypeFields, ...autoFields]) {
      const isAuto = autoKeys.has(field.field_key) && !allowedKeys.has(field.field_key);
      if (recordType === 'ARREST' && field.field_key === 'status') {
        field.section = 'custody_status';
      }
      // Force sections and act to the act_section sheet to prevent them from slipping into General Information
      if (field.field_key === 'sections' || field.field_key === 'act') {
        field.section = 'act_section';
      }
      if (field.field_key === 'case_status') {
        field.section = 'investigation_details';
      }
      let mapping = sectionMap[field.section];
      if (!mapping) {
        // Curated fields keep the historical behaviour (skip — they may live in the base
        // .xlsx already). Auto-included fields must never silently vanish: fall back to the
        // parent sheet and log it, so a new form field always surfaces somewhere.
        if (!isAuto) continue;
        logger.warn(`buildTemplate(${recordType}): field '${field.field_key}' has unmapped section '${field.section}' — placing on ${parentSheetLabel.sheet}`);
        mapping = parentSheetLabel;
      }

      const worksheet = workbook.getWorksheet(mapping.sheet);
      if (!worksheet) continue;

      // 1. Check if column already exists by hidden Row 1 key or Row 3 label
      let exists = false;
      let targetColIndex = -1;
      const row1 = worksheet.getRow(1);
      const row3 = worksheet.getRow(3);
      row1.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (cell.value === field.field_key) {
          exists = true;
          targetColIndex = colNum;
        }
      });
      // Label-based rescue is for curated fields whose base-.xlsx column lacks a Row-1 key.
      // Never apply it to auto-included fields: a coincidental label match would REKEY an
      // existing curated column instead of appending a new one.
      if (!exists && !isAuto) {
        row3.eachCell({ includeEmpty: true }, (cell, colNum) => {
          if (cell.value && (cell.value === field.label_en || cell.value === field.label_hi)) {
            exists = true;
            targetColIndex = colNum;
            row1.getCell(colNum).value = field.field_key;
          }
        });
      }

      const configField = recordType === 'CASE'
        ? caseGeneralFields.find(f => f.field_key === field.field_key) ||
          caseVictimFields.find(f => f.field_key === field.field_key) ||
          caseActSectionFields.find(f => f.field_key === field.field_key) ||
          caseAccusedFields.find(f => f.field_key === field.field_key) ||
          casePropertyFields.find(f => f.field_key === field.field_key)
        : arrestGeneralFields.find(f => f.field_key === field.field_key) ||
          arrestActSectionFields.find(f => f.field_key === field.field_key) ||
          arrestPersonFields.find(f => f.field_key === field.field_key) ||
          arrestPropertyFields.find(f => f.field_key === field.field_key);

      if (!exists) {
        targetColIndex = -1;

        // Resolve which configuration list corresponds to the current worksheet
        let currentFieldsList = [];
        if (recordType === 'CASE') {
          if (mapping.sheet === 'General Information') currentFieldsList = caseGeneralFields;
          else if (mapping.sheet === 'Victim Information') currentFieldsList = caseVictimFields;
          else if (mapping.sheet === 'Act and Sections') currentFieldsList = caseActSectionFields;
          else if (mapping.sheet === 'Accused Detail') currentFieldsList = caseAccusedFields;
          else if (mapping.sheet === 'Property Details') currentFieldsList = casePropertyFields;
        } else {
          if (mapping.sheet === 'General Info') currentFieldsList = arrestGeneralFields;
          else if (mapping.sheet === 'Act and Sections') currentFieldsList = arrestActSectionFields;
          else if (mapping.sheet === 'Person Arrested Detail') currentFieldsList = arrestPersonFields;
          else if (mapping.sheet === 'Property Details') currentFieldsList = arrestPropertyFields;
        }

        // Find position of field in currentFieldsList
        const fieldIdx = currentFieldsList.findIndex(f => f.field_key === field.field_key);
        if (fieldIdx !== -1) {
          // Search for preceding fields in the worksheet Row 1
          let maxPrecedingColIdx = -1;
          for (let i = 0; i < fieldIdx; i++) {
            const precKey = currentFieldsList[i].field_key;
            row1.eachCell({ includeEmpty: true }, (cell, colNum) => {
              if (cell.value === precKey) {
                maxPrecedingColIdx = Math.max(maxPrecedingColIdx, colNum);
              }
            });
          }

          if (maxPrecedingColIdx !== -1) {
            targetColIndex = maxPrecedingColIdx + 1;
          } else {
            // Search for succeeding fields in the worksheet Row 1
            let minSucceedingColIdx = -1;
            for (let i = fieldIdx + 1; i < currentFieldsList.length; i++) {
              const succKey = currentFieldsList[i].field_key;
              row1.eachCell({ includeEmpty: true }, (cell, colNum) => {
                if (cell.value === succKey) {
                  if (minSucceedingColIdx === -1 || colNum < minSucceedingColIdx) {
                    minSucceedingColIdx = colNum;
                  }
                }
              });
            }
            if (minSucceedingColIdx !== -1) {
              targetColIndex = minSucceedingColIdx;
            }
          }
        }

        if (targetColIndex === -1) {
          // Fallback: append at the end of included columns (ignoring trailing empty columns).
          // includedKeys (not allowedKeys) so previously appended auto columns anchor the
          // next append — auto fields land in stable registry order at the sheet's end.
          let lastAllowedCol = 0;
          row1.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (cell.value && includedKeys.has(String(cell.value).trim())) {
              lastAllowedCol = Math.max(lastAllowedCol, colNumber);
            }
          });
          targetColIndex = lastAllowedCol + 1;
        }

        // Keep country code columns immediately to the left of their respective mobile columns
        if (field.field_key && field.field_key.endsWith('_mobile_country_code')) {
          const targetMobileKey = field.field_key.replace('_mobile_country_code', '_mobile');
          let mobileColIdx = -1;
          row1.eachCell({ includeEmpty: true }, (cell, colNum) => {
            if (cell.value === targetMobileKey) {
              mobileColIdx = colNum;
            }
          });
          if (mobileColIdx !== -1) {
            targetColIndex = mobileColIdx;
          }
        }

        // Keep "Type of property" (minor category) immediately to the right of Property
        // Category so the dependent pair sits adjacent while filling — otherwise it lands
        // at the end of the section, several unrelated columns away from its parent.
        if (field.field_key === 'property_minor_category') {
          let majorCatIdx = -1;
          row1.eachCell({ includeEmpty: true }, (cell, colNum) => {
            if (cell.value === 'property_major_category') majorCatIdx = colNum;
          });
          if (majorCatIdx !== -1) {
            targetColIndex = majorCatIdx + 1;
          }
        }

        // 3. Insert the new column
        this.insertColumnAt(worksheet, targetColIndex);

        // 4. Fill values and copy styles from adjacent column (targetColIndex - 1)
        const refColIdx = targetColIndex - 1;
        
        const r1 = worksheet.getRow(1);
        const r2 = worksheet.getRow(2);
        const r3 = worksheet.getRow(3);

        const labelEn = configField ? configField.label_en : field.label_en;
        const labelHi = configField ? configField.label_hi : field.label_hi;

        r1.getCell(targetColIndex).value = field.field_key;
        r2.getCell(targetColIndex).value = mapping.label;
        r3.getCell(targetColIndex).value = lang === 'hi' ? (labelHi || labelEn) : labelEn;

        // Copy formatting from adjacent column
        for (let rIdx = 1; rIdx <= 4; rIdx++) {
          const row = worksheet.getRow(rIdx);
          row.getCell(targetColIndex).style = row.getCell(refColIdx).style;
        }
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          const row = worksheet.getRow(rIdx);
          row.getCell(targetColIndex).style = row.getCell(refColIdx).style;
        }
      }

      // Helper check for district/police station fields
      const isDistrictField = (key) => key === 'district' || key.endsWith('_district');
      const isPSField = (key) => key === 'police_station' || key.endsWith('_police_station');
      const isDist = isDistrictField(field.field_key);
      const isPS = isPSField(field.field_key);

      // ─ Determine option list for this field (live lookups take precedence over config stubs) ─
      let liveOpts = null;
      if (liveLookups[field.field_key] !== undefined) {
        liveOpts = liveLookups[field.field_key]; // [{value, label}] or []
      } else if (isDist) {
        liveOpts = liveLookups['district'];
      } else if (isPS) {
        liveOpts = liveLookups['police_station'];
      } else if (configField && Array.isArray(configField.options) && configField.options.length > 0) {
        // Fall back to static config options (e.g. gender, marital_status, country, state...)
        liveOpts = configField.options.map(o => (o && typeof o === 'object') ? o : { value: o, label: o });
      } else if (field.field_type === 'SELECT' || field.field_type === 'RADIO') {
        // Registry field might have static options in its own options column
        try {
          const raw = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
          if (Array.isArray(raw) && raw.length > 0) {
            liveOpts = raw.map(o => (o && typeof o === 'object') ? o : { value: o, label: o });
          }
        } catch (_) {}
      }

      // ─ Build hint string from the resolved options (or hint from config) ─
      let hintText = (configField && configField.hint) ? configField.hint : null;
      if (!hintText) {
        if (INDIRECT_CASCADE_FIELDS.has(field.field_key)) {
          hintText = 'Select from dropdown (depends on major category)';
        } else if (isDist && hasStateDistrictCascade) {
          hintText = 'Select from dropdown (depends on selected State)';
        } else if (NAMED_RANGE_FIELD_KEYS.has(field.field_key) && namedRangeMap[field.field_key]) {
          hintText = 'See dropdown list';
        } else if (liveOpts && liveOpts.length > 0) {

          const vals = liveOpts.map(o => o.value);
          const joined = vals.join(', ');
          hintText = joined.length <= 200 ? `select: ${joined}` : `select (${vals.length} options): ${vals.slice(0, 5).join(', ')}...`;
        } else {
          hintText = getHint(field);
        }
      }
      worksheet.getRow(4).getCell(targetColIndex).value = hintText;

      // ─ Write data validation (dropdown) for this column ────────────────────────────────
      if (INDIRECT_CASCADE_FIELDS.has(field.field_key)) {
        // property_minor_category: cascade via INDIRECT() on the major category cell.
        // The major-category cell on the same sheet + same row drives which named range is used.
        // Named ranges are OPT_<SLUG>, where slug = UPPER(category).replace(non-alphanum, '_').
        // We defer this to a second pass (after all columns are placed) so we know the
        // major-category column letter — no-op here, handled in second pass below.
        // (Stored as a sentinel so the second pass can detect it.)
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          worksheet.getCell(rIdx, targetColIndex).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false,
            formulae: ['"__INDIRECT_PENDING__"'] // replaced in second pass
          };
        }
      } else if (isDist) {
        // State-wise district cascade: place a sentinel — resolved in fourth pass once
        // all columns (including the sibling state column) are placed on the sheet.
        // Fallback to the flat district named range if state cascade isn't available.
        if (hasStateDistrictCascade) {
          for (let rIdx = 5; rIdx <= 500; rIdx++) {
            worksheet.getCell(rIdx, targetColIndex).dataValidation = {
              type: 'list', allowBlank: true, showErrorMessage: false,
              formulae: ['"__DIST_INDIRECT_PENDING__"'] // replaced in fourth pass
            };
          }
        } else if (namedRangeMap['district']) {
          const nrName = namedRangeMap['district'];
          for (let rIdx = 5; rIdx <= 500; rIdx++) {
            worksheet.getCell(rIdx, targetColIndex).dataValidation = {
              type: 'list', allowBlank: true,
              formulae: [nrName]
            };
          }
        }
      } else if (isPS && namedRangeMap['police_station']) {
        const nrName = namedRangeMap['police_station'];
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          worksheet.getCell(rIdx, targetColIndex).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [nrName]
          };
        }
      } else if (NAMED_RANGE_FIELD_KEYS.has(field.field_key) && namedRangeMap[field.field_key]) {
        // Long list — reference the named range on _Lookups
        const nrName = namedRangeMap[field.field_key];
        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          worksheet.getCell(rIdx, targetColIndex).dataValidation = {
            type: 'list', allowBlank: true,
            formulae: [nrName]
          };
        }
      } else if (liveOpts && liveOpts.length > 0) {
        // Short list — inline formula (values joined, max 255 chars)
        const vals = liveOpts.map(o => o.value);
        const joinedOpts = vals.join(',');
        if (joinedOpts.length <= 250) {
          const formulaVal = `"${joinedOpts}"`;
          for (let rIdx = 5; rIdx <= 1000; rIdx++) {
            const cell = worksheet.getCell(rIdx, targetColIndex);
            cell.dataValidation = {
              type: 'list',
              allowBlank: true,
              showErrorMessage: field.field_key === 'sections' ? false : undefined,
              formulae: [formulaVal]
            };
          }
        } else {
          // Too long for inline: write to _Lookups dynamically and reference it
          // This handles edge cases (e.g. a SELECT field that ended up with many options)
          const tempNRName = `${NR_PREFIX}DYN_${field.field_key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
          const ws2 = workbook.getWorksheet('_Lookups');
          if (ws2) {
            let nextCol = 1;
            ws2.getRow(1).eachCell({ includeEmpty: true }, (_, c) => { nextCol = c + 1; });
            ws2.getCell(1, nextCol).value = tempNRName;
            vals.forEach((v, i) => { ws2.getCell(i + 2, nextCol).value = v; });
            const tLetter = numToColLetter(nextCol);
            try {
              workbook.definedNames.add(`'_Lookups'!$${tLetter}$2:$${tLetter}$${vals.length + 1}`, tempNRName);
            } catch (_) {}
          }
          for (let rIdx = 5; rIdx <= 500; rIdx++) {
            worksheet.getCell(rIdx, targetColIndex).dataValidation = {
              type: 'list', allowBlank: true,
              formulae: [tempNRName]
            };
          }
        }
      }
      // (No validation for non-SELECT fields or SELECT fields with 0 options)
    }

    // ── Second pass: fix property_minor_category INDIRECT() formulas ────────────────────────
    // Now that all columns are placed, we can find property_major_category's column letter
    // on each sheet and write the correct INDIRECT() formula for property_minor_category.
    workbook.worksheets.forEach(ws => {
      if (ws.name === '_Lookups') return;
      const row1 = ws.getRow(1);

      let majorCatCol  = -1;
      let minorCatCol  = -1;
      row1.eachCell({ includeEmpty: true }, (cell, c) => {
        if (cell.value === 'property_major_category') majorCatCol = c;
        if (cell.value === 'property_minor_category') minorCatCol = c;
      });

      if (majorCatCol === -1 || minorCatCol === -1) return; // sheet doesn't have both

      const majorColLetter = numToColLetter(majorCatCol);
      const propFormula = `INDIRECT(VLOOKUP($${majorColLetter}5,PROP_CAT_TO_TYPE_NR,2,FALSE))`;
      for (let rIdx = 5; rIdx <= 500; rIdx++) {
        const cell = ws.getCell(rIdx, minorCatCol);
        if (cell.dataValidation && cell.dataValidation.formulae && cell.dataValidation.formulae[0] === '"__INDIRECT_PENDING__"') {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            showErrorMessage: false,
            formulae: [propFormula]
          };
        }
      }
    });

    // ── District → Police Station cascade pass ──────────────────────────────────────────────
    // Mirrors the interactive form's district-filtered PS dropdown (FieldRenderer.jsx /
    // DISTRICTS_AND_STATIONS), DB-driven here via DISTRICT_TO_PS_NR. Every *_police_station
    // column is paired with the *_district column of the same prefix on the same sheet (e.g.
    // 'police_station' <-> 'district', 'victim_police_station' <-> 'victim_district'). Sheets
    // without a matching district column (or with an empty cascade table) keep the flat
    // namedRangeMap['police_station'] list written in the first pass above.
    if (hasDistrictPSCascade) {
      workbook.worksheets.forEach(ws => {
        if (ws.name === '_Lookups') return;
        const row1 = ws.getRow(1);
        const colsByKey = {};
        row1.eachCell({ includeEmpty: true }, (cell, c) => {
          if (cell.value) colsByKey[String(cell.value).trim()] = c;
        });

        for (const [key, psCol] of Object.entries(colsByKey)) {
          if (key !== 'police_station' && !key.endsWith('_police_station')) continue;
          const prefix = key === 'police_station' ? '' : key.slice(0, key.length - '_police_station'.length);
          const distKey = prefix ? `${prefix}_district` : 'district';
          const distCol = colsByKey[distKey];
          if (!distCol) continue; // no paired district column on this sheet — leave flat list

          const distColLetter = numToColLetter(distCol);
          const formula = `INDIRECT(VLOOKUP($${distColLetter}5,DISTRICT_TO_PS_NR,2,FALSE))`;
          for (let rIdx = 5; rIdx <= 500; rIdx++) {
            ws.getCell(rIdx, psCol).dataValidation = {
              type: 'list', allowBlank: true, showErrorMessage: false,
              formulae: [formula]
            };
          }
        }
      });
    }

    // ── Third pass: configure Act and Sections sheet dropdown cascades ─────────────────────
    const actSectionWS = workbook.getWorksheet('Act and Sections');
    if (actSectionWS) {
      let actCol = -1;
      let secCol = -1;
      let majCol = -1;
      let minCol = -1;
      actSectionWS.getRow(1).eachCell({ includeEmpty: true }, (cell, c) => {
        if (cell.value === 'act') actCol = c;
        if (cell.value === 'sections') secCol = c;
        if (cell.value === 'crime_head') majCol = c;
        if (cell.value === 'minor_head') minCol = c;
      });

      if (actCol !== -1 && secCol !== -1 && majCol !== -1 && minCol !== -1) {
        const actLetter = numToColLetter(actCol);
        const secLetter = numToColLetter(secCol);
        const majLetter = numToColLetter(majCol);
        const minLetter = numToColLetter(minCol);

        const actsList = ['IPC', 'Delhi Excise Act', 'Arms Act', 'Gambling Act', 'Other Act', 'CrPC', 'BNSS', 'BNS'];

        // Every row in a cascade column gets the SAME validation object (parent ref anchored
        // at the first data row, e.g. $B5). Excel re-anchors that row-relative reference per
        // row, and because the objects are byte-identical the patched optimiser collapses each
        // column into a single clean range (C5:C500 …) — the exact shape Excel produces on save.
        const secFormula = `INDIRECT(VLOOKUP($${actLetter}5,ACT_TO_SECTIONS_NR,2,FALSE))`;
        const majFormula = `INDIRECT(VLOOKUP($${actLetter}5&"|"&$${secLetter}5,SECTION_TO_MAJOR_NR,2,FALSE))`;
        const minFormula = `INDIRECT(VLOOKUP($${majLetter}5,MAJOR_HEAD_TO_MINOR_NR,2,FALSE))`;

        for (let rIdx = 5; rIdx <= 500; rIdx++) {
          // 1. Act — flat list of all Acts (OPT_ACTS_LIST named range)
          actSectionWS.getCell(rIdx, actCol).dataValidation = {
            type: 'list', allowBlank: true, formulae: ['OPT_ACTS_LIST']
          };
          // 2. Sections — dependent on Act (VLOOKUP into ACT_TO_SECTIONS_NR → INDIRECT)
          actSectionWS.getCell(rIdx, secCol).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false, formulae: [secFormula]
          };
          // 3. Major Head — dependent on Section (VLOOKUP into SECTION_TO_MAJOR_NR → INDIRECT)
          actSectionWS.getCell(rIdx, majCol).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false, formulae: [majFormula]
          };
          // 4. Minor Head — dependent on Major Head (VLOOKUP into MAJOR_HEAD_TO_MINOR_NR → INDIRECT)
          if (hasMinorHeadCascade) {
            actSectionWS.getCell(rIdx, minCol).dataValidation = {
              type: 'list', allowBlank: true, showErrorMessage: false, formulae: [minFormula]
            };
          }
        }
      }
    }

    // ── Fourth pass: wire state→district INDIRECT cascade on every sheet ────────────────────
    // For each worksheet, we find every *_district column and its sibling *_state column
    // (same prefix, or bare 'district' paired with bare 'state'). The district dropdown
    // then becomes INDIRECT(VLOOKUP(<state_cell>, STATE_TO_DISTRICT_NR, 2, FALSE)) so only
    // the districts of the selected state are shown.
    if (hasStateDistrictCascade) {
      workbook.worksheets.forEach(ws => {
        if (ws.name === '_Lookups') return;
        const row1 = ws.getRow(1);

        // Build column-key map for this worksheet
        const keyToCol = {};
        row1.eachCell({ includeEmpty: true }, (cell, c) => {
          const k = cell.value ? String(cell.value).trim() : '';
          if (k) keyToCol[k] = c;
        });

        // For each district column on this sheet, find its corresponding state column
        for (const [key, distCol] of Object.entries(keyToCol)) {
          const isDistKey = key === 'district' || key.endsWith('_district');
          if (!isDistKey) continue;

          // Derive the expected state key: same prefix + '_state', or bare 'state'
          let stateKey;
          if (key === 'district') {
            stateKey = 'state';
          } else {
            // e.g. 'complainant_district' -> 'complainant_state'
            stateKey = key.replace(/_district$/, '_state');
          }

          const stateCol = keyToCol[stateKey];
          // No sibling state column ⇒ this is NOT an India-scoped address district — it's a
          // Delhi-police-scoped event district (occurrence_district / arrest_district have no
          // state columns by design, D-A). The first pass left the cascade SENTINEL on these
          // cells (it can't know sibling layout yet); resolve them to the flat POLICE
          // district list here, otherwise they'd ship as a broken literal-sentinel dropdown
          // — dead code while the cascade's data source was empty, live now (WP11).
          const distFormula = stateCol
            ? `INDIRECT(IFERROR(VLOOKUP($${numToColLetter(stateCol)}5,STATE_TO_DISTRICT_NR,2,FALSE),"OPT_INDIA_DISTRICTS"))`
            : (namedRangeMap['district'] || null);
          if (!distFormula) continue;

          for (let rIdx = 5; rIdx <= 500; rIdx++) {
            const cell = ws.getCell(rIdx, distCol);
            // Only overwrite the sentinel cells (preserves any manual override)
            if (cell.dataValidation && cell.dataValidation.formulae &&
                cell.dataValidation.formulae[0] === '"__DIST_INDIRECT_PENDING__"') {
              cell.dataValidation = {
                type: 'list',
                allowBlank: true,
                showErrorMessage: false,
                formulae: [distFormula]
              };
            }
          }
        }
      });
    }

    // Rebuild Row-2 section headers cleanly from each column's hidden key. The per-column
    // insert/delete above leaves the stored merges misaligned, so regenerate them here.
    const parentSheetName = recordType === 'CASE' ? 'General Information' : 'General Info';
    for (const worksheet of workbook.worksheets) {
      if (worksheet.name === '_Lookups') continue; // skip the lookup sheet
      TemplateBuilderService.rebuildSectionHeaders(worksheet, recordType, worksheet.name === parentSheetName);
    }

    // ── Mark required fields RED in Row 3 (label row) ────────────────────────────────────
    // Build a set of all field_keys that are required in the curated config for this
    // record type. Any column whose hidden Row-1 key is in this set gets its Row-3 label
    // cell styled with a RED font so users immediately know it must be filled.
    const requiredFieldKeys = new Set();
    const allCuratedFields = recordType === 'CASE'
      ? [...caseGeneralFields, ...caseActSectionFields, ...caseVictimFields, ...caseAccusedFields, ...casePropertyFields]
      : [...arrestGeneralFields, ...arrestActSectionFields, ...arrestPersonFields, ...arrestPropertyFields];
    for (const f of allCuratedFields) {
      if (f.required === true) requiredFieldKeys.add(f.field_key);
    }

    for (const worksheet of workbook.worksheets) {
      if (worksheet.name === '_Lookups') continue;
      const keyRow   = worksheet.getRow(1);
      const labelRow = worksheet.getRow(3);
      keyRow.eachCell({ includeEmpty: true }, (keyCell, colNum) => {
        const fieldKey = keyCell.value ? String(keyCell.value).trim() : '';
        if (fieldKey && requiredFieldKeys.has(fieldKey)) {
          const labelCell = labelRow.getCell(colNum);
          try {
            const s = JSON.parse(JSON.stringify(labelCell.style || {}));
            s.font = { ...(s.font || {}), bold: true, color: { argb: 'FFFF0000' } };
            labelCell.style = s;
          } catch (_) {}
        }
      });
    }

    // ── Hide internal metadata from users ─────────────────────────────────────────────────
    // Row 1 contains raw field_key names (used by the import parser to identify columns).
    // It must NOT be visible to the person filling the template.
    // Strategy: set row height to ~0 and font to white (invisible if accidentally revealed).
    for (const worksheet of workbook.worksheets) {
      if (worksheet.name === '_Lookups') continue;
      const keyRow = worksheet.getRow(1);
      keyRow.height = 0.1; // visually zero height in Excel/LibreOffice
      keyRow.hidden = true; // explicitly hide the row
      keyRow.eachCell({ includeEmpty: true }, (cell) => {
        try {
          const existingStyle = JSON.parse(JSON.stringify(cell.style || {}));
          existingStyle.font = { ...(existingStyle.font || {}), color: { argb: 'FFFFFFFF' }, size: 1 };
          cell.style = existingStyle;
        } catch (_) {}
      });
    }

    // WP7 hardening — see the function's own header comment above for the full design
    // rationale (why this runs as a post-pass, what it deliberately does and doesn't touch).
    const fieldMetaByKey = buildFieldMetaMap([...typeFields, ...autoFields], activeRegistryFields);
    applyFieldLevelHardening(workbook, fieldMetaByKey);
    trimTrailingEmptyColumns(workbook);

    return workbook;

  }

  // Wires state→district INDIRECT cascade onto all sheets of a workbook for record types
  // (UIDB, MISSING, KALANDRA) that build their templates via addSheetToWorkbook.
  // Must be called AFTER addSheetToWorkbook so all columns are present.
  // For each sheet it finds *_district / *_state column pairs (by Row-1 field_key) and
  // replaces the "__DIST_INDIRECT_PENDING__" sentinel with the real INDIRECT formula,
  // then also registers the STATE_TO_DISTRICT_NR named range on the _Lookups sheet.
  static async wireStateDistrictCascade(workbook) {
    let liveLookups = {};
    let hasStateDistrictCascade = false;
    try {
      liveLookups = await buildLiveLookups('CASE'); // record type doesn't affect state/district data
      ({ hasStateDistrictCascade } = createLookupsSheet(workbook, liveLookups, { preserveExisting: true }));
    } catch (err) {
      logger.error('wireStateDistrictCascade: failed to build live lookups', { err: err.message });
      return;
    }
    if (!hasStateDistrictCascade) return;

    workbook.worksheets.forEach(ws => {
      if (ws.name === '_Lookups') return;
      const row1 = ws.getRow(1);

      const keyToCol = {};
      row1.eachCell({ includeEmpty: true }, (cell, c) => {
        const k = cell.value ? String(cell.value).trim() : '';
        if (k) keyToCol[k] = c;
      });

      for (const [key, distCol] of Object.entries(keyToCol)) {
        const isDistKey = key === 'district' || key.endsWith('_district');
        if (!isDistKey) continue;

        const stateKey = key === 'district' ? 'state' : key.replace(/_district$/, '_state');
        const stateCol = keyToCol[stateKey];
        if (!stateCol) continue;

        const stateColLetter = numToColLetter(stateCol);
        // Fallback (state empty / 'Other UT/State') is the full-India address superset, not
        // the police-district list — these are person-address cells (WP11).
        const distFormula = `INDIRECT(IFERROR(VLOOKUP($${stateColLetter}5,STATE_TO_DISTRICT_NR,2,FALSE),"OPT_INDIA_DISTRICTS"))`;

        for (let rIdx = 5; rIdx <= 1000; rIdx++) {
          ws.getCell(rIdx, distCol).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false,
            formulae: [distFormula]
          };
        }
      }
    });
  }

  // Wires the same Act -> Sections/Major-Head -> Minor-Head cascade used by CASE/ARREST's
  // "Act and Sections" sheet onto an arbitrary worksheet + column-key set, for record types
  // (currently UIDB) that build their workbook from addSheetToWorkbook rather than a
  // hand-designed base .xlsx. Reuses buildLiveLookups/createLookupsSheet so the option lists
  // stay identical to CASE/ARREST's — same DB tables, same named-range scheme.
  // keys: { act, sections, major, minor } — the Row-1 field_key each column is stored under.
  static async wireActSectionCascade(workbook, worksheet, recordType, keys) {
    if (!worksheet) return;

    let liveLookups = {};
    let namedRangeMap = {};
    let hasMinorHeadCascade = false;
    try {
      liveLookups = await buildLiveLookups(recordType);
      ({ namedRangeMap, hasMinorHeadCascade } = createLookupsSheet(workbook, liveLookups, { preserveExisting: true }));
    } catch (err) {
      logger.error('wireActSectionCascade: failed to build live lookups (dropdowns will be static)', { err: err.message });
      return;
    }
    if (!namedRangeMap) return;

    let actCol = -1, secCol = -1, majCol = -1, minCol = -1;
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, c) => {
      if (cell.value === keys.act) actCol = c;
      if (cell.value === keys.sections) secCol = c;
      if (cell.value === keys.major) majCol = c;
      if (cell.value === keys.minor) minCol = c;
    });
    if (actCol === -1 || secCol === -1 || majCol === -1 || minCol === -1) return;

    const actLetter = numToColLetter(actCol);
    const secLetter = numToColLetter(secCol);
    const majLetter = numToColLetter(majCol);

    const secFormula = `INDIRECT(VLOOKUP($${actLetter}5,ACT_TO_SECTIONS_NR,2,FALSE))`;
    const majFormula = `INDIRECT(VLOOKUP($${actLetter}5&"|"&$${secLetter}5,SECTION_TO_MAJOR_NR,2,FALSE))`;
    const minFormula = `INDIRECT(VLOOKUP($${majLetter}5,MAJOR_HEAD_TO_MINOR_NR,2,FALSE))`;

    for (let rIdx = 5; rIdx <= 500; rIdx++) {
      worksheet.getCell(rIdx, actCol).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['OPT_ACTS_LIST']
      };

      worksheet.getCell(rIdx, secCol).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: false,
        formulae: [secFormula]
      };

      worksheet.getCell(rIdx, majCol).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: false,
        formulae: [majFormula]
      };

      if (hasMinorHeadCascade) {
        worksheet.getCell(rIdx, minCol).dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: false,
          formulae: [minFormula]
        };
      }
    }
  }

  // Recomputes the merged Row-2 section-header banner from Row-1 keys. Idempotent and
  // robust to earlier merge corruption: unmerge everything on Row 2, derive each column's
  // label (carrying forward for label-only/temporal columns), then re-merge equal runs.
  static rebuildSectionHeaders(worksheet, recordType, isParentSheet) {
    const keys = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, c) => {
      keys[c] = cell.value ? String(cell.value).trim() : '';
    });
    const maxCol = worksheet.columnCount;
    if (maxCol < 1) return;

    // Preserve the header cell styling (blue fill / white bold) from the current Row-2 cell
    const refStyle = JSON.parse(JSON.stringify(worksheet.getCell(2, 1).style || {}));

    // Derive a label for every column, carrying the previous label forward when null
    const labels = [];
    let prev = isParentSheet ? 'General Information' : 'Case Reference';
    for (let c = 1; c <= maxCol; c++) {
      let label = sectionLabelForKey(keys[c] || '', recordType, isParentSheet);
      if (!label) label = prev;
      labels[c] = label;
      prev = label;
    }

    // Clear existing Row-2 merges
    for (const m of [...(worksheet.model.merges || [])]) {
      try { worksheet.unMergeCells(m); } catch (_) {}
    }

    // Write values + style for the whole row
    for (let c = 1; c <= maxCol; c++) {
      const cell = worksheet.getCell(2, c);
      cell.value = labels[c];
      cell.style = JSON.parse(JSON.stringify(refStyle));
    }

    // Merge consecutive equal-label runs (keep the label only on the run's first cell)
    let start = 1;
    for (let c = 2; c <= maxCol + 1; c++) {
      if (c > maxCol || labels[c] !== labels[start]) {
        if (c - 1 > start) {
          for (let k = start + 1; k <= c - 1; k++) worksheet.getCell(2, k).value = null;
          try { worksheet.mergeCells(2, start, 2, c - 1); } catch (_) {}
        }
        start = c;
      }
    }
    worksheet.getRow(2).height = 25;
  }

  static insertColumnAt(worksheet, colIndex) {
    const maxCols = worksheet.columnCount;
    const dvModel = worksheet.dataValidations && worksheet.dataValidations.model;

    // Shift cells backwards
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      for (let c = maxCols; c >= colIndex; c--) {
        const srcCell = row.getCell(c);
        const destCell = row.getCell(c + 1);

        destCell.value = srcCell.value;
        destCell.style = srcCell.style;
        if (srcCell.dataValidation) {
          destCell.dataValidation = srcCell.dataValidation;
        } else if (dvModel) {
          // Explicitly drop any stale entry at the destination address rather than
          // leaving it — a null/undefined value here still counts as a model key and
          // corrupts ExcelJS's range-merging optimiser on write (see deleteColumnAt).
          delete dvModel[destCell.address];
        }

        srcCell.value = null;
        srcCell.style = {};
        if (dvModel) delete dvModel[srcCell.address];
      }
    });

    // Splice columns width configuration
    if (worksheet.columns) {
      const cols = [...worksheet.columns];
      cols.splice(colIndex - 1, 0, { width: 15 });
      worksheet.columns = cols;
    }

    // Shift and update merged ranges
    if (worksheet.model.merges) {
      const newMerges = worksheet.model.merges.map(mergeStr => {
        const { startCol, startRow, endCol, endRow } = parseRange(mergeStr);
        let newStartCol = startCol;
        let newEndCol = endCol;
        
        if (startCol >= colIndex) {
          newStartCol = startCol + 1;
          newEndCol = endCol + 1;
        } else if (endCol >= colIndex) {
          newEndCol = endCol + 1;
        }
        
        return `${numToColLetter(newStartCol)}${startRow}:${numToColLetter(newEndCol)}${endRow}`;
      });
      worksheet.model.merges = newMerges;
    }
  }

  static deleteColumnAt(worksheet, colIndex) {
    const maxCols = worksheet.columnCount;
    const dvModel = worksheet.dataValidations && worksheet.dataValidations.model;

    // Capture each merge's master (top-left) value BEFORE shifting. Shifting left can
    // clobber a master cell when the deleted column IS the master, which would drop the
    // section-header label (e.g. "Property Details") from the surviving merge.
    const mergeMasters = [];
    if (worksheet.model.merges) {
      for (const mergeStr of worksheet.model.merges) {
        const { startCol, startRow, endCol, endRow } = parseRange(mergeStr);
        mergeMasters.push({ startCol, startRow, endCol, endRow, value: worksheet.getCell(startRow, startCol).value });
      }
    }

    // Shift cells forwards (left)
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      for (let c = colIndex; c < maxCols; c++) {
        const srcCell = row.getCell(c + 1);
        const destCell = row.getCell(c);

        destCell.value = srcCell.value;
        destCell.style = srcCell.style;
        if (srcCell.dataValidation) {
          destCell.dataValidation = srcCell.dataValidation;
        } else if (dvModel) {
          // Delete the model key outright — assigning null still leaves an entry in
          // worksheet.dataValidations.model, which ExcelJS's range-merging optimiser
          // (optimiseDataValidations) can group into a blank range that overlaps and
          // shadows a real dropdown validation elsewhere in the same column on write.
          delete dvModel[destCell.address];
        }
      }
      // Clear the last cell
      const lastCell = row.getCell(maxCols);
      lastCell.value = null;
      lastCell.style = {};
      if (dvModel) delete dvModel[lastCell.address];
    });

    // Shift and update merged ranges, then restore any lost master values
    const newMerges = [];
    const restores = [];
    for (const m of mergeMasters) {
      const { startCol, startRow, endCol, endRow, value } = m;

      if (startCol === colIndex && endCol === colIndex) {
        // Single-cell merge on the deleted column — discard completely
        continue;
      }

      let newStartCol = startCol;
      let newEndCol = endCol;
      if (startCol > colIndex) newStartCol = startCol - 1;
      if (endCol >= colIndex) newEndCol = endCol - 1;

      // Only keep if the merge is still valid (spans >1 cell)
      if (newStartCol < newEndCol || startRow < endRow) {
        newMerges.push(`${numToColLetter(newStartCol)}${startRow}:${numToColLetter(newEndCol)}${endRow}`);
        restores.push({ row: startRow, col: newStartCol, value });
      }
    }
    worksheet.model.merges = newMerges;

    // Restore master values that the shift may have blanked out
    for (const { row, col, value } of restores) {
      if (value === null || value === undefined || value === '') continue;
      const cell = worksheet.getCell(row, col);
      if (cell.value === null || cell.value === undefined || cell.value === '') {
        cell.value = value;
      }
    }

    // Splice columns width configuration
    if (worksheet.columns) {
      const cols = [...worksheet.columns];
      cols.splice(colIndex - 1, 1);
      worksheet.columns = cols;
    }
  }
}
