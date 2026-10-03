'use strict';
/* Interactivity for apps CodeSovereign generates: Engine.MockScan already
 * detects empty/fake event handlers, fake-async, mock data, hard-coded
 * auth, stub services, etc. — but until now nothing that actually gates
 * success ever called it. A generator could write a button with an empty
 * onclick and still pass Validator.runAll() cleanly, so Agent.run()'s A2
 * "no success without evidence" gate (see test/agent-validation-gate.test.js)
 * never saw it. Validator.runAll() now folds MockScan's signals in —
 * high/medium/low severity mapped onto Validator's own error/warning/info
 * taxonomy — so a dead button fails the SAME gate a JS syntax error does.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const win = {
    console,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    document: {
      createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }),
      body: { appendChild() {} },
      readyState: 'complete',
      addEventListener: () => {}
    },
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.mockscan.js');
  return win;
}

module.exports = async function (t) {
  // ---- a real dead button (empty handler) is caught as a blocking error ----
  {
    const win = load();
    win.Engine.Proj.create('t1', 'saas-dashboard');
    win.Engine.FS.write('/index.html', '<!doctype html><html lang="en"><body><button onclick="">Export CSV</button></body></html>');
    const issues = win.Engine.Validator.runAll();
    const mockIssues = issues.filter((i) => (i.faultClass || '').indexOf('mock.') === 0);
    t.ok('an empty-handler button produces a mock.* issue', mockIssues.some((i) => i.faultClass === 'mock.empty-handler'));
    t.ok('empty-handler (MockScan high severity) maps to a blocking error, not just a warning', mockIssues.some((i) => i.faultClass === 'mock.empty-handler' && i.severity === 'error'));
  }

  // ---- this actually blocks Agent.run()'s A2 gate, the same as a syntax error would ----
  {
    const win = load();
    win.Engine.Proj.create('t2', 'saas-dashboard');
    // A generator whose plan writes a real-looking but dead "Save" button.
    const originalPlan = win.Engine.Agent._plan;
    win.Engine.Agent._plan = function () {
      return {
        summary: 'test plan',
        offlineFallback: false,
        targets: [
          { path: '/index.html', content: '<!doctype html><html lang="en"><body><button id="save" onclick="">Save</button></body></html>' },
          { path: '/scripts/app.js', content: '// no real save logic wired up\n' }
        ]
      };
    };
    const steps = await win.Engine.Agent.run('build something with a save button');
    win.Engine.Agent._plan = originalPlan;
    t.ok('a dead Save button blocks the done report (A2 gate now also catches fake interactivity)', !steps.some((s) => s.kind === 'done'));
    const warnStep = steps.find((s) => s.kind === 'warn' && /blocking issue/.test(s.text || ''));
    t.ok('the warn step names the interactivity problem, not just a generic message', !!warnStep && /empty arrow handler|inert inline handler/.test(warnStep.text));
  }

  // ---- medium/low severity signals are visible but non-blocking ----
  {
    const win = load();
    win.Engine.Proj.create('t3', 'saas-dashboard');
    win.Engine.FS.write('/index.html', '<!doctype html><html lang="en"><body>lorem ipsum dolor sit amet</body></html>');
    const issues = win.Engine.Validator.runAll();
    const lorem = issues.find((i) => i.faultClass === 'mock.lorem');
    t.ok('a low-severity MockScan signal (lorem ipsum) is still reported', !!lorem);
    t.equal('low severity maps to info, not error — does not block done', lorem.severity, 'info');
  }

  // ---- clean, real code produces zero mock.* issues ----
  {
    const win = load();
    win.Engine.Proj.create('t4', 'saas-dashboard');
    win.Engine.FS.write('/scripts/app.js', "document.getElementById('save').addEventListener('click', () => { localStorage.setItem('x', '1'); });\n");
    const issues = win.Engine.Validator.runAll();
    t.ok('genuinely wired-up code produces no mock.* issues', !issues.some((i) => (i.faultClass || '').indexOf('mock.') === 0));
  }

  // ---- Validator.runAll() degrades gracefully when MockScan is not loaded ----
  {
    const distDir = path.join(__dirname, '..', 'dist');
    const win = {
      console,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      addEventListener: () => {},
      document: { createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener: () => {} },
      fetch: async () => { throw new Error('network blocked'); },
      setTimeout, clearTimeout, setInterval, clearInterval
    };
    win.window = win;
    const ctx = vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(distDir, 'vendor/acorn.js'), 'utf8'), ctx, { filename: 'vendor/acorn.js' });
    vm.runInContext(fs.readFileSync(path.join(distDir, 'engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
    win.Engine.Proj.create('t5', 'saas-dashboard');
    win.Engine.FS.write('/index.html', '<!doctype html><html lang="en"><body><button onclick="">X</button></body></html>');
    let threw = false;
    let issues = [];
    try { issues = win.Engine.Validator.runAll(); } catch (_) { threw = true; }
    t.ok('runAll() does not throw when engine.mockscan.js was never loaded', !threw);
    t.ok('no mock.* issues appear without MockScan present (nothing to invent them)', !issues.some((i) => (i.faultClass || '').indexOf('mock.') === 0));
  }
};
