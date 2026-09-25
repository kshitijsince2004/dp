/**
 * Add a human-readable `uid` column to the `persons` table and backfill existing rows.
 *
 * UID format: {ROLE_PREFIX}-{YYYY}-{6-digit-seq}
 *   COMPLAINANT  → COMP-2026-000001
 *   VICTIM       → VICT-2026-000002
 *   ACCUSED      → ACSD-2026-000003
 *   ARRESTED     → ARST-2026-000004
 *   INFORMANT    → INFO-2026-000005
 *   MISSING      → MISS-2026-000006
 *   DECEASED     → DCSD-2026-000007
 *   CALLER       → CALR-2026-000008
 *   (fallback)   → PERS-2026-XXXXXX
 *
 * The column is UNIQUE so no two persons can share a UID.
 * Backfill generates UIDs for all existing persons rows ordered by created_at.
 */
const ROLE_PREFIXES = {
  COMPLAINANT: 'COMP',
  VICTIM:      'VICT',
  ACCUSED:     'ACSD',
  ARRESTED:    'ARST',
  INFORMANT:   'INFO',
  MISSING:     'MISS',
  DECEASED:    'DCSD',
  CALLER:      'CALR',
};

export async function up(knex) {
  // 1. Add the uid column (nullable first so we can backfill)
  const hasUid = await knex.schema.hasColumn('persons', 'uid');
  if (!hasUid) {
    await knex.schema.alterTable('persons', (t) => {
      t.string('uid', 30).nullable();
    });
  }

  // 2. Fast SQL backfill for existing rows
  await knex.raw(`
    WITH numbered AS (
      SELECT id,
        CASE role
          WHEN 'COMPLAINANT' THEN 'COMP'
          WHEN 'VICTIM' THEN 'VICT'
          WHEN 'ACCUSED' THEN 'ACSD'
          WHEN 'ARRESTED' THEN 'ARST'
          WHEN 'INFORMANT' THEN 'INFO'
          WHEN 'MISSING' THEN 'MISS'
          WHEN 'DECEASED' THEN 'DCSD'
          WHEN 'CALLER' THEN 'CALR'
          ELSE 'PERS'
        END AS prefix,
        ROW_NUMBER() OVER (PARTITION BY role ORDER BY created_at ASC) AS seq
      FROM persons
      WHERE uid IS NULL
    )
    UPDATE persons p
    SET uid = n.prefix || '-' || TO_CHAR(COALESCE(p.created_at, NOW()), 'YYYY') || '-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE p.id = n.id
  `);

  // 3. Add unique constraint
  if (!hasUid) {
    await knex.schema.alterTable('persons', (t) => {
      t.unique(['uid']);
    });
  }
}

export async function down(knex) {
  const hasUid = await knex.schema.hasColumn('persons', 'uid');
  if (hasUid) {
    await knex.schema.alterTable('persons', (t) => {
      t.dropColumn('uid');
    });
  }
}
