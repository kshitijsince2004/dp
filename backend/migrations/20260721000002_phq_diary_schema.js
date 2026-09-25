// PHQ Diary §7.1 — drug quantity unit table + typed quantity columns on record_properties.
// ref.units(unit_cd, unit, to_kg_factor) converts any quantity to kg for NDPS recovery sheets.
// quantity + unit_cd on record_properties replace the previous extra-JSONB ad-hoc pattern.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ref.units (
      unit_cd      serial        PRIMARY KEY,
      unit         varchar(50)   NOT NULL UNIQUE,
      to_kg_factor numeric(20,10) NOT NULL DEFAULT 1.0,
      created_at   timestamptz   NOT NULL DEFAULT now()
    );

    INSERT INTO ref.units (unit, to_kg_factor) VALUES
      ('kg',       1.0),
      ('gram',     0.001),
      ('mg',       0.000001),
      ('litre',    1.0),
      ('ml',       0.001),
      ('tablet',   0.0005),
      ('capsule',  0.0005),
      ('bottle',   0.75),
      ('packet',   0.1),
      ('strip',    0.005),
      ('sachet',   0.005),
      ('piece',    0.1)
    ON CONFLICT (unit) DO NOTHING;

    ALTER TABLE record_properties
      ADD COLUMN IF NOT EXISTS quantity numeric(14,4),
      ADD COLUMN IF NOT EXISTS unit_cd  int REFERENCES ref.units(unit_cd);
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE record_properties
      DROP COLUMN IF EXISTS quantity,
      DROP COLUMN IF EXISTS unit_cd;
    DROP TABLE IF EXISTS ref.units;
  `);
}
