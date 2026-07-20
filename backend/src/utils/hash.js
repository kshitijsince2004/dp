import crypto from 'crypto';
import db from '../config/db.js';

// `record_revisions.prev_hash` is NOT NULL (DB_SCHEMA.md §4.3: "genesis = defined
// constant") — a fixed, documented 64-hex-char sentinel for revision 1 of every chain
// (never a real row_hash, never SQL NULL). Previously undefined anywhere in the codebase —
// revision-1 inserts always violated the NOT NULL constraint before this was defined
// (found during Integration 2's write-path testing, not something the schema changed).
export const GENESIS_HASH = crypto.createHash('sha256').update('PHAROS_RECORD_REVISIONS_GENESIS').digest('hex');

// The canonicalization scheme the SINGLE write path stamps on every NEW revision. The verifier
// dispatches on each row's stored `hash_version`, so bumping this only affects rows written
// after the bump — older rows keep verifying under their own version's rules (DB_SCHEMA.md
// §4.3: "scheme never changes without a bump"). v2 (2026-07, hash-chain enforcement pass)
// widened the hashed payload to cover EVERY content-bearing immutable revision column — v1
// left change_type/level/comment/reason/ip_address outside the hash, so those could be edited
// after the fact without breaking the chain; v2 closes that hole and also folds hash_version
// itself into the digest so the version can't be downgraded to dodge the wider coverage.
export const CURRENT_HASH_VERSION = 2;

/** Deterministic stringify: object keys sorted recursively so the same logical value always
 * serializes identically. Required because Postgres `jsonb` does NOT preserve the original
 * key order/whitespace of what was inserted — a value hashed fresh (JSON.stringify, insertion
 * order) and the same value re-read from a jsonb column and stringified again can differ
 * byte-for-byte even though they're logically equal, which would make every verification run
 * report a false chain break. Canonicalizing both sides here is what ARCHITECTURE.md §11
 * calls "a stable, versioned serialization". Changing this function is a version bump, never
 * a silent edit. */
