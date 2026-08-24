import fs from 'fs';
import path from 'path';

function inspectMigrations() {
  const migDir = './migrations';
  const files = fs.readdirSync(migDir).filter(f => f.endsWith('.js')).sort();
  console.log('Migration files:', files);

  const tables = {};

  for (const f of files) {
    const content = fs.readFileSync(path.join(migDir, f), 'utf8');
    // Extract createTable and table calls
    const lines = content.split('\n');
    let currentTable = null;

    for (const line of lines) {
      const createMatch = line.match(/createTable\(['"]([^'"]+)['"]/);
      const schemaCreateMatch = line.match(/withSchema\(['"]([^'"]+)['"]\)\.createTable\(['"]([^'"]+)['"]/);
      const tableMatch = line.match(/schema\.table\(['"]([^'"]+)['"]/);

      if (schemaCreateMatch) {
        currentTable = schemaCreateMatch[1] + '.' + schemaCreateMatch[2];
        if (!tables[currentTable]) tables[currentTable] = new Set();
      } else if (createMatch) {
        currentTable = createMatch[1];
        if (!tables[currentTable]) tables[currentTable] = new Set();
      } else if (tableMatch) {
        currentTable = tableMatch[1];
        if (!tables[currentTable]) tables[currentTable] = new Set();
      }

      if (currentTable) {
        const colMatch = line.match(/t\.(string|integer|decimal|boolean|date|datetime|timestamp|uuid|text|json|jsonb|increments|specificType)\(['"]([^'"]+)['"]/);
        if (colMatch) {
          tables[currentTable].add(colMatch[2]);
        }
      }
    }
  }

  const out = {};
  for (const [k, v] of Object.entries(tables)) {
    out[k] = Array.from(v);
  }

  fs.writeFileSync('scripts/migration-schema-dump.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('Migration schema dumped! Tables:', Object.keys(out));
}

inspectMigrations();
