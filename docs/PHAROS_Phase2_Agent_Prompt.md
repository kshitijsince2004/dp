# PHAROS — Phase 2 Development Brief (Solo Developer)

Use this document as the system/task prompt for a coding agent (Claude Code or
similar) at the start of, and throughout, Phase 2 development.

---

## 1. Project context

PHAROS (Police Hierarchical Automated Reporting & Operations System) is a
multi-tier reporting platform for a police department, built around a
PS → District → HQ hierarchy. Three master record types — Arrest, PCR Call,
and Cases — flow through a submit/approve/send-back workflow up the hierarchy.

Phase 1 was a 4-day prototype sprint split across three developers (Dev 1:
Auth & Security, Dev 2: Backend Lead, Dev 3: Frontend). Phase 2 is now an
8–10 week "full-feature build" that takes the Phase 1 prototype toward a
production-ready system for one full district (15–20 PS).

The Phase 2 plan as originally written assumes three developers, each owning
a track:
- **Dev 1 track:** Keycloak/OIDC migration, MFA, audit hash-chaining,
  hierarchy expansion (JCP/SCP), security hardening.
- **Dev 2 track:** Legacy data import, filter engine, advanced analytics,
  report templates, scheduled reports, Level Data Contracts.
- **Dev 3 track:** API test coverage (treated as the *primary* deliverable
  in the original plan, not an afterthought), frontend integration, new UI
  modules (MFA screen, legacy import UI, filter bar, report builder,
  analytics v2, offline/PWA, notification center, audit viewer).

## 2. Critical constraint — read this before writing any code

**All three tracks above are now my sole responsibility.** There is no team
to split work with. Every feature in Phase 2, across all three tracks, needs
to be planned and built by one developer (with agent assistance) in sequence
or in parallel branches, not split across people.

**More importantly: I only have my own Phase 1 Dev 1 deliverables.** The
Phase 1 Dev 2 backend (Field Registry, Records CRUD, Workflow Engine,
Compilation Engine, Analytics endpoints, Notifications, the RabbitMQ event
bus itself) and the Phase 1 Dev 3 frontend (the entire React app — layout,
DynamicForm, every role-specific screen, i18n setup) were built by other
people on separate work and **are not in this codebase.** What I do have is
whatever Dev 1 scope produced: JWT auth, RBAC middleware, the user model,
hierarchy CRUD APIs, the audit ledger module, and the report engine
(Puppeteer-based PDF/CSV generation).

This means a large share of Phase 2's task list — which assumes a working
Field Registry, Records API, Workflow Engine, event bus, and a built-out
React frontend already exist to extend — actually has **no foundation to
extend yet** in this repo. Plan accordingly:

1. **First, inspect the actual repository** before assuming anything. Confirm
   precisely what exists (likely: auth, RBAC middleware, hierarchy APIs,
   audit ledger, report engine skeleton) and what's genuinely absent.
2. **Treat the missing Dev 2/Dev 3 Phase 1 scope as reconstruction work**,
   not Phase 2 work — but necessary reconstruction, since nearly every Phase
   2 feature depends on it (filters need a Records API to filter; the legacy
   importer needs the `records` table and Field Registry; the new UI modules
   need DynamicForm and the base screens to attach to; API testing needs
   endpoints to test). Build minimal-but-correct versions of these
   foundational pieces first: the event bus singleton, Field Registry +
   seed data, Records CRUD with JSONB storage, the Workflow state machine,
   and a base React app (layout, auth context, DynamicForm, the core
   role-based screens) — following the same architectural pillars and API
   contracts documented in Phase 1 (single `pharos` topic exchange, the
   standard `{status, data}` response envelope, JWT payload shape, etc.) so
   that this rebuild stays compatible if the original Dev 2/Dev 3 codebase
   ever resurfaces and needs to be reconciled.
