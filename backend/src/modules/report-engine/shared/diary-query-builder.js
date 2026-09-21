/**
 * Shared Diary Query Builder for PHAROS Report Engine
 * Centralized query interface for all diary renderers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../../config/db.js';
import { buildFnDateWindows, parseToISO } from './date-windows.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load status map and section groups once at module init
let caseStatusMap = {};
let sectionGroups = {};

try {
  const statusMapPath = [
    path.resolve(__dirname, '../../../../config/diary/case-status-map.json'),
    path.resolve(process.cwd(), 'backend/config/diary/case-status-map.json'),
    path.resolve(process.cwd(), 'config/diary/case-status-map.json'),
  ].find(p => fs.existsSync(p));

  if (statusMapPath) {
    caseStatusMap = JSON.parse(fs.readFileSync(statusMapPath, 'utf8'));
  }
} catch (e) {
  console.warn('[diaryQueryBuilder] Warning: Failed to load case-status-map.json', e.message);
}

try {
  const sectionGroupsPath = [
    path.resolve(__dirname, '../../../../config/sections/section-groups.json'),
    path.resolve(process.cwd(), 'backend/config/sections/section-groups.json'),
    path.resolve(process.cwd(), 'config/sections/section-groups.json'),
  ].find(p => fs.existsSync(p));

  if (sectionGroupsPath) {
    sectionGroups = JSON.parse(fs.readFileSync(sectionGroupsPath, 'utf8'));
  }
} catch (e) {
  console.warn('[diaryQueryBuilder] Warning: Failed to load section-groups.json', e.message);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executes a diary aggregate count query safely.
 */
export async function diaryCount(options = {}) {
  try {
    const {
      measure = 'REPORTED',
      recordType = 'CASE',
      headType = null,
      headCodes = [],
      window = 'FN',
      fnEnd = new Date().toISOString().slice(0, 10),
      scopeType = 'PS',
      scopeId = null,
      extraFilter = null,
    } = options;

    let query = db('records as r');

    if (recordType === 'CASE') {
      query = query.join('fir_details as fd', 'fd.record_id', 'r.id');
    } else if (recordType === 'ARREST') {
      query = query.join('arrest_details as ad', 'ad.record_id', 'r.id');
    } else if (recordType === 'MISSING') {
      query = query.join('missing_details as md', 'md.record_id', 'r.id');
    }

    query = query.where('r.record_type', recordType).where('r.current_status', '<>', 'DRAFT');

    // Scope filter
    if (scopeId && UUID_RE.test(scopeId)) {
      if (scopeType === 'PS') {
        query = query.where('r.ps_id', scopeId);
      } else if (scopeType === 'DISTRICT') {
        query = query.where('r.district_id', scopeId);
      }
    }

    // Head filters
    if (headCodes && headCodes.length > 0) {
      if (headType === 'LOCAL') {
        const localHeadCol = recordType === 'ARREST' ? 'ad.local_head_id' : 'fd.local_head_id';
        query = query.join('ref.local_heads as lh', 'lh.local_head_cd', localHeadCol)
                     .whereIn('lh.canonical_code', headCodes);
      } else if (headType === 'SECTION_GROUP') {
        let sections = [];
        headCodes.forEach(g => {
          if (sectionGroups[g]) sections = sections.concat(sectionGroups[g]);
        });
        if (sections.length > 0) {
          query = query.join('record_offences as ro', 'ro.record_id', 'r.id')
                       .join('ref.sections as sec', 'sec.section_cd', 'ro.section_id')
                       .where('ro.is_primary', true)
                       .whereIn('sec.section', sections);
        }
      }
    }

    // Measure predicates
    if (measure === 'WORKED_OUT') {
      query = query.where('fd.is_worked_out', true);
    } else if (measure === 'CHARGESHEETED') {
      const challanVals = caseStatusMap.challan || ['CHARGE SHEET', 'POLICE INVESTIGATION REPORT(PIR-JCL)', 'SUPPLEMENTARY CHARGESHEET'];
      query = query.whereIn('fd.case_status', challanVals);
    } else if (measure === 'CANCELLED') {
      const cancelledVals = caseStatusMap.cancelled || ['CANCELLED', 'CANCELLATION'];
      query = query.whereIn('fd.case_status', cancelledVals);
    } else if (measure === 'UNTRACED') {
      const untracedVals = caseStatusMap.untraced || ['UNTRACED'];
      query = query.whereIn('fd.case_status', untracedVals);
    } else if (measure === 'PERSONS_ARRESTED') {
      query = query.whereExists(function() {
        this.select(1)
            .from('record_links as rl')
            .join('link_type_registry as lt', 'lt.id', 'rl.link_type_id')
            .where('lt.code', 'CASE_ARREST')
            .whereRaw('rl.source_record_id = r.id');
      });
    }

    // Date window filtering
    const fnStr = typeof fnEnd === 'string' ? fnEnd : fnEnd.toISOString().slice(0, 10);
    const windows = buildFnDateWindows(fnStr);
    let startDate = windows.fnStart;
    let endDate = windows.fnEnd;
    if (window === 'UPTO') {
      startDate = windows.jan1Curr;
    }

    query = query.whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [startDate, endDate]);

    if (extraFilter && typeof extraFilter === 'function') {
      query = extraFilter(query);
    }

    const res = await query.count('* as cnt').first();
    return parseInt(res?.cnt || 0, 10);
  } catch (err) {
    console.warn(`[diaryQueryBuilder] Error computing count: ${err.message}`);
    return 0;
  }
}

