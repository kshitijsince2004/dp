import db from '../../config/db.js';
import { diaryCount } from '../report-engine/shared/diary-query-builder.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('dashboardService');

// Short in-memory TTL cache (60s) to keep dashboards under 500ms
const cache = new Map();
const TTL_MS = 60000;

function getCachedOrCompute(key, computeFn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < TTL_MS) {
    return Promise.resolve(hit.value);
  }
  return Promise.resolve(computeFn()).then((val) => {
    cache.set(key, { value: val, time: Date.now() });
    return val;
  });
}

/**
 * Single Measure Engine Dashboard Summaries
 * All counts call `diaryCount()` to guarantee 100% agreement with FN Diary!
 */
export async function getPsDashboardSummary({ scopeId, fnEnd = new Date().toISOString().slice(0, 10) }) {
  const cacheKey = `ps_summary_${scopeId}_${fnEnd}`;
  return getCachedOrCompute(cacheKey, async () => {
    log.info('getPsDashboardSummary: computing via diaryCount engine', { scopeId, fnEnd });

    const [reportedFn, workedFn, pendingUpto, arrestsFn, missingFn] = await Promise.all([
      diaryCount({ measure: 'REPORTED', recordType: 'CASE', window: 'FN', fnEnd, scopeType: 'PS', scopeId }),
      diaryCount({ measure: 'WORKED_OUT', recordType: 'CASE', window: 'FN', fnEnd, scopeType: 'PS', scopeId }),
      diaryCount({ measure: 'PENDING', recordType: 'CASE', window: 'UPTO', fnEnd, scopeType: 'PS', scopeId }),
      diaryCount({ measure: 'REPORTED', recordType: 'ARREST', window: 'FN', fnEnd, scopeType: 'PS', scopeId }),
      diaryCount({ measure: 'REPORTED', recordType: 'MISSING', window: 'FN', fnEnd, scopeType: 'PS', scopeId }),
    ]);

    return {
      casesReportedFn: Number(reportedFn || 0),
      casesWorkedOutFn: Number(workedFn || 0),
      casesPendingTotal: Number(pendingUpto || 0),
      arrestsMadeFn: Number(arrestsFn || 0),
      missingReportedFn: Number(missingFn || 0),
    };
  });
}

export async function getDistrictDashboardSummary({ scopeId, fnEnd = new Date().toISOString().slice(0, 10) }) {
  const cacheKey = `district_summary_${scopeId}_${fnEnd}`;
  return getCachedOrCompute(cacheKey, async () => {
    log.info('getDistrictDashboardSummary: computing via diaryCount engine', { scopeId, fnEnd });

    const [reportedFn, workedFn, pendingUpto, arrestsFn] = await Promise.all([
      diaryCount({ measure: 'REPORTED', recordType: 'CASE', window: 'FN', fnEnd, scopeType: 'DISTRICT', scopeId }),
      diaryCount({ measure: 'WORKED_OUT', recordType: 'CASE', window: 'FN', fnEnd, scopeType: 'DISTRICT', scopeId }),
      diaryCount({ measure: 'PENDING', recordType: 'CASE', window: 'UPTO', fnEnd, scopeType: 'DISTRICT', scopeId }),
      diaryCount({ measure: 'REPORTED', recordType: 'ARREST', window: 'FN', fnEnd, scopeType: 'DISTRICT', scopeId }),
    ]);

    return {
      casesReportedFn: Number(reportedFn || 0),
      casesWorkedOutFn: Number(workedFn || 0),
      casesPendingTotal: Number(pendingUpto || 0),
      arrestsMadeFn: Number(arrestsFn || 0),
    };
  });
}

export async function getHqDashboardSummary({ fnEnd = new Date().toISOString().slice(0, 10) }) {
  const cacheKey = `hq_summary_${fnEnd}`;
  return getCachedOrCompute(cacheKey, async () => {
    log.info('getHqDashboardSummary: computing via diaryCount engine', { fnEnd });

    const [reportedFn, workedFn, pendingUpto, arrestsFn] = await Promise.all([
      diaryCount({ measure: 'REPORTED', recordType: 'CASE', window: 'FN', fnEnd, scopeType: 'HQ', scopeId: null }),
      diaryCount({ measure: 'WORKED_OUT', recordType: 'CASE', window: 'FN', fnEnd, scopeType: 'HQ', scopeId: null }),
      diaryCount({ measure: 'PENDING', recordType: 'CASE', window: 'UPTO', fnEnd, scopeType: 'HQ', scopeId: null }),
      diaryCount({ measure: 'REPORTED', recordType: 'ARREST', window: 'FN', fnEnd, scopeType: 'HQ', scopeId: null }),
    ]);

    return {
      casesReportedFn: Number(reportedFn || 0),
      casesWorkedOutFn: Number(workedFn || 0),
      casesPendingTotal: Number(pendingUpto || 0),
      arrestsMadeFn: Number(arrestsFn || 0),
    };
  });
}
