// backend/seeds/05_duration_presets.js
// HQ Dashboard "Duration" dropdown options — DB-driven, never hardcoded in frontend/backend.
//
// scope: 'HQ_DURATION' is deliberately distinct from 'SYSTEM'/'ROLE'/'USER' so these rows
// are never picked up by GET /filters/presets (listPresets), keeping them out of the
// generic Saved Filter Presets panel used elsewhere.
//
// Strategy: ON CONFLICT (id) DO UPDATE — safe to re-run indefinitely.
//
// filter_presets is English-only (name, record_types) per the DB restructure — field_registry
// is the one live bilingual table. filters.controller.js mirrors `name` into name_en/name_hi
// in its API response so existing frontend consumers keep working unchanged.
//
// id is a real `uuid` column on the rebuilt schema (was a free-text slug before), so these are
// fixed UUID literals rather than readable slugs — still stable across reseeds for the ON
// CONFLICT upsert, and their fixed order keeps `ORDER BY id ASC` matching display order.

export async function seed(knex) {
  const presets = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Current Year',
      scope: 'HQ_DURATION',
      scope_id: null,
      filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'current_year_minus_n', value: 0 }] }),
      record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      is_active: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Last Year',
      scope: 'HQ_DURATION',
      scope_id: null,
      filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'current_year_minus_n', value: 1 }] }),
      record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      is_active: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Last 2 Years',
      scope: 'HQ_DURATION',
      scope_id: null,
      filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'current_year_minus_n', value: 2 }] }),
      record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      is_active: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Last 5 Years',
      scope: 'HQ_DURATION',
      scope_id: null,
      filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'current_year_minus_n', value: 4 }] }),
      record_types: JSON.stringify(['CASE', 'ARREST', 'UIDB']),
      is_active: true,
    },
  ];

  await knex('filter_presets').insert(presets).onConflict('id').merge();
  console.log(`[05_duration_presets] Upserted ${presets.length} HQ duration presets`);
}
