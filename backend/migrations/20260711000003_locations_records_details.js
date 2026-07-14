// Fresh schema (DB restructure 2026-07) — 3/6: locations, records spine, 5 typed detail tables, record_offences.
// Spec: docs/db-audit/DB_SCHEMA.md §2 + §3.5. records.data jsonb is DEAD — every field has a typed home.

export async function up(knex) {
  await knex.raw(`
    -- §3.5 shared structured place/address table; one row per use, owned by exactly one referencing row
    CREATE TABLE locations (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      house_no            varchar(100),
      street              varchar(150),
      colony              varchar(150),
      landmark            varchar(150),
      city_town_village   varchar(150),
      tehsil_block_mandal varchar(150),
      district            varchar(100),
      state               varchar(100),
      country             varchar(100),
      police_station      varchar(150),
      pincode             varchar(10),
      latitude            numeric(9,6),
      longitude           numeric(9,6),
      full_address        varchar(500),
      extra               jsonb NOT NULL DEFAULT '{}',
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_locations_pincode ON locations (pincode);
    CREATE INDEX idx_locations_city    ON locations (city_town_village);

    -- §2.1 the spine. current_status legal set = workflow_transitions_config (no CHECK by design)
    CREATE TABLE records (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_type    varchar(20) NOT NULL CHECK (record_type IN ('CASE','ARREST','PCR_CALL','MISSING','UIDB')),
      ps_id          uuid NOT NULL REFERENCES hierarchy_nodes(id),
      district_id    uuid NOT NULL REFERENCES hierarchy_nodes(id),
      sub_div_id     uuid REFERENCES hierarchy_nodes(id),
      io_id          uuid REFERENCES investigating_officers(id),
      original_ps_id uuid REFERENCES hierarchy_nodes(id),
      current_status varchar(30) NOT NULL DEFAULT 'DRAFT',
      current_level  varchar(20) NOT NULL DEFAULT 'PS' CHECK (current_level IN ('PS','DISTRICT','JCP','SCP','HQ')),
      record_date    date NOT NULL,
      is_frozen      boolean NOT NULL DEFAULT false,
      is_legacy      boolean NOT NULL DEFAULT false,
      source_system  varchar(100),
      legacy_ref     varchar(255),
      imported_at    timestamptz,
      imported_by    uuid REFERENCES users(id),
      created_by     uuid NOT NULL REFERENCES users(id),
      updated_by     uuid REFERENCES users(id),
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_records_ps_type_date  ON records (ps_id, record_type, record_date DESC);
    CREATE INDEX idx_records_district_type ON records (district_id, record_type);
    CREATE INDEX idx_records_status        ON records (current_status);
    CREATE INDEX idx_records_date          ON records (record_date DESC);
    CREATE INDEX idx_records_io            ON records (io_id);

    -- §2.2 CASE. fir_details.ps_id = deliberate denormalization #3 (carries the business key)
    CREATE TABLE fir_details (
      record_id                uuid PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
      ps_id                    uuid NOT NULL REFERENCES hierarchy_nodes(id),
      fir_no                   varchar(50),
      fir_year                 smallint,
      original_fir_no          varchar(50),
      original_fir_year        smallint,
      fir_date                 date,
      gd_no                    varchar(50),
      gd_date                  date,
      gd_time                  time,
      case_type                varchar(50),
      source_reference         varchar(255),
      beat_id                  varchar(20) REFERENCES ref.beats(beat_cd),
      is_important             boolean NOT NULL DEFAULT false,
      case_status              varchar(50),
      is_worked_out            boolean,
      worked_out_date          date,
      local_head_id            int REFERENCES ref.local_heads(local_head_cd),
      brief_facts              text,
      occurrence_location_id   uuid REFERENCES locations(id),
      occurrence_from_datetime timestamptz,
      occurrence_to_datetime   timestamptz,
      info_received_at_ps      timestamptz,
      organised_crime          boolean,
      cd_uploaded_24h          boolean,
      footage_collected        boolean,
      rc_no                    varchar(50),
      disposal_type            varchar(50),
      extra                    jsonb NOT NULL DEFAULT '{}',
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now(),
      UNIQUE (ps_id, fir_year, fir_no)
    );
    CREATE INDEX idx_fir_details_date       ON fir_details (fir_date);
    CREATE INDEX idx_fir_details_local_head ON fir_details (local_head_id);

    -- §2.3 ARREST. is_dd_based = arrest-basis discriminator (ruling 18); requiredness is config, not a CHECK
    CREATE TABLE arrest_details (
      record_id                   uuid PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
      gd_no                       varchar(50),
      gd_date                     date,
      gd_time                     time,
      case_type                   varchar(50),
      case_status                 varchar(50),
      fir_no                      varchar(50),
      fir_date                    date,
      is_dd_based                 boolean,
      local_head_id               int REFERENCES ref.local_heads(local_head_cd),
      beat_id                     varchar(20) REFERENCES ref.beats(beat_cd),
      intimation_datetime         timestamptz,
      intimated_relative_name     varchar(100),
      intimated_relative_relation varchar(50),
      intimation_mode             varchar(50),
      nafis_prepared              boolean,
      dossier_prepared            boolean,
      arresting_officer_name      varchar(100),
      arresting_officer_mobile    varchar(20),
      custody_status              varchar(50),
      other_status_reason         varchar(255),
      recovery                    text,
      seizure_desc                text,
      scheme_of_arrest            varchar(100),
      integrated_pi               boolean,
      group_patrolling            boolean,
      cycle_patrolling            boolean,
      by_antisnatching_team       boolean,
      by_prahari                  boolean,
      by_eyes_ears_scheme_members boolean,
      extra                       jsonb NOT NULL DEFAULT '{}',
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_arrest_details_local_head ON arrest_details (local_head_id);
    CREATE INDEX idx_arrest_details_fir_no     ON arrest_details (fir_no);

    -- §2.4 PCR_CALL
    CREATE TABLE pcr_call_details (
      record_id              uuid PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
      pcr_no                 varchar(50),
      gd_no                  varchar(50),
      gd_date                date,
      gd_time                time,
      call_head              varchar(100),
      call_gist              text,
      incident_location_id   uuid REFERENCES locations(id),
      occurrence_location_id uuid REFERENCES locations(id),
      incident_datetime      timestamptz,
      arrival_time           time,
      action_taken           text,
      final_call_status      varchar(50),
      extra                  jsonb NOT NULL DEFAULT '{}',
      created_at             timestamptz NOT NULL DEFAULT now(),
      updated_at             timestamptz NOT NULL DEFAULT now()
    );

    -- §2.5 MISSING
    CREATE TABLE missing_details (
      record_id       uuid PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
      gd_no           varchar(50),
      gd_date         date,
      missing_type    varchar(50),
      missing_status  varchar(50),
      operator_name   varchar(100),
      source          varchar(100),
      zipnet_no       varchar(50),
      case_registered boolean,
      fir_no          varchar(50),
      fir_date        date,
      remarks         text,
      extra           jsonb NOT NULL DEFAULT '{}',
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    -- §2.6 UIDB
    CREATE TABLE uidb_details (
      record_id              uuid PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
      uidb_no                varchar(50),
      gd_no                  varchar(50),
      gd_date                date,
      inquest_sections       varchar(255),
      local_head_id          int REFERENCES ref.local_heads(local_head_cd),
      found_date             date,
      found_time             time,
      found_location_id      uuid REFERENCES locations(id),
      duty_officer           varchar(100),
      zipnet_no              varchar(50),
      identified             boolean,
      cause_of_death         varchar(255),
      deceased_relative_name varchar(100),
      deceased_relation_type varchar(50),
      filed_by_acp_sdm       boolean,
      filed_by_acp_sdm_date  date,
      mortuary_remarks       text,
      uidb_status            varchar(50),
      extra                  jsonb NOT NULL DEFAULT '{}',
      created_at             timestamptz NOT NULL DEFAULT now(),
      updated_at             timestamptz NOT NULL DEFAULT now()
    );

    -- §2.7 flat multi-offence table (rulings 15+17): one row PER SECTION CITATION, deliberate 1NF
    CREATE TABLE record_offences (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id      uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      act_id         int REFERENCES ref.acts(act_cd),
      other_act_name varchar(255),
      section_id     text REFERENCES ref.sections(section_code),
      major_head_id  int REFERENCES ref.major_heads(major_head_code),
      minor_head_id  int REFERENCES ref.minor_heads(minor_head_cd),
      is_primary     boolean NOT NULL DEFAULT false,
      sort_order     int NOT NULL DEFAULT 0,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      CHECK (act_id IS NOT NULL OR other_act_name IS NOT NULL)
    );
    CREATE UNIQUE INDEX uq_record_offences_primary ON record_offences (record_id) WHERE is_primary;
    CREATE UNIQUE INDEX uq_record_offences_dedup   ON record_offences (record_id, act_id, section_id)
      WHERE section_id IS NOT NULL;
    CREATE INDEX idx_record_offences_record  ON record_offences (record_id);
    CREATE INDEX idx_record_offences_section ON record_offences (section_id);
    CREATE INDEX idx_record_offences_major   ON record_offences (major_head_id);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS record_offences;
    DROP TABLE IF EXISTS uidb_details;
    DROP TABLE IF EXISTS missing_details;
    DROP TABLE IF EXISTS pcr_call_details;
    DROP TABLE IF EXISTS arrest_details;
    DROP TABLE IF EXISTS fir_details;
    DROP TABLE IF EXISTS records;
    DROP TABLE IF EXISTS locations;
  `);
}
