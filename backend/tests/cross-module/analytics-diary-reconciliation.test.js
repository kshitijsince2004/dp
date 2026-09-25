import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import db from '../../src/config/db.js';
import { diaryCount } from '../../src/modules/report-engine/shared/diary-query-builder.js';
import { getPsDashboardSummary, getDistrictDashboardSummary } from '../../src/modules/analytics/dashboard.service.js';

describe('Analytics vs Diary Engine Cross-Module Reconciliation Test', () => {
  let samplePsId = null;
  let sampleDistrictId = null;

  before(async () => {
    const ps = await db('hierarchy_nodes').where({ node_type: 'PS' }).first();
    if (ps) samplePsId = ps.id;

    const district = await db('hierarchy_nodes').where({ node_type: 'DISTRICT' }).first();
    if (district) sampleDistrictId = district.id;
  });

  it('cases reported this fortnight agrees between PS Dashboard summary and FN Diary STAT_1', async () => {
    if (!samplePsId) return;

    const fnEnd = '2026-08-15';

    const dashboardResult = await getPsDashboardSummary({ scopeId: samplePsId, fnEnd });
    const diaryResult = await diaryCount({
      measure: 'REPORTED',
      recordType: 'CASE',
      window: 'FN',
      fnEnd,
      scopeType: 'PS',
      scopeId: samplePsId,
    });

    assert.equal(
      dashboardResult.casesReportedFn,
      Number(diaryResult || 0),
      `PS Dashboard casesReportedFn (${dashboardResult.casesReportedFn}) must match Diary count (${diaryResult})`
    );
  });

  it('pending cases agree between District Dashboard summary and FN Diary pending count', async () => {
    if (!sampleDistrictId) return;

    const fnEnd = '2026-08-15';

    const dashboardResult = await getDistrictDashboardSummary({ scopeId: sampleDistrictId, fnEnd });
    const diaryResult = await diaryCount({
      measure: 'PENDING',
      recordType: 'CASE',
      window: 'UPTO',
      fnEnd,
      scopeType: 'DISTRICT',
      scopeId: sampleDistrictId,
    });

    assert.equal(
      dashboardResult.casesPendingTotal,
      Number(diaryResult || 0),
      `District Dashboard pending count (${dashboardResult.casesPendingTotal}) must match Diary count (${diaryResult})`
    );
  });
});
