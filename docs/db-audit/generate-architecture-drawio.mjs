// Convert ARCHITECTURE_DIAGRAMS.md (mermaid flowchart/sequenceDiagram/stateDiagram-v2 blocks)
// → ARCHITECTURE.drawio (native draw.io file, one page per diagram).
//
// This is a SEPARATE generator from generate-drawio.mjs (which only understands ER `erDiagram`
// blocks and table shapes). Architecture diagrams need box/arrow component diagrams, sequence
// diagrams (lifelines + ordered messages), and a state diagram — different shapes, different
// layout algorithms — so this script does not touch or reuse generate-drawio.mjs's output.
//
// Run after editing the Mermaid blocks: node docs/db-audit/generate-architecture-drawio.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'ARCHITECTURE_DIAGRAMS.md');
const OUT = join(HERE, 'ARCHITECTURE.drawio');

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
if (sections.length === 0) throw new Error('no mermaid sections found in ARCHITECTURE_DIAGRAMS.md');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Mermaid source text may itself contain HTML entities (e.g. "&lt;type&gt;" used so the
// angle brackets render literally in Mermaid) — decode those first so esc() below doesn't
// double-escape the ampersand. <br/> is left as a real tag; it must go through esc() into
// "&lt;br/&gt;" like everything else — draw.io's html=1 cell style is what turns that back
// into a rendered line break, it must NOT be a live "<" in the XML attribute value itself.
const decodeEntities = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const escLabel = (s) => esc(decodeEntities(s));

let idc = 0;
const nid = (p) => `${p}${++idc}`;

// ============================================================================
// Shared: rank (longest-path) layered layout for DAGs — used by flowchart + state diagrams.
// ============================================================================
function computeRanks(nodeIds, edges) {
  const rank = new Map(nodeIds.map((n) => [n, 0]));
  const indeg = new Map(nodeIds.map((n) => [n, 0]));
  const adj = new Map(nodeIds.map((n) => [n, []]));
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue;
    adj.get(e.from).push(e.to);
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  }
  // Kahn topological order; nodes with indeg 0 start at rank 0, others get max(pred)+1.
  const queue = nodeIds.filter((n) => (indeg.get(n) || 0) === 0);
  const seen = new Set(queue);
  const order = [];
  const indegWork = new Map(indeg);
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const m of adj.get(n) || []) {
      rank.set(m, Math.max(rank.get(m) || 0, (rank.get(n) || 0) + 1));
      indegWork.set(m, indegWork.get(m) - 1);
      if (indegWork.get(m) === 0 && !seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  // Any node not reached (cycle) keeps rank 0 rather than crashing layout.
  return rank;
}

function layeredPositions(nodeIds, edges, { colW = 260, rowH = 110, marginX = 40, marginY = 40 } = {}) {
  const rank = computeRanks(nodeIds, edges);
  const byRank = new Map();
  for (const n of nodeIds) {
    const r = rank.get(n) || 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(n);
  }
  const pos = new Map();
  for (const [r, ids] of byRank) {
    ids.forEach((n, i) => {
      pos.set(n, { x: marginX + i * colW, y: marginY + r * rowH });
    });
  }
  return pos;
}

// ============================================================================
// Flowchart / graph parser → box + directed-edge drawio page
// ============================================================================
const OPEN_CLOSE = [
  ['[[', ']]', 'subroutine'],
  ['([', '])', 'stadium'],
  ['[(', ')]', 'cylinder'],
  ['{', '}', 'diamond'],
  ['[', ']', 'rect'],
  ['(', ')', 'rounded'],
];

function shapeStyle(kind) {
  switch (kind) {
    case 'cylinder': return 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
    case 'diamond': return 'rhombus;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;';
    case 'stadium': return 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;';
    case 'subroutine': return 'shape=process;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;';
    case 'rounded': return 'rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;';
    default: return 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
  }
}

function parseFlowchart(src) {
  const nodes = new Map(); // id -> {label, kind}
  const edges = []; // {from,to,label}
  const ensureNode = (id) => { if (!nodes.has(id)) nodes.set(id, { label: id, kind: 'rect' }); };

  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%%'));
  for (const line of lines) {
    if (/^(flowchart|graph)\s/i.test(line)) continue;

    // Node declaration: ID<open>"label"<close>
    let matchedNode = false;
    for (const [open, close, kind] of OPEN_CLOSE) {
      const openEsc = open.replace(/[[\]()${}]/g, (c) => `\\${c}`);
      const closeEsc = close.replace(/[[\]()${}]/g, (c) => `\\${c}`);
      const re = new RegExp(`^(\\w+)${openEsc}"(.*)"${closeEsc}\\s*$`);
      const m = line.match(re);
      if (m) {
        nodes.set(m[1], { label: m[2], kind });
        matchedNode = true;
        break;
      }
    }
    if (matchedNode) continue;

    // Edge chain: A --> B, A -->|label| B --> C, A -.->|label| B, repeated segments.
    // Arrow token is either a solid `-->` or a dotted `-.->`; each segment may carry a `|label|`.
    const arrowTok = /(-\.->|-->)/;
    const edgeChainRe = new RegExp(`^\\w+(?:\\s*${arrowTok.source}\\s*(?:\\|[^|]*\\|)?\\s*\\w+)+\\s*$`);
    if (edgeChainRe.test(line)) {
      const segRe = /(-\.->|-->)\s*(?:\|([^|]*)\|)?\s*(\w+)/g;
      const firstIdMatch = line.match(/^\w+/);
      let prevId = firstIdMatch[0];
      ensureNode(prevId);
      let m;
      segRe.lastIndex = firstIdMatch[0].length;
      while ((m = segRe.exec(line))) {
        const dashed = m[1] === '-.->';
        const label = m[2] || '';
        const toId = m[3];
        ensureNode(toId);
        edges.push({ from: prevId, to: toId, label, dashed });
        prevId = toId;
      }
      continue;
    }

    throw new Error(`generate-architecture-drawio: unparsable flowchart line: "${line}"`);
  }
  return { nodes, edges };
}

function emitFlowchartPage(title, { nodes, edges }, pageIdx) {
  const ids = [...nodes.keys()];
  const pos = layeredPositions(ids, edges, { colW: 240, rowH: 130 });
  const cells = [];
  const boxId = new Map();
  const W = 200, H = 60;

  for (const id of ids) {
    const { label, kind } = nodes.get(id);
    const { x, y } = pos.get(id) || { x: 40, y: 40 };
    const bid = nid('n');
    boxId.set(id, bid);
    cells.push(`<mxCell id="${bid}" value="${escLabel(label)}" style="${shapeStyle(kind)}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${W}" height="${H}" as="geometry"/></mxCell>`);
  }
  for (const e of edges) {
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;fontSize=10;endArrow=block;endFill=1;${e.dashed ? 'dashed=1;' : ''}`;
    cells.push(`<mxCell id="${nid('e')}" value="${escLabel(e.label || '')}" style="${style}" edge="1" parent="1" source="${boxId.get(e.from)}" target="${boxId.get(e.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
  return wrapPage(title, pageIdx, cells);
}

// ============================================================================
// Sequence diagram parser → lifelines + ordered horizontal messages
// ============================================================================
function parseSequence(src) {
  const participants = []; // {id, label}
  const seen = new Set();
  const rows = []; // {type:'message'|'note'|'divider', ...}

  const ensureParticipant = (id) => {
    if (!seen.has(id)) { seen.add(id); participants.push({ id, label: id }); }
  };

  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%%'));
  for (const line of lines) {
    if (/^sequenceDiagram\s*$/i.test(line)) continue;

    let m;
    if ((m = line.match(/^participant\s+(\w+)\s+as\s+(.+)$/))) {
      seen.add(m[1]);
      participants.push({ id: m[1], label: m[2] });
      continue;
    }
    if ((m = line.match(/^participant\s+(\w+)\s*$/))) {
      ensureParticipant(m[1]);
      continue;
    }
    if ((m = line.match(/^(\w+)\s*(-->>|->>|-->|->)\s*(\w+)\s*:\s*(.*)$/))) {
      ensureParticipant(m[1]);
      ensureParticipant(m[3]);
      rows.push({ type: 'message', from: m[1], to: m[3], dashed: m[2].startsWith('--'), label: m[4] });
      continue;
    }
    if ((m = line.match(/^(alt|else|opt|loop|par|and|critical)\b\s*(.*)$/))) {
      rows.push({ type: 'divider', label: `[${m[1]}] ${m[2]}`.trim() });
      continue;
    }
    if (line === 'end') {
      rows.push({ type: 'divider', label: '[end]' });
      continue;
    }
    if ((m = line.match(/^Note\s+(over|left of|right of)\s+([\w,]+)\s*:\s*(.*)$/i))) {
      const ids = m[2].split(',').map((s) => s.trim());
      ids.forEach(ensureParticipant);
      rows.push({ type: 'note', ids, label: m[3] });
      continue;
    }
    throw new Error(`generate-architecture-drawio: unparsable sequenceDiagram line: "${line}"`);
  }
  return { participants, rows };
}

function emitSequencePage(title, { participants, rows }, pageIdx) {
  const cells = [];
  const LANE_W = 220, LANE_GAP = 40, TOP = 60, ROW_H = 50;
  const lifelineX = new Map();
  participants.forEach((p, i) => {
    const x = 40 + i * (LANE_W + LANE_GAP) + LANE_W / 2;
    lifelineX.set(p.id, x);
    const headId = nid('h');
    cells.push(`<mxCell id="${headId}" value="${escLabel(p.label)}" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="${x - LANE_W / 2}" y="20" width="${LANE_W}" height="30" as="geometry"/></mxCell>`);
    const totalHeight = TOP + rows.length * ROW_H + 20;
    const lineId = nid('l');
    cells.push(`<mxCell id="${lineId}" style="endArrow=none;dashed=1;html=1;strokeColor=#666666;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${x}" y="50" as="sourcePoint"/><mxPoint x="${x}" y="${totalHeight}" as="targetPoint"/></mxGeometry></mxCell>`);
  });

  const totalWidth = 40 + participants.length * (LANE_W + LANE_GAP);
  rows.forEach((row, i) => {
    const y = TOP + i * ROW_H;
    if (row.type === 'message') {
      const x1 = lifelineX.get(row.from);
      const x2 = lifelineX.get(row.to);
      const style = `html=1;endArrow=block;endFill=1;fontSize=10;${row.dashed ? 'dashed=1;' : ''}${x1 === x2 ? '' : 'edgeStyle=none;rounded=0;'}`;
      if (x1 === x2) {
        // self-message: small loop
        cells.push(`<mxCell id="${nid('m')}" value="${escLabel(row.label)}" style="${style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${x1}" y="${y}" as="sourcePoint"/><mxPoint x="${x1 + 60}" y="${y}" as="targetPoint"/></mxGeometry></mxCell>`);
      } else {
        cells.push(`<mxCell id="${nid('m')}" value="${escLabel(row.label)}" style="${style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${x1}" y="${y}" as="sourcePoint"/><mxPoint x="${x2}" y="${y}" as="targetPoint"/></mxGeometry></mxCell>`);
      }
    } else if (row.type === 'note') {
      const xs = row.ids.map((id) => lifelineX.get(id)).filter((v) => v !== undefined);
      const xMin = Math.min(...xs) - 90, xMax = Math.max(...xs) + 90;
      cells.push(`<mxCell id="${nid('note')}" value="${escLabel(row.label)}" style="shape=note;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;align=center;" vertex="1" parent="1"><mxGeometry x="${xMin}" y="${y}" width="${xMax - xMin}" height="36" as="geometry"/></mxCell>`);
    } else if (row.type === 'divider') {
      cells.push(`<mxCell id="${nid('div')}" value="${escLabel(row.label)}" style="line;html=1;strokeColor=#999999;fontSize=10;fontStyle=2;verticalAlign=middle;align=left;spacingLeft=4;" vertex="1" parent="1"><mxGeometry x="20" y="${y}" width="${totalWidth}" height="20" as="geometry"/></mxCell>`);
    }
  });

  return wrapPage(title, pageIdx, cells);
}

// ============================================================================
// State diagram parser → state nodes + labeled transitions (+ notes)
// ============================================================================
function parseState(src) {
  const nodeIds = new Set();
  const edges = [];
  const notes = []; // {target, text}
  let noteBuf = null;

  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  for (const line of lines) {
    if (/^stateDiagram(-v2)?\s*$/i.test(line)) continue;
    if (noteBuf) {
      if (/^end note$/i.test(line)) { notes.push(noteBuf); noteBuf = null; }
      else noteBuf.text += (noteBuf.text ? '\n' : '') + line;
      continue;
    }
    let m;
    if ((m = line.match(/^note\s+(left of|right of)\s+(\w+)\s*$/i))) {
      noteBuf = { target: m[2], text: '' };
      continue;
    }
    if ((m = line.match(/^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)\s*(?::\s*(.*))?$/))) {
      const from = m[1] === '[*]' ? '__START__' : m[1];
      const to = m[2] === '[*]' ? '__END__' : m[2];
      nodeIds.add(from);
      nodeIds.add(to);
      edges.push({ from, to, label: m[3] || '' });
      continue;
    }
    throw new Error(`generate-architecture-drawio: unparsable stateDiagram line: "${line}"`);
  }
  return { nodeIds: [...nodeIds], edges, notes };
}

function emitStatePage(title, { nodeIds, edges, notes }, pageIdx) {
  const pos = layeredPositions(nodeIds, edges, { colW: 220, rowH: 110 });
  const cells = [];
  const boxId = new Map();
  const W = 170, H = 50;

  for (const id of nodeIds) {
    const { x, y } = pos.get(id) || { x: 40, y: 40 };
    const isTerminal = id === '__START__' || id === '__END__';
    const bid = nid('s');
    boxId.set(id, bid);
    if (isTerminal) {
      cells.push(`<mxCell id="${bid}" value="" style="ellipse;whiteSpace=wrap;html=1;fillColor=#000000;fontColor=#ffffff;" vertex="1" parent="1"><mxGeometry x="${x + 60}" y="${y + 10}" width="24" height="24" as="geometry"/></mxCell>`);
    } else {
      cells.push(`<mxCell id="${bid}" value="${escLabel(id)}" style="rounded=1;arcSize=30;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${W}" height="${H}" as="geometry"/></mxCell>`);
    }
  }
  for (const e of edges) {
    cells.push(`<mxCell id="${nid('se')}" value="${escLabel(e.label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;fontSize=10;endArrow=block;endFill=1;" edge="1" parent="1" source="${boxId.get(e.from)}" target="${boxId.get(e.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
  for (const note of notes) {
    const target = pos.get(note.target) || { x: 40, y: 40 };
    cells.push(`<mxCell id="${nid('sn')}" value="${escLabel(note.text)}" style="shape=note;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;align=left;spacingLeft=4;" vertex="1" parent="1"><mxGeometry x="${target.x + W + 30}" y="${target.y}" width="220" height="60" as="geometry"/></mxCell>`);
  }
  return wrapPage(title, pageIdx, cells);
}

// ============================================================================
// Page wrapper
// ============================================================================
function wrapPage(title, pageIdx, cells) {
  return `<diagram name="${esc(title)}" id="page-${pageIdx}"><mxGraphModel dx="1400" dy="900" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1400" pageHeight="1000" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`;
}

// ============================================================================
// Dispatch by diagram type + emit
// ============================================================================
const pages = [];
let flowchartCount = 0, sequenceCount = 0, stateCount = 0;

sections.forEach((s, i) => {
  const title = s.title.replace(/^\d+\.\s*/, '');
  const firstLine = s.src.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('%%')) || '';
  if (/^(flowchart|graph)\s/i.test(firstLine)) {
    pages.push(emitFlowchartPage(title, parseFlowchart(s.src), i + 1));
    flowchartCount++;
  } else if (/^sequenceDiagram/i.test(firstLine)) {
    pages.push(emitSequencePage(title, parseSequence(s.src), i + 1));
    sequenceCount++;
  } else if (/^stateDiagram/i.test(firstLine)) {
    pages.push(emitStatePage(title, parseState(s.src), i + 1));
    stateCount++;
  } else {
    throw new Error(`generate-architecture-drawio: unrecognized diagram type for section "${s.title}" (first line: "${firstLine}")`);
  }
});

const xml = `<mxfile host="app.diagrams.net" type="device" version="24.0.0">${pages.join('')}</mxfile>`;
writeFileSync(OUT, xml);

console.log(`Parsed ${sections.length} diagrams: ${flowchartCount} flowchart, ${sequenceCount} sequence, ${stateCount} state.`);
console.log(`wrote ${OUT} (${xml.length} bytes, ${pages.length} pages)`);
