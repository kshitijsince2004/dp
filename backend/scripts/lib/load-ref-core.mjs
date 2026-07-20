// load-ref core — org hierarchy + the 21 ref.* lookup tables (DB_SCHEMA.md §8).
// Importable: used by the scripts/load-ref.mjs CLI wrapper AND the startup
// auto-loader (src/bootstrap/autoload.js). Takes a knex instance; throws on any
// failure (callers decide whether that means process.exit or aborted boot).
//
//   1. config/org/hierarchy.json  → hierarchy_nodes (upsert by code, parents first)
//   2. config/ref-data/Menu_Tables.xlsx → ref.* in FK order, in ONE transaction
//   3. config/ref-overlays/local_head_categories.json → ref.local_heads.crime_category
//
// Discipline (ruling 10 + REF_KEY_VERIFICATION.md):
//   - duplicate natural key       → ABORT, listing sheet row numbers
//   - unresolvable FK             → ABORT — except ref.major_minor_mapping, whose source
//     is dirty at origin: those rows are QUARANTINED with a per-reason report
//   - sections rows with NULL act_sec_cd (prose spillover) → excluded, each one reported
//   - beats: linked via config/org/ps_codes.json; ps_cd values absent from the official
//     list load with ps_id = NULL and the raw code kept in source_ps_cd — printed loudly
//   - overlay naming an unknown local_head_cd → ABORT
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(__dirname, '../../../config');

const SOURCE_FILES = [
  path.join(CONFIG, 'ref-data', 'Menu_Tables.xlsx'),
  path.join(CONFIG, 'org', 'hierarchy.json'),
  path.join(CONFIG, 'org', 'ps_codes.json'),
  path.join(CONFIG, 'ref-overlays', 'local_head_categories.json'),
];

export const REF_CHECKSUM_KEY = 'ref_source_checksum';

/**
 * sha256 over every ref/hierarchy source file's bytes — the startup auto-loader
 * compares this against system_meta.ref_source_checksum to decide whether a
 * reload is needed. Missing optional files hash as their absence marker.
 */
export function computeRefSourceChecksum() {
  const h = crypto.createHash('sha256');
  for (const f of SOURCE_FILES) {
    h.update(f);
    h.update(fs.existsSync(f) ? fs.readFileSync(f) : 'ABSENT');
  }
  return h.digest('hex');
}

const fail = (msg) => { throw new Error(`load-ref FAILED: ${msg}`); };

