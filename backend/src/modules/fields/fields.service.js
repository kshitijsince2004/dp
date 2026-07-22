import db from '../../config/db.js';
import { PROPERTY_CATEGORY_SOURCES } from './classificationSources.config.js';
import { getLogger } from '../../utils/logger.js';

// --- ref-schema lookup service (shared by fields.controller.js's standalone
// /lookup/* endpoints and getFieldsForForm) ---
//
// Queries the ref.* lookup tables (loaded by `npm run load-ref`; the old excel_*
// tables are dead). Returns raw domain rows (native column names); HTTP-facing
// {value,label} shaping happens in the controller, so the response shapes the
// frontend forms consume are unchanged. All table/column names for the
// property-category dispatch are resolved through classificationSources.config.js —
// no dynamic identifiers are ever built from request input.

// Style anchor: records.service.js (HANDOFF.md §7). These are thin read-only ref.* lookups —
// entry/exit-with-count is the right density (no per-row loop logging).
const log = getLogger('fields.service');

export const getActs = async () => {
  log.debug('getActs: enter', {});
  const rows = await db('ref.acts').select('act_cd', 'act_long').orderBy('act_long', 'asc');
  log.debug('getActs: exit', { count: rows.length });
  return rows;
};

export const getSectionsForActs = async (actCds) => {
  log.debug('getSectionsForActs: enter', { actCds });
  const rows = await db('ref.sections')
    .whereIn('act_sec_cd', actCds.map(String))
    .select('section_code', 'section', 'section_desc', 'pnsh_gt_7yrs')
    .distinct()
    .orderBy('section', 'asc');
  log.debug('getSectionsForActs: exit', { actCds, count: rows.length });
  return rows;
};

export const getMajorHeadsForActs = async (actCds) => {
  log.debug('getMajorHeadsForActs: enter', { actCds });
  const rows = await db('ref.major_heads as mh')
    .join('ref.major_minor_mapping as m', 'mh.major_head_code', 'm.major_head_code')
    .whereIn('m.act_cd', actCds)
    .select('mh.major_head_code', 'mh.major_head')
    .distinct()
    .orderBy('mh.major_head', 'asc');
  log.debug('getMajorHeadsForActs: exit', { actCds, count: rows.length });
  return rows;
};

export const getMajorHeadsForSection = async (sectionCode) => {
  log.debug('getMajorHeadsForSection: enter', { sectionCode });
  const rows = await db('ref.major_heads as mh')
    .join('ref.major_minor_mapping as m', 'mh.major_head_code', 'm.major_head_code')
    .where('m.section_code', sectionCode)
    .select('mh.major_head_code', 'mh.major_head')
    .distinct()
    .orderBy('mh.major_head', 'asc');
  log.debug('getMajorHeadsForSection: exit', { sectionCode, count: rows.length });
  return rows;
};

export const getMinorHeadsForMajorHeads = async (majorHeadCodes) => {
  log.debug('getMinorHeadsForMajorHeads: enter', { majorHeadCodes: majorHeadCodes || [] });
  if (!majorHeadCodes || majorHeadCodes.length === 0) {
    log.debug('getMinorHeadsForMajorHeads: exit — no major head codes given', {});
    return [];
  }
  const rows = await db('ref.minor_heads')
    .whereIn('major_head_code', majorHeadCodes)
    .select('minor_head_cd', 'minor_head')
    .distinct()
    .orderBy('minor_head', 'asc');
  log.debug('getMinorHeadsForMajorHeads: exit', { majorHeadCodes, count: rows.length });
  return rows;
};

// Every minor head joined to its major head's label, for every major head that has at
// least one minor head — not scoped to any single act. Used to build a fully DB-driven
// major-head -> minor-head cascade (one named range per major head label) instead of a
// hand-curated list of per-crime-type minor_head field_keys.
export const getAllMinorHeadsByMajorHead = async () => {
  log.debug('getAllMinorHeadsByMajorHead: enter', {});
  const rows = await db('ref.minor_heads as mn')
    .join('ref.major_heads as mh', 'mh.major_head_code', 'mn.major_head_code')
    .select('mh.major_head', 'mn.minor_head_cd', 'mn.minor_head')
    .distinct()
    .orderBy('mh.major_head', 'asc')
    .orderBy('mn.minor_head', 'asc');
  log.debug('getAllMinorHeadsByMajorHead: exit', { count: rows.length });
  return rows;
};

// ref.property_categories merges the former property_types (top-level, major_property=1)
// and other_property_categories (sub-categories under OTHERS, major_property=0) —
// major_property IS the discriminator (verified against loaded data 2026-07-14).
export const getPropertyCategories = async () => {
  log.debug('getPropertyCategories: enter', {});
  const rows = await db('ref.property_categories')
    .where({ major_property: 1 })
    .select('parent_srno', 'parent_cd', 'code_type', 'parent_type', 'major_property')
    .orderBy('code_type', 'asc');
  log.debug('getPropertyCategories: exit', { count: rows.length });
  return rows;
};

