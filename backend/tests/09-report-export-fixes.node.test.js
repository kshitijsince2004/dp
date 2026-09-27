/**
 * PHAROS Report Export Audit — regression guards
 * Covers download ACL, dead records.data select, export row cap,
 * pivot save validation, and LIVE join right-filter presence.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import supertest from 'supertest';
import app from '../src/app.js';
import db from '../src/config/db.js';
import { canAccessReportJob } from '../src/modules/reports/reports.controller.js';
import { validateSavedSpec } from '../src/modules/report-builder/reportBuilder.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

after(async () => {
  await db.destroy();
});

test('GET /api/reports/download/:id without auth returns 401', async () => {
  const fakeId = '00000000-0000-4000-8000-000000000001';
  const res = await supertest(app).get(`/api/reports/download/${fakeId}`);
  assert.ok(res.status === 401 || res.status === 403, `expected 401/403, got ${res.status}`);
});

test('canAccessReportJob: owner and global roles allowed; cross-jurisdiction denied', () => {
  const job = {
    created_by: 'owner-uuid',
    filters: JSON.stringify({ ps_id: 'ps-a', district_id: 'dist-a' }),
  };

  assert.equal(
    canAccessReportJob({ user: { id: 'owner-uuid', role: 'HC' } }, job),
    true,
    'owner should access'
  );
  assert.equal(
    canAccessReportJob({ user: { id: 'other', role: 'HQ_ADMIN' } }, job),
    true,
    'global role should access'
  );
  assert.equal(
    canAccessReportJob({
      user: { id: 'other', role: 'SHO', ps_id: 'ps-b', district_id: 'dist-b' },
    }, job),
    false,
    'cross-jurisdiction non-owner should be denied'
  );
  assert.equal(
    canAccessReportJob({
      user: { id: 'other', role: 'SHO', ps_id: 'ps-a', district_id: 'dist-x' },
    }, job),
    true,
    'same PS should be allowed'
  );
});

test('getRecordsForReport does not select records.data / raw_data', () => {
  const src = fs.readFileSync(
    path.join(root, 'src/modules/reports/reports.controller.js'),
    'utf8'
  );
  assert.equal(src.includes("r.data as raw_data"), false);
  assert.equal(src.includes('parseJsonField(r.raw_data)'), false);
});

test('export path uses higher row cap when spec.export is true', () => {
  const src = fs.readFileSync(
    path.join(root, 'src/modules/report-builder/queryEngine.js'),
    'utf8'
  );
  assert.match(src, /spec\.export \? Math\.min\(requested, MAX_EXPORT_ROWS\)/);
  assert.match(src, /REPORT_EXPORT_MAX_ROWS/);

  const ctrl = fs.readFileSync(
    path.join(root, 'src/modules/report-builder/reportBuilder.controller.js'),
    'utf8'
  );
  assert.match(ctrl, /pageSize:\s*100000,\s*export:\s*true/);
});

test('validateSavedSpec accepts pivot specs and rejects pivot without measure', () => {
  const pivotOk = validateSavedSpec({
    rows: ['ps_name'],
    columns: ['crime_head'],
    measure: 'case_count',
    filters: {},
  }, 'HQ_ADMIN');
  assert.equal(pivotOk.ok, true);

  const pivotBad = validateSavedSpec({
    rows: ['ps_name'],
    columns: ['crime_head'],
  }, 'HQ_ADMIN');
  assert.equal(pivotBad.ok, false);
  assert.ok(pivotBad.errors.some(e => /measure/i.test(e)));
});

test('LIVE joined path applies rightFilters in memory (no L.data SQL filters for content)', () => {
  const src = fs.readFileSync(
    path.join(root, 'src/modules/report-builder/queryEngine.js'),
    'utf8'
  );
  assert.match(src, /passesInMemoryFilter\(rData, rightFilters\.conditions\)/);
  assert.match(src, /leftDbFilters/);
  assert.match(src, /leftContentFilters/);
});

test('cross-match LIVE fallback uses recomposeRecord, not M.data', () => {
  const src = fs.readFileSync(
    path.join(root, 'src/modules/report-builder/queryEngine.js'),
    'utf8'
  );
  // LIVE branch must not select dead JSONB column
  assert.equal(/\.select\('M\.id'[^;]*'M\.data'/.test(src), false);
  assert.match(src, /recomposeOne/);
  assert.match(src, /loadRegistry\(db, 'MISSING'\)/);
});

test('PDF uses formatSectionCell; CSV neutralizes formula injection', () => {
  const src = fs.readFileSync(
    path.join(root, 'src/modules/report-builder/reportBuilder.controller.js'),
    'utf8'
  );
  assert.match(src, /formatSectionCell\(row, h, rowGrain\)/);
  assert.match(src, /const csvSafe =/);
  assert.ok(src.includes("if (/^[=+\\-@\\t\\r]/.test(s))"), 'CSV formula neutralization present');
  assert.equal(src.includes('row[h.key]'), false);
});
