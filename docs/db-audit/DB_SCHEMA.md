# PHAROS New DB Schema — Complete Specification

**Status:** DESIGN FINAL — 2026-07-07; amended 2026-07-10 (ruling 15, §10: multi-offence model, `locations` table, fir_details column removals). This is the single AI/dev context file for the new schema; no re-analysis of the old DB should ever be needed. Diagram: `ER_DIAGRAM.md` (generated from this spec — keep in parity).
**Contract sources:** `DB_REDESIGN_DECISIONS.md` (Levels 1–7, verbatim) + architect rulings of 2026-07-07 (§10) + field catalog mined from the old `*_master` views, `rpt.fact_*`, and `backend/seeds/01_fields.js`.
**Old schema:** `DB_GROUND_TRUTH.md` — historical reference only. Data is disposable; fresh migrations + reseed, no data migration.
**Scale target:** ≥800k records.

---

## 0. Conventions (apply to every table unless stated)

| Rule | Value |
|---|---|
| PK | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` on all transactional tables. `ref.*` uses natural integer/varchar codes as PKs (composite where the data requires — §8). |
| Timestamps | `timestamptz` only. `created_at timestamptz NOT NULL DEFAULT now()` + `updated_at timestamptz NOT NULL DEFAULT now()` on every table (exceptions: pure append-only ledgers get `created_at`/action timestamp only). |
| JSON | Native `jsonb` everywhere. JSON-in-`text` is banned. |
| Enums | CHECK constraints, never Postgres native ENUMs. Statuses on `records` are validated against `workflow_transitions_config` (single truth), not a CHECK. CHECK value sets marked "(synced)" are kept in step with seed config. |
| FK discipline | Every classification/dropdown column in a transactional table is a real FK into `ref.*` or `hierarchy_nodes`. Garbage codes cannot enter a record. |
| Single home | A field lives in exactly ONE table — never duplicated between spine and detail. List screens JOIN the 1:1 detail table (cheap at this scale). Deliberate denormalizations are enumerated in §9.3 only. |
| Person/property facts | Live ONLY in `persons` / `record_properties` (+subtypes). The form wizard writes there — never into any jsonb. Named *contact attributes* of a record (duty officer, arresting officer name, relative-of-deceased name) are plain columns, not persons rows — the boundary: persons rows are the entities the record is *about* or who *participate* (complainant, accused, victim, witness, arrestee, missing, deceased, informant, caller). |
| `extra` jsonb | Each detail table, `persons`, `record_properties`, and `locations` carries exactly one `extra jsonb NOT NULL DEFAULT '{}'` — the no-deploy escape hatch. Second-class by design: invisible to the report engine. Promotion path: §9.2. |
| Language | English-only labels in `ref.*` and config tables (single `label`/`name` columns). Exception: `field_registry.labels`/`section_labels` are `jsonb {"en","hi"}` — the one live bilingual case (391/391 real Hindi, consumed by forms). Hindi elsewhere = additive later, never a redesign. |
| Deletion | Records are never deleted — status-changed only. FKs from child tables use `ON DELETE RESTRICT` (default) except explicit cascades noted. |

**Schemas:** `public` (transactional, ~42 tables) + `ref` (21 lookup tables, §8). No `rpt` schema — the warehouse is dead; the report engine queries live tables. Targeted matviews may be added later inside `public` only when a specific proforma is proven slow.

---

## 1. Org & identity

### 1.1 `hierarchy_nodes`
Self-referencing adjacency tree: HQ → ZONE → RANGE → DISTRICT → SUB_DIV → PS. Reorgs are rare; scoping uses denormalized ids (§9.3), reorg = scripted backfill.

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| node_type | varchar(30) | NOT NULL, CHECK IN (HQ, ZONE, RANGE, DISTRICT, SUB_DIV, PS) |
| name | varchar(150) | NOT NULL — single column (old `name_hi` was 261/262 duplicated English junk) |
| code | varchar(30) | NOT NULL, UNIQUE — join key for ref data loaders (`ref.beats.ps_id` resolution) |
| parent_id | uuid | FK → hierarchy_nodes.id, NULL only for HQ root |
| metadata | jsonb | NOT NULL DEFAULT '{}' |
| is_active | boolean | NOT NULL DEFAULT true |
| created_at / updated_at | timestamptz | |

Indexes: `(parent_id)`, `(node_type)`.

### 1.2 `users`
`station_id` is dead — the column is **`ps_id`** end to end (DB = JWT = code = docs).

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| username | varchar(50) | NOT NULL, UNIQUE |
| badge_no | varchar(50) | NOT NULL, UNIQUE |
| name | varchar(100) | NOT NULL — single column |
| password_hash | varchar(255) | NOT NULL |
| role | varchar(20) | NOT NULL, CHECK IN (HC, SHO, DISTRICT_OFFICER, JCP, SCP, HQ_ANALYST, HQ_ADMIN, SYSTEM_ADMIN) (synced) |
| ps_id / district_id / sub_div_id | uuid | FK → hierarchy_nodes (deliberate denormalization, §9.3); nullability by role |
| is_active | boolean | NOT NULL DEFAULT true |
| last_login | timestamptz | |
| created_at / updated_at | timestamptz | |

Indexes: `(ps_id)`, `(district_id)`, `(role)`.

### 1.3 `investigating_officers` — NEW (architect ruling)
IO is its own entity, generalized across all 5 record types. `records` carries only `io_id`. Today IO fields are typed on the entry form (storage-mapped here); future: SHO curates rows, entry forms select from a jurisdiction dropdown — zero schema change.

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users, NULL — set when the IO is a real system user |
| name | varchar(100) | NOT NULL |
| rank | varchar(50) | |
| pis_no | varchar(50) | partial UNIQUE (`WHERE pis_no IS NOT NULL`) |
| mobile | varchar(20) | |
| ps_id | uuid | FK → hierarchy_nodes — jurisdiction for the future dropdown |
| is_active | boolean | NOT NULL DEFAULT true |
| created_at / updated_at | timestamptz | |

Indexes: `(ps_id, is_active)`.

---

## 2. Record spine + typed detail subtypes (supertype/subtype, Option C)

**Placement rule:** workflow/scoping/list-screen fields → `records`; fields only that type's form or reports need → its detail table. Fields are never duplicated across the pair. Adding a new record type = new detail table (expected, acceptable).

### 2.1 `records` — the spine

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| record_type | varchar(20) | NOT NULL, CHECK IN (CASE, ARREST, PCR_CALL, MISSING, UIDB) |
| ps_id | uuid | NOT NULL, FK → hierarchy_nodes |
| district_id | uuid | NOT NULL, FK → hierarchy_nodes |
| sub_div_id | uuid | FK → hierarchy_nodes |
| io_id | uuid | FK → investigating_officers |
| original_ps_id | uuid | FK → hierarchy_nodes — **write-once**: set on FIRST transfer ACCEPT (any record type), immutable after; NULL = never transferred. Lives on the spine because transfers are type-generic (ruling 14) |
| current_status | varchar(30) | NOT NULL DEFAULT 'DRAFT' — legal set defined by `workflow_transitions_config`, no CHECK |
| current_level | varchar(20) | NOT NULL DEFAULT 'PS', CHECK IN (PS, DISTRICT, JCP, SCP, HQ) |
| record_date | date | NOT NULL |
| is_frozen | boolean | NOT NULL DEFAULT false — hash-chain break freeze (§9.4); write path rejects mutations, only privileged review unfreezes |
| is_legacy | boolean | NOT NULL DEFAULT false |
| source_system | varchar(100) | |
| legacy_ref | varchar(255) | |
| imported_at | timestamptz | ; imported_by uuid FK → users |
| created_by / updated_by | uuid | NOT NULL / NULL, FK → users |
| created_at / updated_at | timestamptz | |

Indexes: `(ps_id, record_type, record_date DESC)`, `(district_id, record_type)`, `(current_status)`, `(record_date DESC)`, `(io_id)`.
**No `zone_id`/`range_id`:** verified 2026-07-07 — no zone/range-level scoping exists in any report consumer (python_worker sheets, daily-diary module). If zone-level proformas arrive later: add columns + scripted backfill from the tree (per L3.1).

### 2.2 `fir_details` (record_type = CASE) — 1:1 → records

| column | type | constraints / notes |
|---|---|---|
| record_id | uuid | PK, FK → records ON DELETE CASCADE |
| ps_id | uuid | NOT NULL, FK → hierarchy_nodes — **denormalized copy of records.ps_id** solely for the UNIQUE below; flipped in the same transaction as any transfer ACCEPT |
| fir_no | varchar(50) | NULL until registered — **allocator-assigned** from `fir_number_counters` (§4.2), never typed by hand |
| fir_year | smallint | NULL until registered |
| — | — | `UNIQUE (ps_id, fir_year, fir_no)` — business-key dedup at DB level |
| original_fir_no / original_fir_year | varchar(50) / smallint | set on FIRST transfer only, then **immutable** — CASE-only fact (FIR renumbering); the original PS lives on `records.original_ps_id` (ruling 14) |
| fir_date | date | |
| gd_no | varchar(50) | ; gd_date date; gd_time time |
| case_type | varchar(50) | covers registration mode incl. CCTNS / Zero FIR / Manual — the old cctns_flag/zero_fir_flag booleans are redundant with it (ruling 15) |
| source_reference | varchar(255) | |
| beat_id | varchar(20) | FK → ref.beats(beat_cd) (verified PK, §8) |
| is_important | boolean | NOT NULL DEFAULT false |
| case_status | varchar(50) | domain case status (Under Investigation / Chargesheet / …), distinct from workflow `current_status` |
| is_worked_out | boolean | NULL = unanswered — promoted from `extra` (ruling 23a); form field `work_out` Yes/No, normalized to boolean at write; changes tracked in `record_status_events` (§4.8) so worked-out flips land in the diary of their `effective_date` |
| worked_out_date | date | officer-entered real-world workout date (2026-07-14 addendum to ruling 23a) — form field `work_out_date`, required + shown when work_out=Yes; current-value copy of the latest is_worked_out event's `effective_date`, stamped by the write path in the same transaction as the event row |
| local_head_id | int | FK → ref.local_heads — the single PS-level classification (daily-diary grouping); acts/sections/major/minor heads are multi-valued → `record_offences` (§2.7) |
| brief_facts | text | |
| occurrence_location_id | uuid | FK → locations (§3.5) — full structured place-of-occurrence block (address components + lat/long) |
| occurrence_from_datetime / occurrence_to_datetime | timestamptz | replaces old occurrence_date + occurrence_time pair; both NULL = time of occurrence unknown (the old occurrence_time_type Known/Unknown radio is derived from this, not stored — ruling 15) |
| info_received_at_ps | timestamptz | |
| organised_crime | boolean | |
| cd_uploaded_24h | boolean | CCTV evidence flag |
| footage_collected | boolean | |
| rc_no | varchar(50) | |
| disposal_type | varchar(50) | |
| extra | jsonb | NOT NULL DEFAULT '{}' |
| created_at / updated_at | timestamptz | |

**Removed by ruling 15 (2026-07-10, do not re-add):** `type_of_information` (redundant), `complaint_no` (the complaint number IS the FIR number), `area_of_crime`, `cctns_flag`/`zero_fir_flag` (both expressed by `case_type`), `modus_operandi`, `cheated_amount`, `remarks`, `occurrence_time_type` (derived), `occurrence_place`/`occurrence_latitude`/`occurrence_longitude` (→ `locations`), `act_id`/`other_act_name`/`major_head_id`/`minor_head_id` (→ `record_offences`).
Acts + sections + major/minor heads (multi-valued) → `record_offences` (§2.7, one row per section citation). Vehicle block → a `record_properties` row (§3.4). Complainant/accused/victim/witness → `persons`.
Indexes: `(fir_date)`, `(local_head_id)`, the UNIQUE above.

### 2.3 `arrest_details` (record_type = ARREST) — 1:1 → records

| column | type | constraints / notes |
|---|---|---|
| record_id | uuid | PK, FK → records ON DELETE CASCADE |
| gd_no | varchar(50) | ; gd_date date; gd_time time — the Kalandra reference block (ruling 18) |
| case_type | varchar(50) | ; case_status varchar(50) |
| fir_no | varchar(50) | FIR number **as entered** — provenance + fallback ONLY (FIR not in PHAROS: other unit / pre-system). THE link is a `record_links` CASE_ARREST row (case UUID); when one exists it is authoritative — it survives transfer renumbering, stored text does not (ruling 19); fir_date date |
| is_dd_based | boolean | **the arrest-basis discriminator** (ruling 18): false = under a case → fir_no + fir_date required; true = standalone Kalandra → gd_no + gd_date required. Enforced via field_registry (`show_when` on each block + `required`; hidden fields skip validation) re-checked server-side at the submit transition — deliberately NOT a DB CHECK, because DRAFT records must save half-filled |
| local_head_id | int | FK → ref.local_heads — single; acts/sections/major/minor heads → `record_offences` (§2.7), which are the arrest's OWN rows and may differ from the linked case's (old `crime_head` → the arrest's `is_primary` offence row's major_head_id, §9.1) |
| beat_id | varchar(20) | FK → ref.beats(beat_cd) (verified PK, §8) |
| intimation_datetime | timestamptz | arrest-intimation block (currently commented out of the wizard; columns stay) |
| intimated_relative_name / intimated_relative_relation | varchar(100) / varchar(50) | |
| intimation_mode | varchar(50) | |
| nafis_prepared / dossier_prepared | boolean | |
| arresting_officer_name / arresting_officer_mobile | varchar(100) / varchar(20) | contact attributes, not persons rows |
| custody_status | varchar(50) | ; other_status_reason varchar(255) |
| recovery | text | |
| seizure_desc | text | |
| scheme_of_arrest | varchar(100) | plus special-scheme booleans: integrated_pi, group_patrolling, cycle_patrolling, by_antisnatching_team, by_prahari, by_eyes_ears_scheme_members (all boolean) |
| extra | jsonb | NOT NULL DEFAULT '{}' |
| created_at / updated_at | timestamptz | |

Arrestee facts (arrest date/place, PO/BC status, priors) → `persons` role ARRESTEE + `arrestee_details` (§3.2). Acts/sections/heads → `record_offences` (§2.7, one row per section citation).
Indexes: `(local_head_id)`, `(fir_no)`.

### 2.4 `pcr_call_details` (record_type = PCR_CALL) — 1:1 → records

| column | type | constraints / notes |
|---|---|---|
| record_id | uuid | PK, FK → records ON DELETE CASCADE |
| pcr_no | varchar(50) | |
| gd_no | varchar(50) | ; gd_date date; gd_time time |
| call_head | varchar(100) | PCR call category (no ref table exists — plain column) |
| call_gist | text | |
| incident_location_id | uuid | FK → locations (§3.5) — was place_of_incident + latitude/longitude |
| occurrence_location_id | uuid | FK → locations — was occurrence_place (two distinct form fields — both kept, as two location rows) |
| incident_datetime | timestamptz | |
| arrival_time | time | |
| action_taken | text | |
| final_call_status | varchar(50) | |
| extra | jsonb | NOT NULL DEFAULT '{}' |
| created_at / updated_at | timestamptz | |

Caller → `persons` role CALLER (name/mobile/address live there). Responding/enquiry officer → `records.io_id`.

### 2.5 `missing_details` (record_type = MISSING) — 1:1 → records

| column | type | constraints / notes |
|---|---|---|
| record_id | uuid | PK, FK → records ON DELETE CASCADE |
| gd_no | varchar(50) | DD/FIR reference entry; gd_date date (reference entry date) |
| missing_type | varchar(50) | category (boy/girl/man/woman/abandoned…) |
| missing_status | varchar(50) | Missing / Found / … — domain status, distinct from workflow status |
| operator_name | varchar(100) | |
| source | varchar(100) | source of information — includes PCR-call origin as a value (the old `pcr_call_flag` boolean was redundant with it, ruling 20) |
| zipnet_no | varchar(50) | |
| case_registered | boolean | "is FIR registered?" discriminator (ruling 23b); Yes → fir_no required at submit (config `show_when`+`required`, never a DB CHECK — ruling-18 pattern) |
| fir_no | varchar(50) | FIR number **as entered** — provenance + fallback ONLY, ruling-19 discipline; THE link is an async-resolved `record_links` CASE_MISSING row (ruling 23c); fir_date date |
| remarks | text | |
| extra | jsonb | NOT NULL DEFAULT '{}' |
| created_at / updated_at | timestamptz | |

The missing person (name, age, addresses, physical description, missing/found dates+places) → `persons` role MISSING + `missing_person_details` + `person_descriptions` (§3.2–3.3). Informant → `persons` role INFORMANT.

### 2.6 `uidb_details` (record_type = UIDB, unidentified dead body) — 1:1 → records

| column | type | constraints / notes |
|---|---|---|
| record_id | uuid | PK, FK → records ON DELETE CASCADE |
| uidb_no | varchar(50) | (gazette_number removed by ruling 20 — re-add via `extra`/promotion if gazette publication tracking is ever needed) |
| gd_no | varchar(50) | ; gd_date date |
| inquest_sections | varchar(255) | free text (e.g. 174 CrPC) — deliberately NOT FK'd; inquest sections ≠ offence sections |
| local_head_id | int | FK → ref.local_heads — single; acts/sections/major/minor heads → `record_offences` (§2.7) |
| found_date | date | ; found_time time |
| found_location_id | uuid | FK → locations (§3.5) — was found_place + found_latitude/longitude |
| duty_officer | varchar(100) | contact attribute |
| zipnet_no | varchar(50) | |
| identified | boolean | body identified |
| cause_of_death | varchar(255) | |
| deceased_relative_name / deceased_relation_type | varchar(100) / varchar(50) | contact attributes |
| filed_by_acp_sdm | boolean | ; filed_by_acp_sdm_date date |
| mortuary_remarks | text | current status / mortuary remarks |
| uidb_status | varchar(50) | domain status |
| extra | jsonb | NOT NULL DEFAULT '{}' |
| created_at / updated_at | timestamptz | |

Deceased (name, parent name, addresses, physical description, estimated age) → `persons` role DECEASED + `person_descriptions`. Informant → `persons` role INFORMANT. Offence acts/sections/heads → `record_offences` (§2.7, one row per section citation).

### 2.7 `record_offences` — flat multi-valued offence classification (rulings 15+17; replaces the earlier `record_sections` junction)
Used by CASE, ARREST, UIDB. **One row per section citation**, each row self-contained (deliberate 1NF, ruling 17): a record citing IPC 379/411 under Theft/House-Theft = two rows repeating the same (act, major, minor) triple with different sections. Multiple acts, multiple majors, multiple minors per major — all just rows; no grouping table. Redundant triples across a group are harmless because the write path replaces a record's offence rows wholesale on every save (same delete-and-reinsert pattern as persons/properties) — a group can never half-update. Every column stays an enforced FK (the red line — arrays/jsonb lists of codes are banned). An ARREST's offence rows are its own — they may be fewer/more/different than its linked CASE's.

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| record_id | uuid | NOT NULL, FK → records ON DELETE CASCADE |
| act_id | int | FK → ref.acts, NULL when the act is outside the lookup |
| other_act_name | varchar(255) | free text for non-lookup acts (CHECK: act_id NOT NULL OR other_act_name NOT NULL) |
| section_id | text | FK → ref.sections(section_code) (verified PK, §8), NULL when the act has no section list (e.g. free-text Other Act) |
| major_head_id | int | FK → ref.major_heads |
| minor_head_id | int | FK → ref.minor_heads |
| is_primary | boolean | NOT NULL DEFAULT false — **exactly one primary row per record** (partial UNIQUE `(record_id) WHERE is_primary`); that row's act/major/minor is THE single-head classification read by daily diary, crime-head analytics, and the DCP head override — prevents multi-offence records double-counting in single-head reports (§9.4) |
| sort_order | int | NOT NULL DEFAULT 0 |
| created_at / updated_at | timestamptz | |

Dedup: partial UNIQUE `(record_id, act_id, section_id) WHERE section_id IS NOT NULL`. "All cases u/s X" is a direct indexed WHERE on `section_id` — no join.
Indexes: `(record_id)`, `(section_id)`, `(major_head_id)`, the two partial UNIQUEs above.

---

## 3. Persons, properties & locations

### 3.1 `persons` — one row per participant per record (per-record identity, FINAL; cross-record `identities` is a documented future add-on, §11)

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| record_id | uuid | NOT NULL, FK → records ON DELETE CASCADE |
| role | varchar(20) | NOT NULL, CHECK IN (COMPLAINANT, ACCUSED, VICTIM, WITNESS, ARRESTEE, MISSING, DECEASED, INFORMANT, CALLER, IO) (synced). IO allowed **only** for legacy/imported free-text IOs |
| name | varchar(100) | |
| relative_name | varchar(100) | the named relative (old keys: father_name, parent_name, father_husband_name, *_relative_name) |
| relation_type | varchar(20) | CHECK IN (FATHER, MOTHER, HUSBAND, WIFE, GUARDIAN, OTHER) (synced) — which relation `relative_name` is; with `gender` it derives the S/O / D/O / W/O / C/O display prefix in reports (ruling 21) |
| gender | varchar(10) | CHECK IN (MALE, FEMALE, OTHER, UNKNOWN) |
| age | smallint | ; dob date — write path derives age from dob when only dob is entered |
| is_minor | boolean | **GENERATED ALWAYS AS (age < 18) STORED** — DB-computed, cannot drift (ruling 20); NULL when age unrecorded. Generic across all roles (missing minors, POCSO victims/accused…) |
| nick_names | jsonb | NOT NULL DEFAULT '[]' — multi-value chips |
| mobile | varchar(20) | |
| qualification | varchar(50) | education level (Uneducated/10th/10+2/Graduate/Post-Graduate — options live in field config, not a CHECK); one column for all roles, the form's per-role `*_qualification` fields map here |
| present_location_id | uuid | FK → locations (§3.5) — replaces the old inline present-address block (ruling 15) |
| perm_location_id | uuid | FK → locations, NULL when permanent = present |
| perm_same_as_present | boolean | NOT NULL DEFAULT false — the form's "same as present" toggle; when true, perm_location_id is NULL |
| relation_to_subject | varchar(50) | the informant's/caller's relation to the record's subject (e.g. informant is the missing person's brother) — deliberately distinct from `relation_type`, which describes `relative_name` (ruling 21) |
| sort_order | int | NOT NULL DEFAULT 0 |
| extra | jsonb | NOT NULL DEFAULT '{}' |
| created_at / updated_at | timestamptz | |

Indexes: `(record_id, role)`, `(name)`, `(mobile)`.

### 3.2 Role subtype tables — 1:1 → persons (only where a role has real extra facts)

**`arrestee_details`** (role = ARRESTEE):

| column | type | notes |
|---|---|---|
| person_id | uuid PK | FK → persons ON DELETE CASCADE |
| arrest_date | date | ; arrest_time time; arrest_location_id uuid FK → locations |
| prev_involvement_count | int | ; prev_involvement text (details) |
| is_po | boolean | proclaimed offender; po_declared_court varchar(100); po_case_reference varchar(100) |
| is_bc | boolean | bad character |
| created_at / updated_at | timestamptz | |

**`missing_person_details`** (role = MISSING):

| column | type | notes |
|---|---|---|
| person_id | uuid PK | FK → persons ON DELETE CASCADE |
| missing_date | date | ; missing_location_id uuid FK → locations |
| last_seen_place | text | running/narrative text, deliberately NOT a locations FK (ruling 20) |
| found_date | date | ; found_location_id uuid FK → locations |
| mp_known | boolean | |
| mental_state | varchar(100) | |
| created_at / updated_at | timestamptz | |

### 3.3 `person_descriptions` — shared physical-description subtype, 1:1 → persons
One table instead of duplicating 10 identical columns in missing/deceased subtypes; used by roles MISSING and DECEASED (open choice resolved: shared — the block is byte-identical across both forms).

| column | type |
|---|---|
| person_id | uuid PK, FK → persons ON DELETE CASCADE |
| height / built / complexion / face / hair / beard / moustache | varchar(50) |
| upper_dress_color / lower_dress_color | varchar(50) |
| identification_marks | text |
| physical_description | text |
| age_range | varchar(20) — UIDB "approx 25–30" strings; numeric estimate lives in persons.age |
| created_at / updated_at | timestamptz |

### 3.4 `record_properties` — base + category-specific FK columns (no per-category subtables)

| column | type | constraints / notes |
|---|---|---|
| id | uuid | PK |
| record_id | uuid | NOT NULL, FK → records ON DELETE CASCADE |
| major_category_id | int | FK → ref.property_categories (merged table — was ref.property_types) |
| minor_category_id | int | FK → ref.other_property_items |
| status | varchar(20) | NOT NULL DEFAULT 'STOLEN', CHECK IN (STOLEN, RECOVERED, SEIZED, INTACT, UNCLAIMED) (synced) |
| details | text | |
| uid | varchar(100) | property UID |
| estimated_value | numeric(14,2) | |
| **category FKs** (nullable, one per applicable category): automobile_id → ref.automobiles · fire_arm_id → ref.fire_arms · arms_subtype_id → ref.fire_arms_subtypes · arms_made_id → ref.arms_made · jewelry_type_id → ref.jewelry_types · currency_type_id → ref.currency_types · document_type_id → ref.document_types · drug_type_id → ref.drug_types · electric_good_id → ref.electric_goods · explosive_type_id → ref.explosive_types · cultural_property_id → ref.cultural_properties | int | arms *category* is derivable via fire_arms → arms_categories (single home); arms_subtype cascades off fire_arm_id (form field key `prop_arms_made` is a legacy misnomer — it holds the subtype selection, not arms_made; the live loader/service still reads it that way, so implementation must map it to arms_subtype_id, not arms_made_id) |
| phone_number / phone_make / phone_model / phone_imei / phone_color | varchar | phone block (form repeater) |
| vehicle_no / vehicle_make / vehicle_model / vehicle_color / vehicle_chassis_no / vehicle_engine_no | varchar | vehicle block — the CASE form's flat vehicle section maps to ONE property row (category VEHICLE); vehicle *type* = automobile_id |
| sort_order | int | NOT NULL DEFAULT 0 |
| extra | jsonb | NOT NULL DEFAULT '{}' |
| created_at / updated_at | timestamptz | **timestamptz — the old `updated_at text` bug class must not recur** |

Indexes: `(record_id)`, `(major_category_id)`, `(status)`, `(vehicle_no)`, `(phone_imei)`.

### 3.5 `locations` — shared structured place/address table (ruling 15)
One home for every address/place block in the system, mirroring the form's generated address block (house/street/colony/city/tehsil/country/state/district/PS/pincode). Referenced BY the owning tables via FK — current referencers: `fir_details.occurrence_location_id`, `pcr_call_details.incident_location_id`/`occurrence_location_id`, `uidb_details.found_location_id`, `persons.present_location_id`/`perm_location_id`, `arrestee_details.arrest_location_id`, `missing_person_details.missing_location_id`/`found_location_id` (last-seen is deliberately narrative text, not a location — ruling 20).

| column | type | constraints / notes |
|---|---|---|
| id | uuid | PK |
| house_no | varchar(100) | |
| street | varchar(150) | |
| colony | varchar(150) | |
| landmark | varchar(150) | added at implementation (2026-07-11): live form fields `occurrence_landmark`/`arrest_landmark` (migration 20260703211052 renamed occurrence_state → landmark) had no home in the original column list |
| city_town_village | varchar(150) | |
| tehsil_block_mandal | varchar(150) | |
| district | varchar(100) | form SELECT value — deliberately NOT an FK into hierarchy_nodes (addresses may be anywhere in India, not just Delhi Police jurisdiction) |
| state | varchar(100) | ; country varchar(100) |
| police_station | varchar(150) | same reason as district — free of hierarchy_nodes |
| pincode | varchar(10) | |
| latitude / longitude | numeric(9,6) | |
| full_address | varchar(500) | one-line fallback for simple/legacy entries that were never captured as components |
| extra | jsonb | NOT NULL DEFAULT '{}' — same escape-hatch rules as persons/properties (ruling 7 extended) |
| created_at / updated_at | timestamptz | |

**Ownership/lifecycle:** one `locations` row per use — owned by exactly one referencing row, never shared or deduplicated across records (same per-record philosophy as `persons`, §1.3 of the decisions doc). Created/updated in the owning row's transaction. Records are never deleted, so orphan cleanup is a non-issue in practice; if an owning child row is ever hard-deleted, the app deletes its location row in the same transaction.
Indexes: `(pincode)`, `(city_town_village)`.

---

## 4. Workflow, transfers, revisions, audit

### 4.1 `record_transfers` — first-class case transfer (T1-b + rulings)
Two-step handshake: initiate → record enters `IN_TRANSFER` (transitions live in `workflow_transitions_config`) → receiving side ACCEPTs (one transaction: flip records.ps/district/sub_div; if first transfer set `records.original_ps_id`; CASE only: flip fir_details.ps_id, allocate new FIR number from the counter, stamp assigned_*, set original_fir_* if first transfer) or REJECTs (restore `prior_status`/`prior_level` from this row). Multiple transfers = multiple rows ordered by initiated_at.

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| record_id | uuid | NOT NULL, FK → records |
| from_ps_id / to_ps_id | uuid | NOT NULL, FK → hierarchy_nodes |
| initiated_by | uuid | NOT NULL, FK → users; initiated_at timestamptz NOT NULL DEFAULT now() |
| reason | text | NOT NULL |
| order_ref | varchar(100) | transfer order reference |
| status | varchar(10) | NOT NULL DEFAULT 'PENDING', CHECK IN (PENDING, ACCEPTED, REJECTED) (synced) |
| prior_status / prior_level | varchar(30) / varchar(20) | NOT NULL — captured at initiation; REJECT restores from here, not from config |
| assigned_fir_no | varchar(50) | ; assigned_fir_year smallint — set on ACCEPT; full numbering trail = original_* (first ever) + these rows (each reassignment) + fir_details.fir_no (current) |
| decided_by | uuid | FK → users; decided_at timestamptz; decision_comment text |
| created_at / updated_at | timestamptz | |

Indexes: `(record_id, initiated_at)`, `(to_ps_id, status)`.
Old-PS read-back after transfer: deliberately undecided — this table is the future grant mechanism (scope-logic joins through it; zero schema cost).

### 4.2 `fir_number_counters` — FIR number allocator (ruling)
Both fresh FIR registration and transfer-ACCEPT draw from the same counter via row-locked increment (`SELECT … FOR UPDATE`). The `fir_details` UNIQUE is the backstop, never the allocator.

| column | type | constraints |
|---|---|---|
| ps_id | uuid | FK → hierarchy_nodes |
| fir_year | smallint | |
| last_no | int | NOT NULL DEFAULT 0 |
| — | — | PRIMARY KEY (ps_id, fir_year) |
| updated_at | timestamptz | |

### 4.3 `record_revisions` — append-only ledger + tamper-evident hash chain (IMPLEMENTED, decision b)

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| record_id | uuid | NOT NULL, FK → records ON DELETE CASCADE |
| revision_number | int | NOT NULL; **UNIQUE (record_id, revision_number)** |
| change_type | varchar(30) | NOT NULL, CHECK IN (CREATE, UPDATE, STATUS_CHANGE, LEVEL_TRANSITION, HEAD_OVERRIDE, TRANSFER, AMENDMENT, IMPORT) (synced) |
| field_changes | jsonb | NOT NULL DEFAULT '[]' |
| level | varchar(20) | NOT NULL DEFAULT 'PS' |
| changed_by | uuid | NOT NULL, FK → users; changed_at timestamptz NOT NULL DEFAULT now() |
| comment / reason | text | |
| ip_address | varchar(45) | |
| prev_hash | char(64) | NOT NULL — previous revision's row_hash for this record; genesis = defined constant |
| row_hash | char(64) | NOT NULL — `H(canonical revision payload ‖ prev_hash)` |
| hash_version | smallint | NOT NULL DEFAULT 1 — canonicalization scheme version; scheme never changes without a bump |

Hash rules: computed inside the **single** revision-write path (one choke point — the old dual write paths are consolidated); scheduled verification job walks chains and reports breaks; break procedure = loud alert + `records.is_frozen = true` + audit_logs entry (runbook to be drafted at implementation). Append-only: no updated_at.
Indexes: the UNIQUE, `(changed_by)`, `(changed_at)`.

### 4.4 `workflow_transitions` — append-only transition ledger

| column | type |
|---|---|
| id | uuid PK |
| record_id | uuid NOT NULL FK → records ON DELETE CASCADE |
| from_status / to_status | varchar(30) — to_status NOT NULL |
| from_level / to_level | varchar(20) |
| action | varchar(30) NOT NULL |
| performed_by | uuid FK → users; performed_at timestamptz NOT NULL DEFAULT now() |
| comment | text |
| target_fields | jsonb NOT NULL DEFAULT '[]' — send-back field highlighting |

Indexes: `(record_id, performed_at)`.

### 4.5 `workflow_transitions_config` — the ONE state machine (config-synced from `config/workflow/*.json`; in-code TRANSITIONS object is DELETED)

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| code | varchar(80) | NOT NULL, UNIQUE — stable sync key |
| record_type | varchar(20) | NOT NULL DEFAULT '*' |
| from_status | varchar(30) | NOT NULL; action varchar(30) NOT NULL; to_status varchar(30) NOT NULL |
| from_level / to_level | varchar(20) | |
| allowed_roles | jsonb | NOT NULL DEFAULT '[]' |
| requires_comment | boolean | NOT NULL DEFAULT false |
| sla_hours | int | |
| is_active | boolean | NOT NULL DEFAULT true |
| checksum | varchar(64) | sync no-op detection |
| created_at / updated_at | timestamptz | |

Includes the `IN_TRANSFER` transitions (initiate/accept/reject) and `LEGACY_IMPORTED` / `AMENDMENT_PENDING` specials.

### 4.6 `record_amendments` — single amendments design (replaces `legacy_amendments`; ruling: included)
Correction requests for records that bypass normal workflow (legacy imports, HQ-frozen states).

| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| record_id | uuid | NOT NULL, FK → records |
| requested_by | uuid | NOT NULL, FK → users |
| status | varchar(10) | NOT NULL DEFAULT 'PENDING', CHECK IN (PENDING, APPROVED, REJECTED) (synced) |
| field_changes | jsonb | NOT NULL |
| reason | text | NOT NULL |
| decided_by | uuid | FK → users; decided_at timestamptz; decision_comment text |
| created_at / updated_at | timestamptz | |

Index: `(record_id, status)`.

### 4.7 `audit_logs` — generic cross-table audit (append-only)

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| table_name | varchar(60) NOT NULL | |
| record_id | uuid | **no FK — generic by design** |
| action | varchar(30) NOT NULL | |
| changed_by_id | uuid FK → users; changed_by_role varchar(20) | |
| changed_at | timestamptz NOT NULL DEFAULT now() | |
| field_name | varchar(60) | |
| old_value / new_value | jsonb | |
| reason | text; ip_address varchar(45) | |

Indexes: `(table_name, record_id)`, `(changed_by_id)`, `(changed_at)`.

### 4.8 `record_status_events` — typed domain-status change ledger (ruling 22, 2026-07-13)
Diaries report status changes on the date they **actually happened**, which officers often enter days later — so every domain-status change carries an officer-entered `effective_date` (the diary pivot, backdating expected) distinct from the system `changed_at` (the audit fact). Workflow status stays in `workflow_transitions` (§4.4); this table is **domain** statuses only. Report-queryable by `pharos_report_ro` (§9.5).

| column | type | constraints / notes |
|---|---|---|
| id | uuid | PK |
| record_id | uuid | NOT NULL, FK → records ON DELETE CASCADE |
| property_id | uuid | FK → record_properties ON DELETE CASCADE; NULL unless the event is a property status change; CHECK `(status_field = 'property_status') = (property_id IS NOT NULL)` |
| status_field | varchar(30) | NOT NULL, CHECK IN (case_status, missing_status, uidb_status, final_call_status, property_status, is_worked_out) (synced) — is_worked_out added by ruling 23a (boolean stored as 'true'/'false' in old/new_value) |
| old_value | varchar(50) | |
| new_value | varchar(50) | NOT NULL |
| effective_date | date | NOT NULL — officer-entered real-world date of the change (diary pivot); validated not-future at the API layer, never a DB CHECK |
| changed_by | uuid | NOT NULL, FK → users |
| changed_at | timestamptz | NOT NULL DEFAULT now() — system entry time (audit fact, distinct from effective_date) |
| comment | text | |

Append-only: no updated_at. Indexes: `(record_id)`, `(effective_date)`, `(status_field, effective_date)`.

Write rule: any write that changes one of the tracked status values MUST insert an event row **in the same transaction** (alongside the usual revision), through the single write path. The value set at record creation is NOT an event — registration diaries pivot on the record's own dates; this table holds changes only.

---

## 5. Links & compilation

### 5.1 `record_links` / `link_type_registry` (kept, conventions applied)

`link_type_registry`: id uuid PK · code varchar UNIQUE NOT NULL · source_record_type / target_record_type varchar(20) · label varchar(100) (English-only) · cardinality varchar(20) NOT NULL DEFAULT 'ONE_TO_MANY' · is_active boolean NOT NULL DEFAULT true · created_at/updated_at.

`record_links`: id uuid PK · link_type_id uuid NOT NULL FK → link_type_registry · source_record_id / target_record_id uuid NOT NULL FK → records · metadata jsonb NOT NULL DEFAULT '{}' · created_by uuid FK → users · created_at. **UNIQUE (source_record_id, target_record_id, link_type_id)**. Indexes: `(source_record_id)`, `(target_record_id)`.

Link creation from FIR references is **asynchronous** (ruling 23c): the record write commits first; a post-commit event subscriber resolves the reference and inserts the link row as its own single action (idempotent via the UNIQUE triple). Registry codes include CASE_ARREST (ruling 19) and CASE_MISSING (ruling 23b).

### 5.2 `compilations` (the `record_ids` JSON array is DEAD — join table wins)

| column | type |
|---|---|
| id | uuid PK |
| source_level / target_level | varchar(20) NOT NULL |
| route | varchar(30) NOT NULL DEFAULT 'OPS_CHAIN' |
| period | date NOT NULL |
| source_entity_id | uuid NOT NULL FK → hierarchy_nodes |
| status | varchar(20) NOT NULL DEFAULT 'DRAFT', CHECK IN (DRAFT, SUBMITTED, ACKNOWLEDGED) (synced) |
| compiled_summary | jsonb |
| submitted_by | uuid FK → users; submitted_at timestamptz |
| created_at / updated_at | timestamptz |

### 5.3 `compilation_records` — join table + frozen-snapshot scope (ruling)
A submitted compilation never changes when a member record later transfers; membership queries never re-derive scope from the record's current location.

| column | type | constraints |
|---|---|---|
| compilation_id | uuid | FK → compilations ON DELETE CASCADE |
| record_id | uuid | FK → records |
| — | — | PRIMARY KEY (compilation_id, record_id) |
| ps_id_at_compile | uuid | NOT NULL, FK → hierarchy_nodes — snapshot at compile time |
| district_id_at_compile | uuid | NOT NULL, FK → hierarchy_nodes — snapshot |
| added_at | timestamptz | NOT NULL DEFAULT now() |

Index: `(record_id)`.

---

## 6. Config-as-data (Level 5 — one unified pattern)

**Pattern:** authored in git (versioned seed files) → `npm run sync-config` (idempotent upsert keyed on stable `code`/`field_key`, checksum ⇒ unchanged = no-op) → runtime reads DB only. Migrations are schema-only forever. Admin-UI editing later edits these same tables.

| Config | Git source | Table |
|---|---|---|
| Workflow rules | `config/workflow/*.json` | `workflow_transitions_config` (§4.5) |
| Field definitions | `config/fields/<record_type>.json` | `field_registry` (§6.1) |
| Proforma specs | `config/proformas/<name>.json` (ONE file per proforma) | `report_templates` (§7.1) |
| Level data contracts | `config/contracts/*.json` (ruling) | `level_data_contracts` (§6.2) |
| Diaries | `config/diaries/daily_diary.json` = ["proforma_01", …] | (plain references, no table) |

### 6.1 `field_registry` — UI metadata + storage mapping ONLY (no storage role of its own)

| column | type | constraints / notes |
|---|---|---|
| id | uuid | PK |
| field_key | varchar(60) | NOT NULL, UNIQUE — sync key |
| record_types | jsonb | NOT NULL DEFAULT '[]' (was applicable_record_types) |
| field_type | varchar(20) | NOT NULL |
| labels | jsonb | NOT NULL — `{"en": …, "hi": …}` (the one live bilingual case) |
| section | varchar(60) | ; section_labels jsonb |
| **storage** | jsonb | NOT NULL — exactly four shapes (§9.1; ruling 8 as amended by ruling 15): `{"table": …, "column": …}` scalar · `{"entity": "person"\|"property", "role": …?, "column": …}` repeater row-per-entity · `{"entity": "location", "slot": "occurrence"\|"present"\|"permanent"\|"incident"\|"found"\|"missing"\|"last_seen"\|"arrest", "column": …}` address-block component routed into the owning row's `locations` row for that slot · `"extra"` jsonb pocket of the owning table/entity |
| options | jsonb | inline options; options_source varchar(60) → name of a ref.* lookup |
| depends_on | varchar(60) | cascade parent field_key |
| show_when | jsonb | conditional visibility |
| validation_rules | jsonb | |
| visible_to_levels / editable_by_levels | jsonb | NOT NULL DEFAULT '[]' |
| introduced_at_level | varchar(20) | DEFAULT 'PS' |
| repeater_entity | varchar(20) | PERSON_* / PROPERTY group marker |
| sort_order | real | insert-between ordering |
| full_width / readonly / is_active | boolean | |
| scope_level | varchar(20) | NOT NULL DEFAULT 'global'; scope_id uuid FK → hierarchy_nodes |
| checksum | varchar(64) | |
| created_at / updated_at | timestamptz | |

Field tooling: adding a typed field is ONE command → updates the seed file + generates the `ADD COLUMN` migration together. Promotion from `extra` additionally value-copies (§9.2). The report-engine catalog (`reportableFields` successor) **regenerates from these storage mappings** — never hand-maintained.

### 6.2 `level_data_contracts`
id uuid PK · code varchar UNIQUE NOT NULL (sync key) · from_level / to_level varchar(20) NOT NULL · route varchar(30) NOT NULL DEFAULT 'OPS_CHAIN' · record_type varchar(20) NOT NULL DEFAULT '*' · visible_field_keys jsonb NOT NULL · aggregate_definitions jsonb NOT NULL DEFAULT '[]' · is_active boolean NOT NULL DEFAULT true · checksum varchar(64) · created_at/updated_at.

---

## 7. Reporting, import, misc

### 7.1 `report_templates` (config-synced; the in-memory template array + orphan HTML files are DELETED)
id uuid PK · code varchar UNIQUE NOT NULL (= proforma name) · name varchar(150) NOT NULL · record_types jsonb · levels jsonb · template_definition jsonb NOT NULL · output_formats jsonb NOT NULL DEFAULT '["PDF"]' · template_type varchar(20) NOT NULL DEFAULT 'PROFORMA' · is_active boolean NOT NULL DEFAULT true · checksum varchar(64) · created_at/updated_at.

### 7.2 `report_jobs` (kept; template FK restored — ruling)
id uuid PK · template_id uuid **nullable FK → report_templates** · filters jsonb NOT NULL DEFAULT '{}' · format varchar(10) NOT NULL · status varchar(10) NOT NULL DEFAULT 'PENDING', CHECK IN (PENDING, RUNNING, READY, FAILED) · file_path varchar(500) · custom_definition jsonb · error_message text · created_by uuid NOT NULL FK → users · created_at/updated_at. Index: `(created_by, created_at DESC)`, `(status)`.

### 7.3 `scheduled_reports` (FK now valid — templates actually exist as rows)
id uuid PK · template_id uuid NOT NULL FK → report_templates · cron_expr varchar(50) NOT NULL · filter_spec jsonb NOT NULL DEFAULT '{}' · format varchar(10) NOT NULL DEFAULT 'PDF' · scope_ps_id / scope_district_id uuid FK → hierarchy_nodes · recipients jsonb NOT NULL DEFAULT '[]' · is_active boolean NOT NULL DEFAULT true · last_run_at timestamptz · last_run_status varchar(20) · created_by uuid FK → users · created_at/updated_at.

### 7.4 `report_builder_saved` / `report_builder_audit` (kept, conventions — ruling)
saved: id uuid PK · name varchar(150) NOT NULL · description text · query_spec jsonb NOT NULL · is_shared boolean NOT NULL DEFAULT false · created_by uuid NOT NULL FK → users · created_at/updated_at.
audit (append-only): id uuid PK · user_id uuid FK → users · user_role varchar(20) · run_type varchar(20) · table_spec / fields_spec / filter_spec jsonb · format varchar(10) · row_count int · job_id uuid FK → report_jobs · ip_address varchar(45) · created_at.

### 7.5 `filter_presets` (kept, conventions — ruling)
id uuid PK · name varchar(150) NOT NULL · scope varchar(20) NOT NULL DEFAULT 'global' · scope_id uuid FK → hierarchy_nodes · filter_spec jsonb NOT NULL · record_types jsonb NOT NULL DEFAULT '[]' · created_by uuid FK → users · is_active boolean NOT NULL DEFAULT true · created_at/updated_at.

### 7.6 `import_batches` (merged: `legacy_import_batches` is DEAD — `is_legacy` flag covers it)
id uuid PK · record_type varchar(20) NOT NULL · is_legacy boolean NOT NULL DEFAULT false · uploaded_by uuid NOT NULL FK → users · ps_id / district_id uuid FK → hierarchy_nodes · file_path varchar(500) · total_rows / valid_rows / invalid_rows / imported_rows int NOT NULL DEFAULT 0 · status varchar(30) NOT NULL DEFAULT 'VALIDATION_PENDING', CHECK IN (VALIDATION_PENDING, VALIDATED, CONFIRMED, IMPORTED, FAILED, CANCELLED) (synced) · confirmed_at timestamptz · created_at/updated_at.

### 7.7 `import_batch_errors` (kept — ruling)
id uuid PK · batch_id uuid NOT NULL FK → import_batches ON DELETE CASCADE · row_number int NOT NULL · field_key varchar(60) · error_code varchar(40) · error_message text · created_at. Index: `(batch_id)`.

### 7.8 `notifications` — bilingual redesign (L6.7): type + params, rendered via i18n at read time
id uuid PK · user_id uuid NOT NULL FK → users · type varchar(40) NOT NULL (i18n key) · params jsonb NOT NULL DEFAULT '{}' · record_id uuid FK → records · is_read boolean NOT NULL DEFAULT false · read_at timestamptz · created_at. Index: `(user_id, is_read, created_at DESC)`. English-only i18n for now.

---

## 8. `ref` schema — 21 lookup tables, full FK discipline

Renamed from `excel_*`; every table keeps ALL its real typed columns (nothing smashed into jsonb, no generic lookup table); **UNIQUE on every code column**; every implicit relationship becomes an enforced FK. Loaded by the `menu_table().js` successor in FK order (acts/major_heads/arms_categories/property parents first); **loader fails loudly on duplicate natural keys — never skip or overwrite silently**. English-only labels (FINAL for now; Hindi later = additive). All former `⚠ verify` items were **verified against actual sheet data 2026-07-11** — full evidence in `REF_KEY_VERIFICATION.md`; the table below reflects the verified keys (former `property_types` + `other_property_categories` merged into `property_categories`, hence 21 tables).

| table | columns (label cols NOT NULL) | natural PK | FKs |
|---|---|---|---|
| ref.acts | act_cd int, act_long text | act_cd | |
| ref.sections | section_code text, section_cd varchar, act_sec_cd varchar, section varchar, section_desc text, pnsh_gt_7yrs boolean | **section_code** (verified unique; act_sec_cd is NOT a key — 922 dup values — and NOT ⊆ acts, stays informational; loader excludes the 29 prose-spillover junk rows with NULL act_sec_cd, loudly) | (act linkage only via major_minor_mapping — no act col in sheet) |
| ref.major_heads | major_head_code int, major_head varchar | major_head_code | |
| ref.minor_heads | minor_head_cd int, major_head_code int, minor_head varchar | **minor_head_cd** (verified unique alone; UNIQUE (major_head_code, minor_head_cd) kept as backstop) | major_head_code → ref.major_heads |
| ref.major_minor_mapping | sec_mjrhd_cd int, act_cd int, section_code text, major_head_code int | sec_mjrhd_cd ✅ verified | act_cd → ref.acts; section_code → ref.sections(section_code); major_head_code → ref.major_heads. **Source data is dirty** (~656/2,136 rows reference acts/sections/majors absent from the sheets) — loader quarantines those rows with a per-reason report; FKs stay enforced on what loads (REF_KEY_VERIFICATION.md) |
| ref.local_heads | local_head_cd int, local_head varchar, **crime_category varchar(15) NOT NULL DEFAULT 'OTHER'** CHECK IN (HEINOUS, NON_HEINOUS, OTHER) — reports roll OTHER up with NON_HEINOUS (only HEINOUS is broken out); not in the source sheets → maintained as a curated overlay (`config/ref-overlays/local_head_categories.json`) applied by the ref loader after the sheet load, fail-loud on unknown codes (ruling 16) | local_head_cd | |
| ref.beats | beat_cd varchar, beat_name text, source_ps_cd varchar, ps_id uuid NULL | **beat_cd** (verified globally unique across all 2,855; UNIQUE (ps_id, beat_cd) kept) | **ps_id → hierarchy_nodes.id, NULLable by data reality**: resolution runs via `config/org/ps_codes.json` (derived from the official list `config/ref-data/PS_Codes.xlsx` — re-supplied 2026-07-11; 225 official PS all mapped). 2,090/2,855 beats link; **71 ps_cd values (765 beats) are absent from the official list itself** (defunct/renamed PS in the beat sheet) — those rows keep ps_id NULL + raw `source_ps_cd`; loader reports the distinct codes on every run. SET NOT NULL only if/when the beat sheet is reconciled |
| ref.property_categories | parent_srno int, parent_cd int, code_type varchar, parent_type varchar, major_property int | parent_cd ✅ verified | **merger of the former property_types (10 rows) + other_property_categories (16 rows)** — verified: identical shape, disjoint parent_cd spaces, and other_property_items.parent_cd resolves against exactly their union (543+392, 0 unresolved) — two tables would make that FK unenforceable. `parent_type` carries provenance ('PROPERTY TYPE' vs OTHERS section) |
| ref.other_property_items | property_cd int, parent_cd int, property_type_srno varchar, property varchar | property_cd ✅ verified | parent_cd → ref.property_categories |
| ref.fire_arms | fire_arms_cd int, arms_category_cd int, fire_arms varchar | fire_arms_cd | arms_category_cd → ref.arms_categories |
| ref.fire_arms_subtypes | arms_subtype_cd int, arms_type_cd int, arms_subtype varchar | arms_subtype_cd ✅ verified (215 rows, unique; arms_type_cd → fire_arms 0 unresolved) | arms_type_cd → ref.fire_arms(fire_arms_cd) — sheet's 4th "ARMS AND AMMUNITION" section (header `arms_subtype_cd`), previously mis-parsed into `ref.fire_arms` (live excel_fire_arms = 237 = 22 real + 215 subtypes) before the loader recognized the section boundary |
| ref.arms_categories | arms_category_cd int, arms_category varchar | arms_category_cd | |
| ref.arms_made | arms_made_cd int, arms_made varchar | arms_made_cd | |
| ref.automobiles | automobile_cd int, automobile varchar | automobile_cd | |
| ref.jewelry_types | jewelry_type_cd int, jewelry_type varchar | jewelry_type_cd | |
| ref.currency_types | currency_type_cd int, currency_type varchar | currency_type_cd | |
| ref.document_types | document_type_cd int, document_type varchar | document_type_cd | |
| ref.drug_types | drug_type_cd int, drug_type varchar | drug_type_cd | |
| ref.electric_goods | electric_goods_cd int, electric_goods varchar | electric_goods_cd | |
| ref.explosive_types | explosive_type_cd int, explosive_type varchar | explosive_type_cd | |
| ref.cultural_properties | cultural_prop_cd int, cultural_prop varchar | cultural_prop_cd | |

The old `ref_district`/`ref_police_station` view consumers (import module) switch to direct `hierarchy_nodes` queries.

---

## 9. Cross-cutting specifications

### 9.1 Naming reconciliation — old key/alias → new home (canonical names = seed `field_key`s, the live form contract)

| old (jsonb key / view alias / fact column) | new home |
|---|---|
| records.data (everything) | typed columns per §2–§3; `grep -r "data->>"` must return ~nothing |
| dd_number / dd_date / dd_time (fir_master), gd_entry_number/date/time (pcr), dd_fir_ref_number (missing), dd_number (uidb) | `gd_no / gd_date / gd_time` on the respective detail table |
| officer_name / officer_pis / officer_mobile (facts), io_name / io_pis_no / io_mobile_no / io_rank (views + seed) | `investigating_officers.name / pis_no / mobile / rank` via `records.io_id` |
| responding_officer_name = enquiry_officer_name (pcr view dup) | `records.io_id` (single home) |
| crime_head (analytics/facts/seed ARREST) | the arrest's `record_offences` row with `is_primary` — its `major_head_id` |
| linked_fir_dd_no (ARREST combined FIR/DD ref) | **no column** — import routes it into `fir_no` (FIR-based) or `gd_no` (DD-based) per `is_dd_based`, then resolves to a `record_links` UUID row via `(ps_id, fir_year, fir_no)` (ruling 19) |
| occurrence_date + time_of_occurrence / occurrence_time | `occurrence_from_datetime` (+ `occurrence_to_datetime`) |
| occurrence_time_type (Known/Unknown radio) | **derived at read**: both occurrence datetimes NULL = Unknown — not stored (ruling 15) |
| occurrence_place + occurrence_house_no/street/colony/city/tehsil/state/district/police_station/pincode block + occurrence_latitude/longitude | ONE `locations` row via `fir_details.occurrence_location_id` (storage shape `{entity:'location', slot:'occurrence', column}`) |
| complainant/victim/accused/arrested `*_house_no/_street/_colony/_city_town_village/_tehsil_block_mandal/_country/_state/_district/_police_station/_pincode` (+ `*_perm_*` twins, `*_perm_same` toggle) | `locations` rows via `persons.present_location_id` / `perm_location_id`; toggle → `persons.perm_same_as_present` |
| mustaches (views) / moustache (seed) | `person_descriptions.moustache` |
| complainant_name/-address/-parent_name/-age, accused_name/-address/-parent_name (flat legacy) | `persons` row (role COMPLAINANT / ACCUSED); one-line legacy addresses → the person's `locations.full_address` |
| arrested_name/-address/-age/-father_husband_name, arrest_date/time/place, is_po, po_*, prev_involvement*, bc_or_not/bad_character, nick_name | `persons` role ARRESTEE + `arrestee_details` |
| missing_person_name, missing_parent_name, age_approx, mp_* address keys, physical block, missing/found dates+places, mental state | `persons` role MISSING + `missing_person_details` + `person_descriptions` |
| major_minor (Major/Minor picker) | `persons.is_minor` — DB-generated from age (ruling 20), never stored by the app |
| name_of_deceased, deceased_parent_name, address_of_deceased, deceased_* address keys, estimated_age/approx_age, physical block, identification_marks | `persons` role DECEASED + `person_descriptions` |
| informant_name / informant_mobile / informant_relation | `persons` role INFORMANT (`relation_to_subject` column) |
| *_relative_name + *_relation_type / *_relationship (per-person pair) | `persons.relative_name` + `persons.relation_type` (ruling 21) |
| caller_name / caller_mobile / caller_address (PCR) | `persons` role CALLER |
| complainant_caller_name / pcr_call_category / pcr_dispatch_gist (pcr view) | persons CALLER / `call_head` / `call_gist` |
| vehicle_no/type/make/model/color/chassis_no/engine_no (CASE flat block) | ONE `record_properties` row: vehicle_* columns + `automobile_id` (type) |
| property_major_category / property_minor_category / property_details / property_stolen_recovered / phone_* (repeater) | `record_properties` (major/minor_category_id FKs, details, status, phone_*) |
| stolen_property / property_description / stolen_property_value / recovered_property_desc | `record_properties` rows (status STOLEN / RECOVERED, details, estimated_value) |
| ipc/excise/arms/gambling/other_sections (per-act multi-selects) | `record_offences` rows — one per section citation, carrying that act's heads inline |
| ipc/excise/arms/gambling/other_major_head + per-crime *_minor_head (conditional pickers) | `record_offences.major_head_id` / `minor_head_id` on that act's row (form conditionals map via storage mapping + show_when); single-head consumers read the `is_primary` row |
| beat_no | `beat_id` FK → ref.beats |
| act_name / other_act_name | `record_offences.act_id` / `.other_act_name` — one row per act cited |
| status (seed general_info, all types) | domain-status column per type: `case_status` / `missing_status` / `uidb_status` / `final_call_status` — never the workflow `records.current_status` |
| has_arrested_person (fir view) | **derived at query time** via `record_links` — not stored |
| cause (uidb legacy) → cause_of_death; inquest_sections; uidb_physical_desc → person_descriptions.physical_description | per §2.6/§3.3 |
| current_status_mortuary_remarks | `uidb_details.mortuary_remarks` |
| users.station_id | `users.ps_id` |
| excel_* | `ref.*` per §8 |

The 34 legacy seed rows with empty `applicable_record_types` (superseded flat person/property fields) get **no columns** — their data concept lives in persons/properties as mapped above.

### 9.2 `extra` jsonb + promotion discipline
- New field without deploy → `field_registry` row with `storage: "extra"`; form renders it; value lands in the owning table's `extra`.
- `extra` fields are second-class: invisible to the report engine by design.
- Promotion (field becomes reporting-relevant) is one tooling command → seed-file change + generated migration that **always** includes the value-copy step: `ALTER TABLE … ADD COLUMN …; UPDATE … SET col = (extra->>'key')::type, extra = extra - 'key';` (post-launch promotions will find real prod values in `extra`).

### 9.3 Deliberate denormalizations (the exhaustive list — anything else duplicated is a bug)
1. `records.ps_id / district_id / sub_div_id` — scoping via plain indexed WHEREs (L3.1-A); hierarchy reorg = scripted backfill.
2. `users.ps_id / district_id / sub_div_id` — same rationale.
3. `fir_details.ps_id` — carries the `UNIQUE(ps_id, fir_year, fir_no)` business key; flipped in the same transaction as transfer ACCEPT.
4. `compilation_records.ps_id_at_compile / district_id_at_compile` — frozen snapshots, intentionally NOT kept in sync.

### 9.4 Derived / special-field registry
| field | class | rule |
|---|---|---|
| fir_details.fir_no + fir_year | allocator-assigned | only from `fir_number_counters` row-locked increment (registration + transfer-accept) |
| records.original_ps_id | write-once | set on first transfer ACCEPT of any record type, immutable after |
| fir_details.original_fir_no / _year | write-once | CASE only — set on first transfer, immutable after |
| record_transfers.prior_status / prior_level | snapshot | captured at initiation; REJECT restores from here |
| record_transfers.assigned_fir_no / _year | write-once | set on ACCEPT |
| compilation_records.*_at_compile | snapshot | never updated |
| record_revisions.prev_hash / row_hash / hash_version | hash chain | computed only in the single revision-write path |
| records.is_frozen | control flag | set by chain-break procedure; privileged unfreeze only |
| persons.is_minor | DB-generated | `GENERATED ALWAYS AS (age < 18) STORED` — Postgres computes it, app never writes it; NULL when age unrecorded (write path fills age from dob first) |
| has_arrested_person | derived-at-read | EXISTS over record_links — never stored |
| S/O / D/O / W/O / C/O display prefix | derived-at-read | from `persons.relation_type` + `gender` in report/form formatters — never stored |
| occurrence time Known/Unknown | derived-at-read | both `occurrence_from/to_datetime` NULL = Unknown — the form radio is never stored (ruling 15) |
| record_offences.is_primary | control flag | exactly one per record (partial UNIQUE); single-head consumers (daily diary, crime-head analytics, DCP override) read only this row — prevents multi-act double-counting |
| persons.perm_same_as_present | control flag | when true, perm_location_id stays NULL; readers resolve permanent address = present |
| persons.nick_names | jsonb array | multi-value chips |

### 9.5 Access model (Level 7)
- python_worker: dedicated role **`pharos_report_ro`** — SELECT-only on exactly: records, all 5 detail tables, record_offences, locations, persons (+3 subtypes), record_properties, record_links, link_type_registry, hierarchy_nodes, investigating_officers, field_registry, report_templates, **record_status_events + workflow_transitions (ruling 22 — diaries pivot on status-change dates)**, ref.* (all). Credentials via **environment, never argv**. Job-status writes: Node owns them (worker communicates via stdout/exit protocol) — the role gets NO write grants (implementation may instead grant UPDATE on report_jobs only; either way nothing else).
- Worker sheets read real columns; end-state: worker consumes proforma specs from `report_templates` (the 24 hardcoded JSONB-key mappings dissolve).
- Raw SQL against typed columns is legitimate. One rule: nothing hand-maintains a parallel field catalog — everything derives from `field_registry.storage`.

---

## 10. Architect rulings of 2026-07-07 (binding, quoted for traceability)
1. `record_transfers` gains `prior_status, prior_level` (captured at initiation; REJECT restores from these, not from workflow config).
2. `record_transfers` gains `assigned_fir_no, assigned_fir_year` (set on ACCEPT); trail = original_* + transfer rows + current fir_no.
3. `records.is_frozen boolean NOT NULL DEFAULT false`; write path rejects mutations on frozen records; privileged review unfreezes; used by hash-chain break procedure.
4. `fir_number_counters(ps_id, fir_year, last_no, UNIQUE(ps_id, fir_year))`, row-locked increment; fresh registration and transfer-accept share it; the fir_details UNIQUE is backstop, not allocator.
5. Compilations × transfers = frozen snapshot; `compilation_records` gains `ps_id_at_compile, district_id_at_compile`.
6. Verdicts: level_data_contracts → Level-5 config pattern; filter_presets, report_builder_saved, report_builder_audit, import_batches, import_batch_errors kept under new conventions; report_jobs kept with nullable template_id FK restored.
7. persons and record_properties each get their own `extra` jsonb (same second-class/promotion rules).
8. Storage mapping — exactly three shapes: `{table, column}` · `{entity, role?, column}` · `'extra'`.
9. Promotion migrations always include the value-copy step.
10. ref.* natural keys determined from actual data (composite where needed); loader fails loudly on duplicates.
11. A field lives in exactly ONE table; list screens join the 1:1 detail table.
12. IO = own table (`investigating_officers`, all IO fields there, nullable user_id FK); records carries only the FK; persons role IO only for legacy imports.
13. Amendments included: single `record_amendments` replaces legacy_amendments.
14. *(2026-07-08)* Transfers are type-generic (CASE, ARREST, PCR_CALL, MISSING, UIDB can all transfer), so `original_ps_id` lives on **`records`**, not fir_details; `original_fir_no/_year` stay on `fir_details` because FIR renumbering is a CASE-only fact. Current PS was already spine-level (`records.ps_id`).
15. *(2026-07-10)* Three amendments in one ruling:
    **(a) fir_details column removals** — dropped as redundant: `type_of_information`, `complaint_no` (the complaint number IS the FIR number), `area_of_crime`, `cctns_flag`/`zero_fir_flag` (both are `case_type` values), `modus_operandi`, `cheated_amount`, `remarks`, `occurrence_time_type` (Known/Unknown is derivable: both occurrence datetimes NULL = Unknown).
    **(b) Multi-offence model** — a record cites multiple acts, each with its own sections and major/minor head (matching the form's per-act pickers), and an ARREST's offences may differ from its linked CASE's. `record_sections` is replaced by `record_offences` (one row per act: act_id/other_act_name, major_head_id, minor_head_id, `is_primary`, sort_order) + `offence_sections` (one row per section under an act row). Detail tables keep only `local_head_id`. Exactly one `is_primary` row per record (partial UNIQUE) is the single-head classification read by daily diary, crime-head analytics, and the DCP head override — multi-act records must never double-count in single-head statistics.
    **(c) `locations` table** — all structured address/place blocks (place of occurrence, person present/permanent addresses, PCR incident place, UIDB found place, missing/last-seen/found places, arrest place) move to one shared `locations` table referenced by FK from the owning row; per-use rows, never shared/deduplicated (same per-record philosophy as persons). `persons` gains `perm_same_as_present`. This amends ruling 8: storage mapping now has exactly **four** shapes — the new one is `{entity:'location', slot, column}`.
16. *(2026-07-11)* Heinous classification: `ref.local_heads` gains `crime_category` — CHECK IN (HEINOUS, NON_HEINOUS, OTHER), DEFAULT 'OTHER'. Reports break out only HEINOUS; OTHER rolls up with NON_HEINOUS (a 3-way stored value, 2-way in reports). The government sheets don't carry this fact, so it lives as a **curated overlay** in git (`config/ref-overlays/local_head_categories.json`) that the ref loader applies after loading the sheet — fail-loud if the overlay names a `local_head_cd` that doesn't exist. Attaches to local heads (the single PS-level classification daily-diary reporting groups by); if heinousness is ever needed at major-head grain too, it's an additive column there, not a redesign.
17. *(2026-07-11)* Offence storage flattened to **one table** (amends ruling 15b): `offence_sections` is dropped; `record_offences` becomes one row **per section citation** with `section_id` inline — deliberate 1NF, the (act, major, minor) triple repeats across rows of the same group. Accepted because (a) every column remains an enforced FK (the actual red line — arrays/jsonb code lists stay banned), (b) the wholesale delete-and-reinsert write pattern makes group update anomalies impossible, (c) section queries lose a join. `is_primary` stays row-level (partial UNIQUE per record). This is the only child-table flattening — everything else that looks like a junction carries facts of its own (record_links: type/metadata; compilation_records: frozen snapshots) and stays.
18. *(2026-07-11)* Arrest basis: `arrest_details.is_dd_based` is the discriminator between an arrest **under a case** (false → `fir_no` + `fir_date` required) and a **standalone Kalandra** (true → `gd_no` + `gd_date` required). `arrest_details` gains `gd_date`/`gd_time` (it had only `gd_no` — gap). The conditional requiredness is config, not schema: `show_when` on each block keyed to the form's arrest-type choice + `required` in validation_rules (hidden fields skip validation), re-validated server-side at the submit transition. Deliberately no DB CHECK — DRAFT records save partial.
19. *(2026-07-11)* Case↔arrest linking discipline: there is exactly **one** linking mechanism — a `record_links` CASE_ARREST row storing the case's UUID. FIR numbers are a **resolution key only**: import/entry resolves the typed number against the `fir_details` business key `(ps_id, fir_year, fir_no)` — same PS + year, so cross-PS FIR-number collisions are impossible by construction — and stores the resolved UUID link. The UUID link is authoritative and survives transfer renumbering (a stored text FIR number goes stale when ruling-4's allocator renumbers on transfer ACCEPT). `arrest_details.fir_no/fir_date` remain solely as as-entered provenance and as the fallback reference when the FIR doesn't exist in PHAROS (other unit / pre-system); when a link row exists, it wins. **`linked_fir_dd_no` is DROPPED** — import routes the old combined "FIR/DD No." value into `fir_no` (FIR-based) or `gd_no` (DD-based) per `is_dd_based`, then attempts UUID resolution and reports unresolved rows (the import's existing linked/unmatched report).
20. *(2026-07-11)* MISSING + UIDB cleanup: `missing_details.pcr_call_flag` dropped (redundant with `source`, which carries PCR-origin as a value). `missing_person_details.major_minor` replaced by **`persons.is_minor boolean GENERATED ALWAYS AS (age < 18) STORED`** — DB-computed (a generated column can't reference `dob`/now(), which is non-immutable, so the app derives age from dob at write and Postgres derives is_minor from age); lives on `persons` so it applies to every role, not just MISSING. `last_seen_location_id` reverted to **`last_seen_place text`** — narrative text by design, not an address (amends ruling 15c for this one field). Address of the missing person needs nothing new — it's the MISSING `persons` row's `present_location_id`/`perm_location_id`. `uidb_details.gazette_number` dropped (gazette-publication reference; process doesn't track it — re-add via `extra`/promotion at zero cost if that changes). `mental_state` already existed — unchanged.
21. *(2026-07-11)* Relative pair on persons: the form captures relation type + relative name per person, but the schema only stored the name. `parent_name` → **`relative_name`**, plus new **`relation_type`** CHECK IN (FATHER, MOTHER, HUSBAND, WIFE, GUARDIAN, OTHER) (synced). The S/O / D/O / W/O / C/O display prefix is derived at read from relation_type + gender (matching the existing report-formatter logic), never stored. The old `relation` column is renamed **`relation_to_subject`** (informant's/caller's relation to the record's subject) — a different fact that the near-identical name would have forever confused with `relation_type`.
22. *(2026-07-13)* Domain-status change dates for diaries: proformas report a status change (case_status progressing, property recovered, missing person traced …) in the diary of the date it **actually happened** — and officers routinely enter it days later. New append-only **`record_status_events`** (§4.8): one row per domain-status change with officer-entered `effective_date` (diary pivot, backdating expected, not-future validated at API layer) + system `changed_at` (audit fact) — the two dates are different facts and are never conflated. Covers the five domain statuses (case/missing/uidb/final_call/property_status); workflow status already has its dated ledger (`workflow_transitions`). Written only by the single write path, same transaction as the status update. `pharos_report_ro` grant list gains SELECT on `record_status_events` + `workflow_transitions` (they were missing — reports couldn't see any history). Current-value columns stay as-is. Import template unaffected (status changes are post-registration; registration diaries pivot on the record's own dates). *(2026-07-13, same day: folded into base migration 20260711000005 — DB had no data, no amendment migration needed.)*
23. *(2026-07-13)* Three amendments in one ruling:
    **(a) worked-out promotion** — the `work_out` Yes/No form field (existed, storage `extra`) is reporting-grade: daily diaries break out worked-out cases, and the flag flips after registration. Promoted to **`fir_details.is_worked_out boolean`** (NULL = unanswered; Yes/No normalized to boolean at write per baseline P2). Added to `record_status_events.status_field` CHECK — a later No→Yes flip is a dated event and appears in the diary of its `effective_date`, exactly like a domain-status change. *(2026-07-14 addendum: **`fir_details.worked_out_date date`** — the officer-entered workout date as a first-class current-value column; form field `work_out_date`, required + `show_when` work_out=Yes; the write path uses it as the event's `effective_date` and stamps both in one transaction — reports read the column for current state, the event ledger for history.)*
    **(b) MISSING → FIR reference** — `missing_details.case_registered` (existed, but had no form field) is the "is FIR registered?" discriminator; new columns **`fir_no varchar(50)` + `fir_date date`** hold the as-entered reference (ruling-19 discipline: provenance + fallback only). Config gains 3 MISSING fields: `case_registered` (RADIO Yes/No), `missing_fir_no` (required, `show_when` case_registered=Yes), `missing_fir_date` (`show_when` same) — requiredness is config re-checked at submit, never a DB CHECK (ruling-18 pattern).
    **(c) Async linking discipline** — link resolution NEVER runs inside the record-write transaction: one action at a time. The write path stores the as-entered reference and commits; the existing post-commit `record.created`/`record.updated` events trigger a link-resolver subscriber that does exactly one thing — resolve `(ps_id, fir_year, fir_no)` against the fir_details business key and insert the `record_links` row (CASE_ARREST / **CASE_MISSING** — new `link_type_registry` code) — idempotent via the UNIQUE `(source, target, link_type)` triple. Unresolved references stay provenance-only (fallback display) and are retried on the next update event. Generalizes ruling 19's import-time resolution to interactive entry, for ARREST and MISSING alike.

---

## 11. Kill list (confirmed dead — do NOT recreate) & deferred

**Dead:** `records.data` jsonb blob · `custom_field_definitions`/`custom_field_values` EAV pair · `compilations.record_ids` array · `legacy_import_batches` + `legacy_amendments` · all 32 views + `mv_record_stats` · entire `rpt` schema (dims/facts/bridges/sync_log) + ETL/scheduler/backfill · in-code TRANSITIONS object · in-memory report-template array + orphan HTML files · 18 row-mutating field migrations (migrations are schema-only forever) · `users.station_id` name · JSON-in-text columns · `varchar(36)` ids and stray serials · CLI-arg DB credentials to python_worker.

**Deferred (additive later, none require redesign):** cross-record person identity (`identities` + nullable `persons.identity_id` + matching) · Hindi labels (additive columns / translations table; notifications params already i18n-ready) · old-PS read-back after transfer (scope-logic join through record_transfers) · warehouse/heavy analytics (targeted matviews first, in `public`) · admin UI for workflow/fields/proformas (edits the same config tables) · zone/range stamping on records (backfill script when zone-level proformas exist).

---

## 12. Success criteria → schema facts
1. `\dt` self-explanatory → every domain fact has a named typed home (§2–§8).
2. Exactly ONE typed schema of record data → the detail tables; views/facts/python sheets re-typings all dead (§11).
3. Migrations schema-only; config diffs in git under `config/` (§6).
4. Every dropdown value an enforced FK (§8 upward FKs); every business key UNIQUE (fir business key §2.2, revision key §4.3, ref codes §8, field_key, usernames/badges, link triple).
5. `grep -r "data->>"` ≈ nothing (§9.1 maps every key to a typed home).
6. Revision hash-chain verification passes continuously (§4.3).
