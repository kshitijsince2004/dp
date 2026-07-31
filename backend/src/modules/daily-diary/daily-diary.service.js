import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import db from '../../config/db.js';
import { publish } from '../../events/eventBus.js';

// ─── Preview (raw count by record_type) ──────────────────────────────────────
export const getDailyDiaryPreview = async (user, date, psId, districtId, subDivId) => {
  let query = db('records').where('record_date', date).whereNot('current_status', 'DELETED');
  if (psId)       query = query.where('ps_id', psId);
  if (districtId) query = query.where('district_id', districtId);
  if (subDivId)   query = query.where('sub_div_id', subDivId);
  const rows = await query.select('record_type').count('* as count').groupBy('record_type');
  const counts = Object.fromEntries(rows.map(r => [r.record_type, Number(r.count)]));
  return { date, counts };
};

// ─── Raw data (for frontend preview tables) ───────────────────────────────────
export const getDailyDiaryData = async (user, date, psId, districtId, subDivId, tableName = null) => {
  let query = db('records').where('record_date', date).whereNot('current_status', 'DELETED');
  if (psId)       query = query.where('ps_id', psId);
  if (districtId) query = query.where('district_id', districtId);
  if (subDivId)   query = query.where('sub_div_id', subDivId);
  const records = await query;
  const grouped = {};
  for (const r of records) {
    if (!grouped[r.record_type]) grouped[r.record_type] = [];
    grouped[r.record_type].push(r);
  }
  return tableName ? { [tableName]: grouped[tableName] || [] } : grouped;
};

const runPythonFallback = (jobId) => {
  const pythonPath = process.env.PYTHON_PATH || 'python';
  const cmd = `"${pythonPath}" -c "import sys; sys.path.insert(0, './python_worker'); from generator import generate_report; generate_report('${jobId}')"`;
  exec(cmd, { cwd: path.resolve('.') }, (err, stdout, stderr) => {
    if (err) {
      console.error(`[PythonFallback] Error generating report job ${jobId}:`, err);
    } else {
      console.log(`[PythonFallback] Direct Python execution completed for job ${jobId}`);
    }
  });
};

// ─── Queue Export Job (Node.js queues job and triggers Python engine) ─────────
export const queueDailyDiaryExport = async (user, date, psId, districtId, subDivId, tableNamesFilter = null, dateTo = null) => {
  const jobId      = uuidv4();
  const reportsDir = path.resolve(process.env.REPORTS_DIR || './generated-reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const filePath   = path.join(reportsDir, `${jobId}.xlsx`);
  const userId     = user?.userId || user?.id || null;

  await db('report_jobs').insert({
    id:                jobId,
    template_id:       null,
    custom_definition: JSON.stringify({ type: 'DAILY_DIARY', date }),
    filters:           JSON.stringify({ date, date_to: dateTo, ps_id: psId, district_id: districtId, sub_div_id: subDivId, table_names: tableNamesFilter }),
    format:            'EXCEL',
    status:            'PENDING',
    file_path:         filePath,
    created_by:        userId,
    created_at:        new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  });

  await publish('report.requested', { job_id: jobId, format: 'EXCEL', user_id: userId }).catch(() => {});
  // Run python generator directly so job is guaranteed to execute immediately even if RabbitMQ daemon is offline
  setTimeout(() => runPythonFallback(jobId), 100);
  return { jobId };
};
