'use strict';
/* The base offline Agent.run() (dist/engine.js, the no-AI path) used to run
 * Validator.runAll() after writing files but never gate on the result — it
 * emitted 'done' unconditionally, so a generator that produced broken JS
 * (a syntax error, banned eval()) was still reported as a successful run.
 * This is the exact failure mode the architecture rule "Generate App must
 * never report success merely because files were created" calls out.
 *
 * Fix: only emit 'done' when Validator.runAll() found no error-severity
 * issues; otherwise emit an honest 'warn' step naming what's still broken.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const win = {
    console,
    localStorage: (() => {
      const store = {};
      return {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
      };
    })(),
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
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  return win;
}

module.exports = async function (t) {
  // ---- a clean generation (no blocking issues) still reports done ----
  {
    const win = load();
    win.Engine.Proj.create('test', 'saas-dashboard');
    const steps = await win.Engine.Agent.run('Build a todo list app', () => {});
    t.ok('a clean run still emits done', steps.some((s) => s.kind === 'done'));
    t.ok('a clean run does NOT emit a validation warn', !steps.some((s) => s.kind === 'warn' && /blocking issue/.test(s.text || '')));
  }

  // ---- a run where Validator finds a blocking (error-severity) issue must
  // NOT report done — it must honestly say what's still broken ----
  {
    const win = load();
    win.Engine.Proj.create('test2', 'saas-dashboard');
    const originalRunAll = win.Engine.Validator.runAll;
    win.Engine.Validator.runAll = () => [
      { severity: 'error', faultClass: 'js.syntax', file: '/scripts/app.js', message: 'JS syntax error: Unexpected token' },
      { severity: 'warning', faultClass: 'html.alt', file: '/index.html', message: '<img> missing alt attribute' }
    ];
    const steps = await win.Engine.Agent.run('Build a todo list app', () => {});
    win.Engine.Validator.runAll = originalRunAll;

    t.ok('does NOT emit done when a blocking issue exists', !steps.some((s) => s.kind === 'done'));
    const warnStep = steps.find((s) => s.kind === 'warn' && /blocking issue/.test(s.text || ''));
    t.ok('emits an honest warn step instead', !!warnStep);
    t.ok('the warn step names the actual broken file/message', /scripts\/app\.js/.test(warnStep.text) && /syntax error/i.test(warnStep.text));
    t.ok('the warn step does not get confused by the non-blocking warning-severity issue', !/missing alt/.test(warnStep.text));
  }

  // ---- only 'error' severity blocks; 'warning'/'info' issues alone still
  // report done (they are real but non-blocking, matching Validator's own
  // severity taxonomy) ----
  {
    const win = load();
    win.Engine.Proj.create('test3', 'saas-dashboard');
    const originalRunAll = win.Engine.Validator.runAll;
    win.Engine.Validator.runAll = () => [
      { severity: 'warning', faultClass: 'html.alt', file: '/index.html', message: '<img> missing alt attribute' },
      { severity: 'info', faultClass: 'js.console', file: '/scripts/app.js', message: '1 console.log statement(s)' }
    ];
    const steps = await win.Engine.Agent.run('Build a todo list app', () => {});
    win.Engine.Validator.runAll = originalRunAll;

    t.ok('non-blocking issues alone still allow a done report', steps.some((s) => s.kind === 'done'));
  }
};
