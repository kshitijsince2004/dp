// Migration: Add canonical_code to ref.local_heads and registration_date to records
export async function up(knex) {
  await knex.raw(`
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
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE ref.local_heads DROP COLUMN IF EXISTS canonical_code;
    ALTER TABLE records DROP COLUMN IF EXISTS registration_date;
  `);
}
