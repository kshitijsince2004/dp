/**
 * Incremental Sync Engine (ETL Layer)
 * ===================================
 * Periodically or on-demand synchronizes new/updated records from the live
 * operational `records` table to reporting warehouse fact tables.
 *
 * It uses the `updated_at` column as a watermark to sync incrementally.
 */

import { wh, invalidateWarehouseCache } from '../warehouse.db.js';
import {
  syncHierarchyDimensions,
  populateLocationCaches,
  getDistrictSk,
  getPsSk,
  resolveOfficerSk,
  resolveCrimeHeadSk,
  resolveStatusSk,
  resolveActLawSk
} from './dimensions.js';
import { syncBridgeTables } from './bridges.js';
import { safeParseDate, safeParseInt } from './normalize.js';
import db from '../../../config/db.js';
import { logger } from '../../../utils/logger.js';

// Parse approximate age range to get a numeric representative (e.g. "40-50 yrs" -> 45)
function parseApproxAgeNum(approxAge) {
  if (!approxAge) return null;
  const str = String(approxAge);
  const matches = str.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  if (matches.length === 1) return parseInt(matches[0], 10);
  const val1 = parseInt(matches[0], 10);
  const val2 = parseInt(matches[1], 10);
  return Math.round((val1 + val2) / 2);
}

/**
 * Maps a live operational record to the corresponding warehouse fact row.
 */
