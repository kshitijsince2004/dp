// Fresh schema (DB restructure 2026-07) — 1/6: org & identity.
// Spec: docs/db-audit/DB_SCHEMA.md §1. Schema-only forever — no data rows in migrations.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE hierarchy_nodes (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      node_type   varchar(30) NOT NULL CHECK (node_type IN ('HQ','ZONE','RANGE','DISTRICT','SUB_DIV','PS')),
      name        varchar(150) NOT NULL,
      code        varchar(30) NOT NULL UNIQUE,
      parent_id   uuid REFERENCES hierarchy_nodes(id),
      metadata    jsonb NOT NULL DEFAULT '{}',
      is_active   boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_hierarchy_nodes_parent ON hierarchy_nodes (parent_id);
    CREATE INDEX idx_hierarchy_nodes_type   ON hierarchy_nodes (node_type);

    CREATE TABLE users (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username      varchar(50) NOT NULL UNIQUE,
      badge_no      varchar(50) NOT NULL UNIQUE,
      name          varchar(100) NOT NULL,
      password_hash varchar(255) NOT NULL,
      role          varchar(20) NOT NULL CHECK (role IN
                      ('HC','SHO','ACP','DISTRICT_OFFICER','JCP','SCP','HQ_ANALYST','HQ_ADMIN','SYSTEM_ADMIN')),
      ps_id         uuid REFERENCES hierarchy_nodes(id),
      district_id   uuid REFERENCES hierarchy_nodes(id),
      sub_div_id    uuid REFERENCES hierarchy_nodes(id),
      is_active     boolean NOT NULL DEFAULT true,
      last_login    timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_users_ps       ON users (ps_id);
    CREATE INDEX idx_users_district ON users (district_id);
    CREATE INDEX idx_users_role     ON users (role);

    CREATE TABLE investigating_officers (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid REFERENCES users(id),
      name        varchar(100) NOT NULL,
      rank        varchar(50),
      pis_no      varchar(50),
      mobile      varchar(20),
      ps_id       uuid REFERENCES hierarchy_nodes(id),
      is_active   boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX uq_io_pis_no    ON investigating_officers (pis_no) WHERE pis_no IS NOT NULL;
    CREATE INDEX idx_io_ps_active       ON investigating_officers (ps_id, is_active);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS investigating_officers;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS hierarchy_nodes;
  `);
}
