'use strict';
/* No source file may contain U+FFFD (the Unicode replacement character).
 * One appears when a file is read as the wrong encoding and written back —
 * found in dist/app.js after an edit had turned every "·" in the UI into
 * "�" (28 of them: the welcome status line, Settings > About, the stage
 * headers, the Tab hints). The mangled text still parses, so nothing else
 * catches it. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'release', '.git', 'vendor']);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|html|css|json|md)$/.test(e.name)) out.push(p);
  }
  return out;
}

module.exports = async function (t) {
  const files = [];
  for (const d of ['dist', 'electron', 'scripts']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), files);
  const hits = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => { if (l.includes('�')) hits.push(path.relative(ROOT, f) + ':' + (i + 1)); });
  }
  t.ok('scanned the app sources (' + files.length + ' files)', files.length > 50);
  t.ok('no U+FFFD replacement characters in any source file' + (hits.length ? ' — ' + hits.slice(0, 10).join(', ') : ''), hits.length === 0);
};
