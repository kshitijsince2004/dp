// The frozen-template key bridge (Integration 3, P3.2's "checked mapping"). The bulk-import
// Excel template's columns/order/labels are a FROZEN CONTRACT (ENGINEERING_BASELINE.md P3.1)
// — the template's field_key row (row 1, hidden) can never be renamed to match a
// field_registry field_key when the two differ. This file is the one explicit, checked,
// greppable place that bridges the gap: every template field_key that ISN'T already a live
// field_registry field_key gets an entry here saying exactly where its value goes instead.
//
// Verified against the live DB registry 2026-07-16 (Integration 3 WP3) — every mapping below
// was confirmed by querying field_registry.storage directly, not guessed. See
// docs/new-db-integration/03-import.md for the full audit trail, including the two fields
// that turned out to have NO storage destination at all (arrest_time, arrest_details
// discriminator is_dd_based) and were resolved by adding real field_registry rows / a schema
// column rather than papering over the gap here — this file only carries genuine RENAMES and
// COMPOSITIONS, never a field that's actually just missing.
//
// scripts/import-bridge-parity.js is the enforcement: it asserts every template field_key
// resolves through registry-direct-match OR this bridge to a real storage destination, and
// that every bridge target here actually exists in field_registry. Run `npm run import:parity`
// after touching import-fields.config.js or this file.
//
// Entry shapes:
//   { to: 'registry_field_key' }                         — simple rename
//   { compose: { targetKey, from: [k1, k2], joiner } }    — N template cells -> one field_key
//   { validateOnly: true }                                — never stored; cross-checked against
//                                                            the import batch's target PS/district
//                                                            at validate time (P5.6), then dropped
//   { drop: true }                                        — redundant with another column /
//                                                            killed by an earlier ruling; discarded
import { getLogger } from '../../utils/logger.js';

const log = getLogger('import.key-bridge');

// ── CASE ──────────────────────────────────────────────────────────────────────────────────
const CASE = {
  beat_number: { to: 'beat_no' },                          // -> fir_details.beat_id (resolveBeat)
  property_value: { to: 'prop_other_value' },               // -> record_properties.estimated_value
  district: { validateOnly: true },                         // must match the batch's target PS's district
  police_station: { validateOnly: true },                   // must match the batch's target PS
  under_section: { drop: true },                             // redundant with the Act & Sections sheet
  complaint_no: { drop: true },                              // ruling 15: the FIR number IS the complaint number
  occurrence_date: { compose: { targetKey: 'occurrence_from_date_time', from: ['occurrence_date', 'occurrence_time'], joiner: ' ' } },
  occurrence_time: { drop: true },                           // consumed by the occurrence_date composition above
  // Both discovered dead during WP3 parity audit (2026-07-16), no schema column anywhere:
  // cctns_number tracks the concept ruling 15 already killed ("cctns_flag/zero_fir_flag both
  // expressed by case_type" — CLAUDE.md, "do not re-add"); date_of_arrest is a copy-paste
  // leftover from the ARREST curated list — CASE records have no arrest-date concept (that's
  // the linked ARREST record's own field). User-confirmed drop, docs/new-db-integration/
  // 03-import.md.
  cctns_number: { drop: true },
  date_of_arrest: { drop: true },
  // act/crime_head on the Act and Sections sheet feed the offences[] row builder directly
  // (same as major_head/minor_head) — see COMPOSER_ONLY_KEYS in
  // scripts/import-bridge-parity.js. No bridge entry needed for them.
};

// ── ARREST (also the base for KALANDRA, patched below) ──────────────────────────────────────
const ARREST = {
  linked_fir_dd_no: { to: 'fir_no' },                       // -> arrest_details.fir_no
  date_of_arrest: { to: 'arrest_date' },                    // -> arrestee_details.arrest_date (ARRESTEE role)
  time_of_arrest: { to: 'arrest_time' },                    // -> arrestee_details.arrest_time (ARRESTEE role; field added Integration 3 WP3)
  bad_character: { to: 'listed_criminal' },                 // -> arrestee_details.is_bc (ARRESTEE role)
  verifying_officer_name: { to: 'arresting_officer' },      // -> arrest_details.arresting_officer_name
  property_value: { to: 'prop_other_value' },
  district: { validateOnly: true },
  police_station: { validateOnly: true },
};

