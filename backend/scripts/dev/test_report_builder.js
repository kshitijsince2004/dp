/**
 * PHAROS Report Builder — Smoke Test
 * =====================================
 * End-to-end smoke test for all report builder endpoints.
 *
 * Usage:
 *   cd backend
 *   node scripts/test_report_builder.js [--base-url=http://localhost:3000]
 *
 * Prerequisites:
 *   - Node 18+ (uses native fetch)
 *   - Server running on :3000
 *   - DB seeded with at least one admin user (username: hq_admin, password: test123)
 *   - Migration 20260620100000_report_builder_tables.js has been applied
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import process from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.find(a => a.startsWith('--base-url'))?.split('=')[1] || 'http://localhost:3000';
const API = `${BASE}/api/v1/reports/builder`;

let passed = 0;
let failed = 0;
let token = null;
let csrfToken = null;
let savedId = null;
let jobId = null;

// ─────────────────────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────────────────────

function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${name}: ${err.message}`);
    failed++;
  }
}

async function api(method, path, body, expectStatus = 200) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...(csrfToken ? { Cookie: `csrfToken=${csrfToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  if (res.status !== expectStatus) {
    throw new Error(`Expected HTTP ${expectStatus}, got ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Auth
// ─────────────────────────────────────────────────────────────────────────────

log('🔑', 'Phase 1: Authentication');

await test('Login as hq_admin', async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ badge_no: 'HQ002', password: 'Test@1234' }),
  });
  const data = await res.json();
  if (res.status !== 200) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  token = data.data?.access_token || data.data?.token;
  if (!token) throw new Error('No token in response');
  
  // Extract CSRF token from Set-Cookie header
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/csrfToken=([^;]+)/);
    if (match) {
      csrfToken = match[1];
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Metadata
// ─────────────────────────────────────────────────────────────────────────────

log('\n📋', 'Phase 2: Metadata endpoint');

await test('GET /metadata returns all 5 tables', async () => {
  const data = await api('GET', '/metadata');
  const tables = Object.keys(data.data.tables);
  const expected = ['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'];
  for (const t of expected) {
    if (!tables.includes(t)) throw new Error(`Missing table: ${t}`);
  }
});

await test('GET /metadata returns joins', async () => {
  const data = await api('GET', '/metadata');
  if (!Array.isArray(data.data.joins) || data.data.joins.length < 2) {
    throw new Error('Expected at least 2 joins in metadata');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Query (Preview)
// ─────────────────────────────────────────────────────────────────────────────

log('\n🔍', 'Phase 3: Query preview');

await test('POST /query — simple CASE query succeeds', async () => {
  const data = await api('POST', '/query', {
    table: 'CASE',
    fields: [
      { field: 'fir_no', table: 'CASE' },
      { field: 'fir_date', table: 'CASE' },
      { field: 'local_head', table: 'CASE' },
      { field: '_record_date', table: 'CASE' },
    ],
    page: 1, pageSize: 10,
  });
  if (!Array.isArray(data.data)) throw new Error('Response data should be an array');
  if (!data.meta || typeof data.meta.total !== 'number') throw new Error('Missing meta.total');
});

await test('POST /query — MISSING with nested OR filter', async () => {
  const data = await api('POST', '/query', {
    table: 'MISSING',
    fields: [
      { field: 'missing_name', table: 'MISSING' },
      { field: 'status', table: 'MISSING' },
      { field: 'gender', table: 'MISSING' },
    ],
    filters: {
      logic: 'AND',
      conditions: [
        {
          logic: 'OR',
          conditions: [
            { field: 'gender', table: 'MISSING', operator: 'EQ', value: 'Female' },
            { field: 'status', table: 'MISSING', operator: 'EQ', value: 'Missing' },
          ]
        }
      ]
    },
    page: 1, pageSize: 5,
  });
  if (!Array.isArray(data.data)) throw new Error('Expected array response');
});

await test('POST /query — FIR+ARREST joined query', async () => {
  const data = await api('POST', '/query', {
    table: 'CASE',
    join: 'ARREST',
    fields: [
      { field: 'fir_no', table: 'CASE' },
      { field: 'local_head', table: 'CASE' },
      { field: 'arrest_date', table: 'ARREST' },
      { field: 'crime_head', table: 'ARREST' },
    ],
    page: 1, pageSize: 5,
  });
  if (!Array.isArray(data.data)) throw new Error('Expected array response');
});

await test('POST /query — returns 400 for invalid field', async () => {
  const data = await api('POST', '/query', {
    table: 'CASE',
    fields: [{ field: 'DROP TABLE records', table: 'CASE' }],
  }, 400);
  if (data.success !== false) throw new Error('Expected success=false for invalid field');
});

await test('POST /query — returns 400 for invalid table', async () => {
  const data = await api('POST', '/query', {
    table: 'INVALID_TABLE',
    fields: [{ field: 'fir_no', table: 'INVALID_TABLE' }],
  }, 400);
  if (data.success !== false) throw new Error('Expected success=false');
});

await test('POST /query — returns 400 for invalid operator', async () => {
  const data = await api('POST', '/query', {
    table: 'CASE',
    fields: [{ field: 'fir_no', table: 'CASE' }],
    filters: {
      logic: 'AND',
      conditions: [
        { field: 'fir_no', table: 'CASE', operator: 'INVALID_OP', value: 'test' }
      ]
    }
  }, 400);
  if (data.success !== false) throw new Error('Expected success=false for invalid operator');
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — Export (Async)
// ─────────────────────────────────────────────────────────────────────────────

log('\n📤', 'Phase 4: Async export');

await test('POST /export — queue CSV export returns 201 with job_id', async () => {
  const data = await api('POST', '/export', {
    table: 'CASE',
    format: 'csv',
    fields: [
      { field: 'fir_no', table: 'CASE' },
      { field: 'local_head', table: 'CASE' },
      { field: 'status', table: 'CASE' },
    ],
  }, 201);
  if (!data.data.job_id) throw new Error('Missing job_id in response');
  jobId = data.data.job_id;
});

await test('GET /export/:jobId — status is PENDING or READY', async () => {
  if (!jobId) throw new Error('No jobId from previous test');
  const data = await api('GET', `/export/${jobId}`);
  const status = data.data?.status?.toUpperCase();
  if (!['PENDING', 'READY'].includes(status)) {
    throw new Error(`Unexpected status: ${status}`);
  }
});

await test('POST /export — returns 400 for invalid format', async () => {
  const data = await api('POST', '/export', {
    table: 'CASE',
    format: 'DOCX',
    fields: [{ field: 'fir_no', table: 'CASE' }],
  }, 400);
  if (data.success !== false) throw new Error('Expected error for invalid format');
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Saved reports CRUD
// ─────────────────────────────────────────────────────────────────────────────

log('\n💾', 'Phase 5: Saved report templates');

await test('POST /saved — create template', async () => {
  const data = await api('POST', '/saved', {
    name: 'Test Report — Smoke Test',
    description: 'Created by automated smoke test',
    is_shared: false,
    query_spec: {
      table: 'CASE',
      fields: [{ field: 'fir_no', table: 'CASE' }],
    }
  }, 201);
  if (!data.data.id) throw new Error('Missing id in response');
  savedId = data.data.id;
});

await test('GET /saved — lists templates', async () => {
  const data = await api('GET', '/saved?page=1&limit=10');
  if (!Array.isArray(data.data)) throw new Error('Expected array response');
  if (!data.meta || typeof data.meta.total !== 'number') throw new Error('Missing meta.total');
});

await test('PUT /saved/:id — update template', async () => {
  if (!savedId) throw new Error('No savedId from previous test');
  const data = await api('PUT', `/saved/${savedId}`, {
    name: 'Updated Test Report',
  });
  if (data.data.name !== 'Updated Test Report') {
    throw new Error('Name was not updated');
  }
});

await test('POST /saved — returns 400 for invalid query_spec', async () => {
  const data = await api('POST', '/saved', {
    name: 'Bad Report',
    query_spec: { table: 'INVALID_TABLE', fields: [{ field: 'fir_no', table: 'INVALID_TABLE' }] }
  }, 400);
  if (data.success !== false) throw new Error('Expected validation error');
});

await test('DELETE /saved/:id — deletes template', async () => {
  if (!savedId) throw new Error('No savedId');
  const data = await api('DELETE', `/saved/${savedId}`);
  if (data.success !== true) throw new Error('Delete failed');
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Lookups
// ─────────────────────────────────────────────────────────────────────────────

log('\n📂', 'Phase 6: Lookup dropdowns');

const lookupTypes = ['districts', 'police-stations', 'crime-heads', 'case-status', 'arrestee-status', 'workflow-status', 'record-types'];
for (const lt of lookupTypes) {
  await test(`GET /lookups/${lt}`, async () => {
    const data = await api('GET', `/lookups/${lt}`);
    if (!Array.isArray(data.data)) throw new Error(`Expected array for lookup type "${lt}"`);
  });
}

await test('GET /lookups/invalid — returns 400', async () => {
  const data = await api('GET', '/lookups/INVALID_TYPE', undefined, 400);
  if (data.success !== false) throw new Error('Expected error for invalid lookup type');
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — Cross-match
// ─────────────────────────────────────────────────────────────────────────────

log('\n🔗', 'Phase 7: Missing↔UIDB cross-match');

await test('POST /cross-match/missing-uidb — returns result structure', async () => {
  const data = await api('POST', '/cross-match/missing-uidb', {
    gender: 'Female',
    age_min: 10,
    age_max: 50,
    max_results: 20,
  });
  if (!Array.isArray(data.data)) throw new Error('Expected array response');
  if (typeof data.meta?.total !== 'number') throw new Error('Missing meta.total');
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Audit log
// ─────────────────────────────────────────────────────────────────────────────

log('\n📜', 'Phase 8: Audit log');

await test('GET /audit — returns paginated rows for admin', async () => {
  const data = await api('GET', '/audit?page=1&limit=10');
  if (!Array.isArray(data.data)) throw new Error('Expected array response');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60));
console.log(`Smoke test complete: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('⚠️  Some tests failed — see errors above');
  process.exit(1);
} else {
  console.log('✅  All tests passed!');
}
