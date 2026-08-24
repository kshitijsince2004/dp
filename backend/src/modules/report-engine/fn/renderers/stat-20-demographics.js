import db from '../../../../config/db.js';

export async function renderStat20(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_20') || workbook.getWorksheet('STAT 20');
  if (!ws) return;

  const dbcA = calcData.distByCodeArr || {};
  const g = (code, field) => Number(dbcA[code]?.[field] || 0);

  // STAT_20: Persons arrested by crime head. Rows 5-25.
  const rowMap = {
    5:  'DACOITY',         6:  'MURDER',         7:  'ATT_TO_MURDER',
    8:  'ROBBERY',         9:  'RIOT',           10: 'KID_FOR_RANSOM',
    11: 'RAPE',            12: 'EXTORTION',      13: 'SNATCHING',
    14: 'HURT',            15: 'BURGLARY',       17: 'MV_THEFT',
    18: 'OTHER_THEFT',     19: 'CHEATING',       20: 'DOWRY_DEATH',
    21: 'OTHER_IPC',       23: 'ARMS_ACT',       24: 'EXCISE_ACT',
    25: 'NDPS_ACT',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r = Number(rStr);
    ws.getCell(`C${r}`).value = g(code, 'fnY');
    ws.getCell(`F${r}`).value = g(code, 'uptoY');
  }

  // Populate detailed demographic columns (BC, Prev Involved, Education, Age, Residence)
  try {
    const fnEndStr = typeof calcData === 'string'
      ? calcData
      : (calcData?.fnEnd
          ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
          : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));
    const jan1Str = `${fnEndStr.slice(0, 4)}-01-01`;

    let q = db('records as r')
      .join('arrest_details as ad', 'ad.record_id', 'r.id')
      .join('persons as p', 'p.record_id', 'r.id')
      .leftJoin('arrestee_details as ard', 'ard.person_id', 'p.id')
      .leftJoin('locations as l', 'l.id', 'p.perm_location_id')
      .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'ad.local_head_id')
      .where('r.record_type', 'ARREST')
      .whereIn('p.role', ['ARRESTEE', 'ACCUSED'])
      .whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [jan1Str, fnEndStr]);

    if (scope?.level === 'PS' && scope?.self_id) {
      q = q.where('r.ps_id', scope.self_id);
    } else if (scope?.level === 'DISTRICT' && scope?.self_id) {
      q = q.where('r.district_id', scope.self_id);
    }

    const rows = await q.select(
      'lh.canonical_code',
      'p.education',
      'p.age',
      'p.is_minor',
      'p.social_category',
      'p.financial_status',
      'ard.is_bc',
      'ard.prev_involvement_count',
      'l.state'
    );

    const map = {};
    for (const row of rows) {
      const c = row.canonical_code;
      if (!c) continue;
      if (!map[c]) {
        map[c] = {
          bc: 0, prevInv: 0,
          illiterate: 0, dropout: 0, highSchool: 0, intermediate: 0, graduate: 0, professional: 0,
          ageUpto18: 0, age18to25: 0, age25to35: 0, age35to50: 0, ageGt50: 0,
          delhi: 0, outsideDelhi: 0
        };
      }
      const entry = map[c];
      if (row.is_bc) entry.bc++;
      if (Number(row.prev_involvement_count || 0) > 0) entry.prevInv++;

      const edu = (row.education || '').toUpperCase();
      if (edu === 'ILLITERATE') entry.illiterate++;
      else if (edu === 'DROPOUT') entry.dropout++;
      else if (edu === 'HIGH_SCHOOL') entry.highSchool++;
      else if (edu === 'INTERMEDIATE') entry.intermediate++;
      else if (edu === 'GRADUATE') entry.graduate++;
      else if (edu === 'PROFESSIONAL' || edu === 'POST_GRADUATE') entry.professional++;

      const age = Number(row.age || 0);
      if (row.is_minor || (age > 0 && age <= 18)) entry.ageUpto18++;
      else if (age > 18 && age <= 25) entry.age18to25++;
      else if (age > 25 && age <= 35) entry.age25to35++;
      else if (age > 35 && age <= 50) entry.age35to50++;
      else if (age > 50) entry.ageGt50++;

      const st = (row.state || '').toUpperCase();
      if (!st || st.includes('DELHI')) entry.delhi++;
      else entry.outsideDelhi++;
    }

    for (const [rStr, code] of Object.entries(rowMap)) {
      const r = Number(rStr);
      const d = map[code];
      if (!d) continue;
      ws.getCell(`D${r}`).value = d.bc;
      ws.getCell(`G${r}`).value = d.bc;
      ws.getCell(`E${r}`).value = d.prevInv;
      ws.getCell(`H${r}`).value = d.prevInv;
      ws.getCell(`I${r}`).value = d.illiterate;
      ws.getCell(`J${r}`).value = d.dropout;
      ws.getCell(`K${r}`).value = d.highSchool;
      ws.getCell(`L${r}`).value = d.intermediate;
      ws.getCell(`M${r}`).value = d.graduate;
      ws.getCell(`N${r}`).value = d.professional;
      ws.getCell(`O${r}`).value = d.ageUpto18;
      ws.getCell(`P${r}`).value = d.age18to25;
      ws.getCell(`Q${r}`).value = d.age25to35;
      ws.getCell(`R${r}`).value = d.age35to50;
      ws.getCell(`S${r}`).value = d.ageGt50;
      ws.getCell(`T${r}`).value = d.delhi;
      ws.getCell(`U${r}`).value = d.outsideDelhi;
    }
  } catch (err) {
    console.warn('[renderStat20] Error fetching demographic breakdown:', err.message);
  }
}
