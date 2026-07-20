# Integration 4 — Audit hash-chain enforcement (tamper-evidence, freeze, verification job)

**Status:** ✅ done, 2026-07-18. **Branch:** `dev2/ashmit`.

Completes the audit subsystem — the intentionally-deferred **P1.5 step 8** of
`docs/ENGINEERING_BASELINE.md` ("Hash-chain enforcement + verification job + freeze runbook —
LAST, hooks kept warm per P6"). Everything below is the audit subsystem *only*; the still-
pending **reporting** engine (report-builder / report_templates engine / daily-diary /
warehouse) is explicitly OUT of scope and untouched.

No schema change was required — `record_revisions.prev_hash/row_hash/hash_version`,
`records.is_frozen`, `audit_logs`, and `record_status_events` all already existed (base
migrations `20260711000003` + `20260711000005`). This pass wired enforcement onto the schema
the restructure already laid down, so `DB_SCHEMA.md` / `ER_DIAGRAM` need no edits.

---

## What was already there (Integration 2 legacy) vs what this pass added

**Already present:** `writeRevision` as the single revision writer; `computeRowHash` /
`getPreviousHash` / `GENESIS_HASH`; `is_frozen` checked *only* in `transitionRecord`; a
`GET /audit/chain-verify` endpoint; `verifyAuditChain` that stopped at the first break.

**Gaps this pass closed (the real audit holes):**

1. **Hash payload didn't cover all content (tamper hole).** v1's `computeRowHash` hashed only
   `record_id, revision_number, changed_by, changed_at, field_changes, prev_hash` — so
   `change_type`, `level`, `comment`, `reason`, `ip_address` could be edited in place and the
   chain still verified. Proven closed by the e2e test (tampering `comment` is now caught).
2. **`is_frozen` enforced on only one of five write paths.** `updateRecord`, `overrideCaseHead`,
   `updateDomainStatus`, `deleteRecord` never checked it — a frozen record was still mutable.
3. **Freeze-on-break was never wired.** The old endpoint published an alert but never set
   `is_frozen` or wrote an audit row.
4. **No verification job, no freeze/unfreeze surface, and verify stopped at the first break.**
5. **`updateRecord` took no row lock** — concurrent edits to one record could interleave their
   person/property/offence rewrites (the `UNIQUE(record_id, revision_number)` constraint was
   the only backstop, and only for the revision itself).

---

## Canonical contracts

- **C1 — Versioned canonical hashing (`backend/src/utils/hash.js`).**
  `CURRENT_HASH_VERSION = 2`. Each revision stores the scheme it was written under; the
  verifier dispatches per-row (`HASHERS[hash_version]`), so **old v1 rows keep verifying** and
  a bump is never a migration. `computeRowHashV1` is preserved byte-for-byte (including its
  double-encoded `field_changes` quirk) — **do not edit it**. `computeRowHashV2` hashes every
  immutable content-bearing column *plus `hash_version` itself* (so a row can't be relabelled
  v1 to dodge the wider coverage). Changing a hasher = a new version, never a silent edit
  (DB_SCHEMA.md §4.3). Round-trip stability: `field_changes` (jsonb, read back parsed) and
  `changed_at` (timestamptz, read back as a `Date`) are both normalized identically on write
  and verify — this is what prevents *false* breaks and was the primary e2e risk.

- **C2 — Single writer stamps v2 (`records.service.js` `writeRevision`).** Builds ONE
  `revisionRow` object, hashes exactly that object, and inserts it — the hashed payload can
  never drift from the stored columns. Takes `SELECT … FOR UPDATE` on the spine row up front
  to serialize `revision_number` + `prev_hash` assignment for callers that didn't already lock
  (create/update). Still the only place in the codebase that writes `record_revisions`.

- **C3 — `assertNotFrozen(record)` on every mutation path.** Centralized helper (HTTP 423)
  called in `updateRecord` (after a new entry-level `FOR UPDATE` lock), `transitionRecord`,
  `overrideCaseHead`, `updateDomainStatus`, and `deleteRecord`. `createRecord` /
  `createImportedRecord` are exempt (record doesn't exist yet).

- **C4 — Freeze is an audit fact, never a revision (`records.service.js` `setRecordFrozen`).**
  The ONLY mutator of `records.is_frozen`. Writes a single `audit_logs` row (`FREEZE` /
  `UNFREEZE`, actor role `SYSTEM` when automated) and deliberately does **not** extend the hash
  chain — responding to a break by appending to the broken chain would be self-defeating.

- **C5 — Verification + enforcement (`backend/src/modules/audit/audit.service.js`).**
  `verifyAuditChain` walks every chain in **bounded per-record batches** (200 record_ids at a
  time — no whole-table buffer) and returns `{ valid, checked_records, checked_revisions,
  breaks[], unverifiable[] }`, reporting **all** breaks (one per broken record). A row whose
  stored `hash_version` this instance can't dispatch is classified **`unverifiable`**, never a
  break: it does not flip `valid` and is never frozen — so a rolling deploy/rollback can't cause
  a mass-freeze (an unknown version means "stale code", not "tampered"). `runChainVerification
  ({ freezeOnBreak, actor })` freezes only real `breaks`, subject to a **circuit-breaker**
  (env `AUDIT_VERIFY_MAX_FREEZE`, default 100 absolute, or >50 % of `checked_records`): above
  it, nothing is frozen, it's logged loudly, `freezeSkipped:true` is returned, and the alert
  still fires — a mass break is a systemic bug, not an attack, and mass-freezing would be a
  self-inflicted outage. `audit.chain_break_detected` is published on any break **or** on
  `unverifiable > 0` (best-effort; a broker hiccup never discards freeze work).

- **C6 — Surfaces (all SYSTEM_ADMIN).**
  - `GET  /audit/chain-verify` — read-only report (never mutates). Response carries `breaks`,
    `unverifiable`, `unverifiable_count`, `frozen`, `freezeSkipped` — so it can never read a
    bare green while unverifiable rows exist.
  - `POST /audit/chain-verify[?freeze=false]` — verify **and** freeze broken records.
  - `POST /audit/records/:recordId/freeze` — manual freeze.
  - `POST /audit/records/:recordId/unfreeze` — privileged unfreeze; **reason ≥ 10 chars required**.
  - Scheduled job: `audit.scheduler.js` (`node-cron`), started in `index.js` alongside the
    warehouse scheduler — env `AUDIT_VERIFY_ENABLED` (default on), `AUDIT_VERIFY_CRON`
    (default `15 3 * * *`), `AUDIT_VERIFY_FREEZE` (default freeze on break),
    `AUDIT_VERIFY_MAX_FREEZE` (circuit-breaker cap, default 100).
  - CLI / CI gate: `npm run audit:verify` (`scripts/verify-audit-chain.mjs`) — exit **0** clean,
    **1** on breaks, **3** on unverifiable-only, **2** on run failure; `--freeze` to enforce,
    `--json` for machine output.

- **C7 — `hash_version` is DB-constrained (`migration 20260718000001`).**
  `CHECK (hash_version IN (1,2))` on `record_revisions`. Removes the tamper-laundering path a
  version review found: without it, an attacker could edit a v2 row's content **and** relabel it
  to an unknown version to launder the tamper into `unverifiable`. **Invariant:** widen this
  CHECK to include any new `hash_version N` in the *same* migration that bumps
  `CURRENT_HASH_VERSION`, or legitimate new rows are rejected.

---

## Freeze / break runbook (§9.4)

1. **Detection:** the scheduled job (or `npm run audit:verify`, or `POST /audit/chain-verify`)
   finds a `prev_hash` discontinuity or `row_hash` mismatch.
2. **Automatic response:** every broken record is frozen (`is_frozen = true`), a `FREEZE`
   `audit_logs` row is written by `SYSTEM`, and `audit.chain_break_detected` is published with
   the full break list. All further mutation of those records is rejected with HTTP 423.
3. **Investigation:** a SYSTEM_ADMIN inspects `record_revisions` for the record + the
   `audit_logs` trail; the break `reason` names the revision number and whether it was a
   prev_hash (insert/reorder/delete) or row_hash (in-place edit) failure.
4. **Resolution:** only a SYSTEM_ADMIN may `POST /audit/records/:id/unfreeze` with a documented
   reason (≥ 10 chars, recorded in `audit_logs`). Genuine corrections go through the amendment
   flow, not by editing revisions.

---

## Verification

**Pass 1 (2026-07-18, initial build) — 16-assertion e2e, all green:** v1 backward-compat (57
legacy rows verify under `computeRowHashV1`); a real v2 revision round-trips jsonb + timestamptz
with zero false breaks; an independent hand-derived v2 `row_hash` matches; tampering the
`comment` column (unprotected under v1) is caught; `runChainVerification` freezes + writes a
`SYSTEM` `FREEZE` audit row + appends no revision, then the frozen record rejects mutation with
423; restore returns the chain to valid.

**Pass 2 (2026-07-18, multi-agent hardening + adversarial verification).** A delegated
analysis → plan → implement → adversarial-review → empirical-test workflow hardened the
subsystem and independently re-verified it:
- **Hardening delivered:** unknown-`hash_version` → `unverifiable` not auto-freeze (rolling-
  deploy safety); freeze **circuit-breaker** (`AUDIT_VERIFY_MAX_FREEZE`); **bounded-memory**
  batched verifier; `max(revision_number)+1` (gap-proof).
- **Adversarial reviewer (independent) found a real HIGH** self-inflicted by the unverifiable
  classification: content-edit + `hash_version=99` laundered a tamper into `unverifiable`,
  reading green on CLI/API/alert. **Closed** by C7's DB CHECK (attacker can't claim an unknown
  version) + making `unverifiable > 0` non-green on every channel. Its two MEDIUM findings
  (unkeyed re-chaining, tail truncation) are the documented cryptographic boundary above.
- **Empirical tester (independent) — 11/11 PASS** against the live DB: baseline/backward-compat;
  round-trips through `createRecord` (fat `field_changes`), `updateRecord`, `updateDomainStatus`,
  `overrideCaseHead`; independent hand-derived v2 hash match; tamper→detect→freeze→423→restore;
  version-bump blocked (Postgres `23514`); unverifiable classified + non-green + not frozen;
  circuit-breaker trips (`freezeSkipped`, nothing frozen); strictly-increasing revision numbers.

Left clean: `npm run audit:verify` → "Hash-chain intact", exit 0; no record left frozen;
`record_revisions_hash_version_known` constraint present. Single-writer discipline confirmed by
sweep: `record_revisions` is inserted only at `records.service.js` `writeRevision`; `is_frozen`
is mutated only at `setRecordFrozen`.

---

## Threat model & cryptographic boundary (adversarial review, 2026-07-18)

Be precise about what this subsystem does and does not defend against. The chain is an
**in-database, unkeyed SHA-256** hash chain. It is *tamper-evident*, not *tamper-proof*, and
its strength is bounded by where the trust anchor lives.

**Detected (what the chain catches):**
- Any naive in-place edit of a stored revision's content columns (`field_changes`, `comment`,
  `reason`, `ip_address`, `change_type`, `level`, `changed_by`, `changed_at`) — v2 hashes all
  of them, so the recomputed `row_hash` no longer matches → **break**.
