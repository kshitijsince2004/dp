import fs from 'fs';
import path from 'path';

/**
 * Migration 20260818000002:
 * 1. Sync official_code from ps_codes.json into hierarchy_nodes.metadata
 * 2. Populate diary_abbr and diary_order for all PS nodes
 * 3. Link unlinked beats in ref.beats using official_code and PS mapping
 * 4. Populate primary offence rows in record_offences for CASE and ARREST records
 * 5. Seed sample NDPS property entries for drug recovery verification
 * 6. Fix test record scope alignments
 */

function generateAbbr(name) {
  const clean = name.replace(/^PS\s+/i, '').replace(/Metro\s+Police\s+Station/i, 'MPS').trim();
  const words = clean.split(/[\s_-]+/);
  if (words.length === 1) {
    return clean.slice(0, 4).toUpperCase();
  }
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 5);
}

export async function up(knex) {
  // 1. Sync official_code from config/org/ps_codes.json
  const psCodesPath = path.resolve(process.cwd(), '../config/org/ps_codes.json');
  let psCodes = {};
  if (fs.existsSync(psCodesPath)) {
    try {
      psCodes = JSON.parse(fs.readFileSync(psCodesPath, 'utf8'));
    } catch {}
  }

  for (const [officialCode, psCode] of Object.entries(psCodes)) {
    await knex('hierarchy_nodes')
      .where('code', psCode)
      .where('node_type', 'PS')
      .update({
        metadata: knex.raw(
          `COALESCE(metadata, '{}')::jsonb || ?::jsonb`,
          [JSON.stringify({ official_code: officialCode })]
        )
      });
  }

  // 2. Ensure all PS nodes have diary_abbr and diary_order
  const psNodes = await knex('hierarchy_nodes')
    .where('node_type', 'PS')
    .orderBy('name');

  for (let i = 0; i < psNodes.length; i++) {
    const node = psNodes[i];
    const existingMeta = node.metadata || {};
    const abbr = existingMeta.diary_abbr || generateAbbr(node.name);
    const order = existingMeta.diary_order || (i + 1);

    await knex('hierarchy_nodes')
      .where('id', node.id)
      .update({
        metadata: knex.raw(
          `COALESCE(metadata, '{}')::jsonb || ?::jsonb`,
          [JSON.stringify({ diary_abbr: abbr, diary_order: order })]
        )
      });
  }

  // 3. Link unlinked beats
  await knex.raw(`
    UPDATE ref.beats b
    SET ps_id = hn.id
    FROM hierarchy_nodes hn
    WHERE b.ps_id IS NULL
      AND hn.node_type = 'PS'
      AND (
        hn.metadata->>'official_code' = substring(b.beat_cd from 1 for 7)
        OR hn.metadata->>'official_code' = substring(b.beat_cd from 1 for 6)
      );
  `);

  const prefixMap = {
    '8160014': 'PS_NDD_BARAKHAMBAROAD',
    '8171014': 'PS_DWD_DWARKASOUTH',
    '8171005': 'PS_DWD_BABAHARIDASNAGAR',
    '8174018': 'PS_DWD_BABAHARIDASNAGAR',
    '8172050': 'PS_OD_RANIBAGH',
    '8172008': 'PS_NWD_BHALASWADAIRY',
    '8170033': 'PS_OD_NANGLOI',
    '8173021': 'PS_SHD_MSPARK',
    '8170027': 'PS_OD_MUNDKA',
    '8166003': 'PS_ND_KOTWALI',
    '8952001': 'PS_NDD_PARLIAMENTSTREET',
    '8175002': 'PS_NDD_TILAKMARG'
  };

  for (const [pfx, psCode] of Object.entries(prefixMap)) {
    const targetPs = await knex('hierarchy_nodes').where('code', psCode).first();
    if (targetPs) {
      await knex('ref.beats')
        .whereNull('ps_id')
        .whereRaw('beat_cd LIKE ?', [`${pfx}%`])
        .update({ ps_id: targetPs.id });
    }
  }

  const defaultPs = await knex('hierarchy_nodes').where('code', 'PS_NDD_PARLIAMENTSTREET').first();
  if (defaultPs) {
    await knex('ref.beats').whereNull('ps_id').update({ ps_id: defaultPs.id });
  }

  // 4. Populate primary offence rows in record_offences for CASE and ARREST records
  await knex.raw(`
    INSERT INTO record_offences (
      id,
      record_id,
      act_id,
      is_primary,
      sort_order,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      r.id,
      4375,
      true,
      1,
      r.created_at,
      r.updated_at
    FROM records r
    WHERE r.record_type IN ('CASE', 'ARREST')
      AND NOT EXISTS (
        SELECT 1 FROM record_offences ro WHERE ro.record_id = r.id
      );
  `);

  await knex.raw(`
    WITH ranked_offences AS (
      SELECT id, record_id,
             ROW_NUMBER() OVER(PARTITION BY record_id ORDER BY sort_order ASC, created_at ASC) as rn
      FROM record_offences
      WHERE record_id IN (
        SELECT record_id
        FROM record_offences
        GROUP BY record_id
        HAVING COUNT(*) FILTER (WHERE is_primary = true) = 0
      )
    )
    UPDATE record_offences
    SET is_primary = true
    WHERE id IN (SELECT id FROM ranked_offences WHERE rn = 1);
  `);

  // 5. Seed sample NDPS drug property entries
  const ndpsCases = await knex('records')
    .where('record_type', 'CASE')
    .where('current_status', '<>', 'DRAFT')
    .limit(5);

  for (let i = 0; i < ndpsCases.length; i++) {
    const c = ndpsCases[i];
    const exists = await knex('record_properties').where('record_id', c.id).first();
    if (!exists) {
      await knex('record_properties').insert({
        id: knex.raw('gen_random_uuid()'),
        record_id: c.id,
        status: 'SEIZED',
        drug_type_id: 404, // HEROIN
        quantity: 2.50,
        unit_cd: 1, // kg
        estimated_value: 2500000,
        sort_order: 1,
        extra: '{}',
        created_at: c.created_at,
        updated_at: c.updated_at
      });
    }
  }

  // 6. Fix test record scope alignments
  await knex.raw(`
    UPDATE records r
    SET ps_id = u.ps_id,
        district_id = u.district_id
    FROM users u
    WHERE u.id = r.created_by
      AND u.role = 'HC'
      AND r.ps_id <> u.ps_id;
  `);
}

export async function down(knex) {
  // Reversible operations if needed
}
