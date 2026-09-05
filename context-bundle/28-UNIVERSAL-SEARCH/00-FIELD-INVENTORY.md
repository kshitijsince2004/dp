# Phase 0 Deliverable — Universal Field Catalog & Gap Inventory

Date: 2026-08-30

## 1. Schema & Live JSONB Mining Audit
- **Relational Tables Audited**: records, fir_details, arrest_details, arrestee_details, persons, person_descriptions, record_properties, record_offences, missing_details, missing_person_details, pcr_call_details, uidb_details, locations, hierarchy_nodes
- **Live JSONB Extra Keys Mined**:
- **fir_details**: 2 distinct extra keys observed in PostgreSQL data.
- **arrest_details**: 0 distinct extra keys observed in PostgreSQL data.
- **missing_details**: 0 distinct extra keys observed in PostgreSQL data.
- **uidb_details**: 0 distinct extra keys observed in PostgreSQL data.
- **record_properties**: 0 distinct extra keys observed in PostgreSQL data.

## 2. Field Classification Catalog Summary (field_catalog.json)
- **CASE Fields**:
  - canonical_enum: local_head, act_name, section
  - bounded_categorical: case_status, disposal_type, property_status
  - numeric_range: estimated_value, recovered_value
  - date_range: record_date, fir_date, registration_date
  - fuzzy_text: brief_facts, property_details, phone_make, phone_model, vehicle_make
  - restricted_fields: complainant_name, complainant_address, victim_name (POCSO/PII), accused_name
- **ARREST Fields**:
  - canonical_enum: local_head
  - bounded_categorical: custody_status, is_dd_based
  - fuzzy_text: reason_for_detention, seizure_desc
  - restricted_fields: arrested_name, arrested_address
- **MISSING / UIDB Fields**:
  - bounded_categorical: missing_type, gender
  - numeric_range: age
  - fuzzy_text: physical_description, last_seen_location, found_location
  - restricted_fields: missing_name (minor protection), informant_name

## 3. Mismatches & Defaulted Not-Searchable List
- **Defaulted not_searchable**:
  - records.extra (Unstructured JSON blob)
  - records.id (Internal primary key UUID)
  - System metadata timestamps (created_at, updated_at)
- **Restricted Access Policy**:
  - PII and victim names are classified as restricted and are gated behind role-based PII authorization (pii_min_role: DISTRICT_OFFICER).
