import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mapping = [];
const flagged = [];

const cssExact = [
  [/font-size:\s*16px\b/g, 'font-size: var(--text-body-m)', '16px', 'body-m'],
  [/font-size:\s*0\.6875rem\b/g, 'font-size: var(--text-label-s)', '0.6875rem', 'label-s'],
  [/font-size:\s*0\.75rem\b/g, 'font-size: var(--text-label-m)', '0.75rem', 'label-m'],
  [/font-size:\s*0\.875rem\b/g, 'font-size: var(--text-body-s)', '0.875rem', 'body-s'],
  [/font-size:\s*1rem\b(?![\w-])/g, 'font-size: var(--text-body-m)', '1rem', 'body-m'],
  [/font-size:\s*1\.125rem\b/g, 'font-size: var(--text-body-l)', '1.125rem', 'body-l'],
  [/font-size:\s*1\.25rem\b/g, 'font-size: var(--text-heading-s)', '1.25rem', 'heading-s'],
  [/font-size:\s*1\.5rem\b/g, 'font-size: var(--text-heading-m)', '1.5rem', 'heading-m'],
  [/font-size:\s*1\.75rem\b/g, 'font-size: var(--text-heading-l)', '1.75rem', 'heading-l'],
  [/font-size:\s*2rem\b/g, 'font-size: var(--text-heading-xl)', '2rem', 'heading-xl'],
  [/font-size:\s*2\.25rem\b/g, 'font-size: var(--text-display-xs)', '2.25rem', 'display-xs'],
  [/font-size:\s*2\.5rem\b/g, 'font-size: var(--text-heading-xxl)', '2.5rem', 'heading-xxl'],
  [/font-size:\s*11px\b/g, 'font-size: var(--text-label-s)', '11px', 'label-s'],
  [/font-size:\s*12px\b/g, 'font-size: var(--text-label-m)', '12px', 'label-m'],
  [/font-size:\s*14px\b/g, 'font-size: var(--text-body-s)', '14px', 'body-s'],
  [/font-size:\s*18px\b/g, 'font-size: var(--text-body-l)', '18px', 'body-l'],
  [/font-size:\s*20px\b/g, 'font-size: var(--text-heading-s)', '20px', 'heading-s'],
  [/font-size:\s*24px\b/g, 'font-size: var(--text-heading-m)', '24px', 'heading-m'],
  [/font-size:\s*28px\b/g, 'font-size: var(--text-heading-l)', '28px', 'heading-l'],
  [/font-size:\s*32px\b/g, 'font-size: var(--text-heading-xl)', '32px', 'heading-xl'],
];

let css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');

for (const [re, rep, old, role] of cssExact) {
  const matches = css.match(re);
  if (matches) {
    mapping.push({ file: 'src/index.css', old, role, count: matches.length });
    css = css.replace(re, (m) => (m.includes('!important') ? `${rep} !important` : rep));
  }
}
css = css.replace(/!important\s*!important/g, '!important');
css = css.replace(/font-weight:\s*900(\s*!important)?/g, 'font-weight: 700$1');
css = css.replace(/font-weight:\s*800(\s*!important)?/g, 'font-weight: 700$1');
// Restore html rem root — must stay literal 16px
css = css.replace(/(html\s*\{[\s\S]*?)font-size:\s*var\(--text-body-m\)/, '$1font-size: 16px');

fs.writeFileSync(path.join(root, 'src/index.css'), css);

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(jsx|js|tsx|ts)$/.test(ent.name)) files.push(p);
  }
  return files;
}

const classMaps = [
  [/text-\[11px\]/g, 'text-label-s', 'text-[11px]', 'label-s'],
  [/text-\[12px\]/g, 'text-label-m', 'text-[12px]', 'label-m'],
  [/text-\[14px\]/g, 'text-body-s', 'text-[14px]', 'body-s'],
  [/text-\[16px\]/g, 'text-body-m', 'text-[16px]', 'body-m'],
  [/text-\[18px\]/g, 'text-body-l', 'text-[18px]', 'body-l'],
  [/text-\[20px\]/g, 'text-title-m', 'text-[20px]', 'title-m'],
  [/text-\[24px\]/g, 'text-title-l', 'text-[24px]', 'title-l'],
];

const files = walk(path.join(root, 'src'));
let jsxChanged = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  for (const [re, rep, old, role] of classMaps) {
    const n = (src.match(re) || []).length;
    if (n) {
      src = src.replace(re, rep);
      mapping.push({ file: path.relative(root, file).replace(/\\/g, '/'), old, role, count: n });
    }
  }
  const nBlack = (src.match(/\bfont-black\b/g) || []).length;
  const nExtra = (src.match(/\bfont-extrabold\b/g) || []).length;
  if (nBlack + nExtra) {
    src = src.replace(/\bfont-black\b/g, 'font-bold');
    src = src.replace(/\bfont-extrabold\b/g, 'font-bold');
    mapping.push({
      file: path.relative(root, file).replace(/\\/g, '/'),
      old: 'font-black/extrabold',
      role: 'font-bold(700)',
      count: nBlack + nExtra,
    });
  }
  src = src.replace(/fontWeight:\s*['"]?900['"]?/g, 'fontWeight: 700');
  src = src.replace(/fontWeight:\s*['"]?800['"]?/g, 'fontWeight: 700');
  src = src.replace(/font-weight:\s*['"]?900['"]?/g, 'font-weight: 700');
  src = src.replace(/font-weight:\s*['"]?800['"]?/g, 'font-weight: 700');

  if (src !== orig) {
    fs.writeFileSync(file, src);
    jsxChanged++;
  }
}

// Flag remaining non-exact CSS sizes
const cssNow = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
const cssSizeRe = /font-size:\s*([^;]+);/g;
let m;
while ((m = cssSizeRe.exec(cssNow))) {
  const val = m[1].trim();
  if (val.startsWith('var(--text-') || val === '16px') continue;
  flagged.push({
    file: 'src/index.css',
    value: val,
    reason: 'Non-exact UX4G size; left unchanged to preserve layout',
    proposed: 'nearest role pending approval',
  });
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const arb = src.match(/text-\[\d+px\]/g) || [];
  for (const a of arb) {
    const px = Number(a.match(/\d+/)[0]);
    flagged.push({
      file: path.relative(root, file).replace(/\\/g, '/'),
      value: a,
      reason:
        px < 11
          ? 'Below Label/S (11px); enlarging would reflow dense UI'
          : 'Non-exact scale step; left unchanged pending approval',
      proposed: px < 11 ? 'label-s' : 'review by role',
    });
  }
}

const report = {
  mapping,
  flagged,
  flaggedCount: flagged.length,
  jsxChanged,
  note: 'Exact matches bound to tokens; sub-11px and non-exact CSS sizes FLAGGED.',
};
fs.writeFileSync(path.join(root, 'TYPOGRAPHY_PASS_REPORT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ jsxChanged, mappingEntries: mapping.length, flaggedCount: flagged.length }, null, 2));
