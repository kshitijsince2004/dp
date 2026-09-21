export async function up(knex) {
  await knex.raw(`
    -- 1. Create table for Manual FIR (CCTNS) PS codes (district-scoped)
    CREATE TABLE IF NOT EXISTS ref.ps_manual_fir_codes (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      hierarchy_node_id uuid NOT NULL REFERENCES hierarchy_nodes(id),
      district_code     varchar(3) NOT NULL,
      ps_code           varchar(3) NOT NULL,
      is_active         boolean NOT NULL DEFAULT true,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (district_code, ps_code),
      UNIQUE (hierarchy_node_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ps_manual_codes_node ON ref.ps_manual_fir_codes (hierarchy_node_id);
    CREATE INDEX IF NOT EXISTS idx_ps_manual_codes_dist_ps ON ref.ps_manual_fir_codes (district_code, ps_code);

    -- 2. Create table for Unified e-FIR PS codes (globally unique, shared by E_THEFT, E_MVT, NCRP, ZERO_FIR)
    CREATE TABLE IF NOT EXISTS ref.ps_unified_codes (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      hierarchy_node_id uuid NOT NULL REFERENCES hierarchy_nodes(id),
      ps_code           varchar(3) NOT NULL,
      is_active         boolean NOT NULL DEFAULT true,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (ps_code),
      UNIQUE (hierarchy_node_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ps_unified_codes_node ON ref.ps_unified_codes (hierarchy_node_id);
    CREATE INDEX IF NOT EXISTS idx_ps_unified_codes_ps ON ref.ps_unified_codes (ps_code);

    -- 3. Add registration_type and statutory components to fir_details
    ALTER TABLE fir_details
      ADD COLUMN IF NOT EXISTS registration_type varchar(20) CHECK (registration_type IN ('MANUAL_CCTNS', 'E_THEFT', 'E_MVT', 'NCRP', 'ZERO_FIR')),
      ADD COLUMN IF NOT EXISTS fir_seq integer,
      ADD COLUMN IF NOT EXISTS fir_type_prefix varchar(5),
      ADD COLUMN IF NOT EXISTS fir_ps_code varchar(3),
      ADD COLUMN IF NOT EXISTS is_legacy_format boolean NOT NULL DEFAULT false;

    CREATE INDEX IF NOT EXISTS idx_fir_details_reg_type ON fir_details (registration_type);
    CREATE INDEX IF NOT EXISTS idx_fir_details_statutory_seq ON fir_details (ps_id, registration_type, fir_year, fir_seq);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS ref.ps_manual_fir_codes;
    DROP TABLE IF EXISTS ref.ps_unified_codes;
    ALTER TABLE fir_details
      DROP COLUMN IF EXISTS registration_type,
      DROP COLUMN IF EXISTS fir_seq,
      DROP COLUMN IF EXISTS fir_type_prefix,
      DROP COLUMN IF EXISTS fir_ps_code,
      DROP COLUMN IF EXISTS is_legacy_format;
  `);
}
