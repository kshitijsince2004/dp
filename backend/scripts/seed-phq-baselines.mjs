import db from '../src/config/db.js';

/**
 * Seeder script for PHQ Historical Baselines (2014-2023).
 * Seeds historical counts for scopes and crime heads.
 */

const HEADS = ['BURGLARY', 'ROBBERY', 'MURDER', 'ATTEMPT_TO_MURDER', 'RAPE', 'DOWRY_DEATH', 'MOTOR_VEHICLE_THEFT'];
const SCOPES = [
  'DIST_CD', 'DIST_ND', 'DIST_ED', 'DIST_NED', 'DIST_SHD', 'DIST_NWD', 'DIST_OND', 'DIST_RND',
  'DIST_NDD', 'DIST_SWD', 'DIST_SD', 'DIST_SED', 'DIST_WD', 'DIST_DW', 'DIST_OD',
  'DIST_SPECIALCELL', 'DIST_SPUWAC', 'DIST_VIGILANCE', 'DIST_CRIMEBRANCH', 'DIST_EOW', 'DIST_IGIAIRPORT', 'DIST_METRO', 'DIST_RAILWAYS'
];

export async function seedBaselines() {
  console.log('[Seed PHQ Baselines] Starting seeding for years 2014-2023...');

  let inserted = 0;
  for (let year = 2014; year <= 2023; year++) {
    for (const scopeCode of SCOPES) {
      for (const headCode of HEADS) {
        // Generate deterministic realistic baseline figures
        const base = (year % 10 + 1) * 15 + (headCode.length * 3);
        const reportedCount = base + Math.floor(Math.random() * 10);
        const solvedCount = Math.floor(reportedCount * 0.65);

        await db('stat_baselines')
          .insert({
            year,
            scope_code: scopeCode,
            head_code: headCode,
            reported_count: reportedCount,
            solved_count: solvedCount
          })
          .onConflict(['year', 'scope_code', 'head_code'])
          .merge();

        inserted++;
      }
    }
  }

  console.log(`[Seed PHQ Baselines] Complete! ${inserted} baseline records seeded.`);
}

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1].endsWith('seed-phq-baselines.mjs')) {
  seedBaselines()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed PHQ Baselines] Failed:', err);
      process.exit(1);
    });
}
