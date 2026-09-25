/**
 * Dimension Sync & Key Resolvers (ETL Layer)
 * ==========================================
 * Manages the population of reporting dimensions (dim_*) and maps
 * source IDs/strings to integer surrogate keys (sk).
 */

import { wh } from '../warehouse.db.js';
import {
  normalizeOfficerName,
  normalizeCrimeHead,
  normalizeStatus,
  normalizeActLaw
} from './normalize.js';
import db from '../../../config/db.js';
import { logger } from '../../../utils/logger.js';

// In-memory caches to speed up batch lookups during a sync run
let districtCache = new Map();   // source_district_id -> sk
let psCache = new Map();         // source_ps_id -> sk
let officerCache = new Map();    // name_normalized -> sk
let crimeHeadCache = new Map();   // value_normalized -> sk
let statusCache = new Map();      // record_type:value_normalized -> sk
let actLawCache = new Map();     // value_normalized -> sk

/** Clears the in-memory caches (call before starting a sync/backfill run). */
export function clearDimensionCaches() {
  districtCache.clear();
  psCache.clear();
  officerCache.clear();
  crimeHeadCache.clear();
  statusCache.clear();
  actLawCache.clear();
}

/**
 * Pre-populates district and police station caches from the warehouse.
 * If the caches are empty, loads them from existing warehouse records.
 */
export async function populateLocationCaches() {
  if (districtCache.size === 0) {
    const districts = await wh('dim_district').select('sk', 'source_district_id');
    for (const d of districts) {
      districtCache.set(d.source_district_id, d.sk);
    }
  }
  if (psCache.size === 0) {
    const stations = await wh('dim_police_station').select('sk', 'source_ps_id');
    for (const s of stations) {
      psCache.set(s.source_ps_id, s.sk);
    }
  }
}

/**
 * Helper to recursively walk up the operational hierarchy_nodes
 * starting from a node to locate its parent district.
 */
async function getDistrictIdForNode(nodeId) {
  let currentId = nodeId;
  const maxDepth = 10;
  let depth = 0;
  while (currentId && depth < maxDepth) {
    const node = await db('hierarchy_nodes').where({ id: currentId }).first();
    if (!node) break;
    if (node.node_type === 'DISTRICT') return node.id;
    currentId = node.parent_id;
    depth++;
  }
  return null;
}

/**
 * Synchronizes dim_district and dim_police_station from the operational
 * hierarchy_nodes table.
 */
export async function syncHierarchyDimensions() {
  clearDimensionCaches();

  // 1. Sync Districts
  const opDistricts = await db('hierarchy_nodes')
    .where({ node_type: 'DISTRICT', is_active: true })
    .select('id', 'name_en', 'name_hi', 'code');

  for (const op of opDistricts) {
    let existing = await wh('dim_district').where({ source_district_id: op.id }).first();
    let sk;
    if (existing) {
      await wh('dim_district')
        .where({ sk: existing.sk })
        .update({
          name_en: op.name_en,
          name_hi: op.name_hi || '',
          code: op.code
        });
      sk = existing.sk;
    } else {
      const [newSk] = await wh('dim_district')
        .insert({
          source_district_id: op.id,
          name_en: op.name_en,
          name_hi: op.name_hi || '',
          code: op.code
        })
        .returning('sk');
      // Knex insert might return an array of objects or values depending on DB driver
      sk = typeof newSk === 'object' ? newSk.sk : newSk;
    }
    districtCache.set(op.id, sk);
  }

  // 2. Sync Police Stations
  const opPS = await db('hierarchy_nodes')
    .where({ node_type: 'PS', is_active: true })
    .select('id', 'name_en', 'name_hi', 'code', 'parent_id');

  for (const op of opPS) {
    // Resolve parent district
    const opDistrictId = await getDistrictIdForNode(op.id);
    if (!opDistrictId) {
      logger.warn(`[Warehouse] Could not find district for PS: ${op.id} (${op.name_en})`);
      continue;
    }

    let districtSk = districtCache.get(opDistrictId);
    if (!districtSk) {
      // Lazy load district if it wasn't processed
      const dRow = await wh('dim_district').where({ source_district_id: opDistrictId }).first();
      if (dRow) {
        districtSk = dRow.sk;
        districtCache.set(opDistrictId, districtSk);
      } else {
        logger.warn(`[Warehouse] District SK not found in DB for: ${opDistrictId}`);
        continue;
      }
    }

    let existing = await wh('dim_police_station').where({ source_ps_id: op.id }).first();
    let sk;
    if (existing) {
      await wh('dim_police_station')
        .where({ sk: existing.sk })
        .update({
          name_en: op.name_en,
          name_hi: op.name_hi || '',
          code: op.code,
          district_sk: districtSk
        });
      sk = existing.sk;
    } else {
      const [newSk] = await wh('dim_police_station')
        .insert({
          source_ps_id: op.id,
          name_en: op.name_en,
          name_hi: op.name_hi || '',
          code: op.code,
          district_sk: districtSk
        })
        .returning('sk');
      sk = typeof newSk === 'object' ? newSk.sk : newSk;
    }
    psCache.set(op.id, sk);
  }

  return {
    districtsSynced: districtCache.size,
    psSynced: psCache.size
  };
}

