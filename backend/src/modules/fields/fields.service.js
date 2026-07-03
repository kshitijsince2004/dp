import db from '../../config/db.js';
import { PROPERTY_CATEGORY_SOURCES } from './classificationSources.config.js';

// --- Excel/master-data lookup service (shared by fields.controller.js's standalone
// /lookup/* endpoints and getFieldsForForm) ---
//
// Returns raw domain rows (native column names); HTTP-facing {value,label} shaping happens
// in the controller. All table/column names for the property-category dispatch are resolved
// through classificationSources.config.js — no dynamic identifiers are ever built from request
// input.

export const getActs = async () => {
  return db('excel_acts').select('act_cd', 'act_long').orderBy('act_long', 'asc');
};

export const getSectionsForActs = async (actCds) => {
  return db('excel_sections')
    .whereIn('act_sec_cd', actCds.map(String))
    .select('section_code', 'section', 'section_desc', 'pnsh_gt_7yrs')
    .distinct()
    .orderBy('section', 'asc');
};

export const getMajorHeadsForActs = async (actCds) => {
  return db('excel_major_heads as mh')
    .join('excel_major_minor_mapping as m', 'mh.major_head_code', 'm.major_head_code')
    .whereIn('m.act_cd', actCds)
    .select('mh.major_head_code', 'mh.major_head')
    .distinct()
    .orderBy('mh.major_head', 'asc');
};

export const getMajorHeadsForSection = async (sectionCode) => {
  return db('excel_major_heads as mh')
    .join('excel_major_minor_mapping as m', 'mh.major_head_code', 'm.major_head_code')
    .where('m.section_code', sectionCode)
    .select('mh.major_head_code', 'mh.major_head')
    .distinct()
    .orderBy('mh.major_head', 'asc');
};

export const getMinorHeadsForMajorHeads = async (majorHeadCodes) => {
  if (!majorHeadCodes || majorHeadCodes.length === 0) return [];
  return db('excel_minor_heads')
    .whereIn('major_head_code', majorHeadCodes)
    .select('minor_head_cd', 'minor_head')
    .distinct()
    .orderBy('minor_head', 'asc');
};

export const getPropertyCategories = async () => {
  const standard = await db('excel_property_types').select('parent_srno', 'parent_cd', 'code_type', 'parent_type', 'major_property');
  const others = await db('excel_other_property_categories').select('parent_srno', 'parent_cd', 'code_type', 'parent_type', 'major_property');

  const map = new Map();
  for (const item of [...standard, ...others]) {
    map.set(item.parent_cd, item);
  }
  return Array.from(map.values()).sort((a, b) => a.code_type.localeCompare(b.code_type));
};

export const getPropertyItemsForCategory = async (parentCd) => {
  const pCd = parseInt(parentCd, 10);
  const src = PROPERTY_CATEGORY_SOURCES[pCd];

  if (src?.type === 'ARMS') {
    const made = await db('excel_arms_made').select('arms_made_cd', 'arms_made');
    const categories = await db('excel_arms_categories').select('arms_category_cd', 'arms_category');
    const fireArms = await db('excel_fire_arms').select('fire_arms_cd', 'arms_category_cd', 'fire_arms');
    return { type: 'ARMS', made, categories, fireArms };
  }

  if (src?.type === 'GENERIC') {
    return db(src.table)
      .select(`${src.valueColumn} as value`, `${src.labelColumn} as label`)
      .orderBy(src.labelColumn, 'asc');
  }

  return db('excel_other_property_items')
    .where({ parent_cd: pCd })
    .select('property_cd', 'property')
    .orderBy('property', 'asc');
};

export const getBeats = async (psCd) => {
  let query = db('excel_beats').select('beat_cd', 'beat_name', 'ps_cd');
  if (psCd) {
    query = query.where({ ps_cd: String(psCd) });
  }
  return query.orderBy('beat_name', 'asc');
};

export const getLocalHeads = async () => {
  return db('excel_local_heads').select('local_head_cd', 'local_head').orderBy('local_head', 'asc');
};

let cachedRegistry = null;

export const getActsSectionsRegistry = async () => {
  if (cachedRegistry) return cachedRegistry;

  const acts = await db('excel_acts').select('act_cd', 'act_long');
  const sections = await db('excel_sections').select('act_sec_cd', 'section', 'section_desc');

  const sectionsByActCd = {};
  for (const s of sections) {
    if (!sectionsByActCd[s.act_sec_cd]) {
      sectionsByActCd[s.act_sec_cd] = [];
    }
    sectionsByActCd[s.act_sec_cd].push({
      section: s.section,
      desc: s.section_desc || ''
    });
  }

  // Mappings to frontend expected keys
  const groupMappings = {
    43: 'IPC',
    3032: 'Delhi Excise Act',
    3270: 'Delhi Excise Act',
    4: 'Arms Act',
    2612: 'Gambling Act',
    68: 'Gambling Act'
  };

  const registryMap = new Map();

  for (const act of acts) {
    const actSections = sectionsByActCd[act.act_cd] || [];
    if (actSections.length === 0) continue;

    // Determine the registry key/act name
    const actKey = groupMappings[act.act_cd] || act.act_long;

    // If we already have sections for this actKey, merge them
    if (registryMap.has(actKey)) {
      const existing = registryMap.get(actKey);
      const mergedMap = new Map();
      for (const item of [...existing, ...actSections]) {
        mergedMap.set(item.section, item);
      }
      registryMap.set(actKey, Array.from(mergedMap.values()));
    } else {
      registryMap.set(actKey, actSections);
    }
  }

  // Convert map to list and sort sections
  cachedRegistry = Array.from(registryMap.entries()).map(([actName, actSections]) => {
    actSections.sort((a, b) => {
      const valA = a.section;
      const valB = b.section;
      const numA = parseInt(valA, 10);
      const numB = parseInt(valB, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return valA.localeCompare(valB);
    });

    return {
      act: actName,
      sections: actSections
    };
  });

  return cachedRegistry;
};
