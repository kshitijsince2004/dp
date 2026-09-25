// Migration for PHQ Historical Baseline Data Store
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS stat_baselines (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      year           int NOT NULL,
      scope_code     varchar(50) NOT NULL,
      head_code      varchar(100) NOT NULL,
      reported_count int NOT NULL DEFAULT 0,
      solved_count   int NOT NULL DEFAULT 0,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (year, scope_code, head_code)
    );
    CREATE INDEX IF NOT EXISTS idx_stat_baselines_lookup ON stat_baselines (year, scope_code, head_code);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS stat_baselines;
  `);
}
