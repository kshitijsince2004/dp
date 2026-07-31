import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import db from '../src/config/db.js';
import { resolvePeriod } from '../src/modules/reports/engine/periodResolver.js';
import { resolveScopeCodes, SCOPE_GROUPS } from '../src/modules/reports/engine/scopeResolver.js';
import { fetchHistoricalBaseline, upsertBaseline } from '../src/modules/reports/engine/baselineService.js';
import { safePercentDiff, safeRatio, safeSub } from '../src/modules/reports/engine/measureEngine.js';
import { validateBalance, validatePartitionInvariants } from '../src/modules/reports/engine/validator.js';
import { generateMetadataReport } from '../src/modules/reports/engine/templateRuntime.js';

after(async () => {
  await db.destroy();
});

test('PHQ Engine — Scope Resolution & Scope Partition Invariants', async () => {
  const loNorth = await resolveScopeCodes('LO_NORTH', db);
  const loSouth = await resolveScopeCodes('LO_SOUTH', db);
  const special = await resolveScopeCodes('SPECIAL_UNITS', db);
  const delhiTotal = await resolveScopeCodes('ALL_DELHI_TOTAL', db);

  assert.equal(loNorth.length, 8, 'L&O North should contain exactly 8 districts');
  assert.equal(loSouth.length, 7, 'L&O South should contain exactly 7 districts');
  assert.equal(special.length, 8, 'Special Units should contain exactly 8 non-territorial units');
  assert.equal(delhiTotal.length, 23, 'ALL_DELHI_TOTAL should contain 23 scopes');

  // Verify partition invariant: LO_NORTH + LO_SOUTH + SPECIAL_UNITS = ALL_DELHI_TOTAL
  const partitionCheck = validatePartitionInvariants(loNorth.length, loSouth.length, special.length, delhiTotal.length);
  assert.equal(partitionCheck.isBalanced, true, partitionCheck.error);
});

test('PHQ Engine — Period Resolver Extensions (DAY, FORTNIGHT, UPTO_DATE)', () => {
  const baseDate = '2026-07-21';

  const dayCurr = resolvePeriod('DAY', baseDate, 0);
  assert.equal(dayCurr.from, '2026-07-21');
  assert.equal(dayCurr.to, '2026-07-21');

  const dayPrev = resolvePeriod('DAY_PREVIOUS', baseDate, 0);
  assert.equal(dayPrev.from, '2026-07-20');
  assert.equal(dayPrev.to, '2026-07-20');

  const fortCurr = resolvePeriod('FORTNIGHT_CURRENT', baseDate, 0);
  assert.equal(fortCurr.to, '2026-07-21');
  assert.equal(fortCurr.from, '2026-07-08');

  const fortPrev = resolvePeriod('FORTNIGHT_PREVIOUS', baseDate, 0);
  assert.equal(fortPrev.to, '2026-07-07');
  assert.equal(fortPrev.from, '2026-06-24');

  const fortCorr = resolvePeriod('FORTNIGHT_CORRESPONDING_LAST_YEAR', baseDate, 0);
  assert.equal(fortCorr.to, '2025-07-21');
  assert.equal(fortCorr.from, '2025-07-08');

  const uptoOffset1 = resolvePeriod('UPTO_DATE', baseDate, -1);
  assert.equal(uptoOffset1.from, '2025-01-01');
  assert.equal(uptoOffset1.to, '2025-07-21');
});

test('PHQ Engine — Historical Baseline Read-Through', async () => {
  await upsertBaseline(2018, 'DIST_CD', 'MURDER', 120, 85, db);
  const baseline = await fetchHistoricalBaseline(2018, 'DIST_CD', 'MURDER', db);

  assert.notEqual(baseline, null, 'Baseline entry should be fetched');
  assert.equal(baseline.reported, 120);
  assert.equal(baseline.solved, 85);
  assert.equal(baseline.source, 'stat_baselines');

  const missing = await fetchHistoricalBaseline(1990, 'DIST_CD', 'NON_EXISTENT', db);
  assert.equal(missing, null, 'Missing baseline should return null (rendering as -)');
});

test('PHQ Engine — Safe Math & Derived Metrics', () => {
  assert.equal(safePercentDiff(150, 100), '+50.0%');
  assert.equal(safePercentDiff(80, 100), '-20.0%');
  assert.equal(safePercentDiff(100, 0), '-');
  assert.equal(safePercentDiff(100, null), '-');

  assert.equal(safeRatio(60, 100), '60.0%');
  assert.equal(safeRatio(50, 0), '-');
  assert.equal(safeRatio(null, 10), '-');

  assert.equal(safeSub(100, 40), 60);
  assert.equal(safeSub(100, null), '-');
});

test('PHQ Engine — Matrix Excel Generation (PHQ_UPTODATE_MATRIX & PHQ_MANUALY)', async () => {
  const tplRow = await db('report_templates').where({ code: 'PHQ_UPTODATE_MATRIX' }).first();
  assert.notEqual(tplRow, null, 'PHQ_UPTODATE_MATRIX template should exist in database');

  const outputPath = path.resolve('uploads/reports', `test_phq_uptodate_${Date.now()}.xlsx`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await generateMetadataReport('job-test-phq-1', tplRow, { date: '2026-07-21' }, 'EXCEL', outputPath, null);
  assert.equal(fs.existsSync(outputPath), true, 'Generated Excel report file should exist');

  const stats = fs.statSync(outputPath);
  assert.ok(stats.size > 1000, 'Generated Excel file should contain non-trivial data');

  // Clean up test file
  try { fs.unlinkSync(outputPath); } catch (e) {}
});
