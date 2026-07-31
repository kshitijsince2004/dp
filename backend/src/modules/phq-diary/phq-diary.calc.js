/**
 * PHQ Diary CalculationEngine
 *
 * Takes raw per-(district, local_head) counts from DataCollector and:
 *  1. Maps each local_head to a diary row via config rules (localHeadCds / matchPattern / isCatchAll)
 *  2. Sums across districts for Delhi-total sheets
 *  3. Computes sub-totals (TOTAL HEINOUS, TOTAL NON-HEINOUS, TOTAL IPC, TOTAL ACT)
 *  4. Computes derived columns (VARIATION%, DETECTION%)
 */

import {
  HEINOUS_ROWS,
  NON_HEINOUS_ROWS,
  MONDAY_MORNING_NON_HEINOUS_ROWS,
  LSL_ROWS,
  ARREST_ROWS,
  DRUG_ROWS,
  DISTRICT_IPC_ROWS,
  DISTRICT_LSL_ROWS,
} from './phq-diary.config.js';

// ── Numeric helpers ──────────────────────────────────────────────────────────

export function computeVariation(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (c === 0 && p === 0) return null;
  if (p === 0) return Infinity;
  return ((c - p) / p) * 100;
}

export function varPct(curr, prev) {
  const v = computeVariation(curr, prev);
  if (v === null) return '-';
  if (v === Infinity) return '+∞';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

export function detPct(solved, reported) {
  const s = Number(solved) || 0;
  const r = Number(reported) || 0;
  if (r === 0) return '-';
  return ((s / r) * 100).toFixed(1) + '%';
}

function kgFmt(v) {
  const n = parseFloat(v) || 0;
  return n === 0 ? 0 : parseFloat(n.toFixed(3));
}

// ── Row matcher ──────────────────────────────────────────────────────────────

/**
 * Assign each raw DB row (has local_head_id, head_name, crime_category) to
 * one diary-row code. Returns the code string or null if unmatched.
 */
function classifyHead(dbRow, rowDefs) {
  for (const def of rowDefs) {
    if (def.isCatchAll) continue; // handled separately
    if (def.canonicalCode && dbRow.canonical_code && def.canonicalCode === dbRow.canonical_code) {
      return def.code;
    }
    if (def.localHeadCds && def.localHeadCds.length) {
      if (def.localHeadCds.includes(Number(dbRow.local_head_id))) return def.code;
    }
    if (def.matchPattern && def.matchPattern.test(dbRow.head_name || '')) return def.code;
  }
  return null;
}

/**
 * Build a zero-filled accumulator for all numeric windows.
 */
function zeroAcc() {
  return {
    day_curr: 0, day_prev: 0,
    fn_curr: 0, fn_prev: 0, fn_corr: 0,
    upto_curr: 0, upto_prev: 0, upto_prev2: 0,
    week_curr: 0, week_prev: 0,
    det_curr: 0, det_prev: 0, det_prev2: 0,
  };
}

function addToAcc(acc, row) {
  for (const k of Object.keys(acc)) {
    if (row[k] != null) acc[k] += (Number(row[k]) || 0);
  }
}

// ── Core builder: row → { code → accumulator } ──────────────────────────────

/**
 * Given raw case rows (from fetchCaseCounts), build a map of diary-row-code → accumulator.
 * Optionally filter by districtId (undefined = all districts = Delhi total).
 */
const WINDOW_DATE_MAP = {
  day_curr: 'day_curr',
  day_prev: 'day_prev',
  fn_curr: 'fn_curr',
  fn_prev: 'fn_prev',
  fn_corr: 'fn_corr',
  upto_curr: 'upto_curr',
  upto_prev: 'upto_prev',
  upto_prev2: 'upto_prev2',
  week_curr: 'week_curr',
  week_prev: 'week_prev',
  det_curr: 'upto_curr',
  det_prev: 'upto_prev',
  det_prev2: 'upto_prev2',
  kg_day_curr: 'day_curr',
  kg_day_prev: 'day_prev',
  kg_fn_curr: 'fn_curr',
  kg_fn_prev: 'fn_prev',
  kg_fn_corr: 'fn_corr',
  kg_upto_curr: 'upto_curr',
  kg_upto_prev: 'upto_prev',
  kg_upto_prev2: 'upto_prev2',
  kg_week_curr: 'week_curr',
  kg_week_prev: 'week_prev'
};

function buildCodeMap(caseRows, rowDefs, entityId = undefined, windows = {}) {
  const codes = rowDefs.map(d => d.code);
  const map = Object.fromEntries(codes.map(c => [c, zeroAcc()]));

  // Identify catch-all codes
  const catchAlls = rowDefs.filter(d => d.isCatchAll).map(d => d.code);

  for (const row of caseRows) {
    const rowEntityId = row.entity_id || row.district_id || row.ps_id;
    if (entityId && rowEntityId !== entityId) continue;

    const code = classifyHead(row, rowDefs);

    if (code) {
      addToAcc(map[code], row);
    } else {
      // Goes into catch-all if there is one
      for (const ca of catchAlls) {
        const acc = map[ca];
        for (const k of Object.keys(acc)) {
          if (row[k] == null) continue;

          // Determine the era for this window
          const winKey = WINDOW_DATE_MAP[k];
          const winRange = winKey ? windows[winKey] : null;

          let era = 'PRE_BNS';
          if (winRange && winRange.from && winRange.to) {
            if (winRange.to < '2024-07-01') {
              era = 'PRE_BNS';
            } else if (winRange.from < '2024-07-01') {
              era = 'STRADDLING';
            } else {
              era = 'POST_BNS';
            }
          } else {
            // Default based on report run date if window date not found
            const reportDate = windows.d || new Date().toISOString().slice(0, 10);
            era = reportDate >= '2024-07-01' ? 'POST_BNS' : 'PRE_BNS';
          }

          const lhId = Number(row.local_head_id);
          let include = true;
          if (lhId === 99) {
            include = (era === 'PRE_BNS' || era === 'STRADDLING');
          } else if (lhId === 215) {
            include = (era === 'POST_BNS' || era === 'STRADDLING');
          }

          if (include) {
            acc[k] += Number(row[k]) || 0;
          }
        }
      }
    }
  }

  return map;
}

// ── Public: build full MANUALY-style data for one scope ─────────────────────

const WINDOWS = ['day_curr','day_prev','fn_curr','fn_prev','fn_corr','upto_curr','upto_prev','upto_prev2','week_curr','week_prev'];
const DET_WINS = ['det_curr','det_prev','det_prev2'];

function sumRows(accs, codes) {
  const total = zeroAcc();
  for (const code of codes) {
    const acc = accs[code];
    if (!acc) continue;
    for (const k of [...WINDOWS, ...DET_WINS]) {
      total[k] += acc[k] || 0;
    }
  }
  return total;
}

/**
 * Build the full dataset for the MANUALY / comparative sheets.
 * Returns { heinous, nonHeinous, lsl, totals, drugs, arrests }
 * where each section is an array of { code, label, ...windowValues, varPct_vs_prev2, varPct_vs_prev }
 */
export function buildManualyData(caseRows, arrestRows, drugRows, entityId = undefined, windows = {}) {
  const heinousMap   = buildCodeMap(caseRows, HEINOUS_ROWS, entityId, windows);
  const nonHeinousMap= buildCodeMap(caseRows, NON_HEINOUS_ROWS, entityId, windows);
  const lslMap       = buildCodeMap(caseRows, LSL_ROWS, entityId, windows);
  const arrestMap    = buildCodeMap(arrestRows, ARREST_ROWS.filter(r => !r.isCatchAll), entityId, windows);

  function toRows(defs, map) {
    return defs.map(def => {
      const acc = map[def.code] || zeroAcc();
      let label = def.label;
      if (def.code === 'OTHER_IPC') {
        label = windows.d >= '2024-07-01' ? 'OTHER BNS' : 'OTHER IPC';
      }
      return {
        code:  def.code,
        label,
        ...acc,
        var_vs_prev2: varPct(acc.upto_curr, acc.upto_prev2),
        var_vs_prev:  varPct(acc.upto_curr, acc.upto_prev),
        var_week:     varPct(acc.week_curr, acc.week_prev),
        det_pct_curr: detPct(acc.det_curr, acc.upto_curr),
        det_pct_prev: detPct(acc.det_prev, acc.upto_prev),
      };
    });
  }

  const heinousRows    = toRows(HEINOUS_ROWS,    heinousMap);
  const nonHeinousRows = toRows(NON_HEINOUS_ROWS, nonHeinousMap);
  const lslRows        = toRows(LSL_ROWS,         lslMap);

  const totalHeinous    = sumRows(heinousMap,    HEINOUS_ROWS.map(r => r.code));
  const totalNonHeinous = sumRows(nonHeinousMap, NON_HEINOUS_ROWS.map(r => r.code));
  const totalIPC = sumRows(
    { ...heinousMap, ...nonHeinousMap },
    [...HEINOUS_ROWS, ...NON_HEINOUS_ROWS].map(r => r.code)
  );
  const totalAct = sumRows(lslMap, LSL_ROWS.map(r => r.code));

  function summaryRow(label, acc) {
    return {
      code: null, label, ...acc,
      var_vs_prev2: varPct(acc.upto_curr, acc.upto_prev2),
      var_vs_prev:  varPct(acc.upto_curr, acc.upto_prev),
      var_week:     varPct(acc.week_curr, acc.week_prev),
      det_pct_curr: detPct(acc.det_curr, acc.upto_curr),
      det_pct_prev: detPct(acc.det_prev, acc.upto_prev),
      isTotal: true,
    };
  }

  // Drug rows
  const drugData = buildDrugData(drugRows, entityId);

  // Arrest rows
  const arrestData = buildArrestData(arrestRows, caseRows, entityId, windows);

  return {
    heinousRows,
    totalHeinous:    summaryRow('TOTAL HEINOUS',    totalHeinous),
    nonHeinousRows,
    totalNonHeinous: summaryRow('TOTAL NON HEINOUS', totalNonHeinous),
    totalIPC:        summaryRow(windows.d >= '2024-07-01' ? 'TOTAL BNS' : 'TOTAL IPC',          totalIPC),
    lslRows,
    totalAct:        summaryRow('TOTAL ACT',          totalAct),
    drugData,
    arrestData,
  };
}

// ── Drug section ─────────────────────────────────────────────────────────────

const DRUG_WINDOWS_KG = ['kg_day_curr','kg_day_prev','kg_fn_curr','kg_fn_prev','kg_fn_corr',
                         'kg_upto_curr','kg_upto_prev','kg_upto_prev2','kg_week_curr','kg_week_prev'];

function zeroDrugAcc() {
  return Object.fromEntries(DRUG_WINDOWS_KG.map(k => [k, 0]));
}

export function buildDrugData(drugRows, entityId = undefined) {
  const map = Object.fromEntries(DRUG_ROWS.map(r => [r.code, zeroDrugAcc()]));

  for (const row of drugRows) {
    const rowEntityId = row.entity_id || row.district_id || row.ps_id;
    if (entityId && rowEntityId !== entityId) continue;

    let matched = false;
    for (const def of DRUG_ROWS) {
      if (def.matchPattern && def.matchPattern.test(row.drug_type || '')) {
        for (const k of DRUG_WINDOWS_KG) {
          map[def.code][k] += parseFloat(row[k]) || 0;
        }
        matched = true;
        break;
      }
    }
    // unmatched drugs silently dropped — not in standard PHQ rows
  }

  return DRUG_ROWS.map(def => {
    const acc = map[def.code];
    return {
      code:  def.code,
      label: def.label,
      ...Object.fromEntries(DRUG_WINDOWS_KG.map(k => [k, kgFmt(acc[k])])),
      var_upto_vs_prev:  varPct(acc.kg_upto_curr, acc.kg_upto_prev),
      var_upto_vs_prev2: varPct(acc.kg_upto_curr, acc.kg_upto_prev2),
      var_week:          varPct(acc.kg_week_curr, acc.kg_week_prev),
    };
  });
}

// ── Arrest section ────────────────────────────────────────────────────────────

export function buildArrestData(arrestRows, caseRows, entityId = undefined, windows = {}) {
  const arrestCodes  = ARREST_ROWS.map(r => r.code);
  const namedMap     = buildCodeMap(arrestRows, ARREST_ROWS, entityId, windows);

  // IPC total arrests = all arrests where crime_category HEINOUS or NON_HEINOUS
  const ipcArrMap = zeroAcc();
  for (const row of arrestRows) {
    const rowEntityId = row.entity_id || row.district_id || row.ps_id;
    if (entityId && rowEntityId !== entityId) continue;
    if (row.crime_category === 'HEINOUS' || row.crime_category === 'NON_HEINOUS') {
      addToAcc(ipcArrMap, row);
    }
  }

  // LSL arrests
  const lslArrMap = buildCodeMap(arrestRows, LSL_ROWS, entityId, windows);
  const totalActArr = sumRows(lslArrMap, LSL_ROWS.map(r => r.code));

  function arrRow(label, acc) {
    return {
      label,
      day_curr: acc.day_curr, day_prev: acc.day_prev,
      fn_curr: acc.fn_curr, fn_prev: acc.fn_prev, fn_corr: acc.fn_corr,
      upto_curr: acc.upto_curr, upto_prev: acc.upto_prev, upto_prev2: acc.upto_prev2,
      week_curr: acc.week_curr, week_prev: acc.week_prev,
      var_vs_prev: varPct(acc.upto_curr, acc.upto_prev),
      var_week:    varPct(acc.week_curr, acc.week_prev),
    };
  }

  const named = ARREST_ROWS.map(def => arrRow(def.label, namedMap[def.code] || zeroAcc()));

  // Build LSL arrest named rows
  const lslArrRows = LSL_ROWS.slice(0, -1).map(def => {
    const acc = lslArrMap[def.code] || zeroAcc();
    return arrRow(def.label, acc);
  });

  return {
    named,
    totalIPC:  arrRow(windows.d >= '2024-07-01' ? 'TOTAL BNS' : 'TOTAL IPC', ipcArrMap),
    lslRows:   lslArrRows,
    totalAct:  arrRow('TOTAL ACT', totalActArr),
  };
}

// ── District breakdown: row data per district (for Upto_Date / DISTRICTS sheets) ───

/**
 * Build { [districtCode]: rowData } for the district-breakdown sheets.
 * rowData = array of { code, label, upto_curr, upto_prev, upto_prev2 }
 *
 * DISTRICT_IPC_ROWS merges KIDNAPPING+ABDUCTION into KID_ABDUCTION.
 */
export function buildDistrictMatrix(caseRows, districtMap, windows) {
  const result = {};

  for (const [distCode, distId] of districtMap.codeToId) {
    const heinousM    = buildCodeMap(caseRows, HEINOUS_ROWS, distId, windows);
    const nonHeinousM = buildCodeMap(caseRows, NON_HEINOUS_ROWS, distId, windows);
    const lslM        = buildCodeMap(caseRows, LSL_ROWS, distId, windows);

    const rowData = DISTRICT_IPC_ROWS.map(def => {
      let acc;
      if (def.codes) {
        // merged row e.g. KID_ABDUCTION
        acc = zeroAcc();
        for (const c of def.codes) {
          const src = nonHeinousM[c] || heinousM[c];
          if (src) addToAcc(acc, src);
        }
      } else if (lslM[def.code]) {
        acc = lslM[def.code];
      } else {
        acc = heinousM[def.code] || nonHeinousM[def.code] || zeroAcc();
      }

      let label = def.label;
      if (def.code === 'OTHER_IPC') {
        label = windows.d >= '2024-07-01' ? 'OTHER BNS' : 'OTHER IPC';
      } else if (def.code === 'TOTAL_IPC') {
        label = windows.d >= '2024-07-01' ? 'TOTAL BNS' : 'TOTAL IPC';
      }

      return {
        code: def.code,
        label,
        upto_curr:  acc.upto_curr,
        upto_prev:  acc.upto_prev,
        upto_prev2: acc.upto_prev2,
      };
    });

    result[distCode] = rowData;
  }

  return result;
}

// ── Monday Morning sheet ──────────────────────────────────────────────────────

/**
 * Cases reported vs solved for the Monday Morning sheet.
 * Uses MONDAY_MORNING_NON_HEINOUS_ROWS to match exact 19-row reference structure.
 */
export function buildMondayMorningData(caseRows, entityId = undefined, windows = {}) {
  const heinousMap    = buildCodeMap(caseRows, HEINOUS_ROWS, entityId, windows);
  const nonHeinousMap = buildCodeMap(caseRows, MONDAY_MORNING_NON_HEINOUS_ROWS, entityId, windows);
  const lslMap       = buildCodeMap(caseRows, LSL_ROWS, entityId, windows);

  // Compute Heinous rows
  const heinousData = HEINOUS_ROWS.map(def => {
    const acc = heinousMap[def.code] || zeroAcc();
    if (def.code === 'RAPE') {
      const pocsoAcc = lslMap['POCSO_ACT'] || zeroAcc();
      const repCurr = acc.upto_curr + pocsoAcc.upto_curr;
      const repPrev = acc.upto_prev + pocsoAcc.upto_prev;
      const solCurr = acc.det_curr + pocsoAcc.det_curr;
      const solPrev = acc.det_prev + pocsoAcc.det_prev;
      return {
        code:   def.code,
        label:  'RAPE & POCSO',
        reported_curr: repCurr,
        reported_prev: repPrev,
        variation:     varPct(repCurr, repPrev),
        solved_curr:   solCurr,
        solved_prev:   solPrev,
        pct_solved_curr: detPct(solCurr, repCurr),
        pct_solved_prev: detPct(solPrev, repPrev),
      };
    }
    return {
      code:   def.code,
      label:  def.label,
      reported_curr: acc.upto_curr,
      reported_prev: acc.upto_prev,
      variation:     varPct(acc.upto_curr, acc.upto_prev),
      solved_curr:   acc.det_curr,
      solved_prev:   acc.det_prev,
      pct_solved_curr: detPct(acc.det_curr, acc.upto_curr),
      pct_solved_prev: detPct(acc.det_prev, acc.upto_prev),
    };
  });

  // Heinous total
  const totH = sumRows(heinousMap, HEINOUS_ROWS.map(r => r.code));
  const totalHeinousRow = {
    code: 'TOTAL_HEINOUS',
    label: 'TOTAL  HEINOUS',
    reported_curr: totH.upto_curr,
    reported_prev: totH.upto_prev,
    variation:     varPct(totH.upto_curr, totH.upto_prev),
    solved_curr:   totH.det_curr,
    solved_prev:   totH.det_prev,
    pct_solved_curr: detPct(totH.det_curr, totH.upto_curr),
    pct_solved_prev: detPct(totH.det_prev, totH.upto_prev),
    isTotal: true,
  };

  // Non-Heinous rows for Monday Morning
  const nonHeinousData = MONDAY_MORNING_NON_HEINOUS_ROWS.map(def => {
    const acc = nonHeinousMap[def.code] || zeroAcc();
    let label = def.label;
    if (def.code === 'OTHER_IPC') {
      label = windows.d >= '2024-07-01' ? 'OTHER BNS' : 'OTHER IPC';
    }
    return {
      code:   def.code,
      label,
      reported_curr: acc.upto_curr,
      reported_prev: acc.upto_prev,
      variation:     varPct(acc.upto_curr, acc.upto_prev),
      solved_curr:   acc.det_curr,
      solved_prev:   acc.det_prev,
      pct_solved_curr: detPct(acc.det_curr, acc.upto_curr),
      pct_solved_prev: detPct(acc.det_prev, acc.upto_prev),
    };
  });

  // Non-Heinous total
  const totNH = sumRows(nonHeinousMap, MONDAY_MORNING_NON_HEINOUS_ROWS.map(r => r.code));
  const totalNonHeinousRow = {
    code: 'TOTAL_NON_HEINOUS',
    label: 'TOTAL NON HEINOUS',
    reported_curr: totNH.upto_curr,
    reported_prev: totNH.upto_prev,
    variation:     varPct(totNH.upto_curr, totNH.upto_prev),
    solved_curr:   totNH.det_curr,
    solved_prev:   totNH.det_prev,
    pct_solved_curr: detPct(totNH.det_curr, totNH.upto_curr),
    pct_solved_prev: detPct(totNH.det_prev, totNH.upto_prev),
    isTotal: true,
  };

  // Total IPC
  const totIPC = sumRows(
    { ...heinousMap, ...nonHeinousMap },
    [...HEINOUS_ROWS, ...MONDAY_MORNING_NON_HEINOUS_ROWS].map(r => r.code)
  );
  const totalIPCRow = {
    code: 'TOTAL_IPC',
    label: windows.d >= '2024-07-01' ? 'TOTAL BNS' : 'TOTAL IPC',
    reported_curr: totIPC.upto_curr,
    reported_prev: totIPC.upto_prev,
    variation:     varPct(totIPC.upto_curr, totIPC.upto_prev),
    solved_curr:   totIPC.det_curr,
    solved_prev:   totIPC.det_prev,
    pct_solved_curr: detPct(totIPC.det_curr, totIPC.upto_curr),
    pct_solved_prev: detPct(totIPC.det_prev, totIPC.upto_prev),
    isTotal: true,
  };

  return [
    ...heinousData,
    totalHeinousRow,
    ...nonHeinousData,
    totalNonHeinousRow,
    totalIPCRow
  ];
}
