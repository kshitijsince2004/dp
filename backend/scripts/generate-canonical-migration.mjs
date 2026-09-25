import fs from 'fs';

function generateCanonicalMigration() {
  const data = JSON.parse(fs.readFileSync('scripts/mapped-local-heads.json', 'utf8'));
  const high = data.high;

  let sqlStatements = [];

  for (const item of high) {
    sqlStatements.push(`    -- Unlocks: STAT_1 / STAT_2 (${item.name.trim()})\n    UPDATE ref.local_heads SET canonical_code = '${item.canonical}' WHERE local_head_cd = ${item.cd} AND canonical_code IS NULL;`);
  }

  const migrationContent = `// Migration 20260818000011: Complete Canonical Codes Mapping for ref.local_heads
// Source: Menu_Tables.xlsx & STAT_1 Proforma mapping rules

export async function up(knex) {
  await knex.raw(\`
${sqlStatements.join('\n\n')}
  \`);
}

export async function down(knex) {
  // no-op — canonical codes are additive; reversing would break diary renderers
}
`;

  fs.writeFileSync('migrations/20260818000011_canonical_codes.js', migrationContent, 'utf8');
  console.log(`Generated migration 20260818000011_canonical_codes.js with ${high.length} statements!`);
}

generateCanonicalMigration();
