/**
 * Migration 20260907000001: Add work_out and work_out_date to field_registry.
 *
 * These fields were already tracked in case.json and used by records.service.js
 * (is_worked_out / worked_out_date columns in fir_details) but were never inserted
 * into field_registry, so they never appeared in the dynamic form API response.
 *
 * Business rule (enforced in records.service.js):
 *   - work_out = "Yes" is blocked when case_status is PENDING or NULL.
 *   - work_out defaults to "No" on new cases.
 *   - work_out_date is only shown/required when work_out = "Yes".
 */

const LEVELS = {
  visible: ['PS', 'DISTRICT', 'HQ'],
  editable: ['PS'],
  introduced: 'PS',
};

const WORK_OUT_OPTIONS = [
  { value: 'Yes', label_en: 'Yes', label_hi: 'हाँ' },
  { value: 'No',  label_en: 'No',  label_hi: 'नहीं' },
];

export async function up(knex) {
  const crypto = await import('crypto');

  function makeChecksum(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
  }

  const workOutRow = {
    field_key: 'work_out',
    record_types: JSON.stringify(['CASE']),
    field_type: 'RADIO',
    labels: JSON.stringify({ en: 'WorkOut', hi: 'वर्कआउट' }),
    section: 'investigation_officer',
    section_labels: null,
    storage: JSON.stringify({ table: 'fir_details', column: 'is_worked_out' }),
    options: JSON.stringify(WORK_OUT_OPTIONS),
    options_source: null,
    depends_on: null,
    show_when: null,
    validation_rules: JSON.stringify({ required: false }),
    visible_to_levels: JSON.stringify(LEVELS.visible),
    editable_by_levels: JSON.stringify(LEVELS.editable),
    introduced_at_level: LEVELS.introduced,
    repeater_entity: null,
    full_width: false,
    readonly: false,
    is_active: true,
    scope_level: 'global',
    scope_id: null,
    sort_order: 508,
  };
  workOutRow.checksum = makeChecksum(workOutRow);

  const workOutDateRow = {
    field_key: 'work_out_date',
    record_types: JSON.stringify(['CASE']),
    field_type: 'DATE',
    labels: JSON.stringify({ en: 'WorkOut Date', hi: 'वर्कआउट तिथि' }),
    section: 'investigation_officer',
    section_labels: null,
    storage: JSON.stringify({ table: 'fir_details', column: 'worked_out_date' }),
    options: null,
    options_source: null,
    depends_on: null,
    show_when: JSON.stringify({ field: 'work_out', value: 'Yes' }),
    validation_rules: JSON.stringify({ required: true }),
    visible_to_levels: JSON.stringify(LEVELS.visible),
    editable_by_levels: JSON.stringify(LEVELS.editable),
    introduced_at_level: LEVELS.introduced,
    repeater_entity: null,
    full_width: false,
    readonly: false,
    is_active: true,
    scope_level: 'global',
    scope_id: null,
    sort_order: 509,
  };
  workOutDateRow.checksum = makeChecksum(workOutDateRow);

  // Idempotent — skip if already present
  for (const row of [workOutRow, workOutDateRow]) {
    const existing = await knex('field_registry').where('field_key', row.field_key).first();
    if (!existing) {
      await knex('field_registry').insert(row);
    }
  }
}

export async function down(knex) {
  await knex('field_registry').whereIn('field_key', ['work_out', 'work_out_date']).delete();
}
