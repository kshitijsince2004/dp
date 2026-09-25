// backend/scripts/seed-diary-ps-metadata.mjs
// Seeds diary_abbr and diary_order into hierarchy_nodes.metadata
// for all PS nodes. Run: node scripts/seed-diary-ps-metadata.mjs
//
// Source: Column headers from District_diary.xlsx 'N-1,N-2,N-3' sheet

import db from '../src/config/db.js';

const PS_METADATA = [
  { name_fragment: 'Kotwali',       abbr: 'KT',  order: 1  },
  { name_fragment: 'Lahori Gate',   abbr: 'LG',  order: 2  },
  { name_fragment: 'Kashmeri',      abbr: 'KG',  order: 3  },
  { name_fragment: 'Sadar Bazar',   abbr: 'SB',  order: 4  },
  { name_fragment: 'Bara Hindu',    abbr: 'BHR', order: 5  },
  { name_fragment: 'Subzi Mandi',   abbr: 'SM',  order: 6  },
  { name_fragment: 'Civil Lines',   abbr: 'CL',  order: 7  },
  { name_fragment: 'Maurice',       abbr: 'MN',  order: 8  },
  { name_fragment: 'Roop Nagar',    abbr: 'RN',  order: 9  },
  { name_fragment: 'Timarpur',      abbr: 'TP',  order: 10 },
  { name_fragment: 'Wazirabad',     abbr: 'WZ',  order: 11 },
  { name_fragment: 'Burari',        abbr: 'BU',  order: 12 },
  { name_fragment: 'Sarai Rohilla', abbr: 'SR',  order: 13 },
  { name_fragment: 'Gulabi Bagh',   abbr: 'GB',  order: 14 }
];

async function run() {
  console.log('Seeding PS diary metadata...');
  for (const ps of PS_METADATA) {
    try {
      const rows = await db('hierarchy_nodes')
        .where('node_type', 'PS')
        .whereILike('name', `%${ps.name_fragment}%`);
      
      if (rows.length === 0) {
        console.warn(`NOT FOUND: ${ps.name_fragment}`);
        continue;
      }
      if (rows.length > 1) {
        console.warn(`AMBIGUOUS (${rows.length} matches): ${ps.name_fragment} — processing first match (${rows[0].name})`);
      }

      await db('hierarchy_nodes')
        .where('id', rows[0].id)
        .update({
          metadata: db.raw(
            `COALESCE(metadata, '{}')::jsonb || ?::jsonb`,
            [JSON.stringify({ diary_abbr: ps.abbr, diary_order: ps.order })]
          )
        });
      console.log(`OK: ${rows[0].name} → ${ps.abbr} (order ${ps.order})`);
    } catch (err) {
      console.error(`Error updating ${ps.name_fragment}: ${err.message}`);
    }
  }
  await db.destroy();
}

run().catch(console.error);
