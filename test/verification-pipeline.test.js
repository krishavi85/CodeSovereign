'use strict';
/* The Orchestrator's final verification pass (install -> test/build ->
 * observe) must be able to verify a genuinely correct generated app.
 * Confirmed live, two pipeline bugs made Integration fail no matter how
 * good the generated code was:
 *   1. Nothing ever ran `npm install` before `npm test` and the observer's
 *      dev-server start, so every app with dependencies died on require().
 *   2. Adapters spell "nothing to do" as `echo "no build step"`; echo isn't
 *      on the proc allowlist, so a static site's "nothing to build" came
 *      back code -1 and was recorded as a hard FAIL.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const distDir = path.join(__dirname, '..', 'dist');

function makeWin() {
  const win = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    document: { createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener: () => {} },
    fetch: async () => { throw new Error('network blocked'); }
  };
  win.window = win;
  return win;
}

function loadExec(adapterCommands) {
  const win = makeWin();
  const spawned = [];
  win.desktop = {
    isDesktop: true,
    proc: {
      onData: () => {},
      spawnAllowed: async (o) => { spawned.push(o); return { ok: false }; },
      run: async () => ({ code: 0, stdout: 'ran', stderr: '' }),
      kill: () => {}
    },
    trust: { status: async () => ({ trusted: true }) },
    git: { status: async () => ({ ok: false }) }
  };
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(distDir, 'engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
  win.Engine.FS.__hasWorkspace = () => true;
  // engine.js seeds a default workspace with a package.json (build script);
  // a static site has none, which is what routes CSExec to the adapter.
  win.Engine.FS.clear();
  win.Engine.FS.write('/index.html', '<!doctype html>');
  win.Engine.Adapters = { detect: () => [{ id: 'static', commands: adapterCommands }] };
  vm.runInContext(fs.readFileSync(path.join(distDir, 'desktop', 'desktop-exec.js'), 'utf8'), ctx, { filename: 'desktop-exec.js' });
  return { win, spawned };
}

function loadOrchestrator(packageJson) {
  const win = makeWin();
  win.desktop = { isDesktop: true };
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(distDir, 'engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
  vm.runInContext(fs.readFileSync(path.join(distDir, 'engine.orchestrator.js'), 'utf8'), ctx, { filename: 'engine.orchestrator.js' });
  win.Engine.Proj.create('verify', 'saas-dashboard');
  win.Engine.FS.__hasWorkspace = () => true;
  if (packageJson !== undefined) win.Engine.FS.write('/package.json', JSON.stringify(packageJson));
  else if (win.Engine.FS.exists('/package.json')) win.Engine.FS.remove('/package.json');
  const order = [];
  win.CSExec = {
    available: () => true,
    install: async () => { order.push('install'); return { code: 0 }; }
  };
  const store = {};
  win.Engine.Sovereign = {
    analyze: () => {},
    runEvidence: async () => { order.push('evidence'); return {}; },
    observe: async () => { order.push('observe'); return {}; },
    read: (p) => (p in store ? store[p] : null),
    write: (p, d) => { store[p] = d; }
  };
  win.Engine.Ledger = { build: () => {}, load: () => ({ claims: [] }) };
  win.Engine.DoD = { evaluate: () => {}, load: () => ({ criteria: {}, PASS: false }), certificate: () => {} };
  return { win, order };
}

async function runOnce(win) {
  return win.Engine.Orchestrator.run({
    tasks: [{ id: 'T', name: 'T', generate: () => [], check: () => true }],
    deferProof: true,
    desktop: true
  });
}

module.exports = async function (t) {
  // ---- echo placeholders are skipped, not spawned and failed ----
  {
    const { win, spawned } = loadExec({ build: 'echo "static — nothing to build"', test: 'echo "static — no tests"', dev: 'npx --yes serve .' });
    const build = await win.CSExec.build();
    t.ok('an adapter\'s `echo "nothing to build"` placeholder is reported as skipped', build.skipped === true && build.code === -3);
    t.ok('the placeholder text is kept as the result output', /nothing to build/.test(build.output));
    const test = await win.CSExec.test();
    t.ok('an adapter\'s `echo "no tests"` placeholder is reported as skipped too', test.skipped === true);
    t.equal('an echo placeholder is never sent to the process allowlist at all', spawned.length, 0);
  }
  {
    const { win, spawned } = loadExec({ build: 'npx --yes vite build' });
    await win.CSExec.build();
    t.ok('a real adapter command still goes through the process layer', spawned.length === 1 && spawned[0].cmd === 'npx');
  }

  // ---- dependencies are installed before the verification pass ----
  {
    const { win, order } = loadOrchestrator({ name: 'app', scripts: { start: 'node server.js' }, dependencies: { express: '^4.19.2' } });
    await runOnce(win);
    t.ok('npm install runs when package.json declares dependencies', order.includes('install'));
    t.ok('install runs BEFORE test/build evidence and before the dev server is observed', order.indexOf('install') < order.indexOf('evidence') && order.indexOf('evidence') < order.indexOf('observe'));
  }
  {
    const { win, order } = loadOrchestrator({ name: 'app', devDependencies: { jest: '^29.0.0' } });
    await runOnce(win);
    t.ok('devDependencies alone also trigger an install (tests need them)', order.includes('install'));
  }
  {
    const { win, order } = loadOrchestrator({ name: 'app', scripts: { start: 'node server.js' } });
    await runOnce(win);
    t.ok('no install when package.json declares no dependencies', !order.includes('install') && order.includes('evidence'));
  }
  {
    const { win, order } = loadOrchestrator(undefined);
    await runOnce(win);
    t.ok('no install for a project with no package.json (e.g. a static site)', !order.includes('install') && order.includes('evidence'));
  }
  {
    const { win, order } = loadOrchestrator({ name: 'app', dependencies: { express: '^4.19.2' } });
    win.CSExec.install = async () => { order.push('install'); throw new Error('offline'); };
    await runOnce(win);
    t.ok('a failed install (e.g. offline) does not abort verification — evidence still runs and records the real result', order.includes('evidence'));
  }
};
