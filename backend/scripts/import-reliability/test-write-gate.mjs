#!/usr/bin/env node
// test-write-gate.mjs — Import Reliability Framework, Wave A / T7.3.
//
// Regression proof for F6's caveat ("this audit is read-only and did not execute the current
// code to confirm the gate now holds end-to-end; treat the current invalidParentKeys mechanism
// as sound per static reading, but flag it as worth one live confirm-time regression test
// before being fully trusted"). Two checks:
//
//   1. REAL, no stubs: runs the actual readWorkbook() + validateBatch() (the same functions
//      import.service.js's createBatch/processBatch call) against every corpus file, then
//      asserts the real invariant confirm-time relies on — every parent key with at least one
//      ERROR-severity finding is in `invalidParentKeys`, and `composedPayloads` (the array
//      processBatch's write loop iterates) contains NONE of them. This is the literal
//      mechanism that keeps an ERROR-severity row from ever reaching createImportedRecord —
//      proven against real files/real DB, not a mock.
//   2. Focused/stubbed: `sanitizedWriteFailedRow()` (import.service.js) is a pure function
//      pulled out of processBatch's catch block specifically so this could be tested without a
//      live DB write failure — asserts it NEVER echoes the raw driver error text (T7.2/F6/F7).
//
// Run from backend/: node scripts/import-reliability/test-write-gate.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../src/config/db.js';
import { readWorkbook } from '../../src/modules/import/import.parse.js';
import { validateBatch } from '../../src/modules/import/import.validate.js';
import { normalizeRegistryRow, parseApplicableTypes } from '../../src/modules/import/registry-sync.util.js';
import { districtForPs, sanitizedWriteFailedRow } from '../../src/modules/import/import.service.js';
import { canonKey } from '../../src/modules/import/import.parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildRegistryMap(trx, recordType) {
  const rows = (await trx('field_registry').where('is_active', true)).map(normalizeRegistryRow);
  const map = {};
  for (const f of rows) {
    if (parseApplicableTypes(f.applicable_record_types).includes(recordType)) map[f.field_key] = f;
  }
  return map;
}

