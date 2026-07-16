// Import key-bridge parity check (Integration 3, P3.2 enforcement). Every column on the
// frozen bulk-import Excel template must resolve to SOMEWHERE real: either its field_key IS a
// live field_registry field_key for that record type, or import-key-bridge.config.js says
// exactly where it goes instead. This script is the automated guard against a third option
// silently happening — a template column whose value gets parsed and then discarded because
// nothing downstream recognizes its key.
//
//   node scripts/import-bridge-parity.js
//
// Exits 1 and prints every gap found. Run after touching import-fields.config.js or
// import-key-bridge.config.js. Wire into CI once one exists for this repo (none does yet).
import db from '../src/config/db.js';
import { autoIncludedRegistryFields, parseApplicableTypes, normalizeRegistryRow } from '../src/modules/import/registry-sync.util.js';
import {
  caseGeneralFields, caseVictimFields, caseActSectionFields, caseAccusedFields, casePropertyFields,
  arrestGeneralFields, arrestActSectionFields, arrestPersonFields, arrestPropertyFields,
  kalandraGeneralFields, kalandraActSectionFields, kalandraPersonFields,
  uidbGeneralFields, uidbActSectionFields, missingGeneralFields,
} from '../src/modules/import/import-fields.config.js';
import { getBridge } from '../src/modules/import/import-key-bridge.config.js';

const TYPES = ['CASE', 'ARREST', 'KALANDRA', 'UIDB', 'MISSING'];
// KALANDRA's registry fields live under ARREST (registry-sync.util.js convention).
const REGISTRY_TYPE = (t) => (t === 'KALANDRA' ? 'ARREST' : t);

const SHEET_LISTS = {
  CASE: { general: caseGeneralFields, victim: caseVictimFields, act: caseActSectionFields, accused: caseAccusedFields, property: casePropertyFields },
  ARREST: { general: arrestGeneralFields, act: arrestActSectionFields, person: arrestPersonFields, property: arrestPropertyFields },
  KALANDRA: { general: kalandraGeneralFields, act: kalandraActSectionFields, person: kalandraPersonFields, property: arrestPropertyFields },
  UIDB: { general: uidbGeneralFields, act: uidbActSectionFields },
  MISSING: { general: missingGeneralFields },
};

// Act-sheet per-row inputs consumed directly by the offences[] array builder
// (import.compose.js), never flat-mapped through field_registry.storage — see
// records.mapper.js's buildOffenceRows / zipOffenceStrings. Legitimately exempt everywhere.
// 'act'/'crime_head' are the CASE/ARREST/KALANDRA act-sheet's own row-major-head columns
// (UIDB's act sheet uses 'act_name', which IS a real registry field_key, so it needs no
// exemption). 'crime_head' ALSO happens to exist as its own field_registry row (ARREST-only,
// offence-entity, primary:true) — a different semantic (the flat single-head OVERRIDE the
// mapper's buildOffenceRows reads from data.crime_head), not the per-row act-sheet value; the
// composer must not confuse the two. See docs/new-db-integration/03-import.md.
const COMPOSER_ONLY_KEYS = new Set(['major_head', 'minor_head', 'act', 'crime_head']);

// PCR_CALL isn't in SHEET_LISTS (it has no curated field lists — its template is generated
// straight from field_registry, so every column is registry-direct by construction) but is
// still worth a pass for completeness/symmetry with readWorkbook's own generic branch.
const ALL_CHECK_TYPES = [...TYPES, 'PCR_CALL'];

async function main() {
  const allRegistryFields = (await db('field_registry').where('is_active', true)).map(normalizeRegistryRow);
  const registryByType = {};
  for (const t of ALL_CHECK_TYPES) {
    const rt = REGISTRY_TYPE(t);
    registryByType[rt] ??= new Map(
      allRegistryFields
        .filter((f) => parseApplicableTypes(f.applicable_record_types).includes(rt))
        .map((f) => [f.field_key, f])
    );
  }

  const gaps = [];
  const bridgeTargetErrors = [];

  for (const type of TYPES) {
    const lists = SHEET_LISTS[type];
    if (!lists) continue; // PCR_CALL — nothing curated to check
    const registryMap = registryByType[REGISTRY_TYPE(type)];
    const bridge = getBridge(type);
    const configKeys = new Set(Object.values(lists).flatMap((l) => l.map((f) => f.field_key)));

    // Curated keys.
    for (const [role, fields] of Object.entries(lists)) {
      for (const f of fields) {
        const key = f.field_key;
        if (COMPOSER_ONLY_KEYS.has(key)) continue;
        if (registryMap.has(key)) continue; // registry-direct match
        const entry = bridge[key];
        if (!entry) {
          gaps.push({ type, role, key, reason: 'no registry match and no bridge entry' });
          continue;
        }
        if (entry.validateOnly || entry.drop) continue;
        if (entry.to && !registryMap.has(entry.to)) {
          bridgeTargetErrors.push({ type, key, target: entry.to, reason: `bridge target "${entry.to}" not found in field_registry for ${REGISTRY_TYPE(type)}` });
        }
        if (entry.compose && !registryMap.has(entry.compose.targetKey)) {
          bridgeTargetErrors.push({ type, key, target: entry.compose.targetKey, reason: `compose target "${entry.compose.targetKey}" not found in field_registry for ${REGISTRY_TYPE(type)}` });
        }
      }
    }

    // Auto-included registry fields (appended after curated columns) are registry rows by
    // construction — always resolvable — but still verify no bridge entry SHADOWS one
    // (a bridge key that collides with an auto-included field's own key would be a config bug).
    const registryRows = [...registryMap.values()];
    const autoFields = autoIncludedRegistryFields(type === 'KALANDRA' ? 'ARREST' : type, registryRows, configKeys);
    for (const f of autoFields) {
      if (bridge[f.field_key]) {
        bridgeTargetErrors.push({ type, key: f.field_key, target: null, reason: 'bridge entry shadows an auto-included registry field of the same key — remove one or the other' });
      }
    }
  }

  if (gaps.length === 0 && bridgeTargetErrors.length === 0) {
    console.log(`✓ import-bridge-parity: every template column resolves for ${TYPES.join(', ')}.`);
    process.exit(0);
  }

  if (gaps.length) {
    console.error(`\n${gaps.length} unresolved template column(s):`);
    for (const g of gaps) console.error(`  ${g.type}/${g.role}: '${g.key}' — ${g.reason}`);
  }
  if (bridgeTargetErrors.length) {
    console.error(`\n${bridgeTargetErrors.length} bridge configuration error(s):`);
    for (const e of bridgeTargetErrors) console.error(`  ${e.type}: '${e.key}' — ${e.reason}`);
  }
  console.error('\nFix in import-fields.config.js (add/remove a curated field) or import-key-bridge.config.js (add/fix a bridge entry).');
  process.exit(1);
}

main().catch((err) => {
  console.error('import-bridge-parity crashed:', err);
  process.exit(1);
});
