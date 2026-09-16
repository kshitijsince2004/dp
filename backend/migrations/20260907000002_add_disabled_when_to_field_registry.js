/**
 * Migration 20260907000002: Add disabled_when column to field_registry.
 *
 * `disabled_when` is a jsonb condition (same grammar as `show_when`) that,
 * when truthy, makes the field render as read-only in the UI while still
 * appearing in the form. The backend enforces the same rule on save.
 *
 * First use: work_out = "Yes" must be blocked when case_status is PENDING or null.
 */

export async function up(knex) {
  // 1. Add the column (nullable jsonb, no default — most fields won't have it)
  const hasCol = await knex.schema.hasColumn('field_registry', 'disabled_when');
  if (!hasCol) {
    await knex.schema.table('field_registry', (t) => {
      t.jsonb('disabled_when').nullable().defaultTo(null);
    });
  }

  // 2. Set the condition on work_out:
  //    disabled when case_status is PENDING or not set (null / empty)
  await knex('field_registry')
    .where('field_key', 'work_out')
    .update({
      disabled_when: JSON.stringify({
        or: [
          { field: 'case_status', value: 'PENDING' },
          { field: 'case_status', operator: 'empty' },
        ],
      }),
    });

  // 3. Shift PIS No. of IO (io_pis) above Status (case_status)
  await knex('field_registry')
    .where('field_key', 'io_pis')
    .update({ sort_order: 502.5 });
}


export async function down(knex) {
  await knex('field_registry')
    .where('field_key', 'work_out')
    .update({ disabled_when: null });

  // Only drop the column if no other rows use it
  const inUse = await knex('field_registry').whereNotNull('disabled_when').count('* as n').first();
  if (Number(inUse?.n ?? 0) === 0) {
    await knex.schema.table('field_registry', (t) => {
      t.dropColumn('disabled_when');
    });
  }
}