/**
 * Returns a list of detailed records for diary proformas (CA-6 listing sheets).
 */
export async function diaryList(options = {}) {
  try {
    const {
      recordType = 'CASE',
      scopeId = null,
      limit = 100,
    } = options;

    let query = db('records as r')
      .where('r.record_type', recordType)
      .where('r.current_status', '<>', 'DRAFT');

    if (scopeId && UUID_RE.test(scopeId)) {
      query = query.where('r.ps_id', scopeId);
    }

    return await query.select('r.*').limit(limit);
  } catch (err) {
    console.warn(`[diaryQueryBuilder] Error fetching list: ${err.message}`);
    return [];
  }
}

/**
 * Counts cases transferred based on fir_details transfer columns (Blocker B1 resolution).
 * direction:
 *   'OUT_PS'     → transferred to another Delhi PS (transferred_to_ps_id IS NOT NULL OR transfer_to_type = 'PS')
 *   'OUT_AGENCY' → transferred to external agency (transferred_to_agency_id IS NOT NULL OR transfer_to_type = 'AGENCY')
 *   'IN'         → null (needs original_ps_id tracking)
 */
export async function diaryTransferCount(options = {}) {
  try {
    const {
      direction = 'OUT_PS',
      headCodes = [],
      headType = 'LOCAL',
      window = 'FN',
      fnEnd = new Date().toISOString().slice(0, 10),
      scopeType = 'PS',
      scopeId = null,
      extraWhere = null,
    } = options;

    if (direction === 'IN') {
      return null;
    }

    let query = db('records as r')
      .join('fir_details as fd', 'fd.record_id', 'r.id')
      .where('r.record_type', 'CASE')
      .where('r.current_status', '<>', 'DRAFT');

    if (scopeId && UUID_RE.test(scopeId)) {
      if (scopeType === 'PS') {
        query = query.where('r.ps_id', scopeId);
      } else if (scopeType === 'DISTRICT') {
        query = query.where('r.district_id', scopeId);
      }
    }

    if (direction === 'OUT_PS') {
      query = query.where(builder => {
        builder.whereNotNull('fd.transferred_to_ps_id')
               .orWhere('fd.transfer_to_type', 'PS');
      });
    } else if (direction === 'OUT_AGENCY') {
      query = query.where(builder => {
        builder.whereNotNull('fd.transferred_to_agency_id')
               .orWhere('fd.transfer_to_type', 'AGENCY');
      });
    }

    if (headCodes && headCodes.length > 0) {
      if (headType === 'LOCAL') {
        query = query.join('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
                     .whereIn('lh.canonical_code', headCodes);
      }
    }

    if (extraWhere) {
      query = query.whereRaw(extraWhere);
    }

    const fnStr = typeof fnEnd === 'string' ? fnEnd : fnEnd.toISOString().slice(0, 10);
    const windows = buildFnDateWindows(fnStr);
    let startDate = windows.fnStart;
    let endDate = windows.fnEnd;
    if (window === 'UPTO') {
      startDate = windows.jan1Curr;
    }

    const dateCol = 'COALESCE(fd.date_of_transfer, r.registration_date, r.record_date)';
    query = query.whereRaw(`${dateCol} BETWEEN ? AND ?`, [startDate, endDate]);

    const res = await query.count('* as cnt').first();
    return parseInt(res?.cnt || 0, 10);
  } catch (err) {
    console.warn(`[diaryTransferCount] Error: ${err.message}`);
    return 0;
  }
}

/**
 * Counts DD-based preventive arrests / Kalandras (Blocker B6 resolution).
 */
export async function diaryKalandraCount(options = {}) {
  try {
    const {
      measure = 'KALANDRA_ARRESTED',
      sectionCodes = [],
      actCodes = [],
      actNameContains = null,
      isBc = null,
      window = 'FN',
      fnEnd = new Date().toISOString().slice(0, 10),
      scopeType = 'PS',
      scopeId = null,
    } = options;

    let query = db('records as r')
      .join('arrest_details as ad', 'ad.record_id', 'r.id')
      .where('r.record_type', 'ARREST')
      .where('ad.is_dd_based', true)
      .where('r.current_status', '<>', 'DRAFT');

    if (scopeId && UUID_RE.test(scopeId)) {
      if (scopeType === 'PS') {
        query = query.where('r.ps_id', scopeId);
      } else if (scopeType === 'DISTRICT') {
        query = query.where('r.district_id', scopeId);
      }
    }

    if (isBc !== null) {
      query = query.whereExists(function() {
        this.select(1)
            .from('persons as p')
            .leftJoin('arrestee_details as ard', 'ard.person_id', 'p.id')
            .whereRaw('p.record_id = r.id')
            .andWhere(function() {
              if (isBc) {
                this.where('ard.is_bc', true)
                  .orWhereRaw("COALESCE(p.extra->>'is_bc', p.extra->>'bad_character', p.extra->>'listed_criminal', ad.extra->>'is_bc', ad.extra->>'bad_character', ad.extra->>'listed_criminal') IN ('true', '1', 't', 'yes', 'Yes')");
              } else {
                this.where(function() {
                  this.where('ard.is_bc', false)
                    .orWhereNull('ard.is_bc');
                }).andWhereRaw("COALESCE(p.extra->>'is_bc', p.extra->>'bad_character', p.extra->>'listed_criminal', ad.extra->>'is_bc', ad.extra->>'bad_character', ad.extra->>'listed_criminal') NOT IN ('true', '1', 't', 'yes', 'Yes')");
              }
            });
      });
    }

    if ((sectionCodes && sectionCodes.length > 0) || (actCodes && actCodes.length > 0) || actNameContains) {
      query = query.whereExists(function() {
        let sub = this.select(1)
            .from('record_offences as ro')
            .whereRaw('ro.record_id = r.id');

        if (sectionCodes && sectionCodes.length > 0) {
          sub = sub.join('ref.sections as s', 's.section_code', 'ro.section_id')
                   .whereIn('s.section', sectionCodes);
        }

        if (actCodes && actCodes.length > 0) {
          sub = sub.whereIn('ro.act_id', actCodes);
        }

        if (actNameContains) {
          sub = sub.join('ref.acts as a', 'a.act_cd', 'ro.act_id')
                   .whereILike('a.act_long', `%${actNameContains}%`);
        }
      });
    }

    const fnStr = typeof fnEnd === 'string' ? fnEnd : fnEnd.toISOString().slice(0, 10);
    const windows = buildFnDateWindows(fnStr);
    let startDate = windows.fnStart;
    let endDate = windows.fnEnd;
    if (window === 'UPTO') {
      startDate = windows.jan1Curr;
    }

    const dateCol = 'COALESCE(ad.gd_date, r.registration_date, r.record_date)';
    query = query.whereRaw(`${dateCol} BETWEEN ? AND ?`, [startDate, endDate]);

    const res = await query.countDistinct('r.id as cnt').first();
    return parseInt(res?.cnt || 0, 10);
  } catch (err) {
    console.warn(`[diaryKalandraCount] Error: ${err.message}`);
    return 0;
  }
}

/**
 * Counts crimes against North-East residents (STAT_31).
 * Derives home state from locations.state via persons.perm_location_id.
 */
export async function diaryNorthEastCount(options = {}) {
  try {
    const {
      headCodes = [],
      headType = 'LOCAL',
      window = 'FN',
      fnEnd = new Date().toISOString().slice(0, 10),
      scopeType = 'PS',
      scopeId = null,
    } = options;

    const neStates = [
      'ASSAM', 'ARUNACHAL PRADESH', 'MANIPUR', 'MEGHALAYA',
      'MIZORAM', 'NAGALAND', 'SIKKIM', 'TRIPURA'
    ];

    let query = db('records as r')
      .join('fir_details as fd', 'fd.record_id', 'r.id')
      .join('persons as p', 'p.record_id', 'r.id')
      .join('locations as l', 'l.id', 'p.perm_location_id')
      .where('r.record_type', 'CASE')
      .where('r.current_status', '<>', 'DRAFT')
      .where('p.role', 'VICTIM')
      .whereRaw(`UPPER(l.state) IN (${neStates.map(s => `'${s}'`).join(',')})`);

    if (scopeId && UUID_RE.test(scopeId)) {
      if (scopeType === 'PS') {
        query = query.where('r.ps_id', scopeId);
      } else if (scopeType === 'DISTRICT') {
        query = query.where('r.district_id', scopeId);
      }
    }

    if (headCodes && headCodes.length > 0) {
      if (headType === 'LOCAL') {
        query = query.join('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
                     .whereIn('lh.canonical_code', headCodes);
      }
    }

    const fnStr = typeof fnEnd === 'string' ? fnEnd : fnEnd.toISOString().slice(0, 10);
    const windows = buildFnDateWindows(fnStr);
    let startDate = windows.fnStart;
    let endDate = windows.fnEnd;
    if (window === 'UPTO') {
      startDate = windows.jan1Curr;
    }

    query = query.whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [startDate, endDate]);

    const res = await query.countDistinct('r.id as cnt').first();
    return parseInt(res?.cnt || 0, 10);
  } catch (err) {
    console.warn(`[diaryNorthEastCount] Error: ${err.message}`);
    return 0;
  }
}

/**
 * Counts court progress and outcomes (STAT_40 & STAT_41).
 */
export async function diaryCourtCount(options = {}) {
  try {
    const {
      metric = 'SENT_TO_COURT',
      disposalType = null,
      actName = null,
      headCodes = [],
      headType = 'LOCAL',
      window = 'FN',
      fnEnd = new Date().toISOString().slice(0, 10),
      scopeType = 'PS',
      scopeId = null,
    } = options;

    let query = db('records as r')
      .join('fir_details as fd', 'fd.record_id', 'r.id')
      .where('r.record_type', 'CASE')
      .where('r.current_status', '<>', 'DRAFT');

    if (scopeId && UUID_RE.test(scopeId)) {
      if (scopeType === 'PS') {
        query = query.where('r.ps_id', scopeId);
      } else if (scopeType === 'DISTRICT') {
        query = query.where('r.district_id', scopeId);
      }
    }

    if (headCodes && headCodes.length > 0) {
      if (headType === 'LOCAL') {
        query = query.join('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
                     .whereIn('lh.canonical_code', headCodes);
      }
    }

    if (actName) {
      query = query.whereExists(function() {
        this.select(1)
            .from('record_offences as ro')
            .join('ref.acts as a', 'a.act_cd', 'ro.act_id')
            .whereRaw('ro.record_id = r.id')
            .whereILike('a.act_long', `%${actName}%`);
      });
    }

    const fnStr = typeof fnEnd === 'string' ? fnEnd : fnEnd.toISOString().slice(0, 10);
    const windows = buildFnDateWindows(fnStr);
    let startDate = windows.fnStart;
    let endDate = windows.fnEnd;
    if (window === 'UPTO') {
      startDate = windows.jan1Curr;
    }

    if (metric === 'OPENING_IN_COURT') {
      query = query.whereNotNull('fd.sent_to_court_date')
                   .where('fd.sent_to_court_date', '<', startDate)
                   .where(b => b.whereNull('fd.court_disposal_date').orWhere('fd.court_disposal_date', '>=', startDate));
    } else if (metric === 'SENT_TO_COURT') {
      query = query.whereNotNull('fd.sent_to_court_date')
                   .whereRaw('fd.sent_to_court_date BETWEEN ? AND ?', [startDate, endDate]);
    } else if (metric === 'DISPOSED_BY_COURT') {
      query = query.whereNotNull('fd.court_disposal_date')
                   .whereRaw('fd.court_disposal_date BETWEEN ? AND ?', [startDate, endDate]);
      if (disposalType) {
        query = query.where('fd.court_disposal_type', disposalType);
      }
    }

    const res = await query.countDistinct('r.id as cnt').first();
    return parseInt(res?.cnt || 0, 10);
  } catch (err) {
    console.warn(`[diaryCourtCount] Error: ${err.message}`);
    return 0;
  }
}

export default {
  diaryCount,
  diaryList,
  diaryTransferCount,
  diaryKalandraCount,
  diaryNorthEastCount,
  diaryCourtCount,
};

