/**
 * Add a human-readable `uid` column to the `records` table and backfill existing rows.
 *
 * UID format: {RECORD_TYPE_PREFIX}-{YYYY}-{6-digit-seq}
 *   CASE     → CASE-2026-000001
 *   ARREST   → ARST-2026-000001
 *   MISSING  → MISS-2026-000001
 *   PCR_CALL → PCR-2026-000001
 *   UIDB     → UIDB-2026-000001
 *   (fallback) → REC-2026-000001
 *
 * Every record is uniquely identifiable, and its record type is encoded directly in the prefix.
 * The column is UNIQUE.
 */

export async function up(knex) {
  // 1. Add the uid column (nullable first so we can backfill)
  const hasUid = await knex.schema.hasColumn('records', 'uid');
  if (!hasUid) {
    await knex.schema.alterTable('records', (t) => {
      t.string('uid', 30).nullable();
    });
  }

  // 2. Fast SQL backfill for existing rows
  await knex.raw(`
    WITH numbered AS (
      SELECT id,
        CASE record_type
          WHEN 'CASE' THEN 'CASE'
          WHEN 'ARREST' THEN 'ARST'
          WHEN 'MISSING' THEN 'MISS'
          WHEN 'PCR_CALL' THEN 'PCR'
          WHEN 'UIDB' THEN 'UIDB'
          ELSE 'REC'
        END AS prefix,
        ROW_NUMBER() OVER (PARTITION BY record_type ORDER BY created_at ASC) AS seq
      FROM records
      WHERE uid IS NULL
    )
    UPDATE records r
    SET uid = n.prefix || '-' || TO_CHAR(COALESCE(r.record_date, r.created_at, NOW()), 'YYYY') || '-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE r.id = n.id
  `);

  // 3. Add unique constraint
  if (!hasUid) {
    await knex.schema.alterTable('records', (t) => {
      t.unique(['uid']);
    });
  }
}

export async function down(knex) {
  const hasUid = await knex.schema.hasColumn('records', 'uid');
  if (hasUid) {
    await knex.schema.alterTable('records', (t) => {
      t.dropColumn('uid');
    });
  }
}
