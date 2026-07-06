const fs = require('fs');
let code = fs.readFileSync('frontend/src/components/forms/DynamicForm.jsx', 'utf8');

const regexMajor = /for \(const mf of majorFields\) \{\n\s*if \(mf\.options && Array\.isArray\(mf\.options\)\) \{\n\s*for \(const opt of mf\.options\) \{/m;
code = code.replace(regexMajor, `for (const mf of majorFields) {
        let opts = mf.options;
        if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch {} }
        if (opts && Array.isArray(opts)) {
          for (const opt of opts) {`);

const regexMinor = /if \(minorField\?\.options && Array\.isArray\(minorField\.options\)\) \{\n\s*return minorField\.options;\n\s*\}/m;
code = code.replace(regexMinor, `let opts = minorField?.options;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch {} }
    if (opts && Array.isArray(opts)) {
      return opts;
    }`);

const regexLocal = /if \(localField\?\.options && Array\.isArray\(localField\.options\)\) \{\n\s*return localField\.options;\n\s*\}/m;
code = code.replace(regexLocal, `let opts = localField?.options;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch {} }
    if (opts && Array.isArray(opts)) {
      return opts;
    }`);

fs.writeFileSync('frontend/src/components/forms/DynamicForm.jsx', code);
console.log('Fixed options parsing');
