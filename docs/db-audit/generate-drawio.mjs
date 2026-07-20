// Convert ER_DIAGRAM.md (mermaid erDiagram blocks) → ER_DIAGRAM.drawio (native draw.io file).
// One draw.io page per mermaid block, entities as editable table shapes, crow's-foot edges.
// Run after editing the Mermaid blocks:  node docs/db-audit/generate-drawio.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'ER_DIAGRAM.md');
const OUT = join(HERE, 'ER_DIAGRAM.drawio');

const md = readFileSync(SRC, 'utf8');

// ---- extract sections: heading + mermaid block ----
const sections = [];
{
  const re = /^## (.+)$([\s\S]*?)(?=^## |\s*$(?![\s\S]))/gm;
  for (const m of md.matchAll(re)) {
    const block = m[2].match(/```mermaid\n([\s\S]*?)```/);
    if (block) sections.push({ title: m[1].trim(), src: block[1] });
  }
}
if (sections.length !== 8) throw new Error(`expected 8 sections, got ${sections.length}`);

// ---- mermaid erDiagram parser ----
function parseBlock(src) {
  const entities = new Map(); // name -> [{type,name,key,comment}]
  const rels = [];
  const lines = src.split('\n');
  let i = 0;
  const relRe = /^\s*(\w+)\s+(\|\||\|o|\}o|\}\|)(--|\.\.)(\|\||o\||o\{|\|\{)\s+(\w+)\s*:\s*"([^"]*)"\s*$/;
  const attrRe = /^\s*([\w()\[\]]+)\s+(\w+)(?:\s+(PK|UK|FK))?(?:\s+"([^"]*)")?\s*$/;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t || t === 'erDiagram' || t.startsWith('%%')) { i++; continue; }
    const rm = t.match(relRe);
    if (rm) {
      rels.push({ a: rm[1], la: rm[2], dashed: rm[3] === '..', lb: rm[4], b: rm[5], label: rm[6] });
      // ensure stubs exist
      if (!entities.has(rm[1])) entities.set(rm[1], []);
      if (!entities.has(rm[5])) entities.set(rm[5], []);
      i++; continue;
    }
    const em = t.match(/^(\w+)\s*\{$/);
    if (em) {
      const attrs = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '}') {
        const a = lines[i].trim();
        if (a && !a.startsWith('%%')) {
          const am = a.match(attrRe);
          if (!am) throw new Error(`unparsable attribute line: "${a}" (entity ${em[1]})`);
          let key = am[3] || '';
          if (!key && am[4] && /^FK\b/.test(am[4])) key = 'FK';
          attrs.push({ type: am[1], name: am[2], key, comment: am[4] || '' });
        }
        i++;
      }
      i++; // consume '}'
      entities.set(em[1], attrs);
      continue;
    }
    throw new Error(`unparsable line: "${t}"`);
  }
  return { entities, rels };
}

// ---- draw.io XML emit ----
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ARROW = { '||': 'ERmandOne', '|o': 'ERzeroToOne', '}o': 'ERzeroToMany', '}|': 'ERoneToMany',
                'o|': 'ERzeroToOne', 'o{': 'ERzeroToMany', '|{': 'ERoneToMany' };

const W = 280, HDR = 30, ROW = 22, GAPX = 120, GAPY = 60;

let idc = 0;
const nid = p => `${p}${++idc}`;

