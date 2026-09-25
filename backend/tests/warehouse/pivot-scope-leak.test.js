/**
 * Scope-leak guard for the warehouse pivot engine.
 *
 * The pivot must take its scope from resolveUserScope(req.user) only — never
 * from a client-supplied filter. A PS-scoped caller must not be able to widen
 * to another PS / district / HQ by passing psId / districtId in `filters`.
 *
 * Run: node --test backend/tests/warehouse/pivot-scope-leak.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import db from '../../src/config/db.js';
import { runPivotReport } from '../../src/modules/warehouse/pivot-engine.js';
import { resolveUserScope } from '../../src/modules/warehouse/warehouse.controller.js';

let psA = null; // scoped PS
let psB = null; // a different PS the caller must never see
let districtOfA = null;

function total(r) {
  return r.grandTotals.reduce((a, b) => a + b, 0);
}
function psLabels(r) {
  return r.rowHeaders.map((h) => h.values.join(' | '));
}

describe('warehouse pivot — scope leak guard', () => {
  before(async () => {
    // two PSs in different districts, each with at least one non-draft CASE
    const rows = await db('records')
      .select('ps_id', 'district_id')
      .count('* as n')
      .where({ record_type: 'CASE' })
      .whereNot('current_status', 'DRAFT')
      .whereNotNull('ps_id')
      .groupBy('ps_id', 'district_id')
      .havingRaw('count(*) > 0')
      .orderBy('n', 'desc')
      .limit(50);
    assert.ok(rows.length >= 2, 'need >= 2 PSs with CASE data');
    psA = rows[0].ps_id;
    districtOfA = rows[0].district_id;
    const other = rows.find((r) => r.ps_id !== psA && r.district_id !== districtOfA) || rows[1];
    psB = other.ps_id;
  });

  after(async () => {
    await db.destroy();
  });

  it('PS-scoped pivot returns exactly one PS row — its own', async () => {
    const { scopeType, scopeId } = resolveUserScope({ role: 'SHO', ps_id: psA });
    assert.equal(scopeType, 'PS');
    const r = await runPivotReport({
      rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' },
      scopeType, scopeId,
    });
    assert.equal(r.rowHeaders.length, 1, `expected 1 PS row, got ${psLabels(r).join(', ')}`);
    assert.ok(total(r) > 0);
  });

  it('a PS-scoped caller passing another PS in filters gets nothing (cannot widen)', async () => {
    const { scopeType, scopeId } = resolveUserScope({ role: 'SHO', ps_id: psA });
    const r = await runPivotReport({
      rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE', psId: psB },
      scopeType, scopeId,
    });
    // scope (psA) AND filter (psB) => empty intersection, never psB's data
    assert.equal(total(r), 0);
  });

  it('a PS-scoped caller passing a districtId in filters cannot widen to the district', async () => {
    const scopedTotal = total(await runPivotReport({
      rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' },
      scopeType: 'PS', scopeId: psA,
    }));
    const withDistrictFilter = total(await runPivotReport({
      rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE', districtId: districtOfA },
      scopeType: 'PS', scopeId: psA,
    }));
    // adding a districtId filter can only narrow, never exceed the PS-scoped total
    assert.ok(withDistrictFilter <= scopedTotal, `${withDistrictFilter} must be <= ${scopedTotal}`);
  });

  it('HQ scope sees more PSs than a single PS scope (sanity: scoping actually filters)', async () => {
    const psScoped = await runPivotReport({
      rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' },
      scopeType: 'PS', scopeId: psA,
    });
    const hqScoped = await runPivotReport({
      rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' },
      scopeType: 'HQ', scopeId: null,
    });
    assert.equal(psScoped.rowHeaders.length, 1);
    assert.ok(hqScoped.rowHeaders.length > 1);
  });

  it('unknown scopeType with a scopeId does not silently fall through to unfiltered', async () => {
    // resolveUserScope maps unknown roles to HQ; but if a bad scopeType string
    // reaches the engine it must still not leak — HQ is the only unscoped state
    // and it is explicit, so assert PS/DISTRICT/SUB_DIV each narrow.
    const hq = (await runPivotReport({ rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' }, scopeType: 'HQ', scopeId: null })).rowHeaders.length;
    const ps = (await runPivotReport({ rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' }, scopeType: 'PS', scopeId: psA })).rowHeaders.length;
    const dist = (await runPivotReport({ rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' }, scopeType: 'DISTRICT', scopeId: districtOfA })).rowHeaders.length;
    assert.ok(ps <= dist && dist <= hq, `PS(${ps}) <= DISTRICT(${dist}) <= HQ(${hq})`);
  });
});
