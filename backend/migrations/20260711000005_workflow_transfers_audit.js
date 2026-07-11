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
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS record_amendments;
    DROP TABLE IF EXISTS workflow_transitions_config;
    DROP TABLE IF EXISTS workflow_transitions;
    DROP TABLE IF EXISTS record_revisions;
    DROP TABLE IF EXISTS fir_number_counters;
    DROP TABLE IF EXISTS record_transfers;
  `);
}
