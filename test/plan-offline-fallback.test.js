'use strict';
/* _plan()'s offline deterministic synthesizer silently produced
 * writeStarter()'s generic scaffold for any prompt that matched none of
 * its ~34 keyword intents (or matched one with no dedicated generator),
 * with nothing telling the user this wasn't the app they asked for.
 * _plan() now returns { offlineFallback: true } whenever it falls through
 * to writeStarter(), Engine.Agent.run() emits a 'warn' step when that
 * happens, and the generated SPEC.md carries an explicit banner.
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
  const win = load();

  // No AI connected (only engine.js is loaded, no engine.llm.js patch) and a
  // prompt guaranteed to hit none of _plan()'s keyword intents.
  win.Engine.Proj.create('test', 'saas-dashboard');
  const plan = win.Engine.Agent._plan('generate a quantum flux capacitor UI', win.Engine.Proj.current());
  t.ok('_plan() flags an unmatched prompt as an offline fallback', plan.offlineFallback === true);

  const spec = (plan.targets.find((f) => f.path === '/SPEC.md') || {}).content || '';
  t.ok('SPEC.md carries the offline-fallback banner', /OFFLINE EMERGENCY FALLBACK/.test(spec));

  const steps = await win.Engine.Agent.run('generate a quantum flux capacitor UI', () => {});
  const warnStep = steps.find((s) => s.kind === 'warn');
  t.ok('Agent.run emits a warn step for the offline fallback', !!warnStep);
  t.ok('the warn step explains it is a generic scaffold, not the requested app',
    /generic starter scaffold/i.test((warnStep || {}).text || ''));

  // Every static intent now has a dedicated generator (see
  // test/plan-static-intents.test.js's WIRED table), so a matched intent is
  // never flagged as a fallback anymore — only a truly unmatched prompt
  // (asserted above) reaches writeStarter(). Confirm weather specifically,
  // since it used to be the canonical "matched-but-unwired" example here.
  win.Engine.FS.clear();
  win.Engine.Proj.create('test2', 'saas-dashboard');
  const weatherPlan = win.Engine.Agent._plan('build me a weather forecast app', win.Engine.Proj.current());
  t.ok('weather now has a dedicated generator and is not flagged as fallback', weatherPlan.offlineFallback === false);
  const weatherSpec = (weatherPlan.targets.find((f) => f.path === '/SPEC.md') || {}).content || '';
  t.ok('weather was actually detected', /Primary intent: \*\*weather\*\*/.test(weatherSpec));

  // A genuinely wired intent must NOT be flagged.
  win.Engine.FS.clear();
  win.Engine.Proj.create('test3', 'saas-dashboard');
  const todoPlan = win.Engine.Agent._plan('Build a todo list app', win.Engine.Proj.current());
  t.ok('an already-wired intent (todo) is not flagged as an offline fallback', todoPlan.offlineFallback === false);
  const todoSpec = (todoPlan.targets.find((f) => f.path === '/SPEC.md') || {}).content || '';
  t.ok('a wired intent\'s SPEC.md has no fallback banner', !/OFFLINE EMERGENCY FALLBACK/.test(todoSpec));
};
