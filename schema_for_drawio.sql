-- Source: 20260711000001_org_identity.js
CREATE TABLE hierarchy_nodes (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      node_type   varchar(30) NOT NULL CHECK (node_type IN ('HQ','ZONE','RANGE','DISTRICT','SUB_DIV','PS')),
      name        varchar(150) NOT NULL,
      code        varchar(30) NOT NULL UNIQUE,
      parent_id   uuid REFERENCES hierarchy_nodes(id),
      metadata    jsonb NOT NULL DEFAULT '{}',
      is_active   boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_hierarchy_nodes_parent ON hierarchy_nodes (parent_id);
    CREATE INDEX idx_hierarchy_nodes_type   ON hierarchy_nodes (node_type);

    CREATE TABLE users (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username      varchar(50) NOT NULL UNIQUE,
      badge_no      varchar(50) NOT NULL UNIQUE,
      name          varchar(100) NOT NULL,
      password_hash varchar(255) NOT NULL,
      role          varchar(20) NOT NULL CHECK (role IN
                      ('HC','SHO','ACP','DISTRICT_OFFICER','JCP','SCP','HQ_ANALYST','HQ_ADMIN','SYSTEM_ADMIN')),
      ps_id         uuid REFERENCES hierarchy_nodes(id),
      district_id   uuid REFERENCES hierarchy_nodes(id),
      sub_div_id    uuid REFERENCES hierarchy_nodes(id),
      is_active     boolean NOT NULL DEFAULT true,
      last_login    timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_users_ps       ON users (ps_id);
    CREATE INDEX idx_users_district ON users (district_id);
    CREATE INDEX idx_users_role     ON users (role);

    CREATE TABLE investigating_officers (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid REFERENCES users(id),
      name        varchar(100) NOT NULL,
      rank        varchar(50),
      pis_no      varchar(50),
      mobile      varchar(20),
      ps_id       uuid REFERENCES hierarchy_nodes(id),
      is_active   boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX uq_io_pis_no    ON investigating_officers (pis_no) WHERE pis_no IS NOT NULL;
    CREATE INDEX idx_io_ps_active       ON investigating_officers (ps_id, is_active);

-- Source: 20260711000002_ref_schema.js
CREATE SCHEMA ref;

    CREATE TABLE ref.acts (
      act_cd     int PRIMARY KEY,
      act_long   text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- PK = section_code (verified unique; act_sec_cd is NOT a key and NOT an act FK)
    CREATE TABLE ref.sections (
      section_code  text PRIMARY KEY,
      section_cd    varchar(50),
      act_sec_cd    varchar(50) NOT NULL,
      section       varchar(200),
      section_desc  text,
      pnsh_gt_7yrs  boolean,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.major_heads (
      major_head_code int PRIMARY KEY,
      major_head      varchar(200) NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    -- PK = minor_head_cd alone (verified unique); composite kept as backstop
    CREATE TABLE ref.minor_heads (
      minor_head_cd   int PRIMARY KEY,
      major_head_code int NOT NULL REFERENCES ref.major_heads(major_head_code),
      minor_head      varchar(200) NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      UNIQUE (major_head_code, minor_head_cd)
    );

    -- loader quarantines source-dirty rows (~656/2136) whose refs don't exist; FKs stay enforced
    CREATE TABLE ref.major_minor_mapping (
      sec_mjrhd_cd    int PRIMARY KEY,
      act_cd          int NOT NULL REFERENCES ref.acts(act_cd),
      section_code    text NOT NULL REFERENCES ref.sections(section_code),
      major_head_code int NOT NULL REFERENCES ref.major_heads(major_head_code),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_ref_mmm_act_section ON ref.major_minor_mapping (act_cd, section_code);

    -- crime_category = curated overlay (config/ref-overlays/local_head_categories.json), ruling 16
    CREATE TABLE ref.local_heads (
      local_head_cd  int PRIMARY KEY,
      local_head     varchar(200) NOT NULL,
      crime_category varchar(15) NOT NULL DEFAULT 'OTHER'
                       CHECK (crime_category IN ('HEINOUS','NON_HEINOUS','OTHER')),
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );

    -- PK = beat_cd (verified globally unique). ps_id NULLable until the official
    -- PS-code mapping file is re-supplied (REF_KEY_VERIFICATION.md); then backfill + SET NOT NULL.
    CREATE TABLE ref.beats (
      beat_cd      varchar(20) PRIMARY KEY,
      beat_name    text NOT NULL,
      source_ps_cd varchar(20) NOT NULL,
      ps_id        uuid REFERENCES hierarchy_nodes(id),
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (ps_id, beat_cd)
    );
    CREATE INDEX idx_ref_beats_ps        ON ref.beats (ps_id);
    CREATE INDEX idx_ref_beats_source_ps ON ref.beats (source_ps_cd);

    -- merger of former property_types (10) + other_property_categories (16):
    -- identical shape, disjoint parent_cd spaces, items FK resolves against exactly their union
    CREATE TABLE ref.property_categories (
      parent_cd      int PRIMARY KEY,
      parent_srno    int NOT NULL UNIQUE,
      code_type      varchar(100),
      parent_type    varchar(100),
      major_property int,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.other_property_items (
      property_cd        int PRIMARY KEY,
      parent_cd          int NOT NULL REFERENCES ref.property_categories(parent_cd),
      property_type_srno varchar(20),
      property           varchar(200) NOT NULL,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_ref_opi_parent ON ref.other_property_items (parent_cd);

    CREATE TABLE ref.arms_categories (
      arms_category_cd int PRIMARY KEY,
      arms_category    varchar(100) NOT NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.arms_made (
      arms_made_cd int PRIMARY KEY,
      arms_made    varchar(100) NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.fire_arms (
      fire_arms_cd     int PRIMARY KEY,
      arms_category_cd int NOT NULL REFERENCES ref.arms_categories(arms_category_cd),
      fire_arms        varchar(150) NOT NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

    -- 4th section of the ARMS sheet (the old loader mis-filed these 215 rows into fire_arms)
    CREATE TABLE ref.fire_arms_subtypes (
      arms_subtype_cd int PRIMARY KEY,
      arms_type_cd    int NOT NULL REFERENCES ref.fire_arms(fire_arms_cd),
      arms_subtype    varchar(150) NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.automobiles (
      automobile_cd int PRIMARY KEY,
      automobile    varchar(150) NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.jewelry_types (
      jewelry_type_cd int PRIMARY KEY,
      jewelry_type    varchar(150) NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.currency_types (
      currency_type_cd int PRIMARY KEY,
      currency_type    varchar(150) NOT NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.document_types (
      document_type_cd int PRIMARY KEY,
      document_type    varchar(150) NOT NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.drug_types (
      drug_type_cd int PRIMARY KEY,
      drug_type    varchar(150) NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.electric_goods (
      electric_goods_cd int PRIMARY KEY,
      electric_goods    varchar(150) NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.explosive_types (
      explosive_type_cd int PRIMARY KEY,
      explosive_type    varchar(150) NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ref.cultural_properties (
      cultural_prop_cd int PRIMARY KEY,
      cultural_prop    varchar(150) NOT NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

-- Source: 20260711000003_locations_records_details.js
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
      arresting_officer_rank      varchar(50),
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

-- Source: 20260711000004_persons_properties.js
-- §3.1 one row per participant per record (per-record identity)
    CREATE TABLE persons (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id            uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      role                 varchar(20) NOT NULL CHECK (role IN
                             ('COMPLAINANT','ACCUSED','VICTIM','WITNESS','ARRESTEE',
                              'MISSING','DECEASED','INFORMANT','CALLER','IO')),
      name                 varchar(100),
      relative_name        varchar(100),
      relation_type        varchar(20) CHECK (relation_type IN
                             ('FATHER','MOTHER','HUSBAND','WIFE','GUARDIAN','OTHER')),
      gender               varchar(20) CHECK (gender IN ('MALE','FEMALE','TRANSGENDER','OTHER','UNKNOWN')),
      age                  smallint,
      dob                  date,
      is_minor             boolean GENERATED ALWAYS AS (age < 18) STORED,
      nick_names           jsonb NOT NULL DEFAULT '[]',
      mobile               varchar(20),
      qualification        varchar(50),
      present_location_id  uuid REFERENCES locations(id),
      perm_location_id     uuid REFERENCES locations(id),
      perm_same_as_present boolean NOT NULL DEFAULT false,
      relation_to_subject  varchar(50),
      sort_order           int NOT NULL DEFAULT 0,
      extra                jsonb NOT NULL DEFAULT '{}',
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_persons_record_role ON persons (record_id, role);
    CREATE INDEX idx_persons_name        ON persons (name);
    CREATE INDEX idx_persons_mobile      ON persons (mobile);

    -- §3.2 role subtypes
    CREATE TABLE arrestee_details (
      person_id              uuid PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
      arrest_date            date,
      arrest_time            time,
      arrest_location_id     uuid REFERENCES locations(id),
      prev_involvement_count int,
      prev_involvement       text,
      is_po                  boolean,
      po_declared_court      varchar(100),
      po_case_reference      varchar(100),
      is_bc                  boolean,
      created_at             timestamptz NOT NULL DEFAULT now(),
      updated_at             timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE missing_person_details (
      person_id           uuid PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
      missing_date        date,
      missing_location_id uuid REFERENCES locations(id),
      last_seen_place     text,
      found_date          date,
      found_location_id   uuid REFERENCES locations(id),
      mp_known            boolean,
      mental_state        varchar(100),
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now()
    );

    -- §3.3 shared physical-description subtype (roles MISSING + DECEASED)
    CREATE TABLE person_descriptions (
      person_id            uuid PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
      height               varchar(50),
      built                varchar(50),
      complexion           varchar(50),
      face                 varchar(50),
      hair                 varchar(50),
      beard                varchar(50),
      moustache            varchar(50),
      upper_dress_color    varchar(50),
      lower_dress_color    varchar(50),
      identification_marks text,
      physical_description text,
      age_range            varchar(20),
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now()
    );

    -- §3.4 base + category-specific FK columns (no per-category subtables)
    CREATE TABLE record_properties (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id            uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      person_id            uuid REFERENCES persons(id) ON DELETE SET NULL,
      major_category_id    int REFERENCES ref.property_categories(parent_cd),
      minor_category_id    int REFERENCES ref.other_property_items(property_cd),
      status               varchar(20) NOT NULL DEFAULT 'STOLEN' CHECK (status IN
                             ('STOLEN','RECOVERED','SEIZED','INTACT','UNCLAIMED','INVOLVED')),
      details              text,
      uid                  varchar(100),
      estimated_value      numeric(14,2),
      automobile_id        int REFERENCES ref.automobiles(automobile_cd),
      fire_arm_id          int REFERENCES ref.fire_arms(fire_arms_cd),
      arms_subtype_id      int REFERENCES ref.fire_arms_subtypes(arms_subtype_cd),
      arms_made_id         int REFERENCES ref.arms_made(arms_made_cd),
      jewelry_type_id      int REFERENCES ref.jewelry_types(jewelry_type_cd),
      currency_type_id     int REFERENCES ref.currency_types(currency_type_cd),
      document_type_id     int REFERENCES ref.document_types(document_type_cd),
      drug_type_id         int REFERENCES ref.drug_types(drug_type_cd),
      electric_good_id     int REFERENCES ref.electric_goods(electric_goods_cd),
      explosive_type_id    int REFERENCES ref.explosive_types(explosive_type_cd),
      cultural_property_id int REFERENCES ref.cultural_properties(cultural_prop_cd),
      phone_number         varchar(50),
      phone_make           varchar(100),
      phone_model          varchar(100),
      phone_imei           varchar(50),
      phone_color          varchar(50),
      vehicle_no           varchar(50),
      vehicle_make         varchar(100),
      vehicle_model        varchar(100),
      vehicle_color        varchar(50),
      vehicle_chassis_no   varchar(100),
      vehicle_engine_no    varchar(100),
      sort_order           int NOT NULL DEFAULT 0,
      extra                jsonb NOT NULL DEFAULT '{}',
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_record_properties_record   ON record_properties (record_id);
    CREATE INDEX idx_record_properties_person   ON record_properties (person_id);
    CREATE INDEX idx_record_properties_category ON record_properties (major_category_id);
    CREATE INDEX idx_record_properties_status   ON record_properties (status);
    CREATE INDEX idx_record_properties_vehicle  ON record_properties (vehicle_no);
    CREATE INDEX idx_record_properties_imei     ON record_properties (phone_imei);

-- Source: 20260711000005_workflow_transfers_audit.js
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

-- Source: 20260711000006_links_compilation_config_reporting.js
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
    -- processed_rows/error_message added Integration 3 WP1 (2026-07-16): async confirm needs
    -- an attempted-row counter distinct from imported_rows (rows can be SKIPPED as duplicates
    -- without being imported) for progress polling, and a human-readable reason when the batch
    -- lands in FAILED.
    CREATE TABLE import_batches (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_type    varchar(20) NOT NULL,
      is_legacy      boolean NOT NULL DEFAULT false,
      uploaded_by    uuid NOT NULL REFERENCES users(id),
      ps_id          uuid REFERENCES hierarchy_nodes(id),
      district_id    uuid REFERENCES hierarchy_nodes(id),
      file_path      varchar(500),
      total_rows     int NOT NULL DEFAULT 0,
      valid_rows     int NOT NULL DEFAULT 0,
      invalid_rows   int NOT NULL DEFAULT 0,
      imported_rows  int NOT NULL DEFAULT 0,
      processed_rows int NOT NULL DEFAULT 0,
      status         varchar(30) NOT NULL DEFAULT 'VALIDATION_PENDING' CHECK (status IN
                      ('VALIDATION_PENDING','VALIDATED','CONFIRMED','IMPORTED','FAILED','CANCELLED')),
      error_message  text,
      confirmed_at   timestamptz,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );

    -- §7.7 severity added Integration 3 WP1 (2026-07-16): legacy imports downgrade
    -- unresolvable ref-label errors to WARNING (import anyway, raw value preserved) instead
    -- of ERROR (row rejected) — see docs/new-db-integration/03-import.md C6.
    CREATE TABLE import_batch_errors (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id      uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      row_number    int NOT NULL,
      field_key     varchar(60),
      error_code    varchar(40),
      severity      varchar(10) NOT NULL DEFAULT 'ERROR' CHECK (severity IN ('ERROR','WARNING')),
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

    -- records.import_batch_id — added Integration 3 WP1 (2026-07-16), here (not in migration
    -- ...0003 where the records spine is created) because it FKs to import_batches, which
    -- doesn't exist until this migration. Completes the provenance set alongside is_legacy/
    -- source_system/legacy_ref/imported_at/imported_by (...0003): legacy_ref carries the
    -- record's canonical source key (parent FIR/GD/DD, or row:<n>) and import_batch_id carries
    -- which batch it came from — together the idempotency key for resumable async confirm
    -- (docs/new-db-integration/03-import.md C4).
    ALTER TABLE records ADD COLUMN import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL;
    CREATE INDEX idx_records_import_batch ON records (import_batch_id);

-- Source: 20260711000006_links_compilation_config_reporting.js
ALTER TABLE records DROP COLUMN IF EXISTS import_batch_id;
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

-- Source: 20260718000001_audit_hash_version_check.js
ALTER TABLE record_revisions
      ADD CONSTRAINT record_revisions_hash_version_known
      CHECK (hash_version IN (1, 2));

-- Source: 20260718000001_audit_hash_version_check.js
ALTER TABLE record_revisions
      DROP CONSTRAINT IF EXISTS record_revisions_hash_version_known;

-- Source: 20260721000001_stat_baselines.js
CREATE TABLE IF NOT EXISTS stat_baselines (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      year           int NOT NULL,
      scope_code     varchar(50) NOT NULL,
      head_code      varchar(100) NOT NULL,
      reported_count int NOT NULL DEFAULT 0,
      solved_count   int NOT NULL DEFAULT 0,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (year, scope_code, head_code)
    );
    CREATE INDEX IF NOT EXISTS idx_stat_baselines_lookup ON stat_baselines (year, scope_code, head_code);

-- Source: 20260721000002_phq_diary_schema.js
CREATE TABLE IF NOT EXISTS ref.units (
      unit_cd      serial        PRIMARY KEY,
      unit         varchar(50)   NOT NULL UNIQUE,
      to_kg_factor numeric(20,10) NOT NULL DEFAULT 1.0,
      created_at   timestamptz   NOT NULL DEFAULT now()
    );

    INSERT INTO ref.units (unit, to_kg_factor) VALUES
      ('kg',       1.0),
      ('gram',     0.001),
      ('mg',       0.000001),
      ('litre',    1.0),
      ('ml',       0.001),
      ('tablet',   0.0005),
      ('capsule',  0.0005),
      ('bottle',   0.75),
      ('packet',   0.1),
      ('strip',    0.005),
      ('sachet',   0.005),
      ('piece',    0.1)
    ON CONFLICT (unit) DO NOTHING;

    ALTER TABLE record_properties
      ADD COLUMN IF NOT EXISTS quantity numeric(14,4),
      ADD COLUMN IF NOT EXISTS unit_cd  int REFERENCES ref.units(unit_cd);

-- Source: 20260721000002_phq_diary_schema.js
ALTER TABLE record_properties
      DROP COLUMN IF EXISTS quantity,
      DROP COLUMN IF EXISTS unit_cd;
    DROP TABLE IF EXISTS ref.units;

-- Source: 20260722000001_add_canonical_code_to_local_heads.js
ALTER TABLE ref.local_heads ADD COLUMN IF NOT EXISTS canonical_code VARCHAR(100);
    ALTER TABLE records ADD COLUMN IF NOT EXISTS registration_date DATE;

    -- Backfill records.registration_date from record_date if null
    UPDATE records SET registration_date = record_date WHERE registration_date IS NULL;

    -- Populate canonical_code on ref.local_heads based on fixed local_head_cd and local_head name matching
    UPDATE ref.local_heads SET canonical_code = CASE local_head_cd
      WHEN 1 THEN 'DACOITY'
      WHEN 2 THEN 'MURDER'
      WHEN 3 THEN 'ATT_TO_MURDER'
      WHEN 4 THEN 'ROBBERY'
      WHEN 5 THEN 'RIOT'
      WHEN 6 THEN 'KID_FOR_RANSOM'
      WHEN 7 THEN 'RAPE'
      ELSE canonical_code
    END;

    UPDATE ref.local_heads SET canonical_code = 'EXTORTION' WHERE local_head ILIKE '%extortion%' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'SNATCHING' WHERE local_head ILIKE '%snatching%' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'HURT' WHERE local_head ~* '\\bhurt\\b' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY' WHERE local_head ILIKE '%burglary%' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'HOUSE_THEFT' WHERE local_head ~* 'house\\s*theft' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'MV_THEFT' WHERE local_head ~* '(motor\\s*vehicle\\s*theft|m\\.?v\\.?\\s*theft|vehicle theft)' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'OTHER_THEFT' WHERE local_head ILIKE '%theft%' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'MO_WOMEN' WHERE local_head ~* '(molestation|outraging|m\\.?o\\.?\\s*women|eve\\s*teas)' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'KIDNAPPING' WHERE local_head ILIKE '%kidnapping%' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'ABDUCTION' WHERE local_head ILIKE '%abduction%' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'FATAL_ACCIDENT' WHERE local_head ~* 'fatal\\s*accident' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'SIMPLE_ACCIDENT' WHERE local_head ~* '(simple\\s*accident|non.?fatal)' AND canonical_code IS NULL;

    UPDATE ref.local_heads SET canonical_code = 'ARMS_ACT' WHERE local_head ~* 'arms\\s*act' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'EXCISE_ACT' WHERE local_head ILIKE '%excise%' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'NDPS_ACT' WHERE local_head ~* '(ndps|narcotic)' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'GAMBLING_ACT' WHERE local_head ILIKE '%gambling%' AND canonical_code IS NULL;
    UPDATE ref.local_heads SET canonical_code = 'POCSO' WHERE local_head ~* '(pocso|protection\\s*of\\s*children)' AND canonical_code IS NULL;

    -- Default any remaining local_heads to UPPER_SNAKE_CASE of local_head text
    UPDATE ref.local_heads SET canonical_code = UPPER(REGEXP_REPLACE(local_head, '[^a-zA-Z0-9]+', '_', 'g'))
    WHERE canonical_code IS NULL;

-- Source: 20260722000001_add_canonical_code_to_local_heads.js
ALTER TABLE ref.local_heads DROP COLUMN IF EXISTS canonical_code;
    ALTER TABLE records DROP COLUMN IF EXISTS registration_date;

-- Source: 20260726000001_repair_legacy_column_drift.js
ALTER TABLE persons ALTER COLUMN gender TYPE varchar(20);

    ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_gender_check;
    ALTER TABLE persons ADD CONSTRAINT persons_gender_check
      CHECK (gender IN ('MALE','FEMALE','TRANSGENDER','OTHER','UNKNOWN'));

    ALTER TABLE record_properties DROP CONSTRAINT IF EXISTS record_properties_status_check;
    ALTER TABLE record_properties ADD CONSTRAINT record_properties_status_check
      CHECK (status IN ('STOLEN','RECOVERED','SEIZED','INTACT','UNCLAIMED','INVOLVED'));

-- Source: 20260816000001_add_missing_canonical_codes.js
-- Unlocks: STAT_1 row 1 (Dacoity)
    UPDATE ref.local_heads SET canonical_code = 'DACOITY' WHERE local_head_cd = 1 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 2 (Murder)
    UPDATE ref.local_heads SET canonical_code = 'MURDER' WHERE local_head_cd = 2 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 3 (Att. to Murder)
    UPDATE ref.local_heads SET canonical_code = 'ATT_TO_MURDER' WHERE local_head_cd = 3 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 4 (Robbery)
    UPDATE ref.local_heads SET canonical_code = 'ROBBERY' WHERE local_head_cd = 4 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 5 (Riots)
    UPDATE ref.local_heads SET canonical_code = 'RIOT' WHERE local_head_cd = 5 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 6 (Kid. for Ransom)
    UPDATE ref.local_heads SET canonical_code = 'KID_FOR_RANSOM' WHERE local_head_cd = 6 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 7 (Rape)
    UPDATE ref.local_heads SET canonical_code = 'RAPE' WHERE local_head_cd = 7 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 8 (Extortion)
    UPDATE ref.local_heads SET canonical_code = 'EXTORTION' WHERE local_head_cd = 8 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 9 (Snatching)
    UPDATE ref.local_heads SET canonical_code = 'SNATCHING' WHERE local_head_cd = 9 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 10 (Fatal Accident)
    UPDATE ref.local_heads SET canonical_code = 'FATAL_ACCIDENT' WHERE local_head_cd = 10 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 11 (Simple Accident)
    UPDATE ref.local_heads SET canonical_code = 'SIMPLE_ACCIDENT' WHERE local_head_cd = 11 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 12 (Burglary Day)
    UPDATE ref.local_heads SET canonical_code = 'DAY_BURGLARY' WHERE local_head_cd = 12 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 13 (Burglary Night)
    UPDATE ref.local_heads SET canonical_code = 'NIGHT_BURGLARY' WHERE local_head_cd = 13 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 14 (Att. Burglary)
    UPDATE ref.local_heads SET canonical_code = 'ATT_BURGLARY' WHERE local_head_cd = 14 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 15 (Att. House Theft)
    UPDATE ref.local_heads SET canonical_code = 'ATT_HOUSE_THEFT' WHERE local_head_cd = 15 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 16 (M.V. Theft)
    UPDATE ref.local_heads SET canonical_code = 'MV_THEFT' WHERE local_head_cd = 16 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 17 (Servant Theft)
    UPDATE ref.local_heads SET canonical_code = 'SERVANT_THEFT' WHERE local_head_cd = 17 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 18 (House Theft)
    UPDATE ref.local_heads SET canonical_code = 'HOUSE_THEFT' WHERE local_head_cd = 18 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 19 (Other Theft)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_THEFT' WHERE local_head_cd = 19 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 20 (Pick Pocketing)
    UPDATE ref.local_heads SET canonical_code = 'PICK_POCKETING' WHERE local_head_cd = 20 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 21 (Cycle Theft)
    UPDATE ref.local_heads SET canonical_code = 'CYCLE_THEFT' WHERE local_head_cd = 21 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 22 (Cattle Theft)
    UPDATE ref.local_heads SET canonical_code = 'CATTLE_THEFT' WHERE local_head_cd = 22 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 23 (Telegraph Wire Theft)
    UPDATE ref.local_heads SET canonical_code = 'TELEGRAPH_WIRE_THEFT' WHERE local_head_cd = 23 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 24 (Cable Theft)
    UPDATE ref.local_heads SET canonical_code = 'CABLE_THEFT' WHERE local_head_cd = 24 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 25 (Electric Fitting Theft)
    UPDATE ref.local_heads SET canonical_code = 'ELECTRIC_FITTING_THEFT' WHERE local_head_cd = 25 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 26 (Property Theft Govt)
    UPDATE ref.local_heads SET canonical_code = 'PROP_THEFT_GOVT' WHERE local_head_cd = 26 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 27 (Theft Running Train)
    UPDATE ref.local_heads SET canonical_code = 'THEFT_RUNNING_TRAIN' WHERE local_head_cd = 27 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 28 (Theft Railway Premises)
    UPDATE ref.local_heads SET canonical_code = 'THEFT_RAILWAY_PREMISES' WHERE local_head_cd = 28 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 29 (Kidnapping)
    UPDATE ref.local_heads SET canonical_code = 'KIDNAPPING' WHERE local_head_cd = 29 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 30 (Abduction)
    UPDATE ref.local_heads SET canonical_code = 'ABDUCTION' WHERE local_head_cd = 30 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 31 (Hurt)
    UPDATE ref.local_heads SET canonical_code = 'HURT' WHERE local_head_cd = 31 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 32 (Assault Public Servant)
    UPDATE ref.local_heads SET canonical_code = 'ASSAULT_PUBLIC_SERVANT' WHERE local_head_cd = 32 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 33 (Wrongful Restraint)
    UPDATE ref.local_heads SET canonical_code = 'WRONGFUL_RESTRAINT' WHERE local_head_cd = 33 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 34 (Wrongful Confinement)
    UPDATE ref.local_heads SET canonical_code = 'WRONGFUL_CONFINEMENT' WHERE local_head_cd = 34 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 35 (Criminal Trespass)
    UPDATE ref.local_heads SET canonical_code = 'CRIMINAL_TRESPASS' WHERE local_head_cd = 35 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 36 (Stalking Outraging Modesty)
    UPDATE ref.local_heads SET canonical_code = 'STALK_OUTRAGING_MODESTY' WHERE local_head_cd = 36 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 37 (M.O. Women)
    UPDATE ref.local_heads SET canonical_code = 'MO_WOMEN' WHERE local_head_cd = 37 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 38 (Cheating)
    UPDATE ref.local_heads SET canonical_code = 'CHEATING' WHERE local_head_cd = 38 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 39 (Forgery)
    UPDATE ref.local_heads SET canonical_code = 'FORGERY' WHERE local_head_cd = 39 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 40 (Counterfeiting)
    UPDATE ref.local_heads SET canonical_code = 'COUNTERFEITING' WHERE local_head_cd = 40 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 41 (Criminal Breach of Trust)
    UPDATE ref.local_heads SET canonical_code = 'CRIMINAL_BREACH_OF_TRUST' WHERE local_head_cd = 41 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 42 (Misappropriation)
    UPDATE ref.local_heads SET canonical_code = 'MISAPPROPRIATION' WHERE local_head_cd = 42 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 43 (Cruelty by Husband)
    UPDATE ref.local_heads SET canonical_code = 'CRUELTY_BY_HUSBAND' WHERE local_head_cd = 43 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 44 (Dowry Death)
    UPDATE ref.local_heads SET canonical_code = 'DOWRY_DEATH' WHERE local_head_cd = 44 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 45 (Dowry Prohibition)
    UPDATE ref.local_heads SET canonical_code = 'DOWRY_PROHIBITION' WHERE local_head_cd = 45 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 46 (Indecent Representation)
    UPDATE ref.local_heads SET canonical_code = 'INDECENCT_REPRESENTATION' WHERE local_head_cd = 46 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 47 (Prostitution ITPA)
    UPDATE ref.local_heads SET canonical_code = 'PROSTITUTION_ITPA' WHERE local_head_cd = 47 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 48 (Arms Act)
    UPDATE ref.local_heads SET canonical_code = 'ARMS_ACT' WHERE local_head_cd = 48 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 49 (Explosive Act)
    UPDATE ref.local_heads SET canonical_code = 'EXPLOSIVE_ACT' WHERE local_head_cd = 49 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 50 (Explosive Substances Act)
    UPDATE ref.local_heads SET canonical_code = 'EXPLOSIVE_SUBSTANCES_ACT' WHERE local_head_cd = 50 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 51 (NDPS Act)
    UPDATE ref.local_heads SET canonical_code = 'NDPS_ACT' WHERE local_head_cd = 51 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 52 (Excise Act)
    UPDATE ref.local_heads SET canonical_code = 'EXCISE_ACT' WHERE local_head_cd = 52 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 53 (Gambling Act)
    UPDATE ref.local_heads SET canonical_code = 'GAMBLING_ACT' WHERE local_head_cd = 53 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 54 (Eve Teasing)
    UPDATE ref.local_heads SET canonical_code = 'EVE_TEASING' WHERE local_head_cd = 54 AND canonical_code IS NULL;

    -- Unlocks: STAT_3 row 55 (POCSO Act)
    UPDATE ref.local_heads SET canonical_code = 'POCSO' WHERE local_head_cd = 55 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 56 (Cyber Crime)
    UPDATE ref.local_heads SET canonical_code = 'CYBER_CRIME' WHERE local_head_cd = 56 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 57 (Organised Crime)
    UPDATE ref.local_heads SET canonical_code = 'ORGANISED_CRIME' WHERE local_head_cd = 57 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 58 (Terrorist Act)
    UPDATE ref.local_heads SET canonical_code = 'TERRORIST_ACT' WHERE local_head_cd = 58 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 59 (Drugging Poisoning)
    UPDATE ref.local_heads SET canonical_code = 'DRUGGING_POISONING' WHERE local_head_cd = 59 AND canonical_code IS NULL;

    -- Unlocks: E-FIR Burglary Day
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY_DAY' WHERE local_head_cd = 209 AND canonical_code IS NULL;

    -- Unlocks: E-FIR Burglary Night
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY_NIGHT' WHERE local_head_cd = 210 AND canonical_code IS NULL;

-- Source: 20260816000002_p0_fix_kalandra_fir_no.js
DELETE FROM record_links rl
    USING link_type_registry lt, records ar, arrest_details ad
    WHERE rl.link_type_id = lt.id
      AND lt.code = 'CASE_ARREST'
      AND rl.target_record_id = ar.id
      AND ad.record_id = ar.id
      AND ad.is_dd_based = true

-- Source: 20260818000001_transfer_fields_and_agencies.js
-- 1. Create ref.agencies table
    CREATE TABLE IF NOT EXISTS ref.agencies (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code        varchar(50) UNIQUE NOT NULL,
      name        varchar(200) NOT NULL,
      category    varchar(50) NOT NULL CHECK (category IN ('INTERNAL', 'NATIONAL', 'INTERNATIONAL', 'STATE')),
      is_active   boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ref_agencies_category ON ref.agencies (category, is_active);

    -- 2. Seed initial comprehensive agencies
    INSERT INTO ref.agencies (code, name, category) VALUES
      -- Internal / State Agencies (Delhi Police & State Bodies)
      ('CRIME_BRANCH', 'Delhi Police Crime Branch', 'INTERNAL'),
      ('SPECIAL_CELL', 'Special Cell, Delhi Police', 'INTERNAL'),
      ('EOW', 'Economic Offences Wing (EOW), Delhi', 'INTERNAL'),
      ('IFSO', 'Cyber Crime Unit (IFSO / Special Cell)', 'INTERNAL'),
      ('DIU', 'District Investigation Unit (DIU)', 'INTERNAL'),
      ('SPECIAL_STAFF', 'Special Staff (District Level)', 'INTERNAL'),
      ('ACB_DELHI', 'Anti-Corruption Branch (ACB), Delhi', 'INTERNAL'),
      ('VIGILANCE_DELHI', 'Directorate of Vigilance, Delhi', 'INTERNAL'),
      ('SPUWAC', 'Special Police Unit for Women & Children (SPUWAC)', 'INTERNAL'),
      ('TRAFFIC_SECURITY', 'Traffic & Security Special Cell', 'INTERNAL'),
      ('STATE_CID', 'State CID / Crime Branch (Other State)', 'STATE'),
      ('STATE_POLICE', 'State Police Headquarters (Other State)', 'STATE'),

      -- National Agencies
      ('CBI', 'Central Bureau of Investigation (CBI)', 'NATIONAL'),
      ('NIA', 'National Investigation Agency (NIA)', 'NATIONAL'),
      ('ED', 'Directorate of Enforcement (ED)', 'NATIONAL'),
      ('NCB', 'Narcotics Control Bureau (NCB)', 'NATIONAL'),
      ('SFIO', 'Serious Fraud Investigation Office (SFIO)', 'NATIONAL'),
      ('DRI', 'Directorate of Revenue Intelligence (DRI)', 'NATIONAL'),
      ('IB', 'Intelligence Bureau (IB)', 'NATIONAL'),
      ('RAW', 'Research and Analysis Wing (R&AW)', 'NATIONAL'),
      ('FIU_IND', 'Financial Intelligence Unit (FIU-IND)', 'NATIONAL'),
      ('CVC', 'Central Vigilance Commission (CVC)', 'NATIONAL'),
      ('CBN', 'Central Bureau of Narcotics (CBN)', 'NATIONAL'),
      ('RPF', 'Railway Protection Force (RPF)', 'NATIONAL'),
      ('NSG', 'National Security Guard (NSG)', 'NATIONAL'),
      ('WCCB', 'Wildlife Crime Control Bureau (WCCB)', 'NATIONAL'),
      ('BSF', 'Border Security Force (BSF)', 'NATIONAL'),
      ('ITBP', 'Indo-Tibetan Border Police (ITBP)', 'NATIONAL'),
      ('SSB', 'Sashastra Seema Bal (SSB)', 'NATIONAL'),
      ('CISF', 'Central Industrial Security Force (CISF)', 'NATIONAL'),
      ('CUSTOMS_CENTRAL', 'Customs & Central Excise Investigation', 'NATIONAL'),
      ('INCOME_TAX_INV', 'Income Tax Investigation Directorate', 'NATIONAL'),

      -- International Agencies
      ('INTERPOL', 'INTERPOL (National Central Bureau - New Delhi)', 'INTERNATIONAL'),
      ('FBI', 'Federal Bureau of Investigation (FBI) - USA', 'INTERNATIONAL'),
      ('SCOTLAND_YARD', 'Scotland Yard / Metropolitan Police - UK', 'INTERNATIONAL'),
      ('EUROPOL', 'Europol (European Union Agency for Law Enforcement)', 'INTERNATIONAL'),
      ('RCMP', 'Royal Canadian Mounted Police (RCMP) - Canada', 'INTERNATIONAL'),
      ('AFP', 'Australian Federal Police (AFP) - Australia', 'INTERNATIONAL'),
      ('DUBAI_POLICE', 'Dubai Police / UAE Ministry of Interior', 'INTERNATIONAL'),
      ('BKA_GERMANY', 'Federal Criminal Police Office (BKA) - Germany', 'INTERNATIONAL')
    ON CONFLICT (code) DO NOTHING;

    -- 3. Add transfer columns to fir_details
    ALTER TABLE fir_details
      ADD COLUMN IF NOT EXISTS transfer_to_type varchar(20) CHECK (transfer_to_type IN ('PS', 'AGENCY', 'Agency')),
      ADD COLUMN IF NOT EXISTS transferred_to_ps_id uuid REFERENCES hierarchy_nodes(id),
      ADD COLUMN IF NOT EXISTS transferred_to_agency_id uuid REFERENCES ref.agencies(id),
      ADD COLUMN IF NOT EXISTS date_of_transfer date;

    CREATE INDEX IF NOT EXISTS idx_fir_details_transferred_ps ON fir_details (transferred_to_ps_id) WHERE transferred_to_ps_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_fir_details_transferred_agency ON fir_details (transferred_to_agency_id) WHERE transferred_to_agency_id IS NOT NULL;

-- Source: 20260818000001_transfer_fields_and_agencies.js
ALTER TABLE fir_details
      DROP COLUMN IF EXISTS transfer_to_type,
      DROP COLUMN IF EXISTS transferred_to_ps_id,
      DROP COLUMN IF EXISTS transferred_to_agency_id,
      DROP COLUMN IF EXISTS date_of_transfer;

    DROP TABLE IF EXISTS ref.agencies CASCADE;

-- Source: 20260818000002_fix_beats_and_ps_metadata.js
COALESCE(metadata, '{}')::jsonb || ?::jsonb`,
          [JSON.stringify({ official_code: officialCode })]
        )
      });
  }

  // 2. Ensure all PS nodes have diary_abbr and diary_order
  const psNodes = await knex('hierarchy_nodes')
    .where('node_type', 'PS')
    .orderBy('name');

  for (let i = 0; i < psNodes.length; i++) {
    const node = psNodes[i];
    const existingMeta = node.metadata || {};
    const abbr = existingMeta.diary_abbr || generateAbbr(node.name);
    const order = existingMeta.diary_order || (i + 1);

    await knex('hierarchy_nodes')
      .where('id', node.id)
      .update({
        metadata: knex.raw(
          `COALESCE(metadata, '{}')::jsonb || ?::jsonb`,
          [JSON.stringify({ diary_abbr: abbr, diary_order: order })]
        )
      });
  }

  // 3. Link unlinked beats
  await knex.raw(`
    UPDATE ref.beats b
    SET ps_id = hn.id
    FROM hierarchy_nodes hn
    WHERE b.ps_id IS NULL
      AND hn.node_type = 'PS'
      AND (
        hn.metadata->>'official_code' = substring(b.beat_cd from 1 for 7)
        OR hn.metadata->>'official_code' = substring(b.beat_cd from 1 for 6)
      );

-- Source: 20260818000002_fix_beats_and_ps_metadata.js
INSERT INTO record_offences (
      id,
      record_id,
      act_id,
      is_primary,
      sort_order,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      r.id,
      4375,
      true,
      1,
      r.created_at,
      r.updated_at
    FROM records r
    WHERE r.record_type IN ('CASE', 'ARREST')
      AND NOT EXISTS (
        SELECT 1 FROM record_offences ro WHERE ro.record_id = r.id
      );

-- Source: 20260818000002_fix_beats_and_ps_metadata.js
WITH ranked_offences AS (
      SELECT id, record_id,
             ROW_NUMBER() OVER(PARTITION BY record_id ORDER BY sort_order ASC, created_at ASC) as rn
      FROM record_offences
      WHERE record_id IN (
        SELECT record_id
        FROM record_offences
        GROUP BY record_id
        HAVING COUNT(*) FILTER (WHERE is_primary = true) = 0
      )
    )
    UPDATE record_offences
    SET is_primary = true
    WHERE id IN (SELECT id FROM ranked_offences WHERE rn = 1);

-- Source: 20260818000002_fix_beats_and_ps_metadata.js
UPDATE records r
    SET ps_id = u.ps_id,
        district_id = u.district_id
    FROM users u
    WHERE u.id = r.created_by
      AND u.role = 'HC'
      AND r.ps_id <> u.ps_id;

-- Source: 20260818000010_missing_diary_fields.js
ALTER TABLE persons
      DROP CONSTRAINT IF EXISTS chk_social_category,
      ADD CONSTRAINT chk_social_category
        CHECK (social_category IN ('SC','ST','OBC','GEN','UNKNOWN')),
      DROP CONSTRAINT IF EXISTS chk_education,
      ADD CONSTRAINT chk_education
        CHECK (education IN (
          'ILLITERATE','SCHOOL_DROPOUT','UP_TO_10TH',
          'UP_TO_12TH','GRADUATE','PROFESSIONAL','UNKNOWN'
        )),
      DROP CONSTRAINT IF EXISTS chk_financial_status,
      ADD CONSTRAINT chk_financial_status
        CHECK (financial_status IN ('BPL','LOWER','MIDDLE','UPPER','UNKNOWN'));

-- Source: 20260818000010_missing_diary_fields.js
ALTER TABLE record_properties
      DROP CONSTRAINT IF EXISTS chk_recovery_agency,
      ADD CONSTRAINT chk_recovery_agency
        CHECK (recovery_agency IN ('POLICE','PUBLIC','ABANDONED','OTHER'));

-- Note: Table victim_injury_details created via knex.schema (builder syntax) in 20260818000010_missing_diary_fields.js
-- Note: Table burglary_mo created via knex.schema (builder syntax) in 20260818000010_missing_diary_fields.js
-- Note: Table units created via knex.schema (builder syntax) in 20260818000010_missing_diary_fields.js
-- Source: 20260818000011_canonical_codes.js
-- Unlocks: STAT_1 / STAT_2 (Dacoity)
    UPDATE ref.local_heads SET canonical_code = 'DACOITY' WHERE local_head_cd = 1 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Murder)
    UPDATE ref.local_heads SET canonical_code = 'MURDER' WHERE local_head_cd = 2 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Att. to Murder)
    UPDATE ref.local_heads SET canonical_code = 'ATT_TO_MURDER' WHERE local_head_cd = 3 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Robbery)
    UPDATE ref.local_heads SET canonical_code = 'ROBBERY' WHERE local_head_cd = 4 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Riot)
    UPDATE ref.local_heads SET canonical_code = 'RIOT' WHERE local_head_cd = 5 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Kid. For Ransom)
    UPDATE ref.local_heads SET canonical_code = 'KID_FOR_RANSOM' WHERE local_head_cd = 6 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Rape)
    UPDATE ref.local_heads SET canonical_code = 'RAPE' WHERE local_head_cd = 7 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Extortion)
    UPDATE ref.local_heads SET canonical_code = 'EXTORTION' WHERE local_head_cd = 8 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Snatching)
    UPDATE ref.local_heads SET canonical_code = 'SNATCHING' WHERE local_head_cd = 9 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Simple Hurt)
    UPDATE ref.local_heads SET canonical_code = 'SIMPLE_HURT' WHERE local_head_cd = 10 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Grievous Hurt)
    UPDATE ref.local_heads SET canonical_code = 'GRIEVOUS_HURT' WHERE local_head_cd = 11 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Burglary)
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY' WHERE local_head_cd = 12 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Violent Burglary)
    UPDATE ref.local_heads SET canonical_code = 'VIOLENT_BURGLARY' WHERE local_head_cd = 13 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Kidnapping)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_KIDNAPPING' WHERE local_head_cd = 14 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Abduction)
    UPDATE ref.local_heads SET canonical_code = 'ABDUCTION' WHERE local_head_cd = 15 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (M.V. Theft)
    UPDATE ref.local_heads SET canonical_code = 'MV_THEFT' WHERE local_head_cd = 16 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Servant Theft)
    UPDATE ref.local_heads SET canonical_code = 'SERVANT_THEFT' WHERE local_head_cd = 17 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (House Theft)
    UPDATE ref.local_heads SET canonical_code = 'HOUSE_THEFT' WHERE local_head_cd = 18 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Other Theft)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_THEFT' WHERE local_head_cd = 19 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Theft in Shop)
    UPDATE ref.local_heads SET canonical_code = 'CULPABLE_HOMICIDE' WHERE local_head_cd = 20 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Pick Pocketing)
    UPDATE ref.local_heads SET canonical_code = 'ATT_CULPABLE_HOMICIDE' WHERE local_head_cd = 21 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Mobile Phone Theft)
    UPDATE ref.local_heads SET canonical_code = 'CRIMINAL_TRESPASS' WHERE local_head_cd = 22 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Cycle Theft)
    UPDATE ref.local_heads SET canonical_code = 'CBT' WHERE local_head_cd = 23 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (M.V. Accessiories Theft)
    UPDATE ref.local_heads SET canonical_code = 'CHEATING' WHERE local_head_cd = 24 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Electricity Theft)
    UPDATE ref.local_heads SET canonical_code = 'FORGERY' WHERE local_head_cd = 25 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Stereo Theft)
    UPDATE ref.local_heads SET canonical_code = 'COUNTERFEITING' WHERE local_head_cd = 26 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Cattle Theft)
    UPDATE ref.local_heads SET canonical_code = 'MISCHIEF' WHERE local_head_cd = 27 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Electronic Articles Theft)
    UPDATE ref.local_heads SET canonical_code = 'ARSON' WHERE local_head_cd = 28 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Simple Accident)
    UPDATE ref.local_heads SET canonical_code = 'THREATENING' WHERE local_head_cd = 29 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Fatal Accident)
    UPDATE ref.local_heads SET canonical_code = 'DOWRY_DEATH' WHERE local_head_cd = 30 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (M.O. Women)
    UPDATE ref.local_heads SET canonical_code = 'ELECTION_OFFENCES' WHERE local_head_cd = 31 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Flesh Trade)
    UPDATE ref.local_heads SET canonical_code = 'PREP_OF_DACOITY' WHERE local_head_cd = 32 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Culpable Homicide not Amounting to Murder)
    UPDATE ref.local_heads SET canonical_code = 'ACID_ATTACK' WHERE local_head_cd = 33 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Att. to Culpable Homicide not Amounting to Murder)
    UPDATE ref.local_heads SET canonical_code = 'EVE_TEASING' WHERE local_head_cd = 34 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Tresspass)
    UPDATE ref.local_heads SET canonical_code = 'PICK_POCKETING' WHERE local_head_cd = 35 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Preparation to Commit Dacoity)
    UPDATE ref.local_heads SET canonical_code = 'MOBILE_THEFT' WHERE local_head_cd = 36 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Criminal Breach of Trust)
    UPDATE ref.local_heads SET canonical_code = 'CYCLE_THEFT' WHERE local_head_cd = 37 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Cheating)
    UPDATE ref.local_heads SET canonical_code = 'SHOP_THEFT' WHERE local_head_cd = 38 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Forgery)
    UPDATE ref.local_heads SET canonical_code = 'CATTLE_THEFT' WHERE local_head_cd = 39 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Counterfeiting)
    UPDATE ref.local_heads SET canonical_code = 'MV_ACCESSORY_THEFT' WHERE local_head_cd = 40 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Arson)
    UPDATE ref.local_heads SET canonical_code = 'ASSAULT_ON_WOMEN_MODESTY' WHERE local_head_cd = 41 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Abetment of Suicide)
    UPDATE ref.local_heads SET canonical_code = 'INSULT_MODESTY_WOMEN' WHERE local_head_cd = 42 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Cruelty by Husband)
    UPDATE ref.local_heads SET canonical_code = 'ACCIDENTS' WHERE local_head_cd = 43 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Dowry Death)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_IPC' WHERE local_head_cd = 44 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Eve Teasing)
    UPDATE ref.local_heads SET canonical_code = 'EVE_TEASING' WHERE local_head_cd = 54 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Election Offences)
    UPDATE ref.local_heads SET canonical_code = 'ELECTION_OFFENCES' WHERE local_head_cd = 60 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Mischief)
    UPDATE ref.local_heads SET canonical_code = 'MISCHIEF' WHERE local_head_cd = 66 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Arms Act)
    UPDATE ref.local_heads SET canonical_code = 'SEC223_MANJHA' WHERE local_head_cd = 101 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Delhi Excise Act)
    UPDATE ref.local_heads SET canonical_code = 'SEC223_SERVANT_VERIFICATION' WHERE local_head_cd = 102 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Gambling Act)
    UPDATE ref.local_heads SET canonical_code = 'SEC223_TENANT_VERIFICATION' WHERE local_head_cd = 103 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Immoral Traffic(Prev.) Act, 1956 (SIT Act Renamed))
    UPDATE ref.local_heads SET canonical_code = 'SEC223_CYBER_CAFE' WHERE local_head_cd = 104 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Narcotics Drugs & Psychotropic Substances Act)
    UPDATE ref.local_heads SET canonical_code = 'SEC223_ACID_SALE' WHERE local_head_cd = 105 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Central Motor Vehicles Rules,1989)
    UPDATE ref.local_heads SET canonical_code = 'MVT' WHERE local_head_cd = 129 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Delhi Motor Vehicles Rules,1993)
    UPDATE ref.local_heads SET canonical_code = 'MVT' WHERE local_head_cd = 134 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Motor Vehicle Act,1988)
    UPDATE ref.local_heads SET canonical_code = 'MVT' WHERE local_head_cd = 147 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Luggage Theft)
    UPDATE ref.local_heads SET canonical_code = 'OTHER_THEFT' WHERE local_head_cd = 208 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Day Burglary)
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY' WHERE local_head_cd = 209 AND canonical_code IS NULL;

    -- Unlocks: STAT_1 / STAT_2 (Night Burglary)
    UPDATE ref.local_heads SET canonical_code = 'BURGLARY' WHERE local_head_cd = 210 AND canonical_code IS NULL;


CREATE TABLE victim_injury_details (id uuid PRIMARY KEY, person_id uuid REFERENCES persons(id), injury_severity varchar(20), hospitalized boolean, hospital_name varchar(150), created_at timestamptz, updated_at timestamptz);
CREATE TABLE ref.burglary_mo (mo_cd serial PRIMARY KEY, mo_desc varchar(100) NOT NULL);
CREATE TABLE ref.units (unit_cd serial PRIMARY KEY, unit varchar(30) NOT NULL, to_kg_factor numeric(12,8) NOT NULL DEFAULT 1.0);