// ── KALANDRA — same as ARREST, except the parent key is a GD/DD number, never a FIR ────────
// linked_fir_dd_no MUST resolve to gd_no here, not fir_no (G2, docs/new-db-integration/
// 03-import.md) — routing a Kalandra's DD number into arrest_details.fir_no would make
// linkResolver.js try to auto-link it to a CASE as though it were a real FIR citation.
// is_dd_based=true is stamped onto every composed KALANDRA record by import.compose.js
// directly (not a per-row template column — it's implicit in which template/parent-key-field
// was used, not something officers fill in), using the arrest_details.is_dd_based
// discriminator column added in this same integration (ruling 18; previously unreachable —
// no field_registry row targeted it before Integration 3 WP3).
const KALANDRA = {
  ...ARREST,
  linked_fir_dd_no: { to: 'gd_no' },
};

// UIDB/MISSING: gd_time has NO schema column on uidb_details/missing_details at all (unlike
// KALANDRA's arrest_details.gd_time, which is real, just previously unmapped — see arrest_time
// above) — user-confirmed drop rather than a further schema fold, docs/new-db-integration/
// 03-import.md.
const UIDB = { gd_time: { drop: true } };
const MISSING = { gd_time: { drop: true } };

const BRIDGES = { CASE, ARREST, KALANDRA, UIDB, MISSING };

// PCR_CALL has no curated key mismatches (verified against the live registry alongside the
// above) — its template field_keys already match field_registry field_keys directly (in fact
// its template IS generated directly from the registry, so this is true by construction).
export const getBridge = (recordType) => BRIDGES[recordType] || {};

// T10 (03-TRIAGE-MATRIX.md/F5) — the subset of a bridge's {drop:true} entries that are
// GENUINELY discarded, i.e. never read back by any `compose` entry's `from` list in the SAME
// bridge. CASE's `occurrence_time` also carries `drop:true`, but only as a belt-and-braces
// no-op — import.compose.js's `applyBridge` already consumes it while composing
// `occurrence_from_date_time` from `['occurrence_date', 'occurrence_time']`, so its value IS
// imported (merged into that composed field); warning an operator that it "isn't imported"
// would be actively wrong. Purely data-driven off BRIDGES itself — no separate hand-maintained
// exclusion list to fall out of sync when a bridge entry changes.
export function getDropOnlyKeys(recordType) {
  const bridge = getBridge(recordType);
  const composedFromKeys = new Set(
    Object.values(bridge).flatMap((entry) => (entry.compose ? entry.compose.from : []))
  );
  const dropOnly = Object.entries(bridge)
    .filter(([key, entry]) => entry.drop && !composedFromKeys.has(key))
    .map(([key]) => key);
  log.debug('getDropOnlyKeys: resolved genuinely-discarded template keys', { recordType, dropOnly });
  return dropOnly;
}

// ARREST/KALANDRA person-sheet fields that are semantically RECORD-level (arrest_details),
// even though officers fill them once per arrestee row on the "Person Arrested Detail" sheet
// — the template's layout puts them there, but their field_registry storage targets
// arrest_details directly, not a person subtype table. When an arrest has multiple arrestees
// whose rows disagree on these, import.compose.js merges first-non-empty into the record's
// flat `data` (documented deviation, G6 — the schema doesn't prescribe which arrestee "owns"
// a record-level fact when several are entered).
export const ARREST_PERSON_SHEET_RECORD_LEVEL_KEYS = [
  'nafis_prepared', 'dossier_prepared', 'status', 'scheme_of_arrest',
  'arresting_officer', 'arresting_officer_mobile', 'verifying_officer_rank',
];