3. **Keep reconstruction and net-new Phase 2 work clearly distinguished** in
   commits, branches, and the documentation described in §4 — label
   anything that is "rebuilding what Dev 2/Dev 3 already had" separately from
   "genuinely new Phase 2 capability," so a future integration effort can
   tell at a glance which parts might need to be swapped out for the
   original team's actual code versus which parts are new and should be kept
   regardless.

## 3. Non-negotiable architecture principles (carry forward from both phases)

These applied in Phase 1 and remain binding for every Phase 2 addition and
for any reconstructed foundation:

- **Dynamic Field Registry** — every form field is a DB row, not a hardcoded
  form field. No code change for new fields.
- **Event bus isolation** — modules never call each other directly; all
  inter-module communication goes through the RabbitMQ `pharos` topic
  exchange. A new feature subscribes to existing events; it never modifies
  an existing module to call into it.
- **Server-side RBAC** — enforced in middleware on every route, never as a
  frontend-only check.
- **Append-only audit ledger** — every record change emits an event; nothing
  is ever updated or deleted in `record_revisions`. Phase 2 adds SHA-256
  hash-chaining on top of this, not a replacement for it.
- **Bilingual everywhere** — every label, status, and node carries
  `label_en` + `label_hi`. No UI string ships without both.
- **Hierarchy and config as data** — `hierarchy_nodes`, `level_data_contracts`,
  `report_templates`, and workflow transitions all live as DB rows editable
  from an admin UI, not as code.
- **JSONB record storage** — all three record types share one `records`
  table with a JSONB `data` column; new fields are inserts, not migrations.
- **Legacy-compatible data model** — anything imported via the Phase 2
  legacy importer carries `is_legacy`, `source_system`, `imported_at` and
  must participate in every workflow, filter, report, and analytics path
  exactly like a native record.

## 4. Required deliverable: a living parallel development log

Throughout Phase 2 (and through any Phase 1 reconstruction work done as a
prerequisite), maintain a single markdown document — e.g.
`/docs/PHASE2_DEVELOPMENT_LOG.md` — committed to the repo and updated after
every meaningful work session, not written once at the end. This is a
required deliverable, not optional context. Its purpose is to make later
integration (with the original Dev 2/Dev 3 codebase, or with any other
developer joining later) possible without re-deriving what happened. It
should contain:

- **What's being built and why** — a running narrative log of each feature
  or module worked on, the approach taken, and any assumptions made,
  especially anywhere a missing Phase 1 module had to be reconstructed
  rather than extended. Note any place a design decision deviates from the
  original architecture doc and why.
- **Integration notes** — anything a future integrator would need to
  reconcile: table/column names chosen, event names and payload shapes
  introduced or changed, endpoints that are stubs versus fully implemented,
  and any place this rebuild's behavior might differ from what the original
  Dev 2/Dev 3 implementation would have produced.
- **API and event bus reference** — every new or reconstructed endpoint and
  every RabbitMQ routing key, kept current as the source of truth for what
  actually exists (since the original API reference docs assumed a
  three-person team building it together in real time).
- **A feature checklist**, structured as three columns or status tags —
  ✅ Implemented, 🔄 In progress, ⬜ Not started — covering every feature
  across all three Phase 2 tracks (and the reconstructed Phase 1 foundation
  items). Update this checklist every session; it should always reflect the
  true current state, not a plan. Seed it using §6 below, then expand it as
  work proceeds and sub-tasks are discovered.

This document should be readable on its own as a handoff: someone with zero
prior context should be able to read it and understand what exists, what's
half-built, what's missing, and what to watch out for when merging this work
with anyone else's.

## 5. Tech stack — Phase 2 additions on top of the existing Phase 1 stack

Nothing from Phase 1 is removed (Express, React + Vite + Ant Design,
PostgreSQL + Knex, RabbitMQ, Redis, JWT, Puppeteer, react-i18next, Recharts
all continue). Phase 2 adds:

