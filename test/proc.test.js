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

  // sanitized environment — secrets in the parent env do not reach the child
  process.env.MY_SECRET_TOKEN = 'leaked-value-xyz';
  process.env.NPM_TOKEN = 'npm-leaked';
  const envRun = await proc.runManaged({ cmd: 'node', args: ['-e', 'process.stdout.write(JSON.stringify({s:process.env.MY_SECRET_TOKEN||null,n:process.env.NPM_TOKEN||null,ci:process.env.CI||null,path:!!process.env.PATH||!!process.env.Path}))'], cwd: '.' });
  const env = JSON.parse(envRun.stdout || '{}');
  t.equal('secret env var is stripped', env.s, null);
  t.equal('NPM_TOKEN is stripped', env.n, null);
  t.ok('PATH is preserved', env.path === true);
  t.ok('CI is blanked', !env.ci);
  delete process.env.MY_SECRET_TOKEN; delete process.env.NPM_TOKEN;

  // timeout terminates a hung process
  const t0 = Date.now();
  const hung = await proc.runManaged({ cmd: 'node', args: ['-e', 'setInterval(()=>{},1000)'], cwd: '.', timeoutMs: 1500 });
  t.ok('timeout kills a hung process (~1.5s)', hung.code === -2 && (Date.now() - t0) < 6000);

  // sanitizedEnv() has no obviously-sensitive keys
  const se = proc.sanitizedEnv();
  t.ok('sanitizedEnv drops *TOKEN*/*SECRET*/*KEY*', !Object.keys(se).some((k) => /TOKEN|SECRET|_KEY$|PASSWORD/i.test(k)));

  // killAllSync (app quit): the whole tree is gone when it returns. Live
  // 2026-10-02 the fire-and-forget killAll() on quit ended only the top
  // process; the verified app's `node server.js` kept :3000.
  {
    const PARENT = "const {spawn}=require('child_process');" +
      "const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});" +
      "console.log('GRANDCHILD '+g.pid);setInterval(()=>{},1000);";
    let grand = 0;
    await new Promise((resolve) => {
      proc.spawnAllowed({ cmd: 'node', args: ['-e', PARENT], cwd: '.' }, (e) => {
        const m = e.stream === 'stdout' && /GRANDCHILD (\d+)/.exec(e.data);
        if (m) { grand = Number(m[1]); resolve(); }
      });
      setTimeout(resolve, 10000);
    });
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };
    t.ok('killAllSync: a grandchild was started', grand > 0 && alive(grand));
    proc.killAllSync();
    t.ok('killAllSync: the grandchild is gone when it returns (no waiting)', grand > 0 && !alive(grand));
    t.equal('killAllSync: nothing is left registered', proc.running().length, 0);
    if (grand && alive(grand)) { try { process.kill(grand); } catch (_) {} }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
};
