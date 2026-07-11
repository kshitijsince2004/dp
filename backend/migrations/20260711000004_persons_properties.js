// Fresh schema (DB restructure 2026-07) — 4/6: persons + role subtypes + descriptions + record_properties.
// Spec: docs/db-audit/DB_SCHEMA.md §3.1–§3.4.

export async function up(knex) {
  await knex.raw(`
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
      gender               varchar(10) CHECK (gender IN ('MALE','FEMALE','OTHER','UNKNOWN')),
      age                  smallint,
      dob                  date,
      is_minor             boolean GENERATED ALWAYS AS (age < 18) STORED,
      nick_names           jsonb NOT NULL DEFAULT '[]',
      mobile               varchar(20),
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
      major_category_id    int REFERENCES ref.property_categories(parent_cd),
      minor_category_id    int REFERENCES ref.other_property_items(property_cd),
      status               varchar(20) NOT NULL DEFAULT 'STOLEN' CHECK (status IN
                             ('STOLEN','RECOVERED','SEIZED','INTACT','UNCLAIMED')),
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
    CREATE INDEX idx_record_properties_category ON record_properties (major_category_id);
    CREATE INDEX idx_record_properties_status   ON record_properties (status);
    CREATE INDEX idx_record_properties_vehicle  ON record_properties (vehicle_no);
    CREATE INDEX idx_record_properties_imei     ON record_properties (phone_imei);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS record_properties;
    DROP TABLE IF EXISTS person_descriptions;
    DROP TABLE IF EXISTS missing_person_details;
    DROP TABLE IF EXISTS arrestee_details;
    DROP TABLE IF EXISTS persons;
  `);
}
