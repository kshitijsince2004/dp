import { db } from '../../src/config/db.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const nodes = await db('hierarchy_nodes').select('id', 'name_en', 'node_type', 'parent_id');
const stringNodes = nodes.filter(n => !uuidPattern.test(n.id));
const uuidNodes   = nodes.filter(n =>  uuidPattern.test(n.id));

console.log('Total nodes:', nodes.length);
console.log('UUID nodes (junk from old seeds):', uuidNodes.length);
console.log('String nodes (from migration):', stringNodes.length);

const cyberCrime = stringNodes.filter(n => n.name_en === 'PS Cyber Crime');
console.log('\nAll "PS Cyber Crime" string nodes:');
cyberCrime.forEach(n => console.log(' ', n.id, '→ parent:', n.parent_id));

const byType = {};
stringNodes.forEach(n => { byType[n.node_type] = (byType[n.node_type]||0)+1; });
console.log('\nString node counts by type:', JSON.stringify(byType, null, 2));

await db.destroy();
