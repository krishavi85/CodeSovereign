'use strict';
/* Engine.Goal.run()'s self-healing "Fix" step used to call
 * Engine.Recovery.repair() with no arguments; repair(plan, opts) reads
 * plan.steps immediately, so a `plan === undefined` call threw, and the
 * throw was silently swallowed by an empty catch — the /goal loop has been
 * re-running tests up to SAFETY_CAP times without ever actually repairing
 * anything. healOnce() now delegates the whole analyze->plan->repair->retest
 * cycle to Engine.Recovery.run()/verify() instead.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(recoveryStub) {
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
  run('engine.runtime.js');
  win.Engine.Recovery = recoveryStub;
  return win;
}

module.exports = async function (t) {
  /* ---------- fails once, then succeeds ---------- */
  {
    let calls = 0;
    const stub = {
      run: async () => {
        calls += 1;
        if (calls === 1) return { verify: { ok: false, failed: ['L2'] }, repairedCount: 1 };
        return { verify: { ok: true, failed: [] }, repairedCount: 0 };
      }
    };
    const win = load(stub);
    const g = await win.Engine.Goal.run('/goal make the tests pass');
    t.ok('Recovery.run was actually called (proves the previous silent no-op is fixed)', calls >= 2);
    t.ok('goal reaches satisfied once Recovery.verify reports ok', g.status === 'satisfied');
    t.ok('repairs accumulate from Recovery.run\'s repairedCount', g.repairs === 1);
  }

  /* ---------- never satisfied -> capped, not stuck claiming success ---------- */
  {
    let calls = 0;
    const stub = {
      run: async () => { calls += 1; return { verify: { ok: false, failed: ['L1', 'L2'] }, repairedCount: 0 }; }
    };
    const win = load(stub);
    // Keep this fast: Engine.Loop isn't loaded so runGoal's cap falls back to
    // 48 — shrink it via Engine.Loop.SAFETY_CAP so the test doesn't spin 48x.
    win.Engine.Loop = { SAFETY_CAP: 3 };
    const g = await win.Engine.Goal.run('/goal make the tests pass');
    t.ok('Recovery.run was called on every round', calls === 3);
    t.ok('an unsatisfied goal ends capped, not falsely satisfied', g.status === 'capped');
  }

  /* ---------- Recovery missing entirely -> does not throw, does not falsely satisfy ---------- */
  {
    const win = load(undefined);
    win.Engine.Loop = { SAFETY_CAP: 1 };
    const g = await win.Engine.Goal.run('/goal make the tests pass');
    t.ok('missing Engine.Recovery does not throw and does not falsely report satisfied', g.status === 'capped');
  }
};
