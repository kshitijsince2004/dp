import ExcelJS from 'exceljs';
import fs from 'fs';

async function mapAllLocalHeads() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('../config/ref-data/Menu_Tables.xlsx');
  const ws = wb.getWorksheet('local head');

  const existingCodes1 = fs.readFileSync('migrations/20260722000001_add_canonical_code_to_local_heads.js', 'utf8');
  const existingCodes2 = fs.readFileSync('migrations/20260816000001_add_missing_canonical_codes.js', 'utf8');

  const heads = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const vals = row.values.filter(v => v !== undefined && v !== null && String(v).trim() !== '');
    if (vals.length >= 2) {
      const cd = parseInt(String(vals[0]).trim(), 10);
      const name = String(vals[1]).trim();
      heads.push({ cd, name });
    }
  });

  console.log(`Loaded ${heads.length} local heads from Excel.`);

  const CANONICAL_MAP = {
    1: 'DACOITY',
    2: 'MURDER',
    3: 'ATT_TO_MURDER',
    4: 'ROBBERY',
    5: 'RIOT',
    6: 'KID_FOR_RANSOM',
    7: 'RAPE',
    8: 'EXTORTION',
    9: 'SNATCHING',
    10: 'SIMPLE_HURT',
    11: 'GRIEVOUS_HURT',
    12: 'BURGLARY',
    13: 'VIOLENT_BURGLARY',
    14: 'OTHER_KIDNAPPING',
    15: 'ABDUCTION',
    16: 'MV_THEFT',
    17: 'SERVANT_THEFT',
    18: 'HOUSE_THEFT',
    19: 'OTHER_THEFT',
    20: 'CULPABLE_HOMICIDE',
    21: 'ATT_CULPABLE_HOMICIDE',
    22: 'CRIMINAL_TRESPASS',
    23: 'CBT',
    24: 'CHEATING',
    25: 'FORGERY',
    26: 'COUNTERFEITING',
    27: 'MISCHIEF',
    28: 'ARSON',
    29: 'THREATENING',
    30: 'DOWRY_DEATH',
    31: 'ELECTION_OFFENCES',
    32: 'PREP_OF_DACOITY',
    33: 'ACID_ATTACK',
    34: 'EVE_TEASING',
    35: 'PICK_POCKETING',
    36: 'MOBILE_THEFT',
    37: 'CYCLE_THEFT',
    38: 'SHOP_THEFT',
    39: 'CATTLE_THEFT',
    40: 'MV_ACCESSORY_THEFT',
    41: 'ASSAULT_ON_WOMEN_MODESTY',
    42: 'INSULT_MODESTY_WOMEN',
    43: 'ACCIDENTS',
    44: 'OTHER_IPC',
    // Special Section 223 BNS heads (STAT_22):
    101: 'SEC223_MANJHA',
    102: 'SEC223_SERVANT_VERIFICATION',
    103: 'SEC223_TENANT_VERIFICATION',
    104: 'SEC223_CYBER_CAFE',
    105: 'SEC223_ACID_SALE'
  };

  // Inspect and auto-match canonical codes based on text
  const results = [];
  const lowConfidence = [];

  for (const h of heads) {
    let canonical = CANONICAL_MAP[h.cd] || null;
    let confidence = 'HIGH';

    if (!canonical) {
      const lower = h.name.toLowerCase();
      if (lower.includes('dacoity') && lower.includes('prep')) canonical = 'PREP_OF_DACOITY';
      else if (lower.includes('dacoity')) canonical = 'DACOITY';
      else if (lower.includes('attempt to murder') || lower.includes('att. to murder')) canonical = 'ATT_TO_MURDER';
      else if (lower.includes('murder')) canonical = 'MURDER';
      else if (lower.includes('culpable homicide') && lower.includes('attempt')) canonical = 'ATT_CULPABLE_HOMICIDE';
      else if (lower.includes('culpable homicide')) canonical = 'CULPABLE_HOMICIDE';
      else if (lower.includes('robbery')) canonical = 'ROBBERY';
      else if (lower.includes('riot')) canonical = 'RIOT';
      else if (lower.includes('ransom')) canonical = 'KID_FOR_RANSOM';
      else if (lower.includes('gang rape')) canonical = 'GANG_RAPE';
      else if (lower.includes('rape')) canonical = 'RAPE';
      else if (lower.includes('extortion')) canonical = 'EXTORTION';
      else if (lower.includes('snatching')) canonical = 'SNATCHING';
      else if (lower.includes('simple hurt')) canonical = 'SIMPLE_HURT';
      else if (lower.includes('grievous hurt')) canonical = 'GRIEVOUS_HURT';
      else if (lower.includes('hurt')) canonical = 'HURT';
      else if (lower.includes('burglary')) canonical = 'BURGLARY';
      else if (lower.includes('servant theft')) canonical = 'SERVANT_THEFT';
      else if (lower.includes('pick pocket')) canonical = 'PICK_POCKETING';
      else if (lower.includes('mobile theft')) canonical = 'MOBILE_THEFT';
      else if (lower.includes('cycle theft') || lower.includes('bicycle')) canonical = 'CYCLE_THEFT';
      else if (lower.includes('shop theft')) canonical = 'SHOP_THEFT';
      else if (lower.includes('cattle theft')) canonical = 'CATTLE_THEFT';
      else if (lower.includes('mv accessory') || lower.includes('m.v. accessory')) canonical = 'MV_ACCESSORY_THEFT';
      else if (lower.includes('house theft')) canonical = 'HOUSE_THEFT';
      else if (lower.includes('mv theft') || lower.includes('m.v. theft') || lower.includes('motor vehicle')) canonical = 'MVT';
      else if (lower.includes('theft')) canonical = 'OTHER_THEFT';
      else if (lower.includes('kidnapping') || lower.includes('kidnap')) canonical = 'OTHER_KIDNAPPING';
      else if (lower.includes('abduction')) canonical = 'ABDUCTION';
      else if (lower.includes('criminal trespass') || lower.includes('trespass')) canonical = 'CRIMINAL_TRESPASS';
      else if (lower.includes('criminal breach') || lower.includes('c.b.t') || lower.includes('cbt')) canonical = 'CBT';
      else if (lower.includes('cheating')) canonical = 'CHEATING';
      else if (lower.includes('forgery')) canonical = 'FORGERY';
      else if (lower.includes('counterfeit')) canonical = 'COUNTERFEITING';
      else if (lower.includes('mischief')) canonical = 'MISCHIEF';
      else if (lower.includes('arson')) canonical = 'ARSON';
      else if (lower.includes('threat')) canonical = 'THREATENING';
      else if (lower.includes('dowry death')) canonical = 'DOWRY_DEATH';
      else if (lower.includes('election')) canonical = 'ELECTION_OFFENCES';
      else if (lower.includes('acid attack')) canonical = 'ACID_ATTACK';
      else if (lower.includes('eve teasing') || lower.includes('eve-teasing')) canonical = 'EVE_TEASING';
      else if (lower.includes('outrage') || lower.includes('modesty of women')) canonical = 'ASSAULT_ON_WOMEN_MODESTY';
      else if (lower.includes('insult') && lower.includes('modesty')) canonical = 'INSULT_MODESTY_WOMEN';
      else if (lower.includes('manjha')) canonical = 'SEC223_MANJHA';
      else if (lower.includes('servant verification')) canonical = 'SEC223_SERVANT_VERIFICATION';
      else if (lower.includes('tenant verification')) canonical = 'SEC223_TENANT_VERIFICATION';
      else if (lower.includes('cyber cafe')) canonical = 'SEC223_CYBER_CAFE';
      else if (lower.includes('acid sale')) canonical = 'SEC223_ACID_SALE';
      else if (lower.includes('accident')) canonical = 'ACCIDENTS';
      else {
        confidence = 'LOW';
      }
    }

    if (confidence === 'HIGH') {
      results.push({ cd: h.cd, name: h.name, canonical });
    } else {
      lowConfidence.push({ cd: h.cd, name: h.name, reason: 'Ambiguous or specialized head without 1:1 STAT_1 proforma row' });
    }
  }

  console.log(`Mapped HIGH confidence: ${results.length}, LOW confidence: ${lowConfidence.length}`);
  fs.writeFileSync('scripts/mapped-local-heads.json', JSON.stringify({ high: results, low: lowConfidence }, null, 2), 'utf8');
}

mapAllLocalHeads();