export const getPropertyItemsForCategory = async (parentCd) => {
  const pCd = parseInt(parentCd, 10);
  const src = PROPERTY_CATEGORY_SOURCES[pCd];
  log.debug('getPropertyItemsForCategory: enter', { parentCd, resolvedPCd: pCd, sourceType: src?.type || 'OTHER_PROPERTY(default)' });

  if (src?.type === 'ARMS') {
    const made = await db('ref.arms_made').select('arms_made_cd', 'arms_made');
    const categories = await db('ref.arms_categories').select('arms_category_cd', 'arms_category');
    const fireArms = await db('ref.fire_arms').select('fire_arms_cd', 'arms_category_cd', 'fire_arms');
    const fireArmsSubtypes = await db('ref.fire_arms_subtypes').select('arms_subtype_cd', 'arms_type_cd', 'arms_subtype');
    log.debug('getPropertyItemsForCategory: exit — ARMS branch', {
      parentCd, madeCount: made.length, categoriesCount: categories.length, fireArmsCount: fireArms.length, fireArmsSubtypesCount: fireArmsSubtypes.length,
    });
    return { type: 'ARMS', made, categories, fireArms, fireArmsSubtypes };
  }

  if (src?.type === 'GENERIC') {
    const rows = await db(src.table)
      .select(`${src.valueColumn} as value`, `${src.labelColumn} as label`)
      .orderBy(src.labelColumn, 'asc');
    log.debug('getPropertyItemsForCategory: exit — GENERIC branch', { parentCd, table: src.table, count: rows.length });
    return rows;
  }

  // OTHERS (parent_cd 0) is itself a 2-level structure, same shape as ARMS: the
  // major_property=0 rows of ref.property_categories (Agriculture Products, Animals, ...)
  // are the Type of Property list; ref.other_property_items (keyed by THOSE sub-category
  // parent_cds, not by 0) is the Property Subtype list. Querying ref.other_property_items
  // directly by the major parent_cd (0) — as a flat fallback would — returns nothing,
  // since no row in that table is ever keyed 0.
  const categories = await db('ref.property_categories')
    .where({ major_property: 0 })
    .select('parent_cd', 'code_type')
    .orderBy('code_type', 'asc');
  const items = await db('ref.other_property_items')
    .select('parent_cd', 'property_cd', 'property')
    .orderBy('property', 'asc');
  log.debug('getPropertyItemsForCategory: exit — OTHER_PROPERTY branch (default)', { parentCd, categoriesCount: categories.length, itemsCount: items.length });
  return { type: 'OTHER_PROPERTY', categories, items };
};

export const getBeats = async (psCd) => {
  log.debug('getBeats: enter', { psCd: psCd || null });
  // source_ps_cd aliased back to ps_cd — the /lookup/beats response shape is frozen
  let query = db('ref.beats').select('beat_cd', 'beat_name', 'source_ps_cd as ps_cd');
  if (psCd) {
    query = query.where({ source_ps_cd: String(psCd) });
  }
  const rows = await query.orderBy('beat_name', 'asc');
  log.debug('getBeats: exit', { psCd: psCd || null, count: rows.length });
  return rows;
};

export const getLocalHeads = async () => {
  log.debug('getLocalHeads: enter', {});
  const rows = await db('ref.local_heads').select('local_head_cd', 'local_head').orderBy('local_head', 'asc');
  log.debug('getLocalHeads: exit', { count: rows.length });
  return rows;
};

let cachedRegistry = null;

export const getActsSectionsRegistry = async () => {
  log.debug('getActsSectionsRegistry: enter', { cached: !!cachedRegistry });
  if (cachedRegistry) {
    log.debug('getActsSectionsRegistry: exit — served from cache', { actCount: cachedRegistry.length });
    return cachedRegistry;
  }

  const acts = await db('ref.acts').select('act_cd', 'act_long');
  const sections = await db('ref.sections').select('act_sec_cd', 'section', 'section_desc', 'section_code');
  log.debug('getActsSectionsRegistry: loaded raw acts/sections', { actCount: acts.length, sectionCount: sections.length });

  const sectionsByActCd = {};
  for (const s of sections) {
    if (!sectionsByActCd[s.act_sec_cd]) {
      sectionsByActCd[s.act_sec_cd] = [];
    }
    sectionsByActCd[s.act_sec_cd].push({
      section: s.section,
      desc: s.section_desc || '',
      // Exact key into ref.major_minor_mapping.section_code — needed so Major Head can be
      // filtered by the specific (act, section) pair chosen, not just the act as a whole.
      section_code: s.section_code
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
      log.debug('getActsSectionsRegistry: merged act_cd into existing group key', { actCd: act.act_cd, actKey, mergedSectionCount: mergedMap.size });
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

  log.info('getActsSectionsRegistry: built and cached registry', { actCount: cachedRegistry.length });
  return cachedRegistry;
};