- **Keycloak** (OIDC + MFA) — replaces custom JWT issuance while keeping the
  same Bearer-token interface to existing routes.
- **MinIO** — S3-compatible storage for FIR scans, photos, generated PDFs.
- **Elasticsearch** (optional/complex path) — for full-text and multi-field
  filter queries; PostgreSQL JSONB continues to handle simple filters.
- **ExcelJS** — `.xlsx` report rendering alongside the existing Puppeteer
  PDF path.
- **Workbox** — Service Worker generation for offline-first PWA behavior.
- **node-cron** — scheduled report generation and deadline/SLA alerts.

## 6. Feature scope to seed the checklist (§4)

Reconstruct (Phase 1 foundation, not currently present):
RabbitMQ event bus singleton · Field Registry API + seed data for all 3
record types · Records CRUD (JSONB storage) · Workflow state machine
(submit/approve/send-back) · Compilation engine · Basic Analytics endpoints ·
Notifications API · base React app (layout, AuthContext, routing,
i18n setup) · DynamicForm component · core role screens (HC record entry,
SHO queue, District dashboard, HQ dashboard).

Net-new Phase 2 work:
Keycloak/OIDC migration + MFA for SHO and above · audit hash-chaining +
tamper-detection endpoint · JCP/SCP hierarchy levels and roles · Level Data
Contracts (per-level field visibility) · legacy CSV/Excel import pipeline +
dedup + amendment sub-workflow · send-back `target_fields` highlighting ·
filter engine (AND/OR spec → JSONB/Elasticsearch query) + saved presets ·
10+ proforma report templates (PDF + XLSX) · scheduled report jobs ·
advanced analytics (beat-wise, IO performance, district comparison, heat
map, submission health, legacy coverage) · MinIO file attachment uploads ·
duplicate FIR/accused detection · deadline/SLA alerts · admin config UI
(hierarchy, users, field registry, level contracts, workflow transitions) ·
offline sync (IndexedDB + sync_ops queue + conflict resolution) + PWA
shell · notification center UI · audit trail viewer UI · comprehensive API
test suite (Postman/Jest/Bruno) covering happy path, auth guard, RBAC guard,
scope guard, validation, not-found, state-violation, and pagination for
every endpoint, old and new.

## 7. Suggested order of operations (adapted for one developer)

Rather than three parallel weekly tracks, sequence the work so each layer
has something to build on:

1. **Foundation recovery** — rebuild the missing event bus, Field Registry,
   Records API, Workflow engine, and a minimal working frontend shell with
   DynamicForm and the core screens, to the standard Phase 1 already
   specified (response envelope, RBAC, audit events). Get a single E2E
   record lifecycle (HC → SHO → District → HQ) working end to end before
   moving on.
2. **Security & hierarchy hardening** — Keycloak/MFA migration, hash-chained
   audit, JCP/SCP levels, Level Data Contracts.
3. **Data depth** — legacy import pipeline, dedup, amendments, file
   attachments.
4. **Discovery & reporting** — filter engine + presets, proforma templates,
   scheduled reports, advanced analytics.
5. **Resilience & polish** — offline sync/PWA, deadline alerts, admin config
   UI, notification center, audit viewer.
6. **Testing throughout, not at the end** — write API tests for each module
   as it's completed (or reconstructed), not as a final pass; this matches
   the original plan's emphasis on testing as a continuous primary
   deliverable rather than a phase-end task.

At every step, update the development log and checklist from §4 before
moving to the next item — treat it as part of "done," not a separate
afterthought.

## 8. Definition of done for any feature

A feature is only checked off ✅ in the log when: the endpoint(s) follow the
standard response format and are RBAC-guarded server-side; relevant events
are published to the bus where the architecture calls for it; bilingual
labels are present where applicable; a basic test (happy path + at least one
guard/edge case) exists; and the development log has been updated with what
was built, any deviations, and any integration caveats.
