'use strict';
/* A slow OpenClaw CLI call that is killed on timeout makes Node emit a bogus ENOENT 'error' event before 'close'
 * (seen live with the Microsoft Store build). It used to surface as "spawn openclaw ENOENT"; it must read as a
 * timeout. cross-spawn is replaced with a scripted fake. */
const path = require('path');
const EE = require('events');

module.exports = async function (t) {
  const csPath = require.resolve('cross-spawn');
  const ktPath = require.resolve('../electron/lib/killtree');
  const mgrPath = path.join(__dirname, '..', 'electron', 'lib', 'openclaw-manager.js');
  const saved = { cs: require.cache[csPath], kt: require.cache[ktPath], mgr: require.cache[mgrPath] };

  const calls = [];
  let how = 'ok', child = null;
  function fake(cmd, args) {
    calls.push({ cmd, args });
    const c = new EE();
    c.stdout = new EE(); c.stderr = new EE(); c.pid = 4242;
    child = c;
    setImmediate(() => {
      if (how === 'ok') { c.stdout.emit('data', 'OpenClaw 2026.10.6 (fe06181)\n'); c.emit('close', 0); }
      else if (how === 'exit1') { c.stderr.emit('data', 'bad things'); c.emit('close', 1); }
      else if (how === 'never-starts') { const e = new Error('spawn openclaw ENOENT'); e.code = 'ENOENT'; c.emit('error', e); }
      // how === 'hang': nothing happens until it is killed
    });
    return c;
  }
  // the kill of a hung process: Node reports a bogus ENOENT, then closes
  const killed = [];
  require.cache[ktPath] = { id: ktPath, filename: ktPath, loaded: true, exports: { killTree: (c) => { killed.push(c.pid); setImmediate(() => { const e = new Error('spawn openclaw ENOENT'); e.code = 'ENOENT'; c.emit('error', e); c.emit('close', 1); }); return Promise.resolve(); } } };
  require.cache[csPath] = { id: csPath, filename: csPath, loaded: true, exports: fake };
  delete require.cache[mgrPath];
  try {
    const mgr = require(mgrPath);

    how = 'ok';
    let r = await mgr._runSafe(['--version'], 2000);
    t.ok('a normal call returns its output', !r.err && /2026\.10\.6/.test(r.stdout) && r.timedOut !== true && calls.length === 1);

    how = 'exit1';
    r = await mgr._runSafe(['x'], 2000);
    t.ok('a failing call reports its exit code and stderr', r.err && /exit 1/.test(r.err.message) && /bad things/.test(r.stderr));

    how = 'hang';
    const t0 = Date.now();
    r = await mgr._runSafe(['gateway', 'status', '--json'], 150);
    t.ok('a hung call is killed and reported as a timeout, not as ENOENT', r.timedOut === true && /timed out/.test(r.err.message) && !/ENOENT/.test(r.err.message) && killed.length === 1);
    t.ok('and it returns promptly after the limit', Date.now() - t0 < 2000);

    how = 'never-starts';
    r = await mgr._runSafe(['--version'], 2000);
    t.ok('a CLI that is really not there is still reported as the spawn error (so "not installed" works)', r.err && r.err.code === 'ENOENT' && r.timedOut !== true);

    how = 'never-starts';
    const d = await mgr.detect();
    t.ok('detect() says not installed in that case', d.installed === false);
  } finally {
    for (const [k, p] of [['cs', csPath], ['kt', ktPath], ['mgr', mgrPath]]) { if (saved[k]) require.cache[p] = saved[k]; else delete require.cache[p]; }
  }
};
