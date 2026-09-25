// P0 data-fix: clean legacy Kalandra seed data (2026-07 integration test rows) that were
// imported before the G2 compose fix (delete data.fir_no in import.compose.js) was stable.
// Two artefacts to clean:
//   1. arrest_details.fir_no was set on 6 is_dd_based=true rows — must be NULL for Kalandra.
//   2. 2 of those rows got a spurious CASE_ARREST record_link (linkResolver matched on fir_no
//      before the is_dd_based guard was added).
//
// This migration is idempotent: both statements are WHERE-guarded on is_dd_based=true, so
// re-running on a clean DB is a safe no-op.

export async function up(knex) {
  // Step 1: remove spurious CASE_ARREST links targeting Kalandra records.
  const deleted = await knex.raw(`
    DELETE FROM record_links rl
    USING link_type_registry lt, records ar, arrest_details ad
    WHERE rl.link_type_id = lt.id
      AND lt.code = 'CASE_ARREST'
      AND rl.target_record_id = ar.id
      AND ad.record_id = ar.id
      AND ad.is_dd_based = true
  `);
  const deletedCount = deleted.rowCount ?? 0;
  if (deletedCount > 0) {
    console.log(`[migration] P0 Kalandra fix: removed ${deletedCount} spurious CASE_ARREST link(s)`);
  } else {
    console.log('[migration] P0 Kalandra fix: no spurious CASE_ARREST links found (already clean)');
  }

  // Step 2: clear fir_no and fir_date on all is_dd_based=true rows.
  const updated = await knex('arrest_details')
    .where('is_dd_based', true)
    .whereNotNull('fir_no')
    .update({ fir_no: null, fir_date: null });
  if (updated > 0) {
    console.log(`[migration] P0 Kalandra fix: cleared fir_no/fir_date on ${updated} Kalandra arrest_details row(s)`);
  } else {
    console.log('[migration] P0 Kalandra fix: no Kalandra rows with fir_no found (already clean)');
  }
}

// Down: original fir_no values cannot be mechanically restored.
export async function down(knex) {
  console.warn('[migration] P0 Kalandra fix DOWN: no-op — original fir_no values not recoverable from this migration.');
}
