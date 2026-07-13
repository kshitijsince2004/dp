// backend/seeds/05_duration_presets.js
// HQ Dashboard "Duration" dropdown options — DB-driven, never hardcoded in frontend/backend.
//
// scope: 'HQ_DURATION' is deliberately distinct from 'SYSTEM'/'ROLE'/'USER' so these rows
// are never picked up by GET /filters/presets (listPresets), keeping them out of the
// generic Saved Filter Presets panel used elsewhere.
//
// Strategy: ON CONFLICT (id) DO UPDATE — safe to re-run indefinitely.

export async function seed(knex) {
  const presets = [
    {
      id: 'hq_dur_1_current_year',
      name_en: 'Current Year',
      name_hi: 'चालू वर्ष',
      scope: 'HQ_DURATION',
      scope_id: null,
      filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'current_year_minus_n', value: 0 }] }),
      applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      is_active: true,
    },
    {
      id: 'hq_dur_2_last_year',
      name_en: 'Last Year',
      name_hi: 'पिछला वर्ष',
      scope: 'HQ_DURATION',
      scope_id: null,
      filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'current_year_minus_n', value: 1 }] }),
      applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      is_active: true,
    },
    {
      id: 'hq_dur_3_last_2_years',
      name_en: 'Last 2 Years',
      name_hi: 'पिछले 2 वर्ष',
      scope: 'HQ_DURATION',
      scope_id: null,
      filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'current_year_minus_n', value: 2 }] }),
      applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      is_active: true,
    },
    {
      id: 'hq_dur_4_last_5_years',
      name_en: 'Last 5 Years',
      name_hi: 'पिछले 5 वर्ष',
      scope: 'HQ_DURATION',
      scope_id: null,
      filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'current_year_minus_n', value: 4 }] }),
      applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      is_active: true,
    },
  ];

  await knex('filter_presets').insert(presets).onConflict('id').merge();
  console.log(`[05_duration_presets] Upserted ${presets.length} HQ duration presets`);
}
