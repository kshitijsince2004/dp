// Fresh schema (DB restructure 2026-07) — 6/6: links, compilations, config tables, reporting, import, notifications.
// Spec: docs/db-audit/DB_SCHEMA.md §5–§7.

export async function up(knex) {
  await knex.raw(`
    -- §5.1
    CREATE TABLE link_type_registry (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code               varchar(60) NOT NULL UNIQUE,
      source_record_type varchar(20),
      target_record_type varchar(20),
      label              varchar(100),
      cardinality        varchar(20) NOT NULL DEFAULT 'ONE_TO_MANY',
      is_active          boolean NOT NULL DEFAULT true,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE record_links (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      link_type_id     uuid NOT NULL REFERENCES link_type_registry(id),
      source_record_id uuid NOT NULL REFERENCES records(id),
      target_record_id uuid NOT NULL REFERENCES records(id),
      metadata         jsonb NOT NULL DEFAULT '{}',
      created_by       uuid REFERENCES users(id),
      created_at       timestamptz NOT NULL DEFAULT now(),
      UNIQUE (source_record_id, target_record_id, link_type_id)
    );
    CREATE INDEX idx_record_links_source ON record_links (source_record_id);
    CREATE INDEX idx_record_links_target ON record_links (target_record_id);

    -- §5.2 (record_ids array is DEAD — §5.3 join table wins)
    CREATE TABLE compilations (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_level     varchar(20) NOT NULL,
      target_level     varchar(20) NOT NULL,
      route            varchar(30) NOT NULL DEFAULT 'OPS_CHAIN',
      period           date NOT NULL,
      source_entity_id uuid NOT NULL REFERENCES hierarchy_nodes(id),
      status           varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','ACKNOWLEDGED')),
      compiled_summary jsonb,
      submitted_by     uuid REFERENCES users(id),
      submitted_at     timestamptz,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

    -- §5.3 join table + frozen-snapshot scope
    CREATE TABLE compilation_records (
      compilation_id         uuid NOT NULL REFERENCES compilations(id) ON DELETE CASCADE,
      record_id              uuid NOT NULL REFERENCES records(id),
      ps_id_at_compile       uuid NOT NULL REFERENCES hierarchy_nodes(id),
      district_id_at_compile uuid NOT NULL REFERENCES hierarchy_nodes(id),
      added_at               timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (compilation_id, record_id)
    );
    CREATE INDEX idx_compilation_records_record ON compilation_records (record_id);

    -- §6.1 UI metadata + storage mapping ONLY (no storage role of its own)
    CREATE TABLE field_registry (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      field_key          varchar(60) NOT NULL UNIQUE,
      record_types       jsonb NOT NULL DEFAULT '[]',
      field_type         varchar(20) NOT NULL,
      labels             jsonb NOT NULL,
      section            varchar(60),
      section_labels     jsonb,
      storage            jsonb NOT NULL,
      options            jsonb,
      options_source     varchar(60),
      depends_on         varchar(60),
      show_when          jsonb,
      validation_rules   jsonb,
      visible_to_levels  jsonb NOT NULL DEFAULT '[]',
      editable_by_levels jsonb NOT NULL DEFAULT '[]',
      introduced_at_level varchar(20) DEFAULT 'PS',
      repeater_entity    varchar(20),
      sort_order         real,
      full_width         boolean NOT NULL DEFAULT false,
      readonly           boolean NOT NULL DEFAULT false,
      is_active          boolean NOT NULL DEFAULT true,
      scope_level        varchar(20) NOT NULL DEFAULT 'global',
      scope_id           uuid REFERENCES hierarchy_nodes(id),
      checksum           varchar(64),
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    );

    -- §6.2
    CREATE TABLE level_data_contracts (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code                  varchar(80) NOT NULL UNIQUE,
      from_level            varchar(20) NOT NULL,
      to_level              varchar(20) NOT NULL,
      route                 varchar(30) NOT NULL DEFAULT 'OPS_CHAIN',
      record_type           varchar(20) NOT NULL DEFAULT '*',
      visible_field_keys    jsonb NOT NULL,
      aggregate_definitions jsonb NOT NULL DEFAULT '[]',
      is_active             boolean NOT NULL DEFAULT true,
      checksum              varchar(64),
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now()
    );

    -- §7.1 config-synced proforma catalog
    CREATE TABLE report_templates (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code                varchar(80) NOT NULL UNIQUE,
      name                varchar(150) NOT NULL,
      record_types        jsonb,
      levels              jsonb,
      template_definition jsonb NOT NULL,
      output_formats      jsonb NOT NULL DEFAULT '["PDF"]',
      template_type       varchar(20) NOT NULL DEFAULT 'PROFORMA',
      is_active           boolean NOT NULL DEFAULT true,
      checksum            varchar(64),
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now()
    );

    -- §7.2
    CREATE TABLE report_jobs (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id       uuid REFERENCES report_templates(id),
      filters           jsonb NOT NULL DEFAULT '{}',
      format            varchar(10) NOT NULL,
      status            varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','READY','FAILED')),
      file_path         varchar(500),
      custom_definition jsonb,
      error_message     text,
      created_by        uuid NOT NULL REFERENCES users(id),
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_report_jobs_creator ON report_jobs (created_by, created_at DESC);
    CREATE INDEX idx_report_jobs_status  ON report_jobs (status);

    -- §7.3
    CREATE TABLE scheduled_reports (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id       uuid NOT NULL REFERENCES report_templates(id),
      cron_expr         varchar(50) NOT NULL,
      filter_spec       jsonb NOT NULL DEFAULT '{}',
      format            varchar(10) NOT NULL DEFAULT 'PDF',
      scope_ps_id       uuid REFERENCES hierarchy_nodes(id),
      scope_district_id uuid REFERENCES hierarchy_nodes(id),
      recipients        jsonb NOT NULL DEFAULT '[]',
      is_active         boolean NOT NULL DEFAULT true,
      last_run_at       timestamptz,
      last_run_status   varchar(20),
      created_by        uuid REFERENCES users(id),
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    );

    -- §7.4
    CREATE TABLE report_builder_saved (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        varchar(150) NOT NULL,
      description text,
      query_spec  jsonb NOT NULL,
      is_shared   boolean NOT NULL DEFAULT false,
      created_by  uuid NOT NULL REFERENCES users(id),
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE report_builder_audit (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid REFERENCES users(id),
      user_role   varchar(20),
      run_type    varchar(20),
      table_spec  jsonb,
      fields_spec jsonb,
      filter_spec jsonb,
      format      varchar(10),
      row_count   int,
      job_id      uuid REFERENCES report_jobs(id),
      ip_address  varchar(45),
      created_at  timestamptz NOT NULL DEFAULT now()
    );

    -- §7.5
    CREATE TABLE filter_presets (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name         varchar(150) NOT NULL,
      scope        varchar(20) NOT NULL DEFAULT 'global',
      scope_id     uuid REFERENCES hierarchy_nodes(id),
      filter_spec  jsonb NOT NULL,
      record_types jsonb NOT NULL DEFAULT '[]',
      created_by   uuid REFERENCES users(id),
      is_active    boolean NOT NULL DEFAULT true,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    );

    -- §7.6 (legacy_import_batches is DEAD — is_legacy flag covers it)
    CREATE TABLE import_batches (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_type   varchar(20) NOT NULL,
      is_legacy     boolean NOT NULL DEFAULT false,
      uploaded_by   uuid NOT NULL REFERENCES users(id),
      ps_id         uuid REFERENCES hierarchy_nodes(id),
      district_id   uuid REFERENCES hierarchy_nodes(id),
      file_path     varchar(500),
      total_rows    int NOT NULL DEFAULT 0,
      valid_rows    int NOT NULL DEFAULT 0,
      invalid_rows  int NOT NULL DEFAULT 0,
      imported_rows int NOT NULL DEFAULT 0,
      status        varchar(30) NOT NULL DEFAULT 'VALIDATION_PENDING' CHECK (status IN
                      ('VALIDATION_PENDING','VALIDATED','CONFIRMED','IMPORTED','FAILED','CANCELLED')),
      confirmed_at  timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );

    -- §7.7
    CREATE TABLE import_batch_errors (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id      uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      row_number    int NOT NULL,
      field_key     varchar(60),
      error_code    varchar(40),
      error_message text,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_import_batch_errors_batch ON import_batch_errors (batch_id);

    -- §7.8 type + params, rendered via i18n at read time
    CREATE TABLE notifications (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    uuid NOT NULL REFERENCES users(id),
      type       varchar(40) NOT NULL,
      params     jsonb NOT NULL DEFAULT '{}',
      record_id  uuid REFERENCES records(id),
      is_read    boolean NOT NULL DEFAULT false,
      read_at    timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

    -- §7.9 system bookkeeping (e.g. ref-source checksum for the startup auto-loader)
    CREATE TABLE system_meta (
      key        varchar(100) PRIMARY KEY,
      value      jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS system_meta;
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS import_batch_errors;
    DROP TABLE IF EXISTS import_batches;
    DROP TABLE IF EXISTS filter_presets;
    DROP TABLE IF EXISTS report_builder_audit;
    DROP TABLE IF EXISTS report_builder_saved;
    DROP TABLE IF EXISTS scheduled_reports;
    DROP TABLE IF EXISTS report_jobs;
    DROP TABLE IF EXISTS report_templates;
    DROP TABLE IF EXISTS level_data_contracts;
    DROP TABLE IF EXISTS field_registry;
    DROP TABLE IF EXISTS compilation_records;
    DROP TABLE IF EXISTS compilations;
    DROP TABLE IF EXISTS record_links;
    DROP TABLE IF EXISTS link_type_registry;
  `);
}
