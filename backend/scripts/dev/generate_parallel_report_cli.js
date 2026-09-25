import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateParallelReport } from '../../src/modules/reports/reports.parallel.service.js';
import db from '../../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load dotenv from backend/.env explicitly
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const args = process.argv.slice(2);
  const jobId = args[0] || 'cli-job';
  const filtersJson = args[1] || '{}';
  const outFile = args[2];

  if (!outFile) {
    console.error('Usage: node generate_parallel_report_cli.js <jobId> <filtersJson> <outFile>');
    process.exit(1);
  }

  try {
    const filters = JSON.parse(filtersJson);
    console.log(`[CLI] Generating parallel report for jobId: ${jobId}, filters:`, filters, `to file: ${outFile}`);

    // Resolve output path to absolute if it is relative
    const absoluteOutFile = path.isAbsolute(outFile) ? outFile : path.resolve(process.cwd(), outFile);

    await generateParallelReport(jobId, filters, absoluteOutFile);
    console.log('[CLI] Generation complete!');
    await db.destroy();
    process.exit(0);
  } catch (error) {
    console.error('[CLI] Error generating report:', error);
    try {
      await db.destroy();
    } catch (e) { }
    process.exit(1);
  }
}

main();
