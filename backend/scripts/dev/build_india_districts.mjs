// One-shot builder for config/ref-data/india_states_districts.json — the checked-in
// India states/UTs + districts snapshot that drives address-field dropdowns and the Excel
// state→district cascade (see backend/src/config/geoData.js).
//
// Run manually when district lists change (state government notifications):
//   node backend/scripts/dev/build_india_districts.mjs
// then REVIEW the diff before committing — the snapshot is a deliberate, reviewed artifact,
// never a live dependency.
//
// Source: iaseth/data-for-india (GitHub) — itself LGD/census-derived; verified current as of
// 2026-07 (contains Malerkotla/Punjab [2021] and Alluri Sitharama Raju/AP [2022]).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SOURCE_URL = 'https://raw.githubusercontent.com/iaseth/data-for-india/master/data/minified/districts.min.json';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../config/ref-data/india_states_districts.json');

// App-convention renames: the app (occurrence lock, template state-normalization, existing
// stored records) says 'Delhi', not the formal NCT name.
const STATE_RENAMES = { 'National Capital Territory of Delhi': 'Delhi' };
// Source-data cleanups (stray suffixes/double spaces in district names).
const cleanDistrict = (d) => d.replace(/\s+district$/i, '').replace(/\s{2,}/g, ' ').trim();

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const { districts } = await res.json();

const byState = new Map();
for (const row of districts) {
  const state = (STATE_RENAMES[row.state] || row.state).trim();
  if (!byState.has(state)) byState.set(state, new Set());
  byState.get(state).add(cleanDistrict(row.district));
}

const states = [...byState.keys()].sort((a, b) => a.localeCompare(b))
  .map((state) => ({ state, districts: [...byState.get(state)].sort((a, b) => a.localeCompare(b)) }));

const totalDistricts = states.reduce((n, s) => n + s.districts.length, 0);
// Sanity gates — refuse to write a snapshot that's obviously incomplete/stale.
if (states.length < 35) throw new Error(`only ${states.length} states/UTs — expected >= 35`);
if (totalDistricts < 700) throw new Error(`only ${totalDistricts} districts — expected >= 700`);
const delhi = states.find((s) => s.state === 'Delhi');
if (!delhi || delhi.districts.length < 9) throw new Error('Delhi missing or has too few districts');
if (!states.some((s) => s.districts.includes('Malerkotla'))) throw new Error('Malerkotla (2021) missing — source looks stale');

const out = {
  _meta: {
    source: SOURCE_URL,
    retrieved: new Date().toISOString().slice(0, 10),
    states: states.length,
    districts: totalDistricts,
    note: 'Reviewed snapshot — regenerate via backend/scripts/dev/build_india_districts.mjs and review the diff. NCT of Delhi renamed to "Delhi" (app convention).',
  },
  states,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${OUT}: ${states.length} states/UTs, ${totalDistricts} districts`);