// ── cell helpers (proven semantics from the old loader) ──────────────────────
function getVal(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object') {
    if (cell.result !== undefined) return cell.result;
    if (cell.text !== undefined) return cell.text;
    if (cell.richText !== undefined) return cell.richText.map(t => t.text).join('');
  }
  return cell;
}
function clean(cell) {
  let v = getVal(cell);
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    v = v.trim();
    if (v === '\\N' || v === 'NULL' || v === '') return null;
  }
  return v;
}
function cleanInt(cell) {
  const v = clean(cell);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function cleanBool(cell) {
  const v = clean(cell);
  if (v === null) return null;
  const s = String(v).trim().toUpperCase();
  if (['Y', 'YES', 'TRUE', '1'].includes(s)) return true;
  if (['N', 'NO', 'FALSE', '0'].includes(s)) return false;
  return null;
}

function assertUnique(table, rows, keyFn) {
  const seen = new Map();
  const dups = [];
  for (const r of rows) {
    const k = JSON.stringify(keyFn(r.data));
    if (seen.has(k)) dups.push(`${k} (rows ${seen.get(k)} and ${r.rowNum})`);
    else seen.set(k, r.rowNum);
  }
  if (dups.length) fail(`${table}: duplicate natural keys — never skipped silently:\n  ${dups.slice(0, 20).join('\n  ')}${dups.length > 20 ? `\n  … +${dups.length - 20} more` : ''}`);
}

/**
 * Run the full hierarchy + ref load against the given knex instance.
 * Throws on any failure. `log` defaults to console.log.
 */
export async function loadRef(db, log = console.log) {
  const counts = {};
  async function insert(trx, table, rows) {
    if (rows.length) await trx.batchInsert(table, rows.map(r => r.data ?? r), 500);
    counts[table] = rows.length;
  }

  // ═════════════════════════ 1. hierarchy ════════════════════════════════════
  const hierPath = path.join(CONFIG, 'org', 'hierarchy.json');
  if (!fs.existsSync(hierPath)) fail(`missing ${hierPath}`);
  const hierarchy = JSON.parse(fs.readFileSync(hierPath, 'utf8'));

  log(`Loading hierarchy (${hierarchy.length} nodes) …`);
  const codeToId = {};
  await db.transaction(async (trx) => {
    for (const n of hierarchy) { // file is ordered parents-first (HQ→…→PS)
      const parentId = n.parent_code ? codeToId[n.parent_code] : null;
      if (n.parent_code && !parentId) fail(`hierarchy: ${n.code} references unknown parent ${n.parent_code}`);
      const existing = await trx('hierarchy_nodes').where({ code: n.code }).first();
      const row = {
        node_type: n.node_type, name: n.name, code: n.code, parent_id: parentId,
        metadata: JSON.stringify(n.metadata || {}), is_active: n.is_active !== false,
        updated_at: trx.fn.now(),
      };
      if (existing) {
        await trx('hierarchy_nodes').where({ id: existing.id }).update(row);
        codeToId[n.code] = existing.id;
      } else {
        const [ins] = await trx('hierarchy_nodes').insert(row).returning('id');
        codeToId[n.code] = ins.id ?? ins;
      }
    }
    // nodes no longer in config (e.g. the replaced fictional sub-division layer) → deactivate
    const configCodes = hierarchy.map(n => n.code);
    const stale = await trx('hierarchy_nodes').whereNotIn('code', configCodes).where('is_active', true);
    if (stale.length) {
      await trx('hierarchy_nodes').whereNotIn('code', configCodes).update({ is_active: false, updated_at: trx.fn.now() });
      log(`hierarchy_nodes: deactivated ${stale.length} nodes absent from config: ${stale.map(s => s.code).slice(0, 10).join(', ')}${stale.length > 10 ? ' …' : ''}`);
    }
  });
  log(`hierarchy_nodes: ${hierarchy.length} upserted`);

  // ═════════════════════════ 2. workbook parse ═══════════════════════════════
  const xlsxPath = path.join(CONFIG, 'ref-data', 'Menu_Tables.xlsx');
  if (!fs.existsSync(xlsxPath)) fail(`missing ${xlsxPath}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheetRows = (name) => {
    const sheet = wb.getWorksheet(name);
    if (!sheet) fail(`sheet "${name}" not found in Menu_Tables.xlsx`);
    const out = [];
    sheet.eachRow((row, rowNum) => out.push({ rowNum, v: row.values }));
    return out;
  };

  // simple single-code sheets: [sheet, table, codeCol, labelCol]
  const SIMPLE = [
    ['AUTOMOBILES AND OTHERS', 'ref.automobiles', 'automobile_cd', 'automobile'],
    ['COIN AND CURRENCY', 'ref.currency_types', 'currency_type_cd', 'currency_type'],
    ['CULTURAL PROPERTY', 'ref.cultural_properties', 'cultural_prop_cd', 'cultural_prop'],
    ['Documents', 'ref.document_types', 'document_type_cd', 'document_type'],
    ['DRUGS NARCOTIC', 'ref.drug_types', 'drug_type_cd', 'drug_type'],
    ['ELECTRICAL AND ELECTRONIC GOODS', 'ref.electric_goods', 'electric_goods_cd', 'electric_goods'],
    ['EXPLOSIVES', 'ref.explosive_types', 'explosive_type_cd', 'explosive_type'],
    ['JEWELLERY', 'ref.jewelry_types', 'jewelry_type_cd', 'jewelry_type'],
  ];

  // acts
  const acts = sheetRows('act').slice(1)
    .map(({ rowNum, v }) => ({ rowNum, data: { act_cd: cleanInt(v[1]), act_long: clean(v[3]) } }))
    .filter(r => r.data.act_cd !== null && r.data.act_long !== null);
  assertUnique('ref.acts', acts, (d) => d.act_cd);
  const actCds = new Set(acts.map(r => r.data.act_cd));

  // sections — PK section_code; exclude prose-spillover junk (NULL act_sec_cd) LOUDLY
  const junkSections = [];
  const sections = [];
  for (const { rowNum, v } of sheetRows('section').slice(1)) {
    const section_code = clean(v[1]);
    if (section_code === null) continue;
    const act_sec_cd = clean(v[4]);
    if (act_sec_cd === null) { junkSections.push({ rowNum, section_code }); continue; }
    sections.push({ rowNum, data: {
      section_code: String(section_code), section_cd: clean(v[3]) && String(clean(v[3])),
      act_sec_cd: String(act_sec_cd), section: clean(v[5]) && String(clean(v[5])),
      section_desc: clean(v[6]) && String(clean(v[6])), pnsh_gt_7yrs: cleanBool(v[7]),
    } });
  }
  if (junkSections.length) {
    log(`ref.sections: EXCLUDED ${junkSections.length} prose-spillover rows (NULL act_sec_cd) — row numbers: ${junkSections.map(j => j.rowNum).join(', ')}`);
  }
  assertUnique('ref.sections', sections, (d) => d.section_code);
  const sectionCodes = new Set(sections.map(r => r.data.section_code));

  // major heads
  const majors = sheetRows('major head').slice(1)
    .map(({ rowNum, v }) => ({ rowNum, data: { major_head_code: cleanInt(v[1]), major_head: clean(v[3]) } }))
    .filter(r => r.data.major_head_code !== null && r.data.major_head !== null);
  assertUnique('ref.major_heads', majors, (d) => d.major_head_code);
  const majorCds = new Set(majors.map(r => r.data.major_head_code));

  // minor heads — FK enforced, abort on unresolved
  const minors = sheetRows('minor head').slice(1)
    .map(({ rowNum, v }) => ({ rowNum, data: { minor_head_cd: cleanInt(v[1]), major_head_code: cleanInt(v[3]), minor_head: clean(v[4]) } }))
    .filter(r => r.data.minor_head_cd !== null);
  assertUnique('ref.minor_heads', minors, (d) => d.minor_head_cd);
  {
    const bad = minors.filter(r => !majorCds.has(r.data.major_head_code));
    if (bad.length) fail(`ref.minor_heads: ${bad.length} rows reference unknown major_head_code: ${bad.slice(0, 10).map(r => `row ${r.rowNum}→${r.data.major_head_code}`).join(', ')}`);
  }

  // major_minor_mapping — THE one quarantine table (source dirty at origin)
  const mmmAll = sheetRows('Major_Minor_Mapping').slice(1)
    .map(({ rowNum, v }) => ({ rowNum, data: { sec_mjrhd_cd: cleanInt(v[1]), act_cd: cleanInt(v[3]), section_code: clean(v[4]) && String(clean(v[4])), major_head_code: cleanInt(v[5]) } }))
    .filter(r => r.data.sec_mjrhd_cd !== null);
  assertUnique('ref.major_minor_mapping', mmmAll, (d) => d.sec_mjrhd_cd);
  const quarantine = { act_cd: [], section_code: [], major_head_code: [] };
  const mmm = mmmAll.filter((r) => {
    let ok = true;
    if (r.data.act_cd === null || !actCds.has(r.data.act_cd)) { quarantine.act_cd.push(r.data.act_cd); ok = false; }
    if (r.data.section_code === null || !sectionCodes.has(r.data.section_code)) { quarantine.section_code.push(r.data.section_code); ok = false; }
    if (r.data.major_head_code === null || !majorCds.has(r.data.major_head_code)) { quarantine.major_head_code.push(r.data.major_head_code); ok = false; }
    return ok;
  });
  {
    const q = Object.entries(quarantine).filter(([, v]) => v.length);
    if (q.length) {
      log(`ref.major_minor_mapping: QUARANTINED ${mmmAll.length - mmm.length}/${mmmAll.length} source-dirty rows:`);
      for (const [reason, vals] of q) {
        log(`  unresolvable ${reason} (${vals.length} rows): distinct = ${[...new Set(vals)].slice(0, 20).join(', ')}`);
      }
    }
  }

  // local heads
  const localHeads = sheetRows('local head').slice(1)
    .map(({ rowNum, v }) => ({ rowNum, data: { local_head_cd: cleanInt(v[1]), local_head: clean(v[3]) } }))
    .filter(r => r.data.local_head_cd !== null && r.data.local_head !== null);
  assertUnique('ref.local_heads', localHeads, (d) => d.local_head_cd);

  // Property Type sheet + OTHERS categories section → merged ref.property_categories
  const propertyCategories = sheetRows('Property Type').slice(1)
    .map(({ rowNum, v }) => ({ rowNum, data: { parent_srno: cleanInt(v[1]), parent_cd: cleanInt(v[3]), code_type: clean(v[4]), parent_type: clean(v[5]), major_property: cleanInt(v[6]) } }))
    .filter(r => r.data.parent_srno !== null && r.data.parent_cd !== null);

  // OTHERS sheet: two header-delimited sections (categories, then items)
  const otherItems = [];
  {
    let state = null;
    for (const { rowNum, v } of sheetRows('OTHERS')) {
      const c0 = clean(v[1]);
      if (c0 === 'parent_srno') { state = 'MAJOR'; continue; }
      if (c0 === 'property_cd') { state = 'MINOR'; continue; }
      if (state === 'MAJOR') {
        const d = { parent_srno: cleanInt(v[1]), parent_cd: cleanInt(v[3]), code_type: clean(v[4]), parent_type: clean(v[5]), major_property: cleanInt(v[6]) };
        if (d.parent_srno !== null && d.parent_cd !== null) propertyCategories.push({ rowNum, data: d });
      } else if (state === 'MINOR') {
        const d = { property_cd: cleanInt(v[1]), parent_cd: cleanInt(v[3]), property_type_srno: clean(v[4]) && String(clean(v[4])), property: clean(v[5]) };
        if (d.property_cd !== null && d.parent_cd !== null && d.property !== null) otherItems.push({ rowNum, data: d });
      }
    }
  }
  assertUnique('ref.property_categories', propertyCategories, (d) => d.parent_cd);
  assertUnique('ref.property_categories(parent_srno)', propertyCategories, (d) => d.parent_srno);
  assertUnique('ref.other_property_items', otherItems, (d) => d.property_cd);
  {
    const catCds = new Set(propertyCategories.map(r => r.data.parent_cd));
    const bad = otherItems.filter(r => !catCds.has(r.data.parent_cd));
    if (bad.length) fail(`ref.other_property_items: ${bad.length} rows reference unknown parent_cd: ${bad.slice(0, 10).map(r => `row ${r.rowNum}→${r.data.parent_cd}`).join(', ')}`);
  }

  // ARMS sheet: FOUR header-delimited sections (made / categories / fire_arms / subtypes)
  const armsMade = [], armsCategories = [], fireArms = [], fireArmsSubtypes = [];
  {
    let state = null;
    for (const { rowNum, v } of sheetRows('ARMS AND AMMUNITION')) {
      const c0 = clean(v[1]);
      if (c0 === 'arms_made_cd') { state = 'MADE'; continue; }
      if (c0 === 'arms_category_cd') { state = 'CAT'; continue; }
      if (c0 === 'fire_arms_cd') { state = 'FIRE'; continue; }
      if (c0 === 'arms_subtype_cd') { state = 'SUB'; continue; }
      if (state === 'MADE') {
        const d = { arms_made_cd: cleanInt(v[1]), arms_made: clean(v[3]) };
        if (d.arms_made_cd !== null && d.arms_made !== null) armsMade.push({ rowNum, data: d });
      } else if (state === 'CAT') {
        const d = { arms_category_cd: cleanInt(v[1]), arms_category: clean(v[3]) };
        if (d.arms_category_cd !== null && d.arms_category !== null) armsCategories.push({ rowNum, data: d });
      } else if (state === 'FIRE') {
        const d = { fire_arms_cd: cleanInt(v[1]), arms_category_cd: cleanInt(v[3]), fire_arms: clean(v[4]) };
        if (d.fire_arms_cd !== null && d.arms_category_cd !== null && d.fire_arms !== null) fireArms.push({ rowNum, data: d });
      } else if (state === 'SUB') {
        const d = { arms_subtype_cd: cleanInt(v[1]), arms_type_cd: cleanInt(v[3]), arms_subtype: clean(v[4]) };
        if (d.arms_subtype_cd !== null && d.arms_type_cd !== null && d.arms_subtype !== null) fireArmsSubtypes.push({ rowNum, data: d });
      }
    }
  }
  assertUnique('ref.arms_made', armsMade, (d) => d.arms_made_cd);
  assertUnique('ref.arms_categories', armsCategories, (d) => d.arms_category_cd);
  assertUnique('ref.fire_arms', fireArms, (d) => d.fire_arms_cd);
  assertUnique('ref.fire_arms_subtypes', fireArmsSubtypes, (d) => d.arms_subtype_cd);
  {
    const catCds = new Set(armsCategories.map(r => r.data.arms_category_cd));
    const bad = fireArms.filter(r => !catCds.has(r.data.arms_category_cd));
    if (bad.length) fail(`ref.fire_arms: ${bad.length} rows reference unknown arms_category_cd`);
    const fireCds = new Set(fireArms.map(r => r.data.fire_arms_cd));
    const badSub = fireArmsSubtypes.filter(r => !fireCds.has(r.data.arms_type_cd));
    if (badSub.length) fail(`ref.fire_arms_subtypes: ${badSub.length} rows reference unknown arms_type_cd (fire_arms)`);
  }

  // simple sheets
  const simpleData = {};
  for (const [sheet, table, codeCol, labelCol] of SIMPLE) {
    const rows = sheetRows(sheet).slice(1)
      .map(({ rowNum, v }) => ({ rowNum, data: { [codeCol]: cleanInt(v[1]), [labelCol]: clean(v[3]) } }))
      .filter(r => r.data[codeCol] !== null && r.data[labelCol] !== null);
    assertUnique(table, rows, (d) => d[codeCol]);
    simpleData[table] = rows;
  }

  // beats — linked via the official PS-code mapping when present
  const psCodesPath = path.join(CONFIG, 'org', 'ps_codes.json'); // { "<official ps_cd>": "<hierarchy code>" }
  const psCodeMap = fs.existsSync(psCodesPath) ? JSON.parse(fs.readFileSync(psCodesPath, 'utf8')) : null;
  const beats = sheetRows('Beat').slice(1)
    .map(({ rowNum, v }) => ({ rowNum, data: {
      beat_cd: clean(v[1]) && String(clean(v[1])), beat_name: clean(v[3]),
      source_ps_cd: clean(v[4]) && String(clean(v[4])), ps_id: null,
    } }))
    .filter(r => r.data.beat_cd !== null && r.data.beat_name !== null && r.data.source_ps_cd !== null);
  assertUnique('ref.beats', beats, (d) => d.beat_cd);
  if (psCodeMap) {
    // ps_cd in the map but pointing at an unknown hierarchy code = config inconsistency → abort.
    // ps_cd absent from the map = the official code list itself doesn't carry it (defunct/renamed
    // PS in the beat sheet) → load with ps_id NULL, report the distinct codes loudly.
    const notInMap = new Set();
    let linked = 0;
    for (const r of beats) {
      const hierCode = psCodeMap[r.data.source_ps_cd];
      if (hierCode === undefined) { notInMap.add(r.data.source_ps_cd); continue; }
      const id = codeToId[hierCode];
      if (!id) fail(`ref.beats: org/ps_codes.json maps ${r.data.source_ps_cd} → "${hierCode}" which is not a hierarchy code`);
      r.data.ps_id = id;
      linked++;
    }
    log(`ref.beats: ${linked}/${beats.length} linked to PS via org/ps_codes.json`);
    if (notInMap.size) {
      log(`ref.beats: ⚠ ${notInMap.size} ps_cd values are NOT in the official code list (${beats.length - linked} beats stay ps_id=NULL, raw code kept): ${[...notInMap].sort().join(', ')}`);
    }
  } else {
    log(`ref.beats: ⚠ DEFERRED LINKING — config/org/ps_codes.json not present (official PS-code list pending); loading all ${beats.length} beats with ps_id = NULL, raw code kept in source_ps_cd`);
  }

  // overlay — fail-loud on unknown codes (ruling 16)
  const overlayPath = path.join(CONFIG, 'ref-overlays', 'local_head_categories.json');
  const overlay = fs.existsSync(overlayPath) ? JSON.parse(fs.readFileSync(overlayPath, 'utf8')) : { HEINOUS: {}, NON_HEINOUS: {} };
  const localCds = new Set(localHeads.map(r => r.data.local_head_cd));
  const overlayAssign = {};
  for (const cat of ['HEINOUS', 'NON_HEINOUS']) {
    for (const cd of Object.keys(overlay[cat] || {})) {
      if (!localCds.has(Number(cd))) fail(`ref-overlay names unknown local_head_cd ${cd} (${overlay[cat][cd]})`);
      overlayAssign[cd] = cat;
    }
  }
  for (const r of localHeads) {
    r.data.crime_category = overlayAssign[String(r.data.local_head_cd)] || 'OTHER';
  }

  // ═════════════════════════ 3. load (one transaction) ═══════════════════════
  await db.transaction(async (trx) => {
    // wipe in FK-reverse order
    for (const t of ['ref.major_minor_mapping', 'ref.fire_arms_subtypes', 'ref.fire_arms',
      'ref.other_property_items', 'ref.minor_heads', 'ref.beats', 'ref.sections',
      'ref.acts', 'ref.major_heads', 'ref.local_heads', 'ref.property_categories',
      'ref.arms_categories', 'ref.arms_made', 'ref.automobiles', 'ref.jewelry_types',
      'ref.currency_types', 'ref.document_types', 'ref.drug_types', 'ref.electric_goods',
      'ref.explosive_types', 'ref.cultural_properties']) {
      await trx(t).del();
    }
    await insert(trx, 'ref.acts', acts);
    await insert(trx, 'ref.sections', sections);
    await insert(trx, 'ref.major_heads', majors);
    await insert(trx, 'ref.minor_heads', minors);
    await insert(trx, 'ref.major_minor_mapping', mmm);
    await insert(trx, 'ref.local_heads', localHeads);
    await insert(trx, 'ref.property_categories', propertyCategories);
    await insert(trx, 'ref.other_property_items', otherItems);
    await insert(trx, 'ref.arms_categories', armsCategories);
    await insert(trx, 'ref.arms_made', armsMade);
    await insert(trx, 'ref.fire_arms', fireArms);
    await insert(trx, 'ref.fire_arms_subtypes', fireArmsSubtypes);
    for (const [, table] of SIMPLE.map(s => [s[0], s[1]])) {
      await insert(trx, table, simpleData[table]);
    }
    await insert(trx, 'ref.beats', beats);
  });

  log('\nLoaded:');
  for (const [t, n] of Object.entries(counts)) log(`  ${t.padEnd(30)} ${n}`);
  const heinousCount = localHeads.filter(r => r.data.crime_category === 'HEINOUS').length;
  log(`\ncrime_category: ${heinousCount} HEINOUS, ${localHeads.length - heinousCount} defaulted/other (overlay: ${overlayPath})`);

  // Persist the source checksum HERE, not only in the boot autoload: both entry points
  // (CLI `npm run load-ref` and src/bootstrap/autoload.js) must store it, or the first
  // boot after a manual rebuild re-runs load-ref against a DB whose records already
  // FK-reference ref rows and dies on the delete pass (record_offences → ref.sections).
  const checksum = computeRefSourceChecksum();
  await db('system_meta')
    .insert({ key: REF_CHECKSUM_KEY, value: JSON.stringify({ checksum }), updated_at: db.fn.now() })
    .onConflict('key')
    .merge();
  log(`ref_source_checksum stored (${checksum.slice(0, 12)}…)`);
}
