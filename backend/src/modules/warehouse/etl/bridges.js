/**
 * Bridge Tables Sync (ETL Layer)
 * ==============================
 * Resolves many-to-many or loose relationships between fact tables.
 *
 * Links:
 * - fact_fir ↔ fact_arrest (matching linked_fir_dd_no to fir_no or gd_no at the same station)
 * - fact_fir ↔ fact_missing (matching missing person dd_no to fir gd_no or fir_no at the same station)
 */

import { wh, whTable } from '../warehouse.db.js';
import db from '../../../config/db.js';

/**
 * Rebuilds/updates bridges for both Arrest and Missing Person tables.
 * Uses set-based SQL joins to identify and insert missing bridge entries.
 */
export async function syncBridgeTables() {
  let arrestBridgesCreated = 0;
  let missingBridgesCreated = 0;

  // 1. Resolve FIR ↔ Arrest links
  // Finds matches where linked_fir_dd_no equals fir_no or gd_no at the same PS
  const newArrestLinks = await db(`${whTable('fact_arrest')} as fact_arrest`)
    .join(whTable('fact_fir') + ' as f', function() {
      this.on('fact_arrest.ps_id', '=', 'f.ps_id')
          .andOn(function() {
            this.on('fact_arrest.linked_fir_dd_no', '=', 'f.fir_no')
                .orOn('fact_arrest.linked_fir_dd_no', '=', 'f.gd_no');
          });
    })
    .leftJoin(whTable('bridge_fir_arrest') + ' as b', function() {
      this.on('fact_arrest.sk', '=', 'b.arrest_sk')
          .andOn('f.sk', '=', 'b.fir_sk');
    })
    .whereNull('b.id')
    .select('f.sk as fir_sk', 'fact_arrest.sk as arrest_sk');

  if (newArrestLinks.length > 0) {
    // Insert in batches of 100 to prevent parameterized query limits
    const batchSize = 100;
    for (let i = 0; i < newArrestLinks.length; i += batchSize) {
      const batch = newArrestLinks.slice(i, i + batchSize).map(link => ({
        fir_sk: link.fir_sk,
        arrest_sk: link.arrest_sk,
        link_type: 'FIR_NO_MATCH'
      }));
      await wh('bridge_fir_arrest').insert(batch);
    }
    arrestBridgesCreated = newArrestLinks.length;
  }

  // 2. Resolve FIR ↔ Missing Person links
  // Finds matches where missing dd_no equals fir gd_no or fir_no at the same PS
  const newMissingLinks = await db(`${whTable('fact_missing')} as fact_missing`)
    .join(whTable('fact_fir') + ' as f', function() {
      this.on('fact_missing.ps_id', '=', 'f.ps_id')
          .andOn(function() {
            this.on('fact_missing.dd_no', '=', 'f.gd_no')
                .orOn('fact_missing.dd_no', '=', 'f.fir_no');
          });
    })
    .leftJoin(whTable('bridge_fir_missing') + ' as b', function() {
      this.on('fact_missing.sk', '=', 'b.missing_sk')
          .andOn('f.sk', '=', 'b.fir_sk');
    })
    .whereNull('b.id')
    .select('f.sk as fir_sk', 'fact_missing.sk as missing_sk');

  if (newMissingLinks.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < newMissingLinks.length; i += batchSize) {
      const batch = newMissingLinks.slice(i, i + batchSize).map(link => ({
        fir_sk: link.fir_sk,
        missing_sk: link.missing_sk,
        link_type: 'GD_NO_MATCH'
      }));
      await wh('bridge_fir_missing').insert(batch);
    }
    missingBridgesCreated = newMissingLinks.length;
  }

  return {
    arrestBridgesCreated,
    missingBridgesCreated
  };
}
