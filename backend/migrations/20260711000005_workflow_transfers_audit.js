// Fresh schema (DB restructure 2026-07) — 5/6: transfers, FIR allocator, revisions (hash chain),
// transition ledger + config, amendments, audit. Spec: docs/db-audit/DB_SCHEMA.md §4.

export async function up(knex) {
  await knex.raw(`
    -- §4.1 first-class transfers, two-step handshake
    CREATE TABLE record_transfers (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id        uuid NOT NULL REFERENCES records(id),
      from_ps_id       uuid NOT NULL REFERENCES hierarchy_nodes(id),
      to_ps_id         uuid NOT NULL REFERENCES hierarchy_nodes(id),
      initiated_by     uuid NOT NULL REFERENCES users(id),
      initiated_at     timestamptz NOT NULL DEFAULT now(),
      reason           text NOT NULL,
      order_ref        varchar(100),
      status           varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
      prior_status     varchar(30) NOT NULL,
      prior_level      varchar(20) NOT NULL,
      assigned_fir_no  varchar(50),
      assigned_fir_year smallint,
      decided_by       uuid REFERENCES users(id),
      decided_at       timestamptz,
      decision_comment text,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_record_transfers_record ON record_transfers (record_id, initiated_at);
    CREATE INDEX idx_record_transfers_to_ps  ON record_transfers (to_ps_id, status);

    -- §4.2 FIR number allocator (row-locked increment; fir_details UNIQUE is the backstop)
    CREATE TABLE fir_number_counters (
      ps_id      uuid NOT NULL REFERENCES hierarchy_nodes(id),
      fir_year   smallint NOT NULL,
      last_no    int NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (ps_id, fir_year)
    );

    -- §4.3 append-only ledger + tamper-evident hash chain (single write path computes hashes)
    CREATE TABLE record_revisions (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id       uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      revision_number int NOT NULL,
      change_type     varchar(30) NOT NULL CHECK (change_type IN
                        ('CREATE','UPDATE','STATUS_CHANGE','LEVEL_TRANSITION',
                         'HEAD_OVERRIDE','TRANSFER','AMENDMENT','IMPORT')),
      field_changes   jsonb NOT NULL DEFAULT '[]',
      level           varchar(20) NOT NULL DEFAULT 'PS',
      changed_by      uuid NOT NULL REFERENCES users(id),
      changed_at      timestamptz NOT NULL DEFAULT now(),
      comment         text,
      reason          text,
      ip_address      varchar(45),
      prev_hash       char(64) NOT NULL,
      row_hash        char(64) NOT NULL,
      hash_version    smallint NOT NULL DEFAULT 1,
      UNIQUE (record_id, revision_number)
    );
    CREATE INDEX idx_record_revisions_by ON record_revisions (changed_by);
    CREATE INDEX idx_record_revisions_at ON record_revisions (changed_at);

    -- §4.4 append-only transition ledger
    CREATE TABLE workflow_transitions (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id     uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      from_status   varchar(30),
      to_status     varchar(30) NOT NULL,
      from_level    varchar(20),
      to_level      varchar(20),
      action        varchar(30) NOT NULL,
      performed_by  uuid REFERENCES users(id),
      performed_at  timestamptz NOT NULL DEFAULT now(),
      comment       text,
      target_fields jsonb NOT NULL DEFAULT '[]'
    );
    CREATE INDEX idx_workflow_transitions_record ON workflow_transitions (record_id, performed_at);

    -- §4.5 the ONE state machine (synced from config/workflow/*.json)
    CREATE TABLE workflow_transitions_config (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code             varchar(80) NOT NULL UNIQUE,
      record_type      varchar(20) NOT NULL DEFAULT '*',
      from_status      varchar(30) NOT NULL,
      action           varchar(30) NOT NULL,
      to_status        varchar(30) NOT NULL,
      from_level       varchar(20),
      to_level         varchar(20),
      allowed_roles    jsonb NOT NULL DEFAULT '[]',
      requires_comment boolean NOT NULL DEFAULT false,
      sla_hours        int,
      is_active        boolean NOT NULL DEFAULT true,
      checksum         varchar(64),
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

    -- §4.6 amendments (corrections outside normal workflow: legacy imports, HQ-frozen)
    CREATE TABLE record_amendments (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id        uuid NOT NULL REFERENCES records(id),
      requested_by     uuid NOT NULL REFERENCES users(id),
      status           varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
      field_changes    jsonb NOT NULL,
      reason           text NOT NULL,
      decided_by       uuid REFERENCES users(id),
      decided_at       timestamptz,
      decision_comment text,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_record_amendments_record ON record_amendments (record_id, status);

    -- §4.7 generic cross-table audit (record_id has NO FK — generic by design)
    CREATE TABLE audit_logs (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      table_name      varchar(60) NOT NULL,
      record_id       uuid,
      action          varchar(30) NOT NULL,
      changed_by_id   uuid REFERENCES users(id),
      changed_by_role varchar(20),
      changed_at      timestamptz NOT NULL DEFAULT now(),
      field_name      varchar(60),
      old_value       jsonb,
      new_value       jsonb,
      reason          text,
      ip_address      varchar(45)
    );
    CREATE INDEX idx_audit_logs_table  ON audit_logs (table_name, record_id);
    CREATE INDEX idx_audit_logs_by     ON audit_logs (changed_by_id);
    CREATE INDEX idx_audit_logs_at     ON audit_logs (changed_at);

    -- §4.8 typed domain-status change ledger (rulings 22+23): officer-entered
    -- effective_date (diary pivot, backdating expected) vs system changed_at (audit fact)
    -- Ruling 26 (2026-07-20, Integration 5 follow-up / WS8): 'custody_status' added — ARREST's
    -- custody state (arrest_details.case_status) had no entry in this CHECK at all, so it could
    -- never be changed as a dated event (A2 in FUTURE-IMPROVEMENTS.md). Deliberately a DISTINCT
    -- value from 'case_status' (not reused) even though both ultimately write a column literally
    -- named case_status — CASE's own case_status (fir_details) and ARREST's custody status
    -- (arrest_details) are different domain facts and must stay distinguishable in the ledger;
    -- reusing 'case_status' for both would have also left a pre-existing leak un-closed (see
    -- records.service.js's STATUS_FIELD_DEFS comment). Folded into this base migration (pre-launch
    -- fold rule, DB is disposable — never a standalone amendment migration).
    CREATE TABLE record_status_events (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id      uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      property_id    uuid REFERENCES record_properties(id) ON DELETE CASCADE,
      status_field   varchar(30) NOT NULL CHECK (status_field IN
                       ('case_status','missing_status','uidb_status',
                        'final_call_status','property_status','is_worked_out',
                        'custody_status')),
      old_value      varchar(50),
      new_value      varchar(50) NOT NULL,
      effective_date date NOT NULL,
      changed_by     uuid NOT NULL REFERENCES users(id),
      changed_at     timestamptz NOT NULL DEFAULT now(),
      comment        text,
      CHECK ((status_field = 'property_status') = (property_id IS NOT NULL))
    );
    CREATE INDEX idx_record_status_events_record    ON record_status_events (record_id);
    CREATE INDEX idx_record_status_events_effective ON record_status_events (effective_date);
    CREATE INDEX idx_record_status_events_field_eff ON record_status_events (status_field, effective_date);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS record_status_events;
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS record_amendments;
    DROP TABLE IF EXISTS workflow_transitions_config;
    DROP TABLE IF EXISTS workflow_transitions;
    DROP TABLE IF EXISTS record_revisions;
    DROP TABLE IF EXISTS fir_number_counters;
    DROP TABLE IF EXISTS record_transfers;
  `);
}
