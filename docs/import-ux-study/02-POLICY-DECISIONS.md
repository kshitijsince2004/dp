# Import Reliability — Policy Decisions (user, 2026-07-16)

Binding for all triage and implementation work. Source: project owner, verbatim intent
translated into precise rules. Where a rule says "enumerated in TRIAGE_MATRIX", the architect
enumerates and the enumeration ships unless the owner objects.

## D1 — Requiredness policy

- **Non-legacy bulk import**: every field marked mandatory in `field_registry` stays a hard
  ERROR. No relaxation. Bulk non-legacy import is held to the same bar as interactive entry.
- **Legacy import**: objective is *maximum data capture* — registry-mandatory fields demote to
  WARNING… **except keystone validations, which remain hard ERRORS**. Keystone = the record
  cannot meaningfully exist without it. Owner's example: an ARREST with no FIR number is an
  ERROR even in legacy mode.
- Keystone sets per record type are enumerated in `TRIAGE_MATRIX.md` (architect). Working
  principle: record-identity keys (FIR no where the type is FIR-anchored), a usable record
  date, resolvable PS + district, and child-sheet parent-key integrity are keystone;
  narrative/supplementary fields are not.

## D2 — IO (Investigating Officer) policy

- The bulk IO pre-registration product feature stays OPEN and must NOT block any import work.
- **Legacy import**: if a row carries sufficient IO details in the sheet, **auto-provision**
  the `investigating_officers` row for that PS and link it — do not reject. Auto-provisioned
  IOs must be distinguishable (provenance/needs-verification marker; exact mechanism =
  architect's call at implementation).
- **Non-legacy import**: IO must match an already-registered IO (PIS match, current behavior);
  unmatched IO remains an error.

## D3 — Autonomy

- Architect dispatches all workers (W2+) as needed without per-worker approval.
- Interrupt the owner only when a decision genuinely requires them (policy, P3 visible
  template changes, destructive/irreversible actions).

## Derived, not yet owner-ruled (architect proceeds, flags in TRIAGE_MATRIX)

- Template-version drift (older circulated layouts, e.g. the ~30-column-simpler Property
  sheet): import should *accept and correctly parse* known older layouts (version detection),
  which changes nothing visible about the current frozen template — no P3 sign-off needed to
  be lenient on input. Any change to the *emitted* template remains P3-gated.
- Keystone sets for MISSING/UIDB (not FIR-anchored) — architect proposes in TRIAGE_MATRIX.
