// backend/scripts/update_hierarchy_codes.js
//
// ONE-TIME script — reads Untitled.xlsx (official Delhi Police district/PS codes) and:
//   1. Updates existing hierarchy_nodes with official district + PS codes
//   2. Inserts any missing districts, sub-divisions, and police stations
//
// Run once:  node scripts/update_hierarchy_codes.js
// Safe to re-run — uses onConflict ignore + targeted updates.

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Normalization ────────────────────────────────────────────────────────────
function norm(str) {
  if (!str) return '';
  return str.toString()
    .toLowerCase()
    .replace(/^ps\s+/i, '')
    .replace(/[^a-z0-9]/g, '');
}

// District name mapping: Excel name -> DB district ID
const DIST_ID_MAP = {
  'CENTRAL':                                  'DIST_CD',
  'DWARKA':                                   'DIST_DW',
  'EAST':                                     'DIST_ED',
  'NEW DELHI':                                'DIST_NDD',
  'NORTH':                                    'DIST_ND',
  'NORTH EAST':                               'DIST_NED',
  'NORTH WEST':                               'DIST_NWD',
  'OUTER DISTRICT':                           'DIST_OD',
  'OUTER NORTH':                              'DIST_OND',
  'ROHINI':                                   'DIST_RND',
  'SHAHDARA':                                 'DIST_SHD',
  'SOUTH':                                    'DIST_SD',
  'SOUTH WEST':                               'DIST_SWD',
  'SOUTH-EAST':                               'DIST_SED',
  'WEST':                                     'DIST_WD',
  // Special districts not in the original hierarchy — inserted under HQ
  'CRIME BRANCH':                             'DIST_CRIMEBRANCH',
  'EOW':                                      'DIST_EOW',
  'IGI AIRPORT':                              'DIST_IGIAIRPORT',
  'METRO':                                    'DIST_METRO',
  'RAILWAYS':                                 'DIST_RAILWAYS',
  'SPECIAL CELL':                             'DIST_SPECIALCELL',
  'SPECIAL POLICE UNIT FOR WOMEN & CHILDREN': 'DIST_SPUWAC',
  'VIGILANCE':                                'DIST_VIGILANCE',
};

// Districts that already exist in the hierarchy migration
const EXISTING_DISTRICTS = new Set([
  'DIST_CD', 'DIST_DW', 'DIST_ED', 'DIST_NDD', 'DIST_ND', 'DIST_NED',
  'DIST_NWD', 'DIST_OD', 'DIST_OND', 'DIST_RND', 'DIST_SHD', 'DIST_SD',
  'DIST_SWD', 'DIST_SED', 'DIST_WD',
]);

// PS name normalization overrides: norm(excel PS name) -> DB node ID
const PS_ID_OVERRIDES = {
  'prasadnagar':              'PS_CD_PRASADNAGAR',
  'rajindernagar':            'PS_CD_RAJINDERNAGAR',
  'sector23dwarka':           'PS_DW_SECTOR23',
  'sector23':                 'PS_DW_SECTOR23',
  'patparganjiia':            'PS_ED_PATPARGANJINDAREA',
  'patparganjindustrialarea': 'PS_ED_PATPARGANJINDAREA',
  'mandawlifazalpur':         'PS_ED_MANDAWALI',
  'mayurviharphi':            'PS_ED_MAYURVIHAR',
  'laxminagar':               'PS_ED_LAXMINAGAR',
  'gularibagh':               'PS_ND_GULABIBAGH',
  'dayalpur':                 'PS_NED_DAYALPUR',
  'hauzkhas':                 'PS_SD_HAUZKHAS',
  'pulsahlad':                'PS_SD_PULSAHLADPUR',
  'pulsahladpur':             'PS_SD_PULSAHLADPUR',
  'governmentcolony':         'PS_SED_GOVTCOLONY',
  'delhicantt':               'PS_SWD_DELHICANTT',
  'connaught':                'PS_NDD_CONNAUGHTPLACE',
  'connaughtplace':           'PS_NDD_CONNAUGHTPLACE',
  'southavenue':              'PS_NDD_SOUTHAVENUE',
  'northavenue':              'PS_NDD_NORTHAVENUE',
};

