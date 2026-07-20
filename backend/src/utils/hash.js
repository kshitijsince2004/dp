import crypto from 'crypto';
import db from '../config/db.js';

// `record_revisions.prev_hash` is NOT NULL (DB_SCHEMA.md §4.3: "genesis = defined
// constant") — a fixed, documented 64-hex-char sentinel for revision 1 of every chain
// (never a real row_hash, never SQL NULL). Previously undefined anywhere in the codebase —
// revision-1 inserts always violated the NOT NULL constraint before this was defined
// (found during Integration 2's write-path testing, not something the schema changed).
export const GENESIS_HASH = crypto.createHash('sha256').update('PHAROS_RECORD_REVISIONS_GENESIS').digest('hex');

/** Deterministic stringify: object keys sorted recursively so the same logical value always
 * serializes identically. Required because Postgres `jsonb` does NOT preserve the original
 * key order/whitespace of what was inserted — a value hashed fresh (JSON.stringify, insertion
 * order) and the same value re-read from a jsonb column and stringified again can differ
 * byte-for-byte even though they're logically equal, which would make every verification run
 * report a false chain break. Canonicalizing both sides here is what ARCHITECTURE.md §11
 * calls "a stable, versioned serialization" — this is hash_version 1's definition; changing
 * this function is a version bump, never a silent edit.
 */
function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalFieldChanges(fieldChanges) {
  const parsed = typeof fieldChanges === 'string' ? JSON.parse(fieldChanges || '[]') : (fieldChanges || []);
  return canonicalStringify(parsed);
}

export function computeRowHash(revision, prevHash) {
  const content = canonicalStringify({
    record_id: revision.record_id || revision.recordId,
    revision_number: Number(revision.revision_number),
    changed_by: revision.changed_by,
    changed_at: typeof revision.changed_at === 'string' ? revision.changed_at : new Date(revision.changed_at).toISOString(),
    field_changes: canonicalFieldChanges(revision.field_changes),
    prev_hash: prevHash || GENESIS_HASH,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function getPreviousHash(recordId, trx = db) {
  const lastRev = await trx('record_revisions')
    .where({ record_id: recordId })
    .orderBy('revision_number', 'desc')
    .first();
  return lastRev ? lastRev.row_hash : GENESIS_HASH;
}

export async function verifyAuditChain(trx = db) {
  // Get all record IDs that have revisions
  const records = await trx('record_revisions').distinct('record_id');
  
  for (const r of records) {
    const recordId = r.record_id;
    const revisions = await trx('record_revisions')
      .where({ record_id: recordId })
      .orderBy('revision_number', 'asc');
    
    let lastHash = GENESIS_HASH;
    for (let i = 0; i < revisions.length; i++) {
      const rev = revisions[i];
      
      // 1. Check prev_hash matches
      if (rev.prev_hash !== lastHash) {
        return {
          valid: false,
          record_id: recordId,
          broken_revision_id: rev.id,
          reason: `prev_hash mismatch: expected ${lastHash}, got ${rev.prev_hash}`
        };
      }
      
      // 2. Check row_hash matches computed row_hash
      const computed = computeRowHash(rev, lastHash);
      if (rev.row_hash !== computed) {
        return {
          valid: false,
          record_id: recordId,
          broken_revision_id: rev.id,
          reason: `row_hash mismatch: computed ${computed}, stored ${rev.row_hash}`
        };
      }
      
      lastHash = rev.row_hash;
    }
  }
  
  return { valid: true };
}
