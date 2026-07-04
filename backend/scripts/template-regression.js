// Import-template regression tool. Guards the Excel bulk-import templates against
// accidental structural changes (columns moving, dropping, relabeling, losing dropdowns).
//
//   node scripts/template-regression.js baseline   # regenerate all templates, save the
//                                                  # structural manifest as the new baseline
//   node scripts/template-regression.js check      # regenerate and compare against the saved
//                                                  # baseline; exits 1 and prints what changed
//   node scripts/template-regression.js report     # audit: which field_registry fields are
//                                                  # auto-included / excluded per record type
//
// Run "check" after touching import-fields.config.js, template-builder.service.js,
// import.controller.js or the base *_Import_Template_Final.xlsx files. Run "baseline"
// only when a template change is INTENTIONAL, to bless the new shape.
//
// The comparison covers record sheets only (column keys, labels, hints, section banners,
// merges, per-column validation). _Lookups contents and named-range definitions are shown
// in the manifest but not compared — they legitimately change with DB reference data.
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import db from '../src/config/db.js';
import { downloadImportTemplate } from '../src/modules/import/import.controller.js';
import { autoIncludedRegistryFields, isTemplateExcluded, parseApplicableTypes } from '../src/modules/import/registry-sync.util.js';
import {
  CASE_SHEETS_CONFIG, ARREST_SHEETS_CONFIG, UIDB_SHEETS_CONFIG, MISSING_SHEETS_CONFIG,
} from '../src/modules/import/import-fields.config.js';

const BASELINE_PATH = path.join(process.cwd(), 'scripts', 'template-baseline.manifest.json');
const TYPES = ['CASE', 'ARREST', 'UIDB', 'MISSING'];

const generateTemplates = async (outDir) => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const t of TYPES) {
    const file = path.join(outDir, `${t}.xlsx`);
    const stream = fs.createWriteStream(file);
    stream.setHeader = () => {};
    stream.status = (code) => ({ json: (o) => { throw new Error(`${t}: HTTP ${code} ${JSON.stringify(o)}`); } });
    await downloadImportTemplate({ params: { record_type: t }, query: { lang: 'en' } }, stream);
    await new Promise((res) => stream.on('close', res));
  }
};

const cellText = (cell) => {
  let v = cell.value;
  if (v && typeof v === 'object' && Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join('');
  if (v && typeof v === 'object' && 'text' in v) v = v.text;
  return v === null || v === undefined ? null : String(v);
};

const colLetterToNum = (letter) => {
  let n = 0;
  for (let i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64);
  return n;
};

const validationsByColumn = (ws) => {
  const model = (ws.dataValidations && ws.dataValidations.model) || {};
  const byCol = {};
  for (const [sqref, dv] of Object.entries(model)) {
    for (const part of sqref.split(/\s+/)) {
      const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(part);
      if (!m) continue;
      const c1 = colLetterToNum(m[1]);
      const c2 = m[3] ? colLetterToNum(m[3]) : c1;
      const r1 = parseInt(m[2], 10);
      for (let c = c1; c <= c2; c++) {
        if (!byCol[c] || r1 < byCol[c]._row) {
          byCol[c] = { _row: r1, type: dv.type, formulae: dv.formulae };
        }
      }
    }
  }
  for (const c of Object.keys(byCol)) delete byCol[c]._row;
  return byCol;
};

const extractManifest = async (dir) => {
  const manifest = {};
  for (const t of TYPES) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(dir, `${t}.xlsx`));
    const sheets = {};
    for (const ws of wb.worksheets) {
      if (ws.name === '_Lookups') continue;
      const dvByCol = validationsByColumn(ws);
      const columns = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const key = cellText(ws.getCell(1, c));
        const section = cellText(ws.getCell(2, c));
        const label = cellText(ws.getCell(3, c));
        const hint = cellText(ws.getCell(4, c));
        if (!key && !section && !label && !hint && !dvByCol[c]) continue;
        columns.push({ col: c, key, section, label, hint, validation: dvByCol[c] || null });
      }
      const row2Merges = (ws.model.merges || []).filter((m) => /^[A-Z]+2:/.test(m)).sort();
      sheets[ws.name] = { columns, row2Merges };
    }
    manifest[t] = sheets;
  }
  return manifest;
};

