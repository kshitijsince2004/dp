import * as eventBus from '../eventBus.js';
import { logger } from '../../utils/logger.js';
import { generateReportInternal } from '../../modules/reports/reports.controller.js';
import db from '../../config/db.js';
import path from 'path';

export async function init() {
  await eventBus.subscribe('report.generate.requested', 'report-generation-queue', async (payload) => {
    const jobId = payload?.job_id;
    if (!jobId) {
      logger.warn('[ReportJobHandler] report.generate.requested with no job_id — dropping');
      return;
    }

    try {
      const job = await db('report_jobs').where({ id: jobId }).first();
      if (!job) {
        logger.warn(`[ReportJobHandler] Job ${jobId} not found in database`);
        return;
      }

      await db('report_jobs').where({ id: jobId }).update({ status: 'PROCESSING', updated_at: db.fn.now() });

      const filters = typeof job.filters === 'string' ? JSON.parse(job.filters) : (job.filters || {});
      const fileName = `report_${job.template_id || 'phq'}_${Date.now()}.${(job.format || 'excel').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx'}`;
      const filePath = path.resolve('uploads/reports', fileName);

      await generateReportInternal(jobId, job.template_id, filters, job.format || 'EXCEL', filePath, job.user_id);

      await db('report_jobs').where({ id: jobId }).update({
        status: 'READY',
        file_path: filePath,
        file_name: fileName,
        updated_at: db.fn.now()
      });
      logger.info(`[ReportJobHandler] Report job ${jobId} completed: ${fileName}`);
    } catch (err) {
      logger.error(`[ReportJobHandler] Error processing report job ${jobId}: ${err.message}`);
      await db('report_jobs').where({ id: jobId }).update({ status: 'FAILED', updated_at: db.fn.now() });
    }
  });
}
