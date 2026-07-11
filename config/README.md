# config/ — Config-as-Data (single source of truth in git)

Everything that is *configuration* — form fields, workflow rules, proforma templates,
level data contracts, org hierarchy, ref overlays — is authored HERE and synced into the
DB. Migrations are schema-only forever (`DB_SCHEMA.md` §0/§6). Never edit these DB tables
by hand or by migration; edit the JSON and re-run the sync command.

| Directory | Command | DB table | Upsert key |
|---|---|---|---|
| `fields/*.json` | `npm run sync-config` | `field_registry` | `field_key` |
| `workflow/*.json` | `npm run sync-config` | `workflow_transitions_config` | `code` |
| `proformas/*.json` (one file per proforma) | `npm run sync-config` | `report_templates` | `code` |
| `contracts/*.json` | `npm run sync-config` | `level_data_contracts` | `code` |
| `org/hierarchy.json` | `npm run load-ref` | `hierarchy_nodes` | `code` |
| `ref-data/Menu_Tables.xlsx` + `ref-overlays/` | `npm run load-ref` | `ref.*` (21 tables) | natural codes |

Both commands run from `backend/`. Sync is idempotent (sha256 `checksum` per row —
unchanged rows are no-ops); rows removed from config are **deactivated**, never deleted.
`sync-config` validates every storage mapping against the live schema and fails loudly.

## `storage` mapping shapes (field_registry)

Every field carries exactly one `storage` mapping — the write path splits the submitted
form into typed rows purely from these (no hardcoded field lists anywhere else):

| Shape | Meaning |
|---|---|
| `{"table": T, "column": C}` | scalar column on a named table (`fir_details`, `investigating_officers`, …). `"$detail"` as T = the record type's own detail table (field must exist on the detail table of every record_type it applies to) |
| `{"per_type": {RECORD_TYPE: <shape>}}` | dispatch wrapper when the home differs per record type (e.g. `status` → case_status / missing_status / …) |
| `{"entity": "person", "role": R, "column": C}` | column on the persons row of that role — C may live on `persons` or its 1:1 subtypes (`arrestee_details`, `missing_person_details`, `person_descriptions`); optional `"name_part": 1\|2\|3` composes first/middle/last into the single `persons.name` |
| `{"entity": "person", "role": R, "extra": true}` | that persons row's `extra` jsonb pocket |
| `{"entity": "property", "column": C}` | column on the `record_properties` repeater row; `{"extra": true}` = its `extra` pocket; `"group": "vehicle"` = the CASE form's flat vehicle block that maps to ONE property row |
| `{"entity": "offence", "column": C}` | `record_offences` (one row per section citation, §2.7); optional `"act_group"` (ipc/excise/arms/gambling/other) ties the form's per-act pickers to that act's rows; `"primary": true` = the `is_primary` row (single-head classification) |
| `{"entity": "location", "slot": S, "column": C, "role"?: R}` | address-block component routed into the owning row's `locations` row for that slot (occurrence/present/permanent/incident/found/missing/arrest); `role` names whose person-attached location it is |
| `"extra"` | the record's detail-table `extra` jsonb pocket (second-class: invisible to the report engine; promotion path in DB_SCHEMA.md §9.2) |
| `"ui_only"` | rendered in the form, never persisted (derived/control fields, e.g. `occurrence_time_type` — Known/Unknown is derived from the occurrence datetimes at read) |

The leaf shapes are DB_SCHEMA.md §6.1's four; `per_type`/`$detail`/`offence`/`ui_only`
are implementation-phase dispatch extensions recorded in `docs/db-audit/HANDOFF.md`.

## Workflow config notes

`to_status: "@PRIOR"` on the transfer accept/reject rows = restore
`record_transfers.prior_status/prior_level` (ruling 1) — the state machine reads the
transfer row, not a fixed target. `from_status: "*"` = any active status (transfer
initiation). The DISTRICT→HQ skip is expressed by `level_data_contracts` route
overrides, not by extra transition rows.

## Ref overlays

`ref-overlays/local_head_categories.json` — curated `crime_category` per local head
(ruling 16). Applied by `load-ref` after the sheet load; aborts on unknown codes.
Heads not listed default to `OTHER`.

## Adding a field

- **No-deploy** (`storage: "extra"`): add the JSON entry, `npm run sync-config`. Done.
- **Typed**: add the entry AND the `ADD COLUMN` migration together; promotion from
  `extra` must value-copy (`DB_SCHEMA.md` §9.2).
