'use strict';
/* ZIP-writer tests for electron/lib/zip.js */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const zip = require('../electron/lib/zip');

module.exports = async function (t) {
  t.equal('crc32("hello")', zip.crc32(Buffer.from('hello')) >>> 0, 0x3610a686);

  const buf = zip.build([
    { name: 'index.html', data: '<h1>Test</h1>' },
    { name: 'src/app.js', data: Buffer.from('x'.repeat(400)) }
  ]);
  t.equal('local-file signature', buf.slice(0, 4).toString('hex'), '504b0304');
  t.equal('end-of-central-directory signature', buf.slice(-22, -18).toString('hex'), '504b0506');

  // Round-trip through a real unzip implementation (PowerShell / .NET on Windows).
  if (process.platform === 'win32') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-zip-'));
    const zpath = path.join(dir, 'a.zip');
    fs.writeFileSync(zpath, buf);
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zpath}' -DestinationPath '${dir}\\out' -Force`]);
    t.equal('extracted index.html', fs.readFileSync(path.join(dir, 'out', 'index.html'), 'utf8'), '<h1>Test</h1>');
    t.equal('extracted nested file length', fs.readFileSync(path.join(dir, 'out', 'src', 'app.js'), 'utf8').length, 400);
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
