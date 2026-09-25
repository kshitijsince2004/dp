// The ONE source module for geographic/demographic reference lists (WP11, 2026-07-16).
// Everything here is built synchronously at module load from checked-in data only:
//   - nationality demonyms: the already-installed i18n-nationality package (~248 entries —
//     this builder MOVED here verbatim from import-fields.config.js; its output is the exact
//     list the Excel templates have always shipped, the form now shares it)
//   - India states/UTs + districts: config/ref-data/india_states_districts.json (a reviewed
//     LGD-derived snapshot — regenerate via backend/scripts/dev/build_india_districts.mjs and
//     review the diff; NEVER a live npm dependency or network call at runtime)
// Consumed by: import-fields.config.js (re-exports for the Excel template pipeline),
// scripts/sync-config.mjs ($NATIONALITY/$INDIA_STATES/$INDIA_DISTRICTS placeholder expansion
// into field_registry options), template-builder.service.js (state→district cascade), and
// the /api/fields geo endpoint the form's cascading reads.
//
// Address semantics (user decisions, 2026-07-16): person/present/permanent addresses are
// INDIA-scoped (full states + per-state districts); the OCCURRENCE address is DELHI-scoped
// (country locked India, state locked Delhi, district = Delhi Police districts from the
// hierarchy — untouched by anything in this module).
import nationality from 'i18n-nationality';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Nationality (~248 demonyms) ─────────────────────────────────────────────────────────
const natJsonPath = path.resolve(__dirname, '../../node_modules/i18n-nationality/langs/en.json');
let enNationality = {};
try {
  enNationality = JSON.parse(fs.readFileSync(natJsonPath, 'utf8'));
} catch (e) {
  // Minimal fallback so the module never throws at load — the full list needs the package's
  // data file, this keeps the app bootable if it's ever missing.
  enNationality = {
    IN: 'Indian', NP: 'Nepalese', BT: 'Bhutanese', BD: 'Bangladeshi', PK: 'Pakistani',
    LK: 'Sri Lankan', AF: 'Afghanistan', MM: 'Myanmar', US: 'American', GB: 'British', CA: 'Canadian',
  };
}
nationality.registerLocale(enNationality);
const demonymList = Object.values(nationality.getNames('en')).filter(Boolean);
const natExclude = new Set(['Indian', 'Tibetan', 'Other']);
const cleanNat = demonymList.filter((d) => !natExclude.has(d)).sort((a, b) => a.localeCompare(b));

/** Full demonym list, Indian/Tibetan pinned first, 'Other' escape hatch last. */
export const NATIONALITY_OPTS = ['Indian', 'Tibetan', ...cleanNat, 'Other'];

// ── India states/UTs + districts (LGD snapshot) ─────────────────────────────────────────
const snapshotPath = path.resolve(__dirname, '../../../config/ref-data/india_states_districts.json');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

/** All states/UTs alphabetical + the 'Other UT/State' escape hatch (kept from the old list —
 * foreign/unknown addresses need somewhere to go; the district cascade falls back to the
 * full-India superset for it). */
export const INDIA_STATES = [...snapshot.states.map((s) => s.state), 'Other UT/State'];

/** stateName -> sorted district names. No entry for 'Other UT/State' (deliberate). */
export const DISTRICTS_BY_STATE = Object.fromEntries(
  snapshot.states.map((s) => [s.state, s.districts])
);

/** Flattened unique sorted superset — the un-cascaded fallback list for address districts. */
export const ALL_INDIA_DISTRICTS = [...new Set(snapshot.states.flatMap((s) => s.districts))]
  .sort((a, b) => a.localeCompare(b));

// Occurrence-lock constants (D-A): the occurrence address is always Delhi.
export const INDIA_COUNTRY = 'India';
export const DELHI_STATE = 'Delhi';