- Inserting, removing, or reordering a revision *in the interior* of a chain — the next row's
  `prev_hash` no longer matches the running hash → **break**.
- Relabelling a row to the *other known* version (v2→v1) — it recomputes under v1 and
  mismatches → **break** (and v2 folds `hash_version` into its own digest).
- Relabelling a row to an *unknown* version (e.g. `hash_version=99`) to launder tampering is
  now **structurally blocked** by `CHECK (hash_version IN (1,2))` (migration
  `20260718000001`), and any genuinely-unknown version (a stale instance reading rows from a
  newer deploy) is surfaced as `unverifiable` on every channel — CLI exit 3, API
  `unverifiable_count`, and an `audit.chain_break_detected` alert — never silently green.

**NOT detected without an external anchor (the deferred "hash-sealed audit", CLAUDE.md Phase 2):**
- **Full re-chaining by a DB-write attacker.** Because the hash is public and unkeyed, an
  attacker who can write the DB can edit content, recompute that row's `row_hash`, and rewrite
  every downstream `prev_hash`/`row_hash`. Verification then passes clean. Closing this requires
  a secret held *outside* the mutable store — an **HMAC key** (bump to a keyed `hash_version 3`)
  — so the attacker cannot reproduce the digest.
- **Tail truncation / whole-record deletion.** The verifier walks each record's rows in order
  with no stored per-record head-hash or expected revision count, so deleting the *last* rows
  (or a whole record's chain, which then drops out of the scan entirely) leaves an internally
  consistent shorter chain. Closing this requires a periodically **exported/anchored head-hash +
  revision-count** per record (e.g. published to an append-only external store).

Both gaps are the standard ceiling of any in-DB chain and are the explicit scope of the
deferred Phase-2 hash-sealed-audit work; they are **not** introduced by this pass and are called
out here so the guarantee is not overstated. Implementing HMAC/external anchoring is a
production-behavior change (key management, rotation, external store) and is intentionally NOT
undertaken unilaterally in this pass.

**Config assumption (LOW):** verification assumes node-pg returns `timestamptz` as JS `Date`
(the default). Installing a custom string type-parser for `timestamptz` would change the read
form of `changed_at` and false-break every v2 row; the circuit-breaker prevents that from
mass-freezing (loud noise, not an outage), but do not change the pg type-parser without a
`hash_version` bump.

---

## Deferrals / known risks

- **`deleteRecord` hard-deletes a DRAFT**, cascading its revisions
  (`record_revisions.record_id … ON DELETE CASCADE`). Pre-workflow only, and the `DELETE`
  `audit_logs` row survives (that table has no FK), so it's a product call, not audit plumbing
  — left as-is with the freeze guard added. Revisit if DRAFTs ever need append-only retention.
- **hash_version 3+** slots in by adding `computeRowHashV3` + a `HASHERS` entry, bumping
  `CURRENT_HASH_VERSION`, **and widening the `record_revisions_hash_version_known` CHECK to
  include 3 in the same migration** (C7 invariant); never edit v1/v2. A keyed (HMAC) v3 is the
  natural vehicle for the "hash-sealed audit" boundary above.
- Reporting engine integration (Integration 5) remains out of scope.
