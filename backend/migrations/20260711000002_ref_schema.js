// Fresh schema (DB restructure 2026-07) — 2/6: ref schema, 21 lookup tables.
// Spec: docs/db-audit/DB_SCHEMA.md §8; natural keys verified in REF_KEY_VERIFICATION.md (2026-07-11).
// Loaded by `npm run load-ref` from config/ref-data/Menu_Tables.xlsx — never by migrations.

export async function up(knex) {
  await knex.raw(`
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
  `);
}

export async function down(knex) {
  await knex.raw('DROP SCHEMA IF EXISTS ref CASCADE;');
}
