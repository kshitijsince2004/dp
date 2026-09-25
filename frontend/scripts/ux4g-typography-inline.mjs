import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mapping = [];

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(jsx|js)$/.test(ent.name)) files.push(p);
  }
  return files;
}

/**
 * Inline style fontSize exact matches → CSS vars.
 * Skip chart axis props (fontSize={N} on Recharts) — those stay FLAGGED when N < 11
 * or when changing would densify axes. We only convert object-style fontSize: N / 'Npx'.
 */
const inlineMaps = [
  // fontSize: 11 or '11px' or "11px"
  { re: /fontSize:\s*['"]?11(?:px)?['"]?/g, to: "fontSize: 'var(--text-label-s)'", old: 'fontSize 11', role: 'label-s' },
  { re: /fontSize:\s*['"]?12(?:px)?['"]?/g, to: "fontSize: 'var(--text-label-m)'", old: 'fontSize 12', role: 'label-m' },
  { re: /fontSize:\s*['"]?14(?:px)?['"]?/g, to: "fontSize: 'var(--text-body-s)'", old: 'fontSize 14', role: 'body-s' },
  { re: /fontSize:\s*['"]?16(?:px)?['"]?/g, to: "fontSize: 'var(--text-body-m)'", old: 'fontSize 16', role: 'body-m' },
  { re: /fontSize:\s*['"]?18(?:px)?['"]?/g, to: "fontSize: 'var(--text-body-l)'", old: 'fontSize 18', role: 'body-l' },
  { re: /fontSize:\s*['"]?20(?:px)?['"]?/g, to: "fontSize: 'var(--text-title-m)'", old: 'fontSize 20', role: 'title-m' },
  { re: /fontSize:\s*['"]?24(?:px)?['"]?/g, to: "fontSize: 'var(--text-title-l)'", old: 'fontSize 24', role: 'title-l' },
  { re: /font-size:\s*['"]11(?:px)?['"]/g, to: "font-size: 'var(--text-label-s)'", old: 'font-size 11', role: 'label-s' },
  { re: /font-size:\s*['"]12(?:px)?['"]/g, to: "font-size: 'var(--text-label-m)'", old: 'font-size 12', role: 'label-m' },
  { re: /font-size:\s*['"]14(?:px)?['"]/g, to: "font-size: 'var(--text-body-s)'", old: 'font-size 14', role: 'body-s' },
  { re: /font-size:\s*['"]16(?:px)?['"]/g, to: "font-size: 'var(--text-body-m)'", old: 'font-size 16', role: 'body-m' },
  // 0.875rem = 14
  { re: /fontSize:\s*['"]0\.875rem['"]/g, to: "fontSize: 'var(--text-body-s)'", old: '0.875rem', role: 'body-s' },
  { re: /font-size:\s*['"]0\.875rem['"]/g, to: "font-size: 'var(--text-body-s)'", old: '0.875rem', role: 'body-s' },
  { re: /fontSize:\s*['"]1rem['"]/g, to: "fontSize: 'var(--text-body-m)'", old: '1rem', role: 'body-m' },
  { re: /font-size:\s*['"]1rem['"]/g, to: "font-size: 'var(--text-body-m)'", old: '1rem', role: 'body-m' },
  { re: /fontSize:\s*['"]1\.25rem['"]/g, to: "fontSize: 'var(--text-title-m)'", old: '1.25rem', role: 'title-m' },
  { re: /fontSize:\s*['"]1\.5rem['"]/g, to: "fontSize: 'var(--text-title-l)'", old: '1.5rem', role: 'title-l' },
  { re: /fontSize:\s*['"]2\.5rem['"]/g, to: "fontSize: 'var(--text-display-s)'", old: '2.5rem', role: 'display-s' },
  { re: /font-size:\s*['"]2\.5rem['"]/g, to: "font-size: 'var(--text-display-s)'", old: '2.5rem', role: 'display-s' },
];

// wrapperStyle fontSize in legends — exact 11 only
const wrapperMaps = [
  { re: /fontSize:\s*['"]11px['"]/g, to: "fontSize: 'var(--text-label-s)'", old: "wrapperStyle 11px", role: 'label-s' },
  { re: /fontSize:\s*['"]12px['"]/g, to: "fontSize: 'var(--text-label-m)'", old: "wrapperStyle 12px", role: 'label-m' },
  { re: /fontSize:\s*['"]14px['"]/g, to: "fontSize: 'var(--text-body-s)'", old: "wrapperStyle 14px", role: 'body-s' },
];

const files = walk(path.join(root, 'src'));
let changed = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  const rel = path.relative(root, file).replace(/\\/g, '/');

  for (const { re, to, old, role } of [...inlineMaps, ...wrapperMaps]) {
    const n = (src.match(re) || []).length;
    if (n) {
      src = src.replace(re, to);
      mapping.push({ file: rel, old, role, count: n });
    }
  }

  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
  }
}

// Merge into existing report
const reportPath = path.join(root, 'TYPOGRAPHY_PASS_REPORT.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
report.mapping = [...(report.mapping || []), ...mapping];
report.inlinePassChanged = changed;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ changed, mappingEntries: mapping.length }, null, 2));
