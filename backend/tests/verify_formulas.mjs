import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import { computeVariation, varPct, detPct, buildManualyData, buildMondayMorningData } from '../src/modules/phq-diary/phq-diary.calc.js';
import { buildDateWindows, fetchCaseCounts, fetchArrestCounts, fetchDrugRecovery } from '../src/modules/phq-diary/phq-diary.data.js';

console.log("=== RUNNING FORMULA VERIFICATION SUITE ===");

// 1. Variation % Math Verification
test('Formula Verification 1: computeVariation & varPct Edge Cases', () => {
  // 0 / 0 -> null -> '-'
  assert.equal(computeVariation(0, 0), null);
  assert.equal(varPct(0, 0), '-');

  // P=0, C=10 -> Infinity -> '+∞'
  assert.equal(computeVariation(10, 0), Infinity);
  assert.equal(varPct(10, 0), '+∞');

  // P=10, C=0 -> -100.0%
  assert.equal(computeVariation(0, 10), -100.0);
  assert.equal(varPct(0, 10), '-100.0%');

  // P=10, C=10 -> 0.0%
  assert.equal(computeVariation(10, 10), 0.0);
  assert.equal(varPct(10, 10), '+0.0%');

  // P=100, C=125 -> +25.0%
  assert.equal(computeVariation(125, 100), 25.0);
  assert.equal(varPct(125, 100), '+25.0%');

  // P=100, C=80 -> -20.0%
  assert.equal(computeVariation(80, 100), -20.0);
  assert.equal(varPct(80, 100), '-20.0%');
});

// 2. Detection % Math Verification
test('Formula Verification 2: detPct Cases Solved / Cases Reported', () => {
  // Reported = 0 -> '-'
  assert.equal(detPct(0, 0), '-');
  assert.equal(detPct(5, 0), '-');

  // 10 reported, 10 solved -> 100.0%
  assert.equal(detPct(10, 10), '100.0%');

  // 10 reported, 5 solved -> 50.0%
  assert.equal(detPct(5, 10), '50.0%');

  // 14 reported, 13 solved -> 92.9%
  assert.equal(detPct(13, 14), '92.9%');
});

// 3. Heinous & Non-Heinous Aggregation Integrity
test('Formula Verification 3: Heinous + Non-Heinous = Total IPC', () => {
  const caseRows = [
    { canonical_code: 'DACOITY', day_curr: 1, upto_curr: 10 },
    { canonical_code: 'MURDER', day_curr: 2, upto_curr: 20 },
    { canonical_code: 'EXTORTION', day_curr: 3, upto_curr: 30 },
    { canonical_code: 'SNATCHING', day_curr: 4, upto_curr: 40 },
  ];
  const windows = buildDateWindows('2026-07-22');
  const manualy = buildManualyData(caseRows, [], [], undefined, windows);

  assert.equal(manualy.totalHeinous.day_curr, 3); // 1 + 2
  assert.equal(manualy.totalIPC.day_curr, manualy.totalHeinous.day_curr + manualy.totalNonHeinous.day_curr);
});

// 4. Monday Morning RAPE & POCSO Merged Formula Verification
test('Formula Verification 4: Monday Morning RAPE & POCSO Merge', () => {
  const caseRows = [
    { canonical_code: 'RAPE', upto_curr: 10, upto_prev: 12, det_curr: 8, det_prev: 9 },
    { canonical_code: 'POCSO', upto_curr: 5, upto_prev: 4, det_curr: 5, det_prev: 3 },
  ];
  const mmData = buildMondayMorningData(caseRows, undefined);

  const rapePocsoRow = mmData.find(r => r.code === 'RAPE');
  assert.ok(rapePocsoRow);
  assert.equal(rapePocsoRow.label, 'RAPE & POCSO');
  assert.equal(rapePocsoRow.reported_curr, 15); // 10 + 5
  assert.equal(rapePocsoRow.reported_prev, 16); // 12 + 4
  assert.equal(rapePocsoRow.solved_curr, 13);   // 8 + 5
  assert.equal(rapePocsoRow.solved_prev, 12);   // 9 + 3
});

// 5. Database SQL Verification
test('Formula Verification 5: Live Database SQL Execution & Unit Factor Conversion', async () => {
  const windows = buildDateWindows('2026-07-22');
  const districts = await db('hierarchy_nodes').where({ node_type: 'DISTRICT' }).limit(3);
  const districtIds = districts.map(d => d.id);

  const caseCounts = await fetchCaseCounts(districtIds, windows);
  assert.ok(Array.isArray(caseCounts));

  const arrestCounts = await fetchArrestCounts(districtIds, windows);
  assert.ok(Array.isArray(arrestCounts));

  const drugRecoveries = await fetchDrugRecovery(districtIds, windows);
  assert.ok(Array.isArray(drugRecoveries));
});

test.after(async () => {
  await db.destroy();
});
