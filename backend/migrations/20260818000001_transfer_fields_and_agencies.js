// backend/migrations/20260818000001_transfer_fields_and_agencies.js
// Adds ref.agencies reference table and transfer destination fields to fir_details

export async function up(knex) {
  await knex.raw(`
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
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE fir_details
      DROP COLUMN IF EXISTS transfer_to_type,
      DROP COLUMN IF EXISTS transferred_to_ps_id,
      DROP COLUMN IF EXISTS transferred_to_agency_id,
      DROP COLUMN IF EXISTS date_of_transfer;

    DROP TABLE IF EXISTS ref.agencies CASCADE;
  `);
}