async function mapRecordToFact(opRecord) {
  const data = JSON.parse(opRecord.data || '{}');

  const districtSk = await getDistrictSk(opRecord.district_id);
  const psSk = await getPsSk(opRecord.ps_id);

  // Common metadata
  const baseFact = {
    source_record_id: opRecord.id,
    source_updated_at: safeParseDate(opRecord.updated_at),
    ps_id: opRecord.ps_id,
    district_id: opRecord.district_id,
    sub_div_id: opRecord.sub_div_id || null,
    district_sk: districtSk,
    ps_sk: psSk,
    workflow_status: opRecord.current_status,
    record_date: safeParseDate(opRecord.record_date)
  };

  switch (opRecord.record_type) {
    case 'CASE': {
      const officerSk = await resolveOfficerSk(data.io_name);
      const crimeHeadSk = await resolveCrimeHeadSk(data.local_head);
      const statusSk = await resolveStatusSk('CASE', data.status);
      const actLawSk = await resolveActLawSk(data.act_name);

      return {
        table: 'fact_fir',
        data: {
          ...baseFact,
          source_record_uid: data.uid || null,
          officer_sk: officerSk,
          crime_head_sk: crimeHeadSk,
          status_sk: statusSk,
          act_law_sk: actLawSk,
          fir_no: data.fir_no || null,
          fir_date: safeParseDate(data.fir_date),
          gd_no: data.gd_no || null,
          gd_date: safeParseDate(data.gd_date),
          gd_time: data.gd_time || null,
          beat_no: data.beat_no || null,
          occurrence_date: safeParseDate(data.occurrence_date),
          occurrence_place: data.occurrence_place || null,
          local_head: data.local_head || null,
          act_name: data.act_name || null,
          sections: data.sections || null,
          brief_facts: data.brief_facts || null,
          complainant_name: data.complainant_name || null,
          complainant_address: data.complainant_address || null,
          accused_name: data.accused_name || null,
          accused_address: data.accused_address || null,
          officer_name: data.io_name || null,
          officer_pis: data.io_pis || null,
          officer_mobile: data.io_mobile || null,
          property_description: data.property_description || null,
          property_status: data.property_status || null,
          case_status: data.status || null,
          remarks: data.remarks || null,
          cctns_flag: data.cctns_flag !== undefined ? !!data.cctns_flag : null,
          zero_fir_flag: data.zero_fir_flag !== undefined ? !!data.zero_fir_flag : null
        }
      };
    }

    case 'ARREST': {
      const officerSk = await resolveOfficerSk(data.io_name);
      const crimeHeadSk = await resolveCrimeHeadSk(data.crime_head);
      const statusSk = await resolveStatusSk('ARREST', data.status);
      const actLawSk = await resolveActLawSk(data.act_name);

      return {
        table: 'fact_arrest',
        data: {
          ...baseFact,
          officer_sk: officerSk,
          crime_head_sk: crimeHeadSk,
          status_sk: statusSk,
          act_law_sk: actLawSk,
          linked_fir_dd_no: data.linked_fir_dd_no || null,
          act_name: data.act_name || null,
          sections: data.sections || null,
          crime_head: data.crime_head || null,
          arrested_name: data.arrested_name || null,
          arrested_address: data.arrested_address || null,
          arrest_date: safeParseDate(data.arrest_date),
          arrest_place: data.arrest_place || null,
          custody_status: data.status || null,
          officer_name: data.io_name || null,
          nafis_prepared: data.nafis_prepared !== undefined ? !!data.nafis_prepared : null,
          dossier_prepared: data.dossier_prepared !== undefined ? !!data.dossier_prepared : null
        }
      };
    }

    case 'PCR_CALL': {
      const officerSk = await resolveOfficerSk(data.io_name);
      const crimeHeadSk = await resolveCrimeHeadSk(data.call_head);
      const statusSk = await resolveStatusSk('PCR_CALL', data.status);

      return {
        table: 'fact_pcr',
        data: {
          ...baseFact,
          officer_sk: officerSk,
          crime_head_sk: crimeHeadSk,
          status_sk: statusSk,
          pcr_no: data.pcr_no || null,
          gd_no: data.gd_no || null,
          gd_date: safeParseDate(data.gd_date),
          gd_time: data.gd_time || null,
          call_head: data.call_head || null,
          call_gist: data.call_gist || null,
          caller_name: data.caller_name || null,
          caller_mobile: data.caller_mobile || null,
          officer_name: data.io_name || null,
          arrival_time: data.arrival_time || null,
          call_status: data.status || null
        }
      };
    }

    case 'MISSING': {
      const officerSk = await resolveOfficerSk(data.io_name);
      const statusSk = await resolveStatusSk('MISSING', data.status);

      return {
        table: 'fact_missing',
        data: {
          ...baseFact,
          officer_sk: officerSk,
          status_sk: statusSk,
          dd_no: data.dd_no || null,
          dd_date: safeParseDate(data.dd_date),
          missing_name: data.missing_name || null,
          age: safeParseInt(data.age),
          gender: data.gender || null,
          major_minor: data.major_minor || null,
          missing_date: safeParseDate(data.missing_date),
          missing_place: data.missing_place || null,
          physical_description: data.physical_description || null,
          informant_name: data.informant_name || null,
          informant_mobile: data.informant_mobile || null,
          officer_name: data.io_name || null,
          zipnet_no: data.zipnet_no || null,
          missing_status: data.status || null
        }
      };
    }

    case 'UIDB': {
      const officerSk = await resolveOfficerSk(data.io_name);
      const statusSk = await resolveStatusSk('UIDB', data.status);

      return {
        table: 'fact_uidb',
        data: {
          ...baseFact,
          officer_sk: officerSk,
          status_sk: statusSk,
          dd_no: data.dd_no || null,
          found_date: safeParseDate(data.found_date),
          found_place: data.found_place || null,
          gender: data.gender || null,
          approx_age: data.approx_age || null,
          approx_age_num: parseApproxAgeNum(data.approx_age),
          description: data.description || null,
          officer_name: data.io_name || null,
          informant_name: data.informant_name || null,
          zipnet_no: data.zipnet_no || null,
          identified: data.identified !== undefined ? !!data.identified : null,
          uidb_status: data.status || null
        }
      };
    }

    default:
      return null;
  }
}

/**
 * Runs a sync job for a specific record_type (or 'ALL' for everything).
 *
 * @param {string} sourceTableType 'CASE'|'ARREST'|'PCR_CALL'|'MISSING'|'UIDB'|'ALL'
 * @param {boolean} forceFullSync If true, ignores watermarks and syncs all records
 */
