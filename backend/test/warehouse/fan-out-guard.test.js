/**
 * Fan-out regression guard for the warehouse pivot engine.
 *
 * A record with N persons x M properties x K offences must not inflate a
 * record-level count, and additive property measures must refuse to run
 * alongside a fan-out dimension. Also cross-checks that pivot case_count
 * reconciles with a raw non-draft CASE count (no divergence vs the record spine).
 *
 * Assertions are deltas (after seed - before seed) so they hold regardless of
 * what else lives under the borrowed Police Station.
 *
 * Run: node --test backend/test/warehouse/fan-out-guard.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import db from '../../src/config/db.js';
import { runPivotReport } from '../../src/modules/warehouse/pivot-engine.js';

const SEED = { recordId: randomUUID(), persons: 3, properties: 2, offences: 2 };

let psId = null;
let districtId = null;
let createdBy = null;
const baseline = {};

async function psTotal(spec) {
  const r = await runPivotReport({ scopeType: 'PS', scopeId: psId, ...spec });
  return r.grandTotals.reduce((a, b) => a + b, 0);
}

describe('warehouse pivot — fan-out guard', () => {
  before(async () => {
    const donor = await db('records')
      .whereNotNull('ps_id')
      .whereNotNull('district_id')
      .first('ps_id', 'district_id', 'created_by');
    assert.ok(donor, 'need at least one existing record to borrow PS/district/user');
    psId = donor.ps_id;
    districtId = donor.district_id;
    createdBy = donor.created_by;

    // baselines BEFORE seeding
    baseline.caseCount = await psTotal({ rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' } });
    baseline.caseByGender = await psTotal({ rows: ['ps_name'], columns: ['gender'], measure: 'case_count', filters: { recordType: 'CASE' } });
    baseline.caseByAct = await psTotal({ rows: ['ps_name'], columns: ['act_class'], measure: 'case_count', filters: { recordType: 'CASE' } });
    baseline.personCount = await psTotal({ rows: ['ps_name'], measure: 'person_count', filters: { recordType: 'CASE' } });
    baseline.stolenCount = await psTotal({ rows: ['ps_name'], measure: 'property_stolen_count', filters: { recordType: 'CASE' } });
    baseline.stolenValue = await psTotal({ rows: ['ps_name'], measure: 'property_value_stolen', filters: { recordType: 'CASE' } });

    const now = new Date().toISOString();
    await db('records').insert({
      id: SEED.recordId, record_type: 'CASE', ps_id: psId, district_id: districtId,
      current_status: 'APPROVED', current_level: 'PS', record_date: '2026-07-15',
      is_frozen: false, is_legacy: false, created_by: createdBy, created_at: now, updated_at: now,
    });
    await db('fir_details').insert({
      record_id: SEED.recordId, ps_id: psId, fir_no: 'FANOUT-TEST', fir_date: '2026-07-15',
      is_important: false, extra: '{}', created_at: now, updated_at: now,
    });
    for (let i = 0; i < SEED.persons; i++) {
      // all same gender so a gender-column pivot yields a single column — a
      // delta of 1 then proves the persons join did not inflate the case count.
      // (A case with both a male and a female accused legitimately lands in two
      // gender columns; that is correct cross-tab semantics, not fan-out.)
      await db('persons').insert({
        id: randomUUID(), record_id: SEED.recordId, role: 'ACCUSED', name: `Fanout Person ${i}`,
        gender: 'MALE', nick_names: '[]', perm_same_as_present: true,
        sort_order: i, extra: '{}', created_at: now, updated_at: now,
      });
    }
    for (let i = 0; i < SEED.properties; i++) {
      await db('record_properties').insert({
        id: randomUUID(), record_id: SEED.recordId, status: 'STOLEN', estimated_value: 1000 * (i + 1),
        sort_order: i, extra: '{}', created_at: now, updated_at: now,
      });
    }
    for (let i = 0; i < SEED.offences; i++) {
      await db('record_offences').insert({
        id: randomUUID(), record_id: SEED.recordId, act_id: 4375, is_primary: i === 0,
        sort_order: i, created_at: now, updated_at: now,
      });
    }
  });

  after(async () => {
    await db('record_offences').where({ record_id: SEED.recordId }).del();
    await db('record_properties').where({ record_id: SEED.recordId }).del();
    await db('persons').where({ record_id: SEED.recordId }).del();
    await db('fir_details').where({ record_id: SEED.recordId }).del();
    await db('records').where({ id: SEED.recordId }).del();
    await db.destroy();
  });

  it('adds exactly 1 to case_count (not 3 or 6)', async () => {
    const now = await psTotal({ rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' } });
    assert.equal(now - baseline.caseCount, 1);
  });

  it('adds exactly 1 to case_count even with a persons-derived column', async () => {
    const now = await psTotal({ rows: ['ps_name'], columns: ['gender'], measure: 'case_count', filters: { recordType: 'CASE' } });
    assert.equal(now - baseline.caseByGender, 1);
  });

  it('adds exactly 1 to case_count even with an offences-derived column', async () => {
    const now = await psTotal({ rows: ['ps_name'], columns: ['act_class'], measure: 'case_count', filters: { recordType: 'CASE' } });
    assert.equal(now - baseline.caseByAct, 1);
  });

  it('adds exactly 3 to person_count', async () => {
    const now = await psTotal({ rows: ['ps_name'], measure: 'person_count', filters: { recordType: 'CASE' } });
    assert.equal(now - baseline.personCount, SEED.persons);
  });

  it('adds 2 stolen items / 3000 value — not multiplied by persons or offences', async () => {
    const cnt = await psTotal({ rows: ['ps_name'], measure: 'property_stolen_count', filters: { recordType: 'CASE' } });
    assert.equal(cnt - baseline.stolenCount, SEED.properties);
    const val = await psTotal({ rows: ['ps_name'], measure: 'property_value_stolen', filters: { recordType: 'CASE' } });
    assert.equal(val - baseline.stolenValue, 3000);
  });

  it('property measure REFUSES to run with a fan-out dimension', async () => {
    await assert.rejects(
      () => runPivotReport({ rows: ['ps_name'], columns: ['gender'], measure: 'property_stolen_count', filters: {}, scopeType: 'HQ' }),
      /cannot be combined with dimension/i
    );
    await assert.rejects(
      () => runPivotReport({ rows: ['ps_name'], columns: ['act_class'], measure: 'property_value_stolen', filters: {}, scopeType: 'HQ' }),
      /cannot be combined with dimension/i
    );
  });

  it('pivot case_count reconciles with a raw non-draft CASE count (no divergence)', async () => {
    const raw = await db('records').where({ record_type: 'CASE' }).whereNot('current_status', 'DRAFT').count('* as n').first();
    const r = await runPivotReport({ rows: ['ps_name'], measure: 'case_count', filters: { recordType: 'CASE' }, scopeType: 'HQ', scopeId: null });
    assert.equal(r.grandTotals.reduce((a, b) => a + b, 0), Number(raw.n));
  });
});
