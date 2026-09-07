'use strict';
// "Build": concatenate the public assets into dist/ and stamp a manifest.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of fs.readdirSync(path.join(root, 'public'))) {
  fs.copyFileSync(path.join(root, 'public', f), path.join(out, f));
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  files: fs.readdirSync(out)
}, null, 2));

console.log('built', fs.readdirSync(out).length, 'files -> dist/');