async function main() {
  const xlsxPath = path.resolve(__dirname, '../scratch/Untitled.xlsx');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = workbook.worksheets[0];

  const rows = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const dist     = (row.getCell(2).value || '').toString().trim();
    const subdiv   = (row.getCell(3).value || '').toString().trim();
    const psName   = (row.getCell(4).value || '').toString().trim();
    const distCode = row.getCell(5).value ? Number(row.getCell(5).value) : null;
    const psCode   = row.getCell(6).value ? Number(row.getCell(6).value) : null;
    if (!psName) continue;
    rows.push({ dist, subdiv, psName, distCode, psCode });
  }

  console.log(`Loaded ${rows.length} rows from Excel`);

  const dbNodes = await db('hierarchy_nodes').select('*');
  const dbById  = new Map(dbNodes.map(n => [n.id, n]));

  function findDbPS(excelName, distId) {
    const normExcel = norm(excelName);
    if (PS_ID_OVERRIDES[normExcel] && dbById.has(PS_ID_OVERRIDES[normExcel])) {
      return dbById.get(PS_ID_OVERRIDES[normExcel]);
    }
    const candidates = dbNodes.filter(n => n.node_type === 'PS');
    let best = null, bestScore = 0;
    for (const c of candidates) {
      const normDb = norm(c.name_en);
      if (normDb !== normExcel && !normDb.includes(normExcel) && !normExcel.includes(normDb)) continue;
      let score = 1;
      if (distId) {
        const subdiv = dbById.get(c.parent_id);
        if (subdiv && subdiv.parent_id === distId) score = 3;
        else if (subdiv && dbById.get(subdiv.parent_id)?.parent_id === distId) score = 2;
      }
      if (norm(c.name_en) === normExcel) score += 10;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  let updatedDist = 0, insertedDist = 0;
  let updatedSubdiv = 0, insertedSubdiv = 0;
  let updatedPS = 0, insertedPS = 0;
  const insertedThisRun = new Map();

  // Unique districts
  const distsSeen = new Map();
  rows.forEach(r => { if (!distsSeen.has(r.dist)) distsSeen.set(r.dist, r.distCode); });

  for (const [excelDist, distCode] of distsSeen.entries()) {
    const distId = DIST_ID_MAP[excelDist];
    if (!distId) { console.warn(`Unknown district: "${excelDist}" — skipping`); continue; }

    if (EXISTING_DISTRICTS.has(distId)) {
      await db('hierarchy_nodes').where('id', distId).update({ code: String(distCode) });
      updatedDist++;
    } else if (!dbById.has(distId) && !insertedThisRun.has(distId)) {
      const newDist = {
        id:        distId,
        node_type: 'DISTRICT',
        name_en:   excelDist.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
        name_hi:   excelDist,
        parent_id: 'HQ',
        code:      String(distCode),
        is_active: true,
      };
      await db('hierarchy_nodes').insert(newDist).onConflict('id').ignore();
      insertedThisRun.set(distId, newDist);
      insertedDist++;
    }
  }

  // Sub-divisions + Police Stations
  const subdivsSeen = new Map();

  for (const row of rows) {
    const distId = DIST_ID_MAP[row.dist];
    if (!distId) continue;

    const subdivNorm = norm(row.subdiv);
    const subdivKey  = `${distId}::${subdivNorm}`;
    let   subdivNodeId = null;

    if (subdivsSeen.has(subdivKey)) {
      subdivNodeId = subdivsSeen.get(subdivKey);
    } else {
      const existingSubdiv = dbNodes.find(n =>
        n.node_type === 'SUB_DIVISION' &&
        n.parent_id === distId &&
        norm(n.name_en).includes(subdivNorm)
      );

      if (existingSubdiv) {
        subdivNodeId = existingSubdiv.id;
        updatedSubdiv++;
      } else {
        const distCode = distsSeen.get(row.dist);
        const newId = `SUBDIV_${distCode}_${subdivNorm.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
        if (!dbById.has(newId) && !insertedThisRun.has(newId)) {
          const newSubdiv = {
            id: newId, node_type: 'SUB_DIVISION',
            name_en: row.subdiv, name_hi: row.subdiv,
            parent_id: distId, code: newId, is_active: true,
          };
          await db('hierarchy_nodes').insert(newSubdiv).onConflict('id').ignore();
          insertedThisRun.set(newId, newSubdiv);
          insertedSubdiv++;
        }
        subdivNodeId = newId;
      }
      subdivsSeen.set(subdivKey, subdivNodeId);
    }

    // Police Station
    const existingPS = findDbPS(row.psName, distId);
    if (existingPS) {
      await db('hierarchy_nodes').where('id', existingPS.id).update({ code: String(row.psCode) });
      updatedPS++;
    } else {
      const distCode = distsSeen.get(row.dist);
      const psSafe   = norm(row.psName).toUpperCase().substring(0, 20);
      const newPSId  = `PS_${distCode}_${psSafe}`;
      if (!dbById.has(newPSId) && !insertedThisRun.has(newPSId)) {
        const newPS = {
          id: newPSId, node_type: 'PS',
          name_en: `PS ${row.psName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}`,
          name_hi: row.psName,
          parent_id: subdivNodeId, code: String(row.psCode), is_active: true,
        };
        await db('hierarchy_nodes').insert(newPS).onConflict('id').ignore();
        insertedThisRun.set(newPSId, newPS);
        insertedPS++;
      }
    }
  }

  console.log(`Districts  — updated: ${updatedDist}, inserted: ${insertedDist}`);
  console.log(`Sub-Divs   — updated: ${updatedSubdiv}, inserted: ${insertedSubdiv}`);
  console.log(`PS         — updated: ${updatedPS}, inserted: ${insertedPS}`);
  console.log('Done.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
