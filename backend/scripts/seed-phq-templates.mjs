import fs from 'fs';
import path from 'path';
import db from '../src/config/db.js';

/**
 * Seeder script for PHQ Proforma Report Templates into report_templates table.
 */

const PHQ_FILES = [
  'phq_uptodate_matrix.json',
  'phq_districts_comparative.json',
  'phq_lo_north.json',
  'phq_lo_south.json',
  'phq_monday_morning.json',
  'phq_multiyear_detection.json',
  'phq_manualy.json',
  'phq_for_week.json',
  'phq_variation_mvt.json'
];

export async function seedTemplates() {
  console.log('[Seed PHQ Templates] Inserting 9 PHQ report templates...');
  const baseDir = path.resolve('../config/proformas');

  for (const filename of PHQ_FILES) {
    const filePath = path.join(baseDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[Seed PHQ Templates] Warning: File ${filePath} not found, skipping.`);
      continue;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const tpl = JSON.parse(raw);

    const existing = await db('report_templates').where({ code: tpl.code }).first();

    if (existing) {
      await db('report_templates').where({ id: existing.id }).update({
        name: tpl.name,
        record_types: JSON.stringify(tpl.record_types || ['CASE']),
        levels: JSON.stringify(tpl.levels || ['HQ']),
        template_type: tpl.template_type || 'PROFORMA',
        template_definition: JSON.stringify(tpl.template_definition),
        is_active: tpl.is_active ?? true,
        updated_at: db.fn.now()
      });
      console.log(`  Updated: ${tpl.code}`);
    } else {
      await db('report_templates').insert({
        code: tpl.code,
        name: tpl.name,
        record_types: JSON.stringify(tpl.record_types || ['CASE']),
        levels: JSON.stringify(tpl.levels || ['HQ']),
        template_type: tpl.template_type || 'PROFORMA',
        template_definition: JSON.stringify(tpl.template_definition),
        is_active: tpl.is_active ?? true
      });
      console.log(`  Inserted: ${tpl.code}`);
    }
  }

  console.log('[Seed PHQ Templates] Completed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('seed-phq-templates.mjs')) {
  seedTemplates()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed PHQ Templates] Failed:', err);
      process.exit(1);
    });
}
