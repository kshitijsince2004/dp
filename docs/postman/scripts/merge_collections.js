import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const collectionsDir = path.join(__dirname, '../collections');
const combinedFile = path.join(__dirname, '../combined/delhi_police_portal.postman_collection.json');

const files = fs.readdirSync(collectionsDir).filter(f => f.endsWith('.json')).sort();

const combined = {
  info: {
    name: "Delhi Police Portal - Combined API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  item: []
};

files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(path.join(collectionsDir, file), 'utf8'));
  combined.item.push({
    name: data.info.name,
    item: data.item
  });
});

fs.writeFileSync(combinedFile, JSON.stringify(combined, null, 2));
console.log('Merged collections into ' + combinedFile);
