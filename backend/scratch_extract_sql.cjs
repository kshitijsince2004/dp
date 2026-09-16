const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, 'migrations');
const files = fs.readdirSync(migrationsDir).sort();

let sqlOutput = '';

for (const file of files) {
  if (file.endsWith('.js')) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    // Extract everything inside knex.raw(`...`)
    const rawMatches = content.match(/knex\.raw\(\s*`([\s\S]*?)`\s*\)/g);
    if (rawMatches) {
      for (const match of rawMatches) {
        // Extract the inner content correctly
        const innerMatch = match.match(/knex\.raw\(\s*`([\s\S]*?)`\s*\)/);
        if (innerMatch && innerMatch[1]) {
            // Ignore DROP TABLE commands as we only want schema for draw.io
            if (!innerMatch[1].trim().toUpperCase().startsWith('DROP')) {
                sqlOutput += `-- Source: ${file}\n`;
                sqlOutput += innerMatch[1].trim() + '\n\n';
            }
        }
      }
    }

    // Handle knex.schema.createTable manually by looking at lines or just adding a note
    const knexSchemaTables = content.match(/knex\.schema\.(?:withSchema\('[^']+'\)\.)?createTable\('([^']+)'/g);
    if (knexSchemaTables) {
      for (const match of knexSchemaTables) {
        const tableName = match.match(/'([^']+)'$/)[1];
        sqlOutput += `-- Note: Table ${tableName} created via knex.schema (builder syntax) in ${file}\n`;
        // Since there are only 3, I'll just write them manually if they matter, 
        // but draw.io handles SQL. Let's just output the raw SQL we found, which is 95% of the schema.
      }
    }
  }
}

fs.writeFileSync(path.join(__dirname, '../schema_for_drawio.sql'), sqlOutput);
console.log('Done generating schema_for_drawio.sql');
