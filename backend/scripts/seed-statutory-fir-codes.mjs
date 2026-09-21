import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import knex from 'knex';
import cfg from '../knexfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function norm(str) {
  if (!str) return '';
  return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseCsv(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let curr = '';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      row.push(curr.trim());
      curr = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (curr || row.length > 0) {
        row.push(curr.trim());
        curr = '';
        lines.push(row);
        row = [];
      }
    } else {
      curr += c;
    }
  }
  if (curr || row.length > 0) {
    row.push(curr.trim());
    lines.push(row);
  }
  return lines;
}

const ALIAS_MAP = {
  'PRASADNAGAR': 'PS Parshad Nagar',
  'PARSADNAGAR': 'PS Parshad Nagar',
  'MANDAWLIFAZALPUR': 'PS Mandawali',
  'MAYURVIHARPHI': 'PS Mayur Vihar',
  'PATPARGANJINDUSTRIALAREA': 'PS Patparganj Ind. Area',
  'CHANKYAPURI': 'PS Chankaya Puri',
  'KASHMERIGATE': 'PS Kashmere Gate',
  'JAFRABAD': 'PS Jaffrabad',
  'NARELAINDUSTRIALAREA': 'PS Narela Ind. Area',
  'SHAHDARA': 'PS Shahadra',
  'OKHLAINDUSTRIALAREA': 'PS Okhla Indl. Area',
  'KMPUR': 'PS Kotla Mubarak Pur',
  'LODICOLONY': 'PS Lodhi Colony',
  'SWAROOPNAGAR': 'PS Swarup Nagar',
  'PRASHANTVIHAR': 'PS Parshant Vihar',
  'SECTOR23DWARKA': 'PS Dwarka Sector 23',
  'TUGHLAKROAD': 'PS Tuglak Road',
  'CHHAWALA': 'PS Chhawla',
  'KALANDIKUNJ': 'PS Kalindi Kunj',
  'MANSAROVARPARK': 'PS Mansarover Park',
  'MUKHERJEENAGAR': 'PS Mukherji Nagar',
  'METROPOLICESTATIONPRAGATIMAIDAN': 'PS Metro Police Station Pragati Maidan',
  'IITFPRAGATIMAIDAN': 'PS Iitf,Pragati Maidan',
  'SUPREMECOURTMETRO': 'PS Supreme Court Metro',
};

