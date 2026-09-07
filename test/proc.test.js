'use strict';
/* Command-execution tests for electron/lib/proc.js */
const os = require('os');
const fs = require('fs');
const path = require('path');
const ws = require('../electron/lib/workspace');
const proc = require('../electron/lib/proc');

module.exports = async function (t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-proc-'));
  ws.setRoot(tmp);

  const r1 = await proc.runManaged({ cmd: 'node', args: ['--version'], cwd: '.' });
  t.ok('runManaged: node --version succeeds', r1.code === 0 && /^v\d+/.test(r1.stdout.trim()));

  const r2 = await proc.runManaged({ cmd: 'calc', args: [], cwd: '.' });
  t.ok('runManaged: non-allowlisted command blocked', r2.code === -1 && /allowlist/i.test(r2.stderr));

  const r3 = await proc.runManaged({ cmd: 'node', args: ['-e', '0'], cwd: '../../..' });
  t.ok('runManaged: cwd escape blocked', r3.code === -1);

  const events = [];
  await new Promise((resolve) => {
    let done = false;
    proc.spawnManaged({ cmd: 'node', args: ['-e', 'process.stdout.write("hello\\n")'], cwd: '.' }, (e) => {
      events.push(e);
      if (e.stream === 'exit') { done = true; resolve(); }
    });
    setTimeout(() => { if (!done) resolve(); }, 5000);
  });
  t.ok('spawnManaged: streams stdout', events.some((e) => e.stream === 'stdout' && /hello/.test(e.data)));
  t.ok('spawnManaged: emits exit 0', events.some((e) => e.stream === 'exit' && e.code === 0));

  // spawnAllowed: same allowlist as runManaged, but streamed
  await t.throwsAsync('spawnAllowed rejects non-allowlisted', async () =>
    proc.spawnAllowed({ cmd: 'powershell', args: ['-c', 'calc'], cwd: '.' }, () => {}));

  const ev2 = [];
  await new Promise((resolve) => {
    let done = false;
    proc.spawnAllowed({ cmd: 'node', args: ['-e', 'console.log("streamed")'], cwd: '.' }, (e) => {
      ev2.push(e);
      if (e.stream === 'exit') { done = true; resolve(); }
    });
    setTimeout(() => { if (!done) resolve(); }, 5000);
  });
  t.ok('spawnAllowed: streams + exits 0', ev2.some((e) => e.stream === 'stdout' && /streamed/.test(e.data)) && ev2.some((e) => e.stream === 'exit' && e.code === 0));

  fs.rmSync(tmp, { recursive: true, force: true });
};
