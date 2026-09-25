/**
 * Repair schema drift on databases provisioned BEFORE the widen-fold.
 *
 * WHY THIS EXISTS (2026-07-26 bugfix batch, C17):
 * `20260711000004_persons_properties.js` was EDITED IN PLACE by an earlier session to widen
 * `persons.gender` (varchar(10) -> varchar(20), CHECK + 'TRANSGENDER') and to extend
 * `record_properties.status`'s CHECK with 'INVOLVED'; the standalone `...000007` migration that
 * originally carried those changes was then deleted. That is fine for a fresh `db:reset`, but
 * knex records `...000004` as already-run, so any database created from the ORIGINAL version of
 * that file keeps the OLD narrow column forever and can never receive the fix.
 *
 * Real consequence, observed in a tester's logs on 2026-07-25:
 *   insert into "persons" (...) - value too long for type character varying(10)
 * i.e. saving a person with gender 'TRANSGENDER' (11 chars) crashed the write path outright on
 * their machine while working perfectly on freshly-reset machines. Same class of drift applies
 * to record_properties.status = 'INVOLVED'.
 *
 * This migration is deliberately IDEMPOTENT and a no-op on an up-to-date database: widening a
 * varchar that is already wide is a metadata-only ALTER, and both CHECK constraints are dropped
 * and recreated with exactly the definition `...000004` declares today. It never narrows, never
 * drops data, and never touches rows. Migrations stay schema-only (CLAUDE.md / P1).
 *
 * DO NOT "fix" future drift of this kind by editing an already-applied migration again — add a
 * forward migration like this one instead.
 */
export async function up(knex) {
  await knex.raw(`
    ALTER TABLE persons ALTER COLUMN gender TYPE varchar(20);

    ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_gender_check;
    ALTER TABLE persons ADD CONSTRAINT persons_gender_check
      CHECK (gender IN ('MALE','FEMALE','TRANSGENDER','OTHER','UNKNOWN'));

    ALTER TABLE record_properties DROP CONSTRAINT IF EXISTS record_properties_status_check;
    ALTER TABLE record_properties ADD CONSTRAINT record_properties_status_check
      CHECK (status IN ('STOLEN','RECOVERED','SEIZED','INTACT','UNCLAIMED','INVOLVED'));
  `);
}

/**
 * Intentionally a no-op. Rolling back would mean re-narrowing `persons.gender` to varchar(10)
 * and re-rejecting 'TRANSGENDER'/'INVOLVED' — which would fail outright on any database that has
 * since stored such a row, and is never a state anyone wants to return to. The `up` is already
 * idempotent, so there is nothing to undo.
 */
export async function down() {
  // no-op by design — see above.
}