const compareManifests = (baseline, current) => {
  const problems = [];
  for (const t of TYPES) {
    const bSheets = baseline[t] || {};
    const cSheets = current[t] || {};
    for (const name of new Set([...Object.keys(bSheets), ...Object.keys(cSheets)])) {
      const b = bSheets[name];
      const c = cSheets[name];
      if (!b) { problems.push(`${t}/${name}: sheet is NEW (not in baseline)`); continue; }
      if (!c) { problems.push(`${t}/${name}: sheet MISSING`); continue; }
      const bKeys = b.columns.map((x) => x.key);
      const cKeys = c.columns.map((x) => x.key);
      const max = Math.max(b.columns.length, c.columns.length);
      for (let i = 0; i < max; i++) {
        const bc = b.columns[i];
        const cc = c.columns[i];
        if (!bc) { problems.push(`${t}/${name}: column ${i + 1} ADDED ('${cc.key}' "${cc.label}")`); continue; }
        if (!cc) { problems.push(`${t}/${name}: column ${i + 1} REMOVED ('${bc.key}' "${bc.label}")`); continue; }
        for (const prop of ['key', 'section', 'label', 'hint']) {
          if (bc[prop] !== cc[prop]) problems.push(`${t}/${name} col ${i + 1} ('${bc.key}'): ${prop} changed "${bc[prop]}" -> "${cc[prop]}"`);
        }
        if (JSON.stringify(bc.validation) !== JSON.stringify(cc.validation)) {
          problems.push(`${t}/${name} col ${i + 1} ('${bc.key}'): validation changed ${JSON.stringify(bc.validation)} -> ${JSON.stringify(cc.validation)}`);
        }
      }
      if (JSON.stringify(b.row2Merges) !== JSON.stringify(c.row2Merges)) {
        problems.push(`${t}/${name}: row-2 section merges changed`);
      }
      void bKeys; void cKeys;
    }
  }
  return problems;
};

const runReport = async () => {
  const rows = await db('field_registry').where('is_active', true)
    .select('field_key', 'label_en', 'section', 'applicable_record_types')
    .orderBy('sort_order', 'asc');
  const CONFIG_KEYS = {
    CASE: new Set(Object.values(CASE_SHEETS_CONFIG).flat()),
    ARREST: new Set(Object.values(ARREST_SHEETS_CONFIG).flat()),
    UIDB: new Set(Object.values(UIDB_SHEETS_CONFIG).flat()),
    MISSING: new Set(Object.values(MISSING_SHEETS_CONFIG).flat()),
  };
  for (const t of TYPES) {
    const auto = autoIncludedRegistryFields(t, rows, CONFIG_KEYS[t]);
    const excluded = rows.filter((r) =>
      parseApplicableTypes(r.applicable_record_types).includes(t)
      && !CONFIG_KEYS[t].has(r.field_key)
      && isTemplateExcluded(t, r.field_key));
    console.log(`\n=== ${t} ===`);
    console.log(`auto-included in template (${auto.length}):`);
    for (const f of auto) console.log(`  + ${f.field_key.padEnd(38)} "${f.label_en}"`);
    console.log(`excluded from template (${excluded.length}):`);
    for (const f of excluded) console.log(`  - ${f.field_key.padEnd(38)} "${f.label_en}"`);
  }
};

const mode = process.argv[2];
try {
  if (mode === 'report') {
    await runReport();
  } else if (mode === 'baseline' || mode === 'check') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pharos-templates-'));
    await generateTemplates(tmp);
    const manifest = await extractManifest(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (mode === 'baseline') {
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(manifest, null, 2));
      console.log(`Baseline saved: ${BASELINE_PATH}`);
    } else {
      if (!fs.existsSync(BASELINE_PATH)) throw new Error(`No baseline at ${BASELINE_PATH} — run "baseline" first.`);
      const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
      const problems = compareManifests(baseline, manifest);
      if (problems.length) {
        console.log(`TEMPLATE DRIFT DETECTED (${problems.length} difference(s)):\n`);
        for (const p of problems) console.log('  ' + p);
        console.log('\nIf these changes are intentional, bless them with: node scripts/template-regression.js baseline');
        process.exitCode = 1;
      } else {
        console.log('OK — templates match the baseline exactly.');
      }
    }
  } else {
    console.log('usage: node scripts/template-regression.js <baseline|check|report>');
    process.exitCode = 2;
  }
} finally {
  await db.destroy().catch(() => {});
}