function emitPage(title, { entities, rels }, pageIdx) {
  const cells = [];
  const tid = new Map();

  // masonry layout: place tallest first into the shortest of K columns
  const names = [...entities.keys()];
  const height = n => HDR + Math.max(entities.get(n).length, 0) * ROW;
  names.sort((a, b) => height(b) - height(a) || a.localeCompare(b));
  const K = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(names.length * 1.5))));
  const colY = new Array(K).fill(40);
  const pos = new Map();
  for (const n of names) {
    let c = 0;
    for (let k = 1; k < K; k++) if (colY[k] < colY[c]) c = k;
    pos.set(n, { x: 40 + c * (W + GAPX), y: colY[c] });
    colY[c] += height(n) + GAPY;
  }

  for (const n of names) {
    const attrs = entities.get(n);
    const id = nid('t');
    tid.set(n, id);
    const { x, y } = pos.get(n);
    const h = height(n);
    const isRef = n.startsWith('ref_');
    const fill = isRef ? 'fillColor=#f5f5f5;fontColor=#333333;strokeColor=#666666;'
                       : 'fillColor=#dae8fc;strokeColor=#6c8ebf;';
    cells.push(`<mxCell id="${id}" value="${esc(n)}" style="shape=table;startSize=${HDR};container=1;collapsible=1;childLayout=tableLayout;fontStyle=1;html=1;${fill}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${W}" height="${h}" as="geometry"/></mxCell>`);
    attrs.forEach((a, ri) => {
      const rowId = nid('r');
      cells.push(`<mxCell id="${rowId}" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom=0;html=1;" vertex="1" parent="${id}"><mxGeometry y="${HDR + ri * ROW}" width="${W}" height="${ROW}" as="geometry"/></mxCell>`);
      const keyStyle = a.key === 'PK' ? 'fontStyle=5;' : a.key ? 'fontStyle=2;' : '';
      cells.push(`<mxCell id="${nid('c')}" value="${esc(a.key)}" style="shape=partialRectangle;overflow=hidden;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;${keyStyle}html=1;fontSize=10;" vertex="1" parent="${rowId}"><mxGeometry width="36" height="${ROW}" as="geometry"/></mxCell>`);
      const label = `${a.name}: ${a.type}`;
      const nameStyle = a.key === 'PK' ? 'fontStyle=4;' : '';
      const cell = `<mxCell id="${nid('c')}" style="shape=partialRectangle;overflow=hidden;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;align=left;spacingLeft=4;${nameStyle}html=1;fontSize=10;" vertex="1" parent="${rowId}"><mxGeometry x="36" width="${W - 36}" height="${ROW}" as="geometry"/></mxCell>`;
      // put comment in tooltip via wrapping object when present
      if (a.comment) {
        cells.push(`<object label="${esc(label)}" tooltip="${esc(a.comment)}" id="${nid('o')}">${cell.replace(/ id="[^"]*"/, '').replace('<mxCell', '<mxCell')}</object>`);
      } else {
        cells.push(cell.replace('<mxCell id=', `<mxCell value="${esc(label)}" id=`));
      }
    });
  }

  for (const r of rels) {
    const style = `edgeStyle=entityRelationEdgeStyle;html=1;rounded=0;fontSize=10;` +
      `startArrow=${ARROW[r.la]};startFill=0;endArrow=${ARROW[r.lb]};endFill=0;` +
      (r.dashed ? 'dashed=1;' : '');
    cells.push(`<mxCell id="${nid('e')}" value="${esc(r.label)}" style="${style}" edge="1" parent="1" source="${tid.get(r.a)}" target="${tid.get(r.b)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }

  return `<diagram name="${esc(title)}" id="page-${pageIdx}"><mxGraphModel dx="1200" dy="800" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`;
}

const pages = sections.map((s, i) => emitPage(s.title.replace(/^\d+\.\s*/, ''), parseBlock(s.src), i + 1));
const xml = `<mxfile host="app.diagrams.net" type="device" version="24.0.0">${pages.join('')}</mxfile>`;
writeFileSync(OUT, xml);

// summary
let totalE = 0, totalR = 0, withAttrs = new Set();
for (const s of sections) {
  const { entities, rels } = parseBlock(s.src);
  totalE += entities.size; totalR += rels.length;
  for (const [n, a] of entities) if (a.length) withAttrs.add(n);
  console.log(`${s.title}: ${entities.size} entities, ${rels.length} relationships`);
}
console.log(`total entity instances: ${totalE}, edges: ${totalR}, distinct entities with attributes: ${withAttrs.size}`);
console.log(`wrote ${OUT} (${xml.length} bytes, ${pages.length} pages)`);