/** Resolves the surrogate key for a district ID. */
export async function getDistrictSk(sourceDistrictId) {
  if (!sourceDistrictId) return null;
  if (districtCache.has(sourceDistrictId)) {
    return districtCache.get(sourceDistrictId);
  }
  const row = await wh('dim_district').where({ source_district_id: sourceDistrictId }).first();
  if (row) {
    districtCache.set(sourceDistrictId, row.sk);
    return row.sk;
  }
  return null;
}

/** Resolves the surrogate key for a police station ID. */
export async function getPsSk(sourcePsId) {
  if (!sourcePsId) return null;
  if (psCache.has(sourcePsId)) {
    return psCache.get(sourcePsId);
  }
  const row = await wh('dim_police_station').where({ source_ps_id: sourcePsId }).first();
  if (row) {
    psCache.set(sourcePsId, row.sk);
    return row.sk;
  }
  return null;
}

/** Resolves or creates dim_officer for the given raw name. */
export async function resolveOfficerSk(rawName) {
  if (!rawName) return null;
  const normalized = normalizeOfficerName(rawName);
  if (officerCache.has(normalized)) {
    return officerCache.get(normalized);
  }

  // Check DB
  let row = await wh('dim_officer').where({ name_normalized: normalized }).first();
  if (!row) {
    const [newSk] = await wh('dim_officer')
      .insert({
        name_raw: rawName,
        name_normalized: normalized,
        is_unmapped: false
      })
      .returning('sk');
    const sk = typeof newSk === 'object' ? newSk.sk : newSk;
    row = { sk };
  }

  officerCache.set(normalized, row.sk);
  return row.sk;
}

/** Resolves or creates dim_crime_head for the given raw value. */
export async function resolveCrimeHeadSk(rawValue) {
  if (!rawValue) return null;
  const normalized = normalizeCrimeHead(rawValue);
  if (crimeHeadCache.has(normalized)) {
    return crimeHeadCache.get(normalized);
  }

  let row = await wh('dim_crime_head').where({ value_normalized: normalized }).first();
  if (!row) {
    const [newSk] = await wh('dim_crime_head')
      .insert({
        value_raw: rawValue,
        value_normalized: normalized,
        is_unmapped: false
      })
      .returning('sk');
    const sk = typeof newSk === 'object' ? newSk.sk : newSk;
    row = { sk };
  }

  crimeHeadCache.set(normalized, row.sk);
  return row.sk;
}

/** Resolves or creates dim_case_status for the given record type & raw status. */
export async function resolveStatusSk(recordType, rawValue) {
  if (!rawValue) return null;
  const normalized = normalizeStatus(rawValue);
  const cacheKey = `${recordType}:${normalized}`;
  if (statusCache.has(cacheKey)) {
    return statusCache.get(cacheKey);
  }

  let row = await wh('dim_case_status')
    .where({ record_type: recordType, value_normalized: normalized })
    .first();

  if (!row) {
    const [newSk] = await wh('dim_case_status')
      .insert({
        record_type: recordType,
        value_raw: rawValue,
        value_normalized: normalized,
        is_unmapped: false
      })
      .returning('sk');
    const sk = typeof newSk === 'object' ? newSk.sk : newSk;
    row = { sk };
  }

  statusCache.set(cacheKey, row.sk);
  return row.sk;
}

/** Resolves or creates dim_act_law for the given raw act. */
export async function resolveActLawSk(rawValue) {
  if (!rawValue) return null;
  const normalized = normalizeActLaw(rawValue);
  if (actLawCache.has(normalized)) {
    return actLawCache.get(normalized);
  }

  let row = await wh('dim_act_law').where({ value_normalized: normalized }).first();
  if (!row) {
    const [newSk] = await wh('dim_act_law')
      .insert({
        value_raw: rawValue,
        value_normalized: normalized,
        is_unmapped: false
      })
      .returning('sk');
    const sk = typeof newSk === 'object' ? newSk.sk : newSk;
    row = { sk };
  }

  actLawCache.set(normalized, row.sk);
  return row.sk;
}