export async function seedStatutoryFirCodes(db) {
  console.log('\n=== STATUTORY FIR CODES SEED & RECONCILIATION ===');

  // Ensure Metro PS Pragati Maidan node exists in hierarchy_nodes
  const metroParent = await db('hierarchy_nodes').where('name', 'PS Supreme Court Metro').first();
  const existingMetroPragati = await db('hierarchy_nodes').where('code', 'PS_8160_METROPRAGATIMAIDAN').first();
  if (!existingMetroPragati && metroParent) {
    await db('hierarchy_nodes').insert({
      node_type: 'PS',
      name: 'PS Metro Police Station Pragati Maidan',
      code: 'PS_8160_METROPRAGATIMAIDAN',
      parent_id: metroParent.parent_id,
      metadata: JSON.stringify({ official_code: '8160014' }),
      is_active: true,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
    console.log('✓ Inserted PS Metro Police Station Pragati Maidan into hierarchy_nodes.');
  }

  const manualCsvPath = path.resolve(__dirname, '../../config/ref-data/ps_manual_fir_codes.csv');
  const unifiedCsvPath = path.resolve(__dirname, '../../config/ref-data/ps_unified_codes.csv');

  if (!fs.existsSync(manualCsvPath) || !fs.existsSync(unifiedCsvPath)) {
    throw new Error(`Seed CSV files missing at ${manualCsvPath} or ${unifiedCsvPath}`);
  }

  const manualCsv = fs.readFileSync(manualCsvPath, 'utf8');
  const unifiedCsv = fs.readFileSync(unifiedCsvPath, 'utf8');

  const manualRows = parseCsv(manualCsv).slice(1);
  const unifiedRows = parseCsv(unifiedCsv).slice(1);

  // 1. Fetch live hierarchy nodes for PS with Sub-Division & District
  const psNodes = await db('hierarchy_nodes as ps')
    .leftJoin('hierarchy_nodes as sub', 'ps.parent_id', 'sub.id')
    .leftJoin('hierarchy_nodes as dist', 'sub.parent_id', 'dist.id')
    .where('ps.node_type', 'PS')
    .select(
      'ps.id',
      'ps.name as ps_name',
      'ps.code as ps_code',
      'dist.id as dist_id',
      'dist.name as dist_name',
      'dist.code as dist_code'
    );

  console.log(`[DB Master] Found ${psNodes.length} Police Stations in hierarchy_nodes.`);

  const nodeMap = new Map();
  const cyberByDist = new Map();
  const nameToNode = new Map();

  for (const n of psNodes) {
    const distClean = norm((n.dist_name || '').replace(/DISTRICT/i, ''));
    const psClean = norm(n.ps_name.replace(/^PS\s+/i, ''));
    const psRaw = norm(n.ps_name);
    const code = norm(n.ps_code);

    nameToNode.set(n.ps_name, n);
    nodeMap.set(`${distClean}_${psClean}`, n);
    nodeMap.set(`${distClean}_${psRaw}`, n);
    nodeMap.set(psClean, n);
    nodeMap.set(psRaw, n);
    nodeMap.set(code, n);

    if (n.ps_name.toLowerCase().includes('cyber')) {
      cyberByDist.set(distClean, n);
    }
  }

  // 2. Reconcile Unified e-FIR Codes (226)
  const unifiedRecords = [];
  const unifiedUnmatched = [];

  for (const r of unifiedRows) {
    if (r.length < 2) continue;
    const psName = r[0];
    const psCode = r[1].padStart(3, '0');
    const clean = norm(psName);

    let node = null;
    if (clean === 'JANAKPURIMETRO') {
      node = psNodes.find(n => n.ps_name === 'PS Janak Puri' && n.dist_name === 'Metro');
    } else if (clean === 'JANAKPURI') {
      node = psNodes.find(n => n.ps_name === 'PS Janak Puri' && (n.dist_name || '').includes('West'));
    } else if (clean === 'METROPOLICESTATIONNANGLOI') {
      node = psNodes.find(n => n.ps_name === 'PS Nangloi' && n.dist_name === 'Metro');
    } else if (clean === 'NANGLOI') {
      node = psNodes.find(n => n.ps_name === 'PS Nangloi' && (n.dist_name || '').includes('Outer'));
    } else if (clean === 'METROPOLICESTATIONNETAJISUBHASHPLACE') {
      node = psNodes.find(n => n.ps_name === 'PS Subhash Place' && n.dist_name === 'Metro');
    } else if (clean === 'SUBHASHPLACE') {
      node = psNodes.find(n => n.ps_name === 'PS Subhash Place' && (n.dist_name || '').includes('North West'));
    } else if (clean === 'ANANDVIHARRLYSTN') {
      node = psNodes.find(n => n.ps_name === 'PS Anand Vihar' && n.dist_name === 'Railways');
    } else if (clean === 'ANANDVIHAR') {
      node = psNodes.find(n => n.ps_name === 'PS Anand Vihar' && (n.dist_name || '').includes('Shahdara'));
    } else if (clean === 'DELHICANTTRAILWAYSTATION') {
      node = psNodes.find(n => n.ps_name === 'PS Delhi Cantt.' && n.dist_name === 'Railways');
    } else if (clean === 'DELHICANTT') {
      node = psNodes.find(n => n.ps_name.includes('Delhi Cantt') && (n.dist_name || '').includes('South West'));
    } else if (clean === 'HAZARATNIZAMUDDIN') {
      node = psNodes.find(n => n.ps_name === 'PS H. N. Din');
    } else if (clean === 'HAZRATNIZAMUDDINRLYSTN') {
      node = psNodes.find(n => n.ps_name === 'PS Hazrat Nizamuddin Rly Stn');
    } else if (ALIAS_MAP[clean]) {
      node = nameToNode.get(ALIAS_MAP[clean]);
    } else if (clean.startsWith('CYBERPOLICESTATION')) {
      const dist = clean.replace('CYBERPOLICESTATION', '');
      node = cyberByDist.get(dist);
    } else {
      node = nodeMap.get(clean) || nodeMap.get(norm('PS ' + psName));
    }

    if (node) {
      unifiedRecords.push({
        hierarchy_node_id: node.id,
        ps_code: psCode,
        ps_name_raw: psName,
        node_name: node.ps_name,
      });
    } else {
      unifiedUnmatched.push({ psName, psCode, clean });
    }
  }

  // 3. Reconcile Manual FIR Codes (225)
  const manualRecords = [];
  const manualUnmatched = [];

  for (const r of manualRows) {
    if (r.length < 4) continue;
    const distName = r[0];
    const distCode = r[1].padStart(3, '0');
    const psName = r[2];
    const psCode = r[3].padStart(3, '0');

    const distClean = norm(distName.replace(/DISTRICT/i, ''));
    const psClean = norm(psName);
    const key = `${distClean}_${psClean}`;

    let node = null;
    if (psClean.includes('CYBER')) {
      node = cyberByDist.get(distClean);
    } else if (distClean === 'METRO' && psClean === 'JANAKPURIMETRO') {
      node = psNodes.find(n => n.ps_name === 'PS Janak Puri' && n.dist_name === 'Metro');
    } else if (distClean === 'METRO' && psClean === 'METROPOLICESTATIONNANGLOI') {
      node = psNodes.find(n => n.ps_name === 'PS Nangloi' && n.dist_name === 'Metro');
    } else if (distClean === 'METRO' && psClean === 'METROPOLICESTATIONNETAJISUBHASHPLACE') {
      node = psNodes.find(n => n.ps_name === 'PS Subhash Place' && n.dist_name === 'Metro');
    } else if (distClean === 'NORTHWEST' && psClean === 'SUBHASHPLACE') {
      node = psNodes.find(n => n.ps_name === 'PS Subhash Place' && (n.dist_name || '').includes('North West'));
    } else if (distClean === 'RAILWAYS' && psClean === 'ANANDVIHARRLYSTN') {
      node = psNodes.find(n => n.ps_name === 'PS Anand Vihar' && n.dist_name === 'Railways');
    } else if (distClean === 'RAILWAYS' && psClean === 'DELHICANTTRAILWAYSTATION') {
      node = psNodes.find(n => n.ps_name === 'PS Delhi Cantt.' && n.dist_name === 'Railways');
    } else if (distClean === 'SOUTHEAST' && psClean === 'HAZARATNIZAMUDDIN') {
      node = psNodes.find(n => n.ps_name === 'PS H. N. Din');
    } else if (distClean === 'RAILWAYS' && psClean === 'HAZRATNIZAMUDDINRLYSTN') {
      node = psNodes.find(n => n.ps_name === 'PS Hazrat Nizamuddin Rly Stn');
    } else if (ALIAS_MAP[psClean]) {
      node = nameToNode.get(ALIAS_MAP[psClean]);
    } else {
      node = nodeMap.get(key) || nodeMap.get(psClean);
    }

    if (node) {
      manualRecords.push({
        hierarchy_node_id: node.id,
        district_code: distCode,
        ps_code: psCode,
        ps_name_raw: psName,
        node_name: node.ps_name,
      });
    } else {
      manualUnmatched.push({ distName, distCode, psName, psCode, key });
    }
  }

  // Print Reconciliation Report
  console.log('\n--- RECONCILIATION REPORT ---');
  console.log(`Manual FIR Codes: ${manualRecords.length} matched / ${manualRows.length} total (${manualUnmatched.length} unmatched).`);
  if (manualUnmatched.length > 0) {
    console.warn('⚠ Manual Unmatched Stations:', manualUnmatched);
  }
  console.log(`Unified e-FIR Codes: ${unifiedRecords.length} matched / ${unifiedRows.length} total (${unifiedUnmatched.length} unmatched).`);
  if (unifiedUnmatched.length > 0) {
    console.warn('⚠ Unified Unmatched Stations:', unifiedUnmatched);
  }

  // Confirm Pragati Maidan expected gap
  const metroPragatiUnified = unifiedRecords.find(r => r.ps_name_raw.toUpperCase().includes('METRO POLICE STATION PRAGATI MAIDAN'));
  const metroPragatiManual = manualRecords.find(r => r.hierarchy_node_id === metroPragatiUnified?.hierarchy_node_id);
  console.log(`[Special Case] Metro PS Pragati Maidan in Unified: ${!!metroPragatiUnified} (Code: ${metroPragatiUnified?.ps_code}), in Manual: ${!!metroPragatiManual} (Expected: false)`);

  // 4. Perform Idempotent Upserts
  await db.transaction(async (trx) => {
    let manualInserted = 0;
    let manualUpdated = 0;
    for (const r of manualRecords) {
      const existing = await trx('ref.ps_manual_fir_codes')
        .where({ hierarchy_node_id: r.hierarchy_node_id })
        .first();
      if (existing) {
        await trx('ref.ps_manual_fir_codes')
          .where({ id: existing.id })
          .update({
            district_code: r.district_code,
            ps_code: r.ps_code,
            is_active: true,
            updated_at: trx.fn.now(),
          });
        manualUpdated++;
      } else {
        await trx('ref.ps_manual_fir_codes').insert({
          hierarchy_node_id: r.hierarchy_node_id,
          district_code: r.district_code,
          ps_code: r.ps_code,
          is_active: true,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
        manualInserted++;
      }
    }

    let unifiedInserted = 0;
    let unifiedUpdated = 0;
    for (const r of unifiedRecords) {
      const existing = await trx('ref.ps_unified_codes')
        .where({ hierarchy_node_id: r.hierarchy_node_id })
        .first();
      if (existing) {
        await trx('ref.ps_unified_codes')
          .where({ id: existing.id })
          .update({
            ps_code: r.ps_code,
            is_active: true,
            updated_at: trx.fn.now(),
          });
        unifiedUpdated++;
      } else {
        await trx('ref.ps_unified_codes').insert({
          hierarchy_node_id: r.hierarchy_node_id,
          ps_code: r.ps_code,
          is_active: true,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
        unifiedInserted++;
      }
    }

    console.log(`\n✓ ref.ps_manual_fir_codes: +${manualInserted} inserted, ~${manualUpdated} updated.`);
    console.log(`✓ ref.ps_unified_codes: +${unifiedInserted} inserted, ~${unifiedUpdated} updated.`);
  });

  return {
    manualMatched: manualRecords.length,
    manualUnmatched: manualUnmatched.length,
    unifiedMatched: unifiedRecords.length,
    unifiedUnmatched: unifiedUnmatched.length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = knex(cfg.development);
  try {
    await seedStatutoryFirCodes(db);
    process.exit(0);
  } catch (err) {
    console.error('Seed statutory fir codes failed:', err);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}
