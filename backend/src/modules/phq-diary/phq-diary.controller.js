import path from 'path';
import os from 'os';
import { generate } from './phq-diary.service.js';
import { logger } from '../../utils/logger.js';

/**
 * POST /api/phq-diary/generate
 * Body: { date: 'YYYY-MM-DD', scope?: 'ALL_DELHI_TOTAL' }
 * Returns: { url: '/api/phq-diary/download?file=<token>' }
 *
 * For simplicity, file is written to OS tmp dir and returned inline.
 * In production, wire through the warehouse/storage module.
 */
export async function generateDiary(req, res) {
  const date  = req.body?.date || req.query?.date || new Date().toISOString().slice(0, 10);
  const scope = req.body?.scope || req.query?.scope || 'ALL_DELHI_TOTAL';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  try {
    logger.info(`[PHQDiary] Generating for date=${date} scope=${scope}`);
    const buffer = await generate(date, scope);

    const filename = `PHQ_Diary_${date}.xlsx`;
    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length',      buffer.length);
    return res.send(buffer);
  } catch (err) {
    logger.error(`[PHQDiary] Generation failed: ${err.message}`, { stack: err.stack });
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/phq-diary/preview?date=YYYY-MM-DD&scope=...
 * Returns JSON summary of what will appear in the diary (no Excel generation).
 */
export async function previewDiary(req, res) {
  const date  = req.query?.date || new Date().toISOString().slice(0, 10);
  const scope = req.query?.scope || 'ALL_DELHI_TOTAL';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  try {
    const { buildDateWindows, fetchCaseCounts, fetchArrestCounts, fetchDrugRecovery, resolveDistrictNodes } = await import('./phq-diary.data.js');
    const { buildManualyData, buildMondayMorningData } = await import('./phq-diary.calc.js');
    const { resolveScopeCodes } = await import('../reports/engine/scopeResolver.js');

    const windows       = buildDateWindows(date);
    const distCodes     = await resolveScopeCodes(scope);
    const distNodes     = await resolveDistrictNodes(distCodes);
    const districtIds   = [...distNodes.codeToId.values()];

    if (districtIds.length === 0) {
      return res.status(400).json({ error: `No districts resolved for scope: ${scope}` });
    }

    const [caseRows, arrestRows, drugRows] = await Promise.all([
      fetchCaseCounts(districtIds, 'district_id', windows),
      fetchArrestCounts(districtIds, 'district_id', windows),
      fetchDrugRecovery(districtIds, 'district_id', windows),
    ]);

    const data = buildManualyData(caseRows, arrestRows, drugRows, undefined, windows);

    return res.json({
      date,
      scope,
      windows: {
        day_curr:  windows.day_curr,
        fn_curr:   windows.fn_curr,
        upto_curr: windows.upto_curr,
        year_curr: windows.year_curr,
        year_prev: windows.year_prev,
        year_prev2: windows.year_prev2,
      },
      summary: {
        heinous_cases_today: data.totalHeinous.day_curr,
        total_ipc_upto:      data.totalIPC.upto_curr,
        total_act_upto:      data.totalAct.upto_curr,
      },
      heinousRows:    data.heinousRows,
      totalHeinous:   data.totalHeinous,
      nonHeinousRows: data.nonHeinousRows,
      totalIPC:       data.totalIPC,
      lslRows:        data.lslRows,
      totalAct:       data.totalAct,
      drugData:       data.drugData,
    });
  } catch (err) {
    logger.error(`[PHQDiary] Preview failed: ${err.message}`, { stack: err.stack });
    return res.status(500).json({ error: err.message });
  }
}
