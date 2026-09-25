import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'scripts') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(jsx|js|css)$/.test(ent.name)) files.push(p);
  }
  return files;
}

const files = walk(path.join(root, 'src'));
const remaining = {
  textArbitraryPx: [],
  inlineFontSizeLiteral: [],
  cssFontSizeLiteral: [],
  lato: [],
};

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/text-\[(\d+)px\]/g)) {
    remaining.textArbitraryPx.push({ file: rel, value: m[0], px: Number(m[1]) });
  }
  for (const m of src.matchAll(/fontSize:\s*['"]?(\d+(?:\.\d+)?(?:px|rem)?)['"]?/g)) {
    const v = m[1];
    if (String(v).startsWith('var(')) continue;
    remaining.inlineFontSizeLiteral.push({ file: rel, value: v });
  }
  if (file.endsWith('.css')) {
    for (const m of src.matchAll(/font-size:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (v.startsWith('var(--text-') || v === '16px') continue;
      remaining.cssFontSizeLiteral.push({ file: rel, value: v });
    }
  }
  if (/Lato/.test(src)) remaining.lato.push(rel);
}

const prev = JSON.parse(fs.readFileSync(path.join(root, 'TYPOGRAPHY_PASS_REPORT.json'), 'utf8'));

const flaggedClusters = [
  {
    cluster: 'Sub-11px Tailwind arbitrary sizes',
    count: remaining.textArbitraryPx.filter((x) => x.px < 11).length,
    proposed: 'label-s (11/14)',
    reason: 'Enlarging 8–10px chips/meta would wrap dense toolbars, badges, and matrix builders',
  },
  {
    cluster: 'text-[13px] navbar stats / notifications',
    count: remaining.textArbitraryPx.filter((x) => x.px === 13).length,
    proposed: 'label-l (14) or keep legacy',
    reason: '13px sits between label-m and label-l; snap changes compact navbar metrics',
  },
  {
    cluster: 'Non-exact CSS font-size in index.css',
    count: remaining.cssFontSizeLiteral.length,
    proposed: 'nearest role after visual QA',
    reason: 'Values like 0.6–0.95rem, 1.05–1.35rem, 15px couple with 44px controls / nav density',
  },
  {
    cluster: 'Recharts axis/legend ticks 8–10px',
    count: 'see chart files',
    proposed: 'label-s',
    reason: 'Dense chart ticks; Recharts needs numeric fontSize; enlarging reflows plot margins',
  },
  {
    cluster: 'Login card title 1.35rem',
    file: 'src/features/auth/LoginPage.jsx',
    proposed: 'title-m (20px) or title-l (24px)',
    reason: 'No exact scale step; snap would shift login card header',
  },
  {
    cluster: 'Sidebar brand-sub 0.6rem',
    file: 'src/components/layout/PoliceSidebar.jsx',
    proposed: 'label-s',
    reason: 'Below scale minimum; enlarging reflows brand lockup',
  },
  {
    cluster: 'Times New Roman report print styles',
    file: 'src/index.css (.report-document)',
    proposed: 'N/A — intentional print serif',
    reason: 'Print document face is not UX4G UI type; left unchanged',
  },
  {
    cluster: 'Legacy Tailwind text-xs (13px) / text-sm (15px) / text-body (17px)',
    proposed: 'bind call sites by role; then retire aliases',
    reason: 'Metrics preserved intentionally to avoid mass reflow; not on UX4G steps',
  },
  {
    cluster: 'Display optical cuts',
    proposed: 'Noto Sans 600/700',
    reason: 'Google Fonts Noto Sans has no Display SemiBold/Bold optical cuts',
  },
];

const report = {
  ...prev,
  remaining,
  flaggedClusters,
  verification: {
    latoReferences: remaining.lato.length,
    textArbitraryPxRemaining: remaining.textArbitraryPx.length,
    cssLiteralFontSizesRemaining: remaining.cssFontSizeLiteral.length,
    canonicalTokensLocation: 'frontend/src/index.css (@theme)',
    fontLoadLocation: 'frontend/index.html (Google Fonts Noto Sans 400/500/600/700 + Devanagari)',
    configProvider: 'not introduced (decision 2B)',
    screenshots: 'NOT RUN in this pass — verify manually at mobile/tablet/desktop/desktop-xl on light UI and dark-surface admin/report pages',
    a11y: 'No color/focus/target-size changes; no forced reduction below prior readable sizes for bound tokens; sub-11px left unchanged (FLAGGED)',
  },
};

fs.writeFileSync(path.join(root, 'TYPOGRAPHY_PASS_REPORT.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      arbitraryPx: remaining.textArbitraryPx.length,
      cssLiterals: remaining.cssFontSizeLiteral.length,
      lato: remaining.lato.length,
      byPx: remaining.textArbitraryPx.reduce((a, x) => {
        a[x.px] = (a[x.px] || 0) + 1;
        return a;
      }, {}),
    },
    null,
    2
  )
);
