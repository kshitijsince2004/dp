// Audit hash-chain hardening — constrain record_revisions.hash_version to KNOWN values only.
//
// WHY: `verifyAuditChain` (backend/src/utils/hash.js) classifies any revision whose stored
// hash_version is not in the HASHERS map as `unverifiable` — NOT a break — so it never flips
// `valid` and never freezes. Left unconstrained, an attacker with DB write access could edit a
// stored v2 revision's content AND set hash_version to an unknown value (e.g. 99); the tampered
// row would then launder into "unverifiable" and every alert/CLI/API channel would read GREEN.
// A DB CHECK that only permits currently-known versions removes that laundering path at the
// source: a relabelled row can no longer be written at all.
//
// INVARIANT: this CHECK must always list exactly the hash_versions the code can compute. When a
// future hash_version N is added, widen this CHECK to include N in the SAME migration that bumps
// CURRENT_HASH_VERSION (backend/src/utils/hash.js) — never bump the writer without widening the
// constraint, or new legitimate rows will be rejected.

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE record_revisions
      ADD CONSTRAINT record_revisions_hash_version_known
      CHECK (hash_version IN (1, 2));
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE record_revisions
      DROP CONSTRAINT IF EXISTS record_revisions_hash_version_known;
  `);
}
