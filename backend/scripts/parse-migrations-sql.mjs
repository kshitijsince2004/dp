import fs from 'fs';
import path from 'path';

function parseAllMigrations() {
  const migDir = './migrations';
  const files = fs.readdirSync(migDir).filter(f => f.endsWith('.js')).sort();

  const tables = {};

  for (const f of files) {
    const content = fs.readFileSync(path.join(migDir, f), 'utf8');

    // Find CREATE TABLE statements
    const tableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_.]+)\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      const tableName = match[1].replace(/public\./g, '');
      const body = match[2];
      if (!tables[tableName]) tables[tableName] = {};

      const lines = body.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('PRIMARY KEY') || trimmed.startsWith('FOREIGN KEY') || trimmed.startsWith('UNIQUE') || trimmed.startsWith('CHECK')) {
          continue;
        }
        const colMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_()]+)(.*)$/);
        if (colMatch) {
          const colName = colMatch[1];
          const colType = colMatch[2];
          const rest = colMatch[3] || '';
          tables[tableName][colName] = {
            type: colType,
            nullable: !rest.includes('NOT NULL'),
            defaultVal: rest.match(/DEFAULT\s+([^,;]+)/)?.[1]?.trim() || null
          };
        }
      }
    }

    // Find ALTER TABLE ADD COLUMN statements
    const alterRegex = /ALTER\s+TABLE\s+([a-zA-Z0-9_.]+)\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_()]+)([^;]*);/gi;
    while ((match = alterRegex.exec(content)) !== null) {
      const tableName = match[1].replace(/public\./g, '');
      const colName = match[2];
      const colType = match[3];
      const rest = match[4] || '';
      if (!tables[tableName]) tables[tableName] = {};
      tables[tableName][colName] = {
        type: colType,
        nullable: !rest.includes('NOT NULL'),
        defaultVal: rest.match(/DEFAULT\s+([^,;]+)/)?.[1]?.trim() || null
      };
    }
  }

  fs.writeFileSync('scripts/parsed-full-db-schema.json', JSON.stringify(tables, null, 2), 'utf8');
  console.log('Parsed full DB schema from migrations! Tables found:', Object.keys(tables));
}

parseAllMigrations();
