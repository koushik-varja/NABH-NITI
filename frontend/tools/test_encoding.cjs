// Production guard: detect common broken UTF-8 -> Windows-1252 -> UTF-8 edits.
// The UI source deliberately uses ASCII-only visible labels to avoid recurring
// mojibake when someone edits the code through an incorrectly configured shell.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const extensions = new Set(['.tsx', '.ts', '.css', '.html']);
const files = [];
function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) scan(full);
    else if (extensions.has(path.extname(e.name))) files.push(full);
  }
}
scan(path.join(root, 'src'));
files.push(path.join(root, 'index.html'));
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  assert(!/[\uFFFD\u00C2\u00C3\u00E2][\u0080-\u00BF\u2018-\u2122]/u.test(text), `Possible mojibake in ${file}`);
  assert(!/[^\x00-\x7F]/.test(text), `Non-ASCII text in ${file}: use ASCII UI labels to prevent Windows encoding corruption`);
}
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'src', 'PolicyGuide.tsx'), 'utf8');
const source = fs.readFileSync(path.join(root, '..', 'backend', 'nabhniti', 'core.py'), 'utf8');
assert(app.includes("setPage('rules')") && app.includes('<PolicyGuide'), 'Rules reference screen must be accessible');
for (const policy of ['Fixed Rules', 'Centralized', 'NABH-NITI']) assert(guide.includes(policy), `Missing ${policy} in rules guide`);
for (const rule of ['medical_priority', 'congestion_priority', 'one_way_lane', 'entry_quota']) {
  assert(source.includes(rule), `Backend rule missing: ${rule}`);
}
assert(guide.includes('Hard safety shield') && guide.includes('Rule-by-rule comparison'));
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(css.includes("'Segoe UI'"), 'Expected local cross-platform font stack');
assert(!css.includes('fonts.googleapis.com'), 'Website must not require online fonts');
assert(/charset=["']?UTF-8/i.test(html), 'Explicit UTF-8 charset is required');
assert(app.includes('NABH<span>-</span>NITI'), 'ASCII-safe brand title is required');
assert(app.includes('DRAG TO ORBIT') && app.includes('SCROLL TO ZOOM'), 'Readable camera instructions are required');
console.log(`PASS: ASCII/encoding scan of ${files.length} source files; three governance references and shared safety policy validated`);
