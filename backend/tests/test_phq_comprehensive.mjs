import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import { generatePHQDiary } from '../src/modules/phq-diary/phq-diary.service.js';
import { buildDateWindows, fetchCaseCounts } from '../src/modules/phq-diary/phq-diary.data.js';
import { computeVariation, varPct, detPct, buildMondayMorningData } from '../src/modules/phq-diary/phq-diary.calc.js';
import { HEINOUS_ROWS, MONDAY_MORNING_NON_HEINOUS_ROWS } from '../src/modules/phq-diary/phq-diary.config.js';

test('AUD-01 & AUD-02 — PHQ Routing, Date Authority & Service Generation', async () => {
  const dateStr = '2026-07-22';
  const buffer = await generatePHQDiary(dateStr, 'ALL_DELHI_TOTAL');
  assert.ok(buffer instanceof Buffer, 'generatePHQDiary should return an Excel buffer');
  assert.ok(buffer.length > 5000, 'Generated Excel buffer should be non-trivial');
});

test('AUD-03 & AUD-04 — Canonical Code DB Mapping & Recomputation Policy', async () => {
  const localHeads = await db('ref.local_heads').select('*');
  assert.ok(localHeads.length > 0, 'ref.local_heads table should be populated');
  
  const unmapped = localHeads.filter(lh => !lh.canonical_code);
  assert.equal(unmapped.length, 0, 'Every ref.local_heads entry must have a non-null canonical_code');
  
  const dacoity = localHeads.find(lh => lh.local_head_cd === 1);
  assert.equal(dacoity?.canonical_code, 'DACOITY', 'local_head_cd=1 must map to canonical_code DACOITY');
  
  const murder = localHeads.find(lh => lh.local_head_cd === 2);
  assert.equal(murder?.canonical_code, 'MURDER', 'local_head_cd=2 must map to canonical_code MURDER');
});

test('AUD-05 — Standardized computeVariation & varPct Formatting', () => {
  assert.equal(computeVariation(0, 0), null, 'computeVariation(0, 0) must be null');
  assert.equal(computeVariation(10, 0), Infinity, 'computeVariation(10, 0) must be Infinity');
  assert.equal(computeVariation(120, 100), 20.0, 'computeVariation(120, 100) must be 20.0');

  assert.equal(varPct(0, 0), '-', 'varPct(0, 0) must return "-"');
  assert.equal(varPct(10, 0), '+∞', 'varPct(10, 0) must return "+∞"');
  assert.equal(varPct(120, 100), '+20.0%', 'varPct(120, 100) must return "+20.0%"');
  assert.equal(varPct(80, 100), '-20.0%', 'varPct(80, 100) must return "-20.0%"');
});

test('AUD-07 — Monday Morning RAPE & POCSO Scope Guardrail', () => {
  const mmData = buildMondayMorningData([]);
  const rapeRow = mmData.find(r => r.code === 'RAPE');
  assert.ok(rapeRow, 'RAPE row should exist in Monday Morning data');
  assert.equal(rapeRow.label, 'RAPE & POCSO', 'Sheet 9 Monday Morning label for RAPE must be "RAPE & POCSO"');

  const regularRape = HEINOUS_ROWS.find(r => r.code === 'RAPE');
  assert.equal(regularRape.label, 'RAPE', 'Standard HEINOUS_ROWS label for RAPE must remain "RAPE"');
});

test('AUD-08 — District Record Editing & Workout Status Guardrail', async () => {
  const districtUser = { id: 'usr-3', role: 'DISTRICT_OFFICER', district_id: 'DIST_NDD' };
  const { updateDomainStatus } = await import('../src/modules/records/records.service.js');
  
  // Verify District user is blocked from directly updating is_worked_out
  await assert.rejects(
    async () => {
      await updateDomainStatus('non-existent-id', districtUser, {
        statusField: 'is_worked_out',
        newValue: true,
        effectiveDate: '2026-07-22'
      }, '127.0.0.1');
    },
    (err) => {
      return err.status === 403 && err.message.includes('District users cannot update workout status directly');
    },
    'District user direct workout status update must be rejected with HTTP 403'
  );
});

test.after(async () => {
  await db.destroy();
});