function canonicalStringify(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** `field_changes` is a jsonb column: written as a JSON string, but read back as an already-
 * parsed value. Normalize to the parsed form so both directions canonicalize identically. */
function parseFieldChanges(fieldChanges) {
  if (fieldChanges === null || fieldChanges === undefined) return [];
  return typeof fieldChanges === 'string' ? JSON.parse(fieldChanges || '[]') : fieldChanges;
}

/** timestamptz round-trips as an ISO string on write and a JS Date on read — collapse both to
 * the same millisecond-precision ISO string (toISOString round-trips ms→µs→ms exactly). */
function normalizeChangedAt(changedAt) {
  return typeof changedAt === 'string' ? changedAt : new Date(changedAt).toISOString();
}

// ── hash_version 1 (LEGACY — do not edit; only reproduces rows written before v2) ──────────
// Preserved byte-for-byte so any revision persisted under v1 still verifies. v1 hashed the
// field_changes as a canonical STRING nested inside the payload (double-encoded); that quirk
// is part of the v1 contract and is deliberately kept here.
function canonicalFieldChangesV1(fieldChanges) {
  return canonicalStringify(parseFieldChanges(fieldChanges));
}

function computeRowHashV1(revision, prevHash) {
  const content = canonicalStringify({
    record_id: revision.record_id || revision.recordId,
    revision_number: Number(revision.revision_number),
    changed_by: revision.changed_by,
    changed_at: normalizeChangedAt(revision.changed_at),
    field_changes: canonicalFieldChangesV1(revision.field_changes),
    prev_hash: prevHash || GENESIS_HASH,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ── hash_version 2 (CURRENT) ───────────────────────────────────────────────────────────────
// Covers every immutable, content-bearing column of record_revisions. hash_version is part of
// the digest so a stored row can't be re-labelled v1 to escape the wider field coverage.
function computeRowHashV2(revision, prevHash) {
  const content = canonicalStringify({
    hash_version: 2,
    record_id: revision.record_id || revision.recordId,
    revision_number: Number(revision.revision_number),
    change_type: revision.change_type ?? null,
    level: revision.level ?? null,
    changed_by: revision.changed_by,
    changed_at: normalizeChangedAt(revision.changed_at),
    field_changes: parseFieldChanges(revision.field_changes),
    comment: revision.comment ?? null,
    reason: revision.reason ?? null,
    ip_address: revision.ip_address ?? null,
    prev_hash: prevHash || GENESIS_HASH,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

const HASHERS = { 1: computeRowHashV1, 2: computeRowHashV2 };

/** Compute a revision's row_hash under a specific canonicalization scheme. New writes must use
 * CURRENT_HASH_VERSION; verification passes the row's own stored hash_version so historical
 * rows reproduce under the scheme they were written with. */
export function computeRowHash(revision, prevHash, version = CURRENT_HASH_VERSION) {
  const hasher = HASHERS[version];
  if (!hasher) throw new Error(`Unknown hash_version ${version} — cannot compute row_hash`);
  return hasher(revision, prevHash);
}

export async function getPreviousHash(recordId, trx = db) {
  const lastRev = await trx('record_revisions')
    .where({ record_id: recordId })
    .orderBy('revision_number', 'desc')
    .first();
  return lastRev ? lastRev.row_hash : GENESIS_HASH;
}

/**
 * Walk every record's revision chain and report ALL tamper-evidence failures (not just the
 * first). Memory is bounded: rather than buffering every revision in one read, this fetches the
 * distinct record_ids that have revisions and then processes them in fixed-size batches, loading
 * and verifying one chunk of records' revisions at a time (ordered by record_id then
 * revision_number so each chain arrives contiguous and in-order). Each row dispatches to the
 * hasher for its stored hash_version. A chain is broken by either a prev_hash discontinuity (a
 * row inserted/removed/reordered) or a KNOWN-version row_hash mismatch (a column edited in
 * place); the first anomaly on a chain poisons everything after it, so at most one break is
 * reported per record.
 *
 * A row whose stored hash_version is NOT dispatchable by this instance (unknown/newer scheme —
 * e.g. mid rolling-deploy or after a rollback) is NOT tamper evidence: it is recorded in
 * `unverifiable` and never counted as a break or allowed to flip `valid`. Because an unhashable
 * row also means the expected prev_hash for the rest of that record's chain can no longer be
 * advanced, once an unverifiable row is hit the remainder of that record's rows are recorded as
 * unverifiable-context too (never fabricated as breaks).
 *
 * Returns { valid, checked_records, checked_revisions,
 *   breaks: [{ record_id, broken_revision_id, revision_number, reason }],
 *   unverifiable: [{ record_id, revision_id, revision_number, hash_version, reason }] }.
 * `valid` is a convenience mirror of breaks.length === 0 (unverifiable never affects it).
 */
export async function verifyAuditChain(trx = db) {
  const RECORD_BATCH = 200;

  const idRows = await trx('record_revisions')
    .distinct('record_id')
    .orderBy('record_id');
  const recordIds = idRows.map((r) => r.record_id);

  const breaks = [];
  const unverifiable = [];
  let checkedRevisions = 0;

  for (let i = 0; i < recordIds.length; i += RECORD_BATCH) {
    const chunkIds = recordIds.slice(i, i + RECORD_BATCH);
    const rows = await trx('record_revisions')
      .select('id', 'record_id', 'revision_number', 'change_type', 'field_changes', 'level',
        'changed_by', 'changed_at', 'comment', 'reason', 'ip_address', 'prev_hash', 'row_hash', 'hash_version')
      .whereIn('record_id', chunkIds)
      .orderBy([{ column: 'record_id' }, { column: 'revision_number', order: 'asc' }]);

    checkedRevisions += rows.length;

    // Per-chunk maps keep memory bounded to a single batch. Every revision of any record in this
    // chunk is loaded together, so a record's full chain is always resolved within one chunk.
    const brokenRecords = new Set();
    const unverifiableRecords = new Set();
    const lastHashByRecord = new Map();

    for (const rev of rows) {
      if (brokenRecords.has(rev.record_id)) continue; // first break already recorded for this chain

      if (unverifiableRecords.has(rev.record_id)) {
        // An earlier row on this chain was unhashable, so we can't advance the expected prev_hash
        // — the rest of the chain is context, not tamper. Never emit a fabricated break here.
        unverifiable.push({
          record_id: rev.record_id,
          revision_id: rev.id,
          revision_number: rev.revision_number,
          hash_version: rev.hash_version,
          reason: `revision ${rev.revision_number} follows an unverifiable revision on this chain — cannot advance prev_hash past an unhashable row`,
        });
        continue;
      }

      // Classify version dispatchability WITHOUT changing how a known version is hashed: only
      // rows whose scheme this instance doesn't know are diverted to `unverifiable`.
      if (!HASHERS[rev.hash_version]) {
        unverifiable.push({
          record_id: rev.record_id,
          revision_id: rev.id,
          revision_number: rev.revision_number,
          hash_version: rev.hash_version,
          reason: `unknown hash_version ${rev.hash_version} at revision ${rev.revision_number} — written by a newer/unrecognized scheme this instance cannot verify`,
        });
        unverifiableRecords.add(rev.record_id);
        continue;
      }

      const expectedPrev = lastHashByRecord.has(rev.record_id) ? lastHashByRecord.get(rev.record_id) : GENESIS_HASH;

      if (rev.prev_hash !== expectedPrev) {
        breaks.push({
          record_id: rev.record_id,
          broken_revision_id: rev.id,
          revision_number: rev.revision_number,
          reason: `prev_hash mismatch at revision ${rev.revision_number}: expected ${expectedPrev}, got ${rev.prev_hash}`,
        });
        brokenRecords.add(rev.record_id);
        continue;
      }

      let computed;
      try {
        computed = computeRowHash(rev, rev.prev_hash, rev.hash_version);
      } catch (err) {
        // Version is dispatchable (checked above) — a throw here is a genuine known-version
        // failure (e.g. corrupt field_changes), so it remains a real break, as before.
        breaks.push({
          record_id: rev.record_id,
          broken_revision_id: rev.id,
          revision_number: rev.revision_number,
          reason: `cannot recompute row_hash at revision ${rev.revision_number}: ${err.message}`,
        });
        brokenRecords.add(rev.record_id);
        continue;
      }

      if (rev.row_hash !== computed) {
        breaks.push({
          record_id: rev.record_id,
          broken_revision_id: rev.id,
          revision_number: rev.revision_number,
          reason: `row_hash mismatch at revision ${rev.revision_number}: computed ${computed}, stored ${rev.row_hash}`,
        });
        brokenRecords.add(rev.record_id);
        continue;
      }

      lastHashByRecord.set(rev.record_id, rev.row_hash);
    }
  }

  return {
    valid: breaks.length === 0,
    checked_records: recordIds.length,
    checked_revisions: checkedRevisions,
    breaks,
    unverifiable,
  };
}
