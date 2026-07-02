const fs = require('fs');
const path = require('path');
const file = path.resolve(process.cwd(), 'frontend/src/components/forms/DynamicForm.jsx');
const text = fs.readFileSync(file, 'utf8');
const stack = [];
const opens = { '{': '}', '(': ')', '[': ']' };
const closes = { '}': '{', ')': '(', ']': '[' };
let line = 1;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (ch === '\n') line++;
  if (opens[ch]) stack.push({ ch, line, i });
  else if (closes[ch]) {
    if (stack.length === 0) {
      console.error(`Unmatched closing ${ch} at line ${line} (index ${i})`);
      process.exit(2);
    }
    const top = stack.pop();
    if (top.ch !== closes[ch]) {
      console.error(`Mismatched ${top.ch} opened at line ${top.line} but closed by ${ch} at line ${line} (index ${i})`);
      process.exit(3);
    }
  }
}
if (stack.length > 0) {
  const top = stack[stack.length-1];
  console.error(`Unclosed ${top.ch} opened at line ${top.line}`);
  process.exit(4);
}
console.log('All brackets matched.');
