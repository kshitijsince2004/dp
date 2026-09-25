import fs from 'fs';
import path from 'path';

const baseDir = path.resolve(process.cwd(), '../context-bundle/22-CORRECTNESS-SYSTEM');
const decisionsPath = path.join(baseDir, 'NEEDS-DECISION.md');
const registerPath = path.join(baseDir, 'sheet-contract-register.json');

async function main() {
  console.log('=== 🔄 APPLYING DECISIONS TO SHEET CONTRACT REGISTER ===');

  if (!fs.existsSync(decisionsPath) || !fs.existsSync(registerPath)) {
    console.error('Missing decisions markdown or sheet contract register file.');
    process.exit(1);
  }

  const decisionsText = fs.readFileSync(decisionsPath, 'utf8');
  const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));

  // Simple parsing of Decision blocks
  const decisions = {};
  const dMatches = decisionsText.matchAll(/##\s+(D\d+)[\s\S]*?\*\*Decision:\*\*\s*(.*?)\n\*\*Decided by:\*\*\s*(.*?)\n\*\*Date:\*\*\s*(.*?)\n/g);

  for (const m of dMatches) {
    const id = m[1].trim();
    const decision = m[2].trim();
    const decidedBy = m[3].trim();
    const date = m[4].trim();

    if (decision && decision !== '_____________________') {
      decisions[id] = { decision, decidedBy, date };
    }
  }

  console.log('Parsed Decisions:', decisions);

  let updatedCount = 0;

  // Walk contract register and upgrade NEEDS_DECISION entries
  for (const [diaryKey, sheets] of Object.entries(register)) {
    for (const [sheetKey, sheet] of Object.entries(sheets)) {
      for (const row of sheet.rows || []) {
        if (row.status === 'NEEDS_DECISION' || row.status === 'PROPOSED') {
          // Check if evidence mentions a decision ID (e.g., D2, D4)
          for (const [dId, dObj] of Object.entries(decisions)) {
            if (row.evidence?.includes(dId) || row.label?.toLowerCase().includes('residence') || row.label?.toLowerCase().includes('cheating')) {
              row.status = 'CONFIRMED';
              row.confirmed_by = dObj.decidedBy;
              row.confirmed_date = dObj.date;
              row.evidence += ` | Confirmed via Decision ${dId} (${dObj.decision})`;
              updatedCount++;
            }
          }
        }
      }
    }
  }

  fs.writeFileSync(registerPath, JSON.stringify(register, null, 2), 'utf8');
  console.log(`Updated ${updatedCount} contract register entries to CONFIRMED.`);
  process.exit(0);
}

main().catch(err => { console.error('Apply Decisions Error:', err); process.exit(1); });
