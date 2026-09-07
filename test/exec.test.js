'use strict';
/* Real npm script execution through the proc layer — the core of M2 #1. */
const os = require('os');
const fs = require('fs');
const path = require('path');
const ws = require('../electron/lib/workspace');
const proc = require('../electron/lib/proc');

module.exports = async function (t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-exec-'));
  ws.setRoot(tmp);
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    name: 'exec-fixture',
    version: '1.0.0',
    scripts: {
      test: 'node -e "process.exit(0)"',
      build: 'node -e "require(\'fs\').writeFileSync(\'built.txt\',\'ok\')"',
      failing: 'node -e "process.exit(3)"'
    }
  }, null, 2));

  const testRun = await proc.runManaged({ cmd: 'npm', args: ['test'], cwd: '.' });
  t.equal('npm test (passing script) exits 0', testRun.code, 0);

  const buildRun = await proc.runManaged({ cmd: 'npm', args: ['run', 'build'], cwd: '.' });
  t.equal('npm run build exits 0', buildRun.code, 0);
  t.ok('build produced its artifact on disk', fs.existsSync(path.join(tmp, 'built.txt')));

  const failRun = await proc.runManaged({ cmd: 'npm', args: ['run', 'failing'], cwd: '.' });
  t.ok('failing script surfaces a non-zero code', failRun.code !== 0);

  // streamed variant used by long jobs (install/build)
  const events = [];
  await new Promise((resolve) => {
    let done = false;
    proc.spawnAllowed({ cmd: 'npm', args: ['run', 'build'], cwd: '.' }, (e) => {
      events.push(e);
      if (e.stream === 'exit') { done = true; resolve(); }
    });
    setTimeout(() => { if (!done) resolve(); }, 15000);
  });
  t.ok('streamed npm run build exits 0', events.some((e) => e.stream === 'exit' && e.code === 0));

  fs.rmSync(tmp, { recursive: true, force: true });
};
