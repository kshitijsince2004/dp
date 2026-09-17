export async function up(knex) {
  // Drop the existing CHECK constraint on the role column (often named persons_role_check)
  // and add a new one that includes MISSING_CHILD.
  await knex.raw(`
    DO $$ 
    DECLARE 
      r_constraint_name text;
    BEGIN
      -- Find the CHECK constraint on the role column
      SELECT conname INTO r_constraint_name
      FROM pg_constraint
      WHERE conrelid = 'persons'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%role%';
        
      IF r_constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE persons DROP CONSTRAINT ' || r_constraint_name;
      END IF;
    END $$;

    ALTER TABLE persons ADD CONSTRAINT persons_role_check CHECK (role IN (
      'COMPLAINANT', 'ACCUSED', 'VICTIM', 'WITNESS', 'ARRESTEE',
      'MISSING', 'DECEASED', 'INFORMANT', 'CALLER', 'IO', 'MISSING_CHILD'
    ));
  `);
}

export async function down(knex) {
  // Revert back to the original constraint (removes MISSING_CHILD)
  // WARNING: If there are rows with role='MISSING_CHILD', this down migration will fail.
  // In a real rollback, you would first delete those rows or reassign them.
  await knex.raw(`
    DO $$ 
    DECLARE 
      r_constraint_name text;
    BEGIN
      SELECT conname INTO r_constraint_name
      FROM pg_constraint
      WHERE conrelid = 'persons'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%role%';
        
      IF r_constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE persons DROP CONSTRAINT ' || r_constraint_name;
      END IF;
    END $$;

    ALTER TABLE persons ADD CONSTRAINT persons_role_check CHECK (role IN (
      'COMPLAINANT', 'ACCUSED', 'VICTIM', 'WITNESS', 'ARRESTEE',
      'MISSING', 'DECEASED', 'INFORMANT', 'CALLER', 'IO'
    ));
  `);
}