export async function runWarehouseSync(sourceTableType = 'ALL', forceFullSync = false) {
  const syncStartTime = new Date();

  // Create a log entry
  const [logIdObj] = await wh('sync_log')
    .insert({
      source_table: sourceTableType,
      run_started_at: syncStartTime,
      status: 'RUNNING',
      watermark_from: null,
      watermark_to: null,
      rows_scanned: 0,
      rows_upserted: 0,
      rows_failed: 0,
      bridges_updated: 0,
      error_rows: '[]',
      notes: forceFullSync ? 'Force full sync triggered.' : 'Incremental sync triggered.'
    })
    .returning('id');
  const logId = typeof logIdObj === 'object' ? logIdObj.id : logIdObj;

  let watermarkFrom = null;
  let watermarkTo = syncStartTime;

  try {
    // 1. Sync locations/hierarchy first to ensure they are up to date
    await syncHierarchyDimensions();
    await populateLocationCaches();

    // 2. Resolve watermark
    if (!forceFullSync) {
      const lastSuccessLog = await wh('sync_log')
        .where({ source_table: sourceTableType, status: 'SUCCESS' })
        .orderBy('run_started_at', 'desc')
        .first();

      if (lastSuccessLog && lastSuccessLog.watermark_to) {
        watermarkFrom = new Date(lastSuccessLog.watermark_to);
      }
    }

    // 3. Query records to sync
    let recordsQuery = db('records')
      .orderBy('updated_at', 'asc');

    if (sourceTableType !== 'ALL') {
      recordsQuery = recordsQuery.where('record_type', sourceTableType);
    }

    if (watermarkFrom) {
      // Sync items modified since the last watermark (with a 2-second overlap for safety)
      const adjustedWatermark = new Date(watermarkFrom.getTime() - 2000);
      recordsQuery = recordsQuery.where('updated_at', '>', adjustedWatermark);
    }

    const records = await recordsQuery;

    let upsertedCount = 0;
    let failedCount = 0;
    const failedRowsList = [];

    // Process and upsert each record
    for (const record of records) {
      try {
        const fact = await mapRecordToFact(record);
        if (!fact) continue;

        // Perform idempotent upsert
        const existing = await wh(fact.table).where({ source_record_id: record.id }).first();
        if (existing) {
          await wh(fact.table)
            .where({ sk: existing.sk })
            .update({
              ...fact.data,
              warehouse_updated_at: new Date()
            });
        } else {
          await wh(fact.table).insert({
            ...fact.data,
            warehouse_loaded_at: new Date(),
            warehouse_updated_at: new Date()
          });
        }
        upsertedCount++;

        // Keep watermark_to set to the maximum updated_at of processed records
        const recordUpdatedAt = new Date(record.updated_at);
        if (recordUpdatedAt > watermarkTo) {
          watermarkTo = recordUpdatedAt;
        }
      } catch (err) {
        failedCount++;
        failedRowsList.push({
          id: record.id,
          type: record.record_type,
          error: err.message
        });
      }
    }

    // 4. Update bridge tables
    const bridgeStats = await syncBridgeTables();
    const totalBridges = bridgeStats.arrestBridgesCreated + bridgeStats.missingBridgesCreated;

    // Invalidate warehouse cache so resolveQueryMode knows we have data
    invalidateWarehouseCache();

    // 5. Update log to success
    await wh('sync_log')
      .where({ id: logId })
      .update({
        status: failedCount > 0 ? 'PARTIAL' : 'SUCCESS',
        run_completed_at: new Date(),
        watermark_from: watermarkFrom,
        watermark_to: watermarkTo,
        rows_scanned: records.length,
        rows_upserted: upsertedCount,
        rows_failed: failedCount,
        bridges_updated: totalBridges,
        error_rows: JSON.stringify(failedRowsList),
        notes: `Sync completed successfully. ${upsertedCount} upserted, ${failedCount} failed, ${totalBridges} bridges created.`
      });

    return {
      status: 'SUCCESS',
      scanned: records.length,
      upserted: upsertedCount,
      failed: failedCount,
      bridges: totalBridges
    };

  } catch (err) {
    logger.error('[Warehouse] Warehouse sync failed:', err.message);
    await wh('sync_log')
      .where({ id: logId })
      .update({
        status: 'FAILED',
        run_completed_at: new Date(),
        watermark_from: watermarkFrom,
        watermark_to: watermarkTo,
        notes: `Sync failed with error: ${err.message}`
      });
    throw err;
  }
}
