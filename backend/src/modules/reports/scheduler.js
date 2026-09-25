import cron from 'node-cron';
import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { generateReportInternal } from './reports.controller.js';
import { getLogger } from '../../utils/logger.js';

// Logging-instrumentation-2026-07-22 (B5): matches records.service.js style. Replaces the
// pre-existing unbound `logger.info(\`[Scheduler] ...\`)` string-concat calls with the bound
// `getLogger('reports.scheduler')` + structured `log.<level>(event, data)` convention
// (additive — same information carried, no behavior change).
const log = getLogger('reports.scheduler');

const activeCronJobs = new Map();

export const initScheduler = async () => {
  log.info('initScheduler: enter');
  try {
    const schedules = await db('scheduled_reports').where({ is_active: true });
    log.info('initScheduler: found active scheduled_reports rows', { count: schedules.length });

    for (const schedule of schedules) {
      await startScheduledJob(schedule);
    }
  } catch (error) {
    log.error('initScheduler: failed to initialize scheduled reports', { err: error });
  }

  // Refresh analytics materialized view nightly at 02:00 AM (PostgreSQL only)
  const isPg = db.client.config.client === 'pg';
  log.debug('initScheduler: checked DB client for materialized-view cron eligibility', { isPg });
  if (isPg) {
    cron.schedule('0 2 * * *', async () => {
      log.debug('initScheduler: nightly mv_record_stats refresh cron fired');
      try {
        await db.raw('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_record_stats');
        log.info('initScheduler: mv_record_stats refreshed successfully');
      } catch (err) {
        log.error('initScheduler: mv_record_stats refresh failed', { err });
      }
    });
    log.info('initScheduler: analytics materialized view refresh scheduled (nightly 02:00)');
  }

  // Hourly cron to clean up expired bulk import temp files
  cron.schedule('0 * * * *', async () => {
    log.debug('initScheduler: expired import temp files cleanup cron fired');
    const path = await import('path');
    const fs = await import('fs');
    try {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - 24);

      const expiredBatches = await db('import_batches')
        .where('created_at', '<', cutoff.toISOString())
        .whereNotIn('status', ['COMPLETED', 'EXPIRED']);
      log.debug('initScheduler: resolved expired import_batches', { cutoff: cutoff.toISOString(), count: expiredBatches.length });

      if (expiredBatches.length > 0) {
        log.info('initScheduler: purging expired import batches', { count: expiredBatches.length });
        for (const batch of expiredBatches) {
          if (batch.file_path && fs.existsSync(batch.file_path)) {
            try {
              fs.unlinkSync(batch.file_path);
              log.info('initScheduler: deleted expired temp file', { batchId: batch.id, filePath: batch.file_path });
            } catch (fileErr) {
              log.error('initScheduler: error unlinking temp file', { batchId: batch.id, filePath: batch.file_path, err: fileErr });
            }
          }
          await db('import_batches')
            .where({ id: batch.id })
            .update({ status: 'EXPIRED' });
          log.debug('initScheduler: marked import_batches row EXPIRED', { batchId: batch.id });
        }
      }
    } catch (err) {
      log.error('initScheduler: import temp files cleanup cron failed', { err });
    }
  });
  log.info('initScheduler: exit — import temp files cleanup scheduled (hourly)');
};


export const startScheduledJob = async (schedule) => {
  const { id, template_id, cron_expr, format, filter_spec, scope_ps_id, scope_district_id, recipients } = schedule;
  log.debug('startScheduledJob: enter', { scheduleId: id, template_id, cron_expr, format });

  // Stop if already running
  if (activeCronJobs.has(id)) {
    log.debug('startScheduledJob: job already active, stopping before restart', { scheduleId: id });
    stopScheduledJob(id);
  }

  try {
    const job = cron.schedule(cron_expr, async () => {
      log.info('startScheduledJob: cron fired — triggered scheduled report execution', { scheduleId: id, template_id });
      const jobId = uuidv4();
      const reportsDir = process.env.REPORTS_DIR || './generated-reports';
      const fileName = `${jobId}.${format.toLowerCase()}`;
      const path = await import('path');
      const filePath = path.join(reportsDir, fileName);

      try {
        // Insert report job as pending
        await db('report_jobs').insert({
          id: jobId,
          template_id,
          filters: filter_spec,
          format: format.toUpperCase(),
          status: 'pending',
          file_path: filePath,
          created_by: schedule.created_by,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        log.debug('startScheduledJob: wrote report_jobs row (pending)', { scheduleId: id, jobId });

        // Run the generation
        const parsedFilters = typeof filter_spec === 'string' ? JSON.parse(filter_spec) : filter_spec || {};
        if (scope_ps_id) parsedFilters.psId = scope_ps_id;
        if (scope_district_id) parsedFilters.districtId = scope_district_id;

        await generateReportInternal(jobId, template_id, parsedFilters, format.toUpperCase(), filePath, schedule.created_by);

        // Update schedule metadata
        await db('scheduled_reports').where({ id }).update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'SUCCESS'
        });

        log.info('startScheduledJob: scheduled report completed successfully', { scheduleId: id, jobId });
      } catch (err) {
        log.error('startScheduledJob: scheduled report execution failed', { scheduleId: id, jobId, err });

        await db('scheduled_reports').where({ id }).update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'FAILED'
        });

        await db('report_jobs').where({ id: jobId }).update({
          status: 'FAILED',
          updated_at: new Date().toISOString()
        });
      }
    });

    activeCronJobs.set(id, job);
    log.info('startScheduledJob: exit — cron job registered', { scheduleId: id, cron_expr });
  } catch (err) {
    log.error('startScheduledJob: failed to start scheduled job', { scheduleId: id, cron_expr, err });
  }
};

export const stopScheduledJob = (id) => {
  log.debug('stopScheduledJob: enter', { scheduleId: id });
  if (activeCronJobs.has(id)) {
    const job = activeCronJobs.get(id);
    job.stop();
    activeCronJobs.delete(id);
    log.info('stopScheduledJob: exit — stopped scheduled job', { scheduleId: id });
  } else {
    log.debug('stopScheduledJob: exit — no active job for this id, no-op', { scheduleId: id });
  }
};

export const reloadScheduledJob = async (id) => {
  log.debug('reloadScheduledJob: enter', { scheduleId: id });
  const schedule = await db('scheduled_reports').where({ id }).first();
  if (!schedule || !schedule.is_active) {
    log.debug('reloadScheduledJob: schedule missing or inactive, stopping job', { scheduleId: id, found: !!schedule, isActive: schedule?.is_active ?? null });
    stopScheduledJob(id);
  } else {
    log.debug('reloadScheduledJob: schedule active, (re)starting job', { scheduleId: id });
    await startScheduledJob(schedule);
  }
};
