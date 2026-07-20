# Stage-5 Integration Log — Index

Stage 5 is the app-layer adaptation of PHAROS to the rebuilt DB (see the top of
`CLAUDE.md` and `docs/db-audit/HANDOFF.md` for the DB restructure itself). It
proceeds as a series of scoped integrations, each with its own handoff doc
here. `docs/ENGINEERING_BASELINE.md` (P1–P6) is the binding contract for every
integration — read it before touching code.

## Integration roadmap

| # | Integration | Status | Handoff |
|---|---|---|---|
| 1 | Auth, RBAC, JWT, workflow engine, ref lookups, IO module | ✅ done (2026-07-14) | [`01-auth-rbac-workflow-refs.md`](01-auth-rbac-workflow-refs.md) |
| 2 | Records write path (registry-driven spine/detail/persons/properties/locations/offences split) + compilation + analytics + SHO-provisions-HC + domain status updates | ✅ done (2026-07-15) | [`02-records-write-path.md`](02-records-write-path.md) |
| 3 | Import / bulk-upload (typed write path, async confirm, case↔FIR linkage, frozen-template hardening, legacy module deleted) | ✅ done (2026-07-16) | [`03-import.md`](03-import.md) |
| 4 | Reports / report-builder / daily-diary / warehouse (analytics already adapted in #2) | not started | — |
| 5 | Hash-chain audit enforcement (deferred per baseline — last, not first) | not started | — |

## How to use this log

Each handoff doc records: what was adapted, the canonical shapes/contracts
established, anything deliberately deferred (with why), and gotchas the next
integration needs to know about. Read the most recent handoff before starting
new work in an adjacent module — it's the fastest way to avoid re-deriving
context that's already settled.
