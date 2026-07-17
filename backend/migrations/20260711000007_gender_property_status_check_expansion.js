// T7.1 (docs/import-ux-study/03-TRIAGE-MATRIX.md / F7) — vocabulary reconciliation, schema half.
// `field_registry` option lists offer values these two CHECK constraints don't accept at all
// (not a case-mismatch — those are fixed in code, records.mapper.js's normalizeEnumUpper):
//   - persons.gender's config option 'Transgender' has no CHECK member.
//   - record_properties.status's config option 'Involved' has no CHECK member.
// Config options are the product truth; the DB catches up (schema-only migration, per
// ENGINEERING_BASELINE.md P1 — field/option changes belong in config/, this migration only
// widens the enforcement layer to match what the product has already been offering).
export async function up(knex) {
  await knex.raw(`
    ALTER TABLE persons DROP CONSTRAINT persons_gender_check;
    ALTER TABLE persons ADD CONSTRAINT persons_gender_check
      CHECK (gender IN ('MALE','FEMALE','TRANSGENDER','OTHER','UNKNOWN'));

    ALTER TABLE record_properties DROP CONSTRAINT record_properties_status_check;
    ALTER TABLE record_properties ADD CONSTRAINT record_properties_status_check
      CHECK (status IN ('STOLEN','RECOVERED','SEIZED','INTACT','UNCLAIMED','INVOLVED'));
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE persons DROP CONSTRAINT persons_gender_check;
    ALTER TABLE persons ADD CONSTRAINT persons_gender_check
      CHECK (gender IN ('MALE','FEMALE','OTHER','UNKNOWN'));

    ALTER TABLE record_properties DROP CONSTRAINT record_properties_status_check;
    ALTER TABLE record_properties ADD CONSTRAINT record_properties_status_check
      CHECK (status IN ('STOLEN','RECOVERED','SEIZED','INTACT','UNCLAIMED'));
  `);
}
