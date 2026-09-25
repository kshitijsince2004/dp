# PHAROS — Development Roadmap & Timeline
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Product leadership, engineering team leads, stakeholders

---

## 1. Current State (Completed in Prototype)

### Core Features & Architecture
- [x] **5 Core Record Types:** Complete CRUD and lifecycle management for `CASE`, `ARREST`, `PCR_CALL`, `MISSING`, and `UIDB`.
- [x] **Relational Spine Architecture:** Unified `records` table with atomic sub-table transactions for persons, offences, properties, and locations.
- [x] **Data-Driven Workflow Engine:** Zero hardcoded states; complete transition management via `workflow_transitions_config` supporting submit, review, send-back, seal, and `@PRIOR` restore.
- [x] **Tamper-Evident Audit Chain:** SHA-256 hash chaining on `record_revisions` verifying complete change provenance.
- [x] **Role-Based Access Control:** 9 distinct police roles with server-side `allow()` enforcement and strict geographic scoping via `enforceScope`.
- [x] **Dynamic Field Registry:** Schema-driven form rendering evaluating `show_when` and `required_when` rules at runtime.
- [x] **Kalandra Preventive Arrest Tracking:** Discrete handling of DD-based preventive arrests (`is_dd_based = true`) separated from FIR-linked arrests.
- [x] **Two-Phase Bulk Excel Import:** Pre-validation and batch commitment for historical police logs.
- [x] **Multi-Tier Dashboards:** Station, District, and HQ analytics with crime head matrices and trend comparisons.
- [x] **Fortnightly Diary (FN Diary):** 41 STAT sheets structured, with 25+ sheets outputting live, verified data via ExcelJS cell-injection.
- [x] **Hierarchy & Beat Coverage:** 225 police stations with 100% diary metadata and 2,855 beats linked to police stations.
- [x] **Frontend Modernization:** Vite 8, React 19, Tailwind CSS v4, unified table typography and helper formatting.

---

## 2. Phase 1 — Immediate Pre-Rollout Polish (Sprint 1)
**Focus:** Operational stability and pilot station readiness.

1. **Log Rotation:** Configure Winston daily log rotation to cap local log files at 50MB.
2. **Remove MongoDB/Mongoose:** Purge unused legacy packages from `backend/package.json`.
3. **Quarantine Unused Tables:** Formally deprecate `record_transfers` in documentation.
4. **End-to-End Pilot Testing:** Run end-to-end station data cycles across selected trial stations (e.g., PS Parliament Street, PS Connaught Place).
5. **Supervisory Review Guards:** Complete remaining client-side role guards on district overview routes.

---

## 3. Phase 2 — Operational Completeness (Months 1–3)
**Focus:** Expanding report coverage and judicial alignment.

1. **Kalandra Judicial Disposal Register:** Extend `arrest_details` with Special Executive Magistrate (SEM) court outcomes to unblock STAT_14/21 disposal columns.
2. **Proclaimed Offenders (PO) Module:** Build a dedicated PO warrant tracker to populate STAT_15.
3. **District Compilation Approval Flow:** Enhance the multi-station review UI for District DCP approval sign-offs.
4. **Keycloak / Police SSO Integration:** Transition from standalone JWT credentials to Police Enterprise SSO via Keycloak adapter.
5. **Redis Session Management:** Active revocation and token blacklist storage in Redis.

---

## 4. Phase 3 — Enterprise Scale & Integration (Months 3–6)
**Focus:** District-wide deployment across all 23 Delhi Police districts.

1. **NJDG (National Judicial Data Grid) Integration:** Ingest court hearing dates and final judgments directly from court APIs.
2. **CCTNS Interoperability Bridge:** Bi-directional sync with central CCTNS records.
3. **Advanced Predictive Analytics:** Hotspot analysis and crime pattern detection based on beat-level geocoding.
4. **Mobile / PWA Companion:** Field officer companion app for real-time PCR call updates and IO case diary entries.
5. **Multi-State / Force Customization:** Generalize hierarchy levels and local law definitions for potential adoption by other state police forces.
