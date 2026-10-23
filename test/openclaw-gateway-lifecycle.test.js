'use strict';
/* openclaw-manager gateway lifecycle against a scripted fake `openclaw` CLI
   (cross-spawn is stubbed — no real service is touched). The replies are the
   exact JSON shapes the real CLI (2026.9.6) printed on 2026-09-27 when a
   failed self-update had left the Windows Scheduled Task Disabled. */
const Module = require('module');
const { EventEmitter } = require('events');

const DISABLED_ERR = 'Gateway start failed: Error: schtasks run failed: ERROR: The scheduled task "OpenClaw Gateway" could not run because it is disabled.';

function loadWithFakeCli(script) {
  const calls = [];
  const fake = function (_bin, args) {
    calls.push(args.join(' '));
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = () => {};
    const reply = script(args.join(' '), calls);
    setImmediate(() => {
      child.stdout.emit('data', JSON.stringify(reply.json));
      child.emit('close', reply.code || 0);
    });
    return child;
  };
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === 'cross-spawn') return fake;
    return origLoad.apply(this, arguments);
  };
  const p = require.resolve('../electron/lib/openclaw-manager.js');
  delete require.cache[p];
  const mgr = require(p);
  Module._load = origLoad;
  delete require.cache[p];
  return { mgr, calls };
}

module.exports = async function (t) {
  // 1. A disabled task: start fails → install --force → start succeeds.
  {
    let enabled = false;
    const { mgr, calls } = loadWithFakeCli((cmd) => {
      if (cmd === 'gateway start --json') {
        return enabled
          ? { json: { action: 'start', ok: true, result: 'already-running' } }
          : { json: { action: 'start', ok: false, error: DISABLED_ERR, hintItems: [{ kind: 'install', text: 'openclaw gateway install' }] }, code: 1 };
      }
      if (cmd === 'gateway install --force --json') { enabled = true; return { json: { action: 'install', ok: true, result: 'installed' } }; }
      return { json: { ok: false, error: 'unexpected ' + cmd }, code: 1 };
    });
    const r = await mgr.gatewayStart();
    t.equal('disabled task: start ends up ok', r.ok, true);
    t.equal('disabled task: result says it re-enabled the task', r.repaired, 'reenabled-disabled-task');
    t.deepEqual('disabled task: start → install --force → start', calls,
      ['gateway start --json', 'gateway install --force --json', 'gateway start --json']);
  }

  // 2. A JSON reply with ok:false is a failure, not a success (the UI used to
  //    show "gateway started" for this).
  {
    const { mgr, calls } = loadWithFakeCli(() => ({ json: { action: 'start', ok: false, error: 'port 18789 in use by another process' }, code: 1 }));
    const r = await mgr.gatewayStart();
    t.equal('ok:false JSON → ok:false result', r.ok, false);
    t.ok('ok:false JSON → the CLI error is surfaced', /port 18789 in use/.test(r.error));
    t.equal('a non-disabled failure does not trigger a reinstall', calls.length, 1);
  }

  // 3. Re-registering fails → honest error naming both steps.
  {
    const { mgr } = loadWithFakeCli((cmd) => cmd.startsWith('gateway install')
      ? { json: { action: 'install', ok: false, error: 'Access is denied.' }, code: 1 }
      : { json: { action: 'start', ok: false, error: DISABLED_ERR }, code: 1 });
    const r = await mgr.gatewayStart();
    t.equal('failed repair → ok:false', r.ok, false);
    t.ok('failed repair → says the service is disabled and why the repair failed', /disabled/.test(r.error) && /Access is denied/.test(r.error));
  }

  // 4. Normal start and stop pass straight through.
  {
    const { mgr, calls } = loadWithFakeCli((cmd) => ({ json: { action: cmd.split(' ')[1], ok: true, result: 'started' } }));
    t.equal('healthy start → ok', (await mgr.gatewayStart()).ok, true);
    t.equal('healthy stop → ok', (await mgr.gatewayStop()).ok, true);
    t.deepEqual('healthy path makes no extra calls', calls, ['gateway start --json', 'gateway stop --json']);
  }

  // 5. Restart on a disabled task gets the same repair.
  {
    let enabled = false;
    const { mgr } = loadWithFakeCli((cmd) => {
      if (cmd === 'gateway install --force --json') { enabled = true; return { json: { ok: true, result: 'installed' } }; }
      if (enabled) return { json: { ok: true, result: 'already-running' } };
      return { json: { ok: false, error: DISABLED_ERR.replace('start', 'restart') }, code: 1 };
    });
    t.equal('disabled task: restart is repaired too', (await mgr.gatewayRestart()).ok, true);
  }

  // 6. getStatus reports the Disabled task state so the card can say so.
  {
    const { mgr } = loadWithFakeCli((cmd) => {
      if (cmd === '--version') return { json: 'OpenClaw 2026.9.6 (eb377ac)' };
      return { json: {
        config: { cli: { exists: true, valid: true, path: 'C:/x/openclaw.json' } },
        service: { loaded: true, runtime: { status: 'stopped', state: 'Disabled' } },
        rpc: { ok: false }, port: { status: 'free' }, gateway: { port: 18789 }
      }, code: 1 };
    });
    const s = await mgr.getStatus();
    t.equal('getStatus: disabled task is still phase stopped (Start stays offered)', s.phase, 'stopped');
    t.equal('getStatus: gateway.disabled is true', s.gateway && s.gateway.disabled, true);
  }
  // 7/8. "start timed out after 90s waiting for /healthz" — seen live twice,
  //      with the Gateway ready seconds later. Probe before calling it failed.
  {
    const http = require('http');
    const TIMEOUT_ERR = 'Gateway start timed out after 90s waiting for /healthz and /readyz.';
    const freePort = () => new Promise((res) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const { mgr } = loadWithFakeCli(() => ({ json: { action: 'start', ok: false, error: TIMEOUT_ERR }, code: 1 }));

    const port = await freePort();
    const srv = http.createServer((_q, r) => { r.writeHead(200); r.end('ok'); });
    await new Promise((res) => srv.listen(port, '127.0.0.1', res));
    const r = await mgr.gatewayStart({ probePort: port, lateReadyWaitMs: 2000 });
    await new Promise((res) => srv.close(res));
    t.equal('start timed out but the gateway answers → ok', r.ok, true);
    t.equal('start timed out but the gateway answers → flagged lateReady', r.lateReady, true);

    const dead = await freePort();
    const r2 = await mgr.gatewayStart({ probePort: dead, lateReadyWaitMs: 0 });
    t.equal('start timed out and nothing answers → still a failure', r2.ok, false);
    t.ok('start timed out and nothing answers → the CLI error is kept', /timed out/.test(r2.error));

    const r3 = await mgr.gatewayRestart({ probePort: dead, lateReadyWaitMs: 0 });
    t.equal('restart gets the same late-ready check', r3.ok, false);
  }
};
