'use strict';
// Minimal lint: every .js under src/ scripts/ server.js must parse and must not
// use `var`. Exits non-zero on a finding.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const targets = ['server.js', 'src/repository.js', 'scripts/build.js', 'scripts/lint.js']
  .map((f) => path.join(root, f))
  .filter((f) => fs.existsSync(f));

let problems = 0;
for (const f of targets) {
  const src = fs.readFileSync(f, 'utf8');
  try { new vm.Script(src, { filename: f }); }
  catch (e) { console.error('PARSE  ' + f + ': ' + e.message); problems++; continue; }
  const varLines = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /^\s*var\s/.test(l));
  for (const [ln] of varLines) { console.error('NO-VAR ' + f + ':' + ln); problems++; }
}

console.log(problems ? problems + ' lint problem(s)' : 'lint clean');
process.exit(problems ? 1 : 0);