let _psCache = null;
async function loadPsNodes(trx) {
  if (_psCache) return _psCache;
  _psCache = await trx('hierarchy_nodes').where({ node_type: 'PS', is_active: true }).select('id', 'name');
  return _psCache;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();
async function resolveBestEffortScope(trx, psHint, firstParentRow) {
  const psNodes = await loadPsNodes(trx);
  const tryMatch = (candidate) => {
    if (!candidate) return null;
    return psNodes.find((n) => norm(n.name) === norm(candidate)) || null;
  };
  const psNode = tryMatch(psHint) || tryMatch(firstParentRow && firstParentRow.police_station) || psNodes[0];
  if (!psNode) return { psId: null, districtId: null, districtName: null, psName: null };
  const districtNode = await districtForPs(psNode.id);
  return {
    psId: psNode.id, districtId: districtNode ? districtNode.id : null,
    districtName: districtNode ? districtNode.name : null, psName: psNode.name,
  };
}

// ── Check 1: the write gate (real readWorkbook + validateBatch, real DB, no stubs) ─────────
async function checkWriteGate(isLegacy) {
  const manifest = JSON.parse(
    (await import('fs')).readFileSync(path.join(__dirname, 'corpus.manifest.json'), 'utf8')
  );
  let filesChecked = 0;
  let totalErrorFindings = 0;
  let totalComposed = 0;
  const violations = [];

  for (const entry of manifest.entries) {
    const recordType = entry.record_type;
    if (!recordType) continue;
    const registryMap = await buildRegistryMap(db, recordType);
    let parsed;
    try {
      parsed = await readWorkbook(recordType, entry.path, registryMap);
    } catch (err) {
      continue; // unreadable fixture — not this test's concern (replay-corpus already covers it)
    }
    if (!parsed) continue;
    // T9 (03-TRIAGE-MATRIX.md) — same guard as replay-corpus.mjs's replayOneFile: readWorkbook
    // returns a truthy `{ unknownLayout: true }` sentinel (never throws) for a file whose
    // headers don't fingerprint-match any known template layout. Without this check, the code
    // below crashes on the missing parentRows/childSheets fields instead of skipping the file.
    if (parsed.unknownLayout) continue;

    const firstParentRow = parsed.parentRows[0] ? parsed.parentRows[0].rowData : null;
    const batchScope = await resolveBestEffortScope(db, entry.ps_hint, firstParentRow);
    if (!batchScope.psId) continue; // can't meaningfully scope this fixture — skip

    const { errorRows, invalidParentKeys, composedPayloads } = await validateBatch(db, {
      recordType, isLegacy, batchScope, parsed, registryMap,
    });
    filesChecked++;

    const parentKeyField = parsed.parentKeyField;
    const parentIndex = parsed.parentIndex;
    const canonOfRow = (rowIdx) => {
      const row = parsed.parentRows.find((r) => r.rowIdx === rowIdx);
      if (row && parentKeyField) {
        const val = row.rowData[parentKeyField];
        return (parentIndex && parentIndex.resolve(val)) || canonKey(val);
      }
      return `row:${rowIdx}`;
    };

    // Every ERROR-severity finding attached to a real row must belong to an invalidated parent
    // (row 0 = batch-level findings like GHOST_ROWS_SKIPPED, never a parent-scoped finding).
    // WARNING-severity findings (BEAT_RECOVERED, SUBMIT_REQUIREMENTS_PENDING, IO_AUTO_PROVISIONED,
    // etc.) are NOT expected to invalidate anything — that's the whole point of a WARNING — so
    // they're deliberately excluded here, not part of this invariant.
    //
    // Only codes emitted at the COMPOSED level (validateComposedRow, attributed to the
    // payload's OWN rowIdx == the parent row's rowIdx) are checked directly here — row-level
    // codes (REQUIRED_MISSING, PARENT_KEY_BLANK/UNMATCHED) can fire on a CHILD sheet, whose
    // rowIdx is independent worksheet-row numbering that can numerically coincide with an
    // unrelated parent row's rowIdx (both sheets start counting from ~row 5) — canonOfRow()
    // would misattribute those. That case is still fully covered by the SECOND check below
    // (composedPayloads never contains an invalidated parent, derived from each parent's own
    // real rowData — no rowIdx ambiguity there), which is the actual write-time guarantee.
    const COMPOSED_LEVEL_CODES = new Set([
      'RECORD_DATE_MISSING', 'DUPLICATE_IN_DB', 'DUPLICATE_IN_SHEET', 'PS_MISMATCH',
      'IO_NOT_REGISTERED', 'REF_UNRESOLVED_SECTION', 'REF_UNRESOLVED_MAJOR_HEAD',
      'REF_UNRESOLVED_MINOR_HEAD', 'REF_UNRESOLVED_LOCAL_HEAD', 'REF_UNRESOLVED_BEAT',
    ]);
    for (const e of errorRows) {
      if (e.code === '__INVALID_PARENT__' || e.row === 0 || e.severity !== 'ERROR') continue;
      if (!COMPOSED_LEVEL_CODES.has(e.code)) continue;
      totalErrorFindings++;
      const canon = canonOfRow(e.row);
      if (!invalidParentKeys.has(canon)) {
        violations.push(`${entry.id}: row ${e.row} (${e.code}) is ERROR but its parent (${canon}) is NOT in invalidParentKeys`);
      }
    }

    // The actual gate: composedPayloads (what processBatch's write loop iterates) must contain
    // NO parent whose canon is in invalidParentKeys.
    totalComposed += composedPayloads.length;
    for (const { payload, rawParentRow } of composedPayloads) {
      const canon = parentKeyField
        ? ((parentIndex && parentIndex.resolve(rawParentRow.rowData[parentKeyField])) || canonKey(rawParentRow.rowData[parentKeyField]))
        : `row:${rawParentRow.rowIdx}`;
      if (invalidParentKeys.has(canon)) {
        violations.push(`${entry.id}: composedPayloads contains invalidated parent ${canon} (row ${payload.rowIdx}) — THIS WOULD REACH createImportedRecord`);
      }
    }
  }

  return { filesChecked, totalErrorFindings, totalComposed, violations };
}

// ── Check 2: WRITE_FAILED sanitization (focused, stubbed — no live DB failure needed) ──────
function checkSanitization() {
  const rawMessages = [
    'insert into "persons" (...) - violates check constraint "persons_gender_check"',
    'duplicate key value violates unique constraint "uq_io_pis_no"',
    'null value in column "record_date" of relation "records" violates not-null constraint',
    'update or delete on table "records" violates foreign key constraint',
  ];
  const violations = [];
  for (const raw of rawMessages) {
    const row = sanitizedWriteFailedRow('batch-test-123', 7);
    if (row.error_message.includes(raw)) violations.push(`sanitized message leaked raw text: "${raw}"`);
    if (!/^This row could not be saved due to a system error \(ref: batch-test-123\/7\)\. Report this to your administrator\.$/.test(row.error_message)) {
      violations.push(`unexpected sanitized message shape: "${row.error_message}"`);
    }
    if (row.severity !== 'ERROR' || row.error_code !== 'WRITE_FAILED') {
      violations.push('sanitizedWriteFailedRow did not return the expected {severity, error_code}');
    }
  }
  return { checked: rawMessages.length, violations };
}

async function main() {
  console.log('T7.3 write-gate regression test\n');

  console.log('-- Check 1: ERROR findings never reach composedPayloads (non-legacy) --');
  const nonLegacy = await checkWriteGate(false);
  console.log(`files checked: ${nonLegacy.filesChecked}, ERROR findings examined: ${nonLegacy.totalErrorFindings}, composedPayloads examined: ${nonLegacy.totalComposed}`);
  nonLegacy.violations.forEach((v) => console.log('  VIOLATION:', v));

  console.log('\n-- Check 1b: same, legacy mode (keystone ERRORs still must gate) --');
  const legacy = await checkWriteGate(true);
  console.log(`files checked: ${legacy.filesChecked}, ERROR findings examined: ${legacy.totalErrorFindings}, composedPayloads examined: ${legacy.totalComposed}`);
  legacy.violations.forEach((v) => console.log('  VIOLATION:', v));

  console.log('\n-- Check 2: WRITE_FAILED sanitization (never err.message verbatim) --');
  const sanitization = checkSanitization();
  console.log(`raw messages checked: ${sanitization.checked}`);
  sanitization.violations.forEach((v) => console.log('  VIOLATION:', v));

  const allViolations = [...nonLegacy.violations, ...legacy.violations, ...sanitization.violations];
  console.log(`\n${allViolations.length === 0 ? 'PASS' : 'FAIL'} — ${allViolations.length} violation(s).`);
  return allViolations.length === 0 ? 0 : 1;
}

main()
  .then(async (code) => { await db.destroy(); process.exit(code); })
  .catch(async (err) => {
    console.error('test-write-gate failed:', err.stack || err.message);
    await db.destroy();
    process.exit(1);
  });
