import db from '../../../config/db.js';

/**
 * Baseline Service for Pharos Reporting Engine.
 * Transparent read-through interface for multi-year historical data:
 *   1. Live DB records within period window
 *   2. Legacy batch records (is_legacy = true)
 *   3. stat_baselines table (for historical pre-system years 2014-2023)
 * Returns null if absent (renders as "-" in UI/Excel).
 */

import { STAT_BASELINE_CODE_MAP } from '../../phq-diary/phq-diary.config.js';

export async function fetchHistoricalBaseline(year, scopeCode, headCode, trx = db) {
  try {
    // 1. Recompute-first policy: Check if raw imported records exist for target year
    const rawCheck = await trx('records')
      .whereRaw(`EXTRACT(YEAR FROM registration_date) = ?`, [year])
      .count('* as cnt')
      .first();

    const recordCount = parseInt(rawCheck?.cnt || 0, 10);

    if (recordCount > 0) {
      // Recompute from raw records
      const canonicalCode = STAT_BASELINE_CODE_MAP[headCode] || headCode;
      const res = await trx('records as r')
        .join('fir_details as fd', 'fd.record_id', 'r.id')
        .join('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
        .whereRaw(`EXTRACT(YEAR FROM r.registration_date) = ?`, [year])
        .where(function() {
          this.where('lh.canonical_code', canonicalCode)
              .orWhere('lh.local_head', headCode);
        })
        .select(
          trx.raw(`COUNT(*) as reported`),
          trx.raw(`COUNT(*) FILTER (WHERE fd.is_worked_out = true) as solved`)
        )
        .first();

      if (res && (parseInt(res.reported, 10) > 0 || parseInt(res.solved, 10) > 0)) {
        return {
          reported: parseInt(res.reported, 10),
          solved: parseInt(res.solved, 10),
          source: 'recomputed_records'
        };
      }
    }

    // 2. Fallback path: Query stat_baselines with STAT_BASELINE_CODE_MAP code translation
    const mappedCode = Object.keys(STAT_BASELINE_CODE_MAP).find(k => STAT_BASELINE_CODE_MAP[k] === headCode) || headCode;
    const row = await trx('stat_baselines')
      .where({ year, scope_code: scopeCode })
      .where(function() {
        this.where({ head_code: headCode })
            .orWhere({ head_code: mappedCode });
      })
      .first();

    if (row) {
      return {
        reported: row.reported_count,
        solved: row.solved_count,
        source: 'stat_baselines'
      };
    }
  } catch (err) {
    // Return null if table missing or database unpopulated
  }

  return null;
}

export async function upsertBaseline(year, scopeCode, headCode, reportedCount, solvedCount = 0, trx = db) {
  const existing = await trx('stat_baselines')
    .where({ year, scope_code: scopeCode, head_code: headCode })
    .first();

  if (existing) {
    await trx('stat_baselines')
      .where({ id: existing.id })
      .update({
        reported_count: reportedCount,
        solved_count: solvedCount,
        updated_at: trx.fn.now()
      });
  } else {
    await trx('stat_baselines').insert({
      year,
      scope_code: scopeCode,
      head_code: headCode,
      reported_count: reportedCount,
      solved_count: solvedCount
    });
  }
}
