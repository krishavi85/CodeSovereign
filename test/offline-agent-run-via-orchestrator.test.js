'use strict';
/* Phase D (part 3) of the Generate-App unification: engine.js's base,
 * offline Agent.run() — reached only when no AI provider is configured —
 * used to build a "substantial" Contract-derived app with its own one-shot
 * SC.specFromContract()+SC.generate() call, gated only by a client-side
 * Validator.runAll() pass. That is a real, working build, but it never
 * actually executes/builds/tests/observes the app — exactly the gap the
 * architecture doc's core rule calls out ("success means planned, built,
 * EXECUTED, OBSERVED, tested, repaired where necessary, and its
 * functionality was EVIDENCED").
 *
 * Inside the desktop app, Agent.run() now routes a substantial build
 * through Engine.Orchestrator (tasksFromContract() -> run()) instead —
 * the real Build Graph -> Executor -> Observer -> Validator -> Repair
 * system — so the offline planner and the LLM round loop are now both
 * "intelligence providers" feeding the same underlying system, per the
 * doc's stated fix.
 *
 * This can only produce real DoD-verified evidence inside actual Electron
 * (real npm test/build + a real runtime to observe) — that can't exist in
 * a VM test or a plain browser tab, so Agent.run() only takes this branch
 * when window.desktop.isDesktop && FS.__hasWorkspace() are both true.
 * Outside desktop, it must fall through UNCHANGED to the pre-existing
 * SC.generate()+Validator-gate path — this file asserts both halves.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const win = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    document: {
      createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }),
      body: { appendChild() {} },
      readyState: 'complete',
      addEventListener: () => {}
    },
    fetch: async () => { throw new Error('network blocked'); }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.contract.js');
  run('engine.schema.js');
  run('engine.auth.js');
  run('engine.backend.js');
  run('engine.scaffold.js');
  run('engine.orchestrator.js');
  run('engine.ledger.js');
  run('engine.dod.js');
  return win;
}

const PROMPT = 'Build a project management tool with tasks, projects, and comments, with user accounts and admin roles';

module.exports = async function (t) {
  // ---- outside desktop: unchanged, pre-existing behavior ----
  {
    const win = load();
    win.Engine.Proj.create('offline-nondesktop', 'saas-dashboard');
    const steps = await win.Engine.Agent.run(PROMPT);
    t.ok('non-desktop: still reports a contract step', steps.some((s) => s.kind === 'contract'));
    t.ok('non-desktop: uses the pre-existing one-shot Scaffold summary, not the task-graph plan', steps.some((s) => s.kind === 'plan-result' && /full-stack repo from the contract/.test(s.text)));
    t.ok('non-desktop: does NOT mention the task graph (Orchestrator branch not taken)', !steps.some((s) => /task graph/.test(s.text || '')));
    t.ok('non-desktop: still resolves to done or warn, not silently nothing', steps.some((s) => s.kind === 'done' || s.kind === 'warn'));
    t.ok('non-desktop: real files were written', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/package.json'));
  }

  // ---- inside desktop: routes through Engine.Orchestrator's task graph ----
  {
    const win = load();
    win.window.desktop = { isDesktop: true };
    win.Engine.FS.__hasWorkspace = () => true;
    // A real Electron app always has Engine.Sovereign loaded; this VM does
    // not, so stub the minimum reproof() touches. It resolves with no real
    // evidence on purpose — that's exactly the "generated but not yet
    // verified" scenario this test checks for an honest warn, not a crash.
    const sovStore = {};
    win.Engine.Sovereign = {
      analyze: () => {},
      runEvidence: () => Promise.resolve({}),
      observe: () => Promise.resolve({}),
      read: (p) => (Object.prototype.hasOwnProperty.call(sovStore, p) ? sovStore[p] : null),
      write: (p, d) => { sovStore[p] = d; }
    };
    win.Engine.Proj.create('offline-desktop', 'saas-dashboard');
    const steps = await win.Engine.Agent.run(PROMPT);

    t.ok('desktop: reports a contract step', steps.some((s) => s.kind === 'contract'));
    const planResult = steps.find((s) => s.kind === 'plan-result');
    t.ok('desktop: the plan-result step names the task graph, not the old one-shot summary', !!planResult && /task graph/.test(planResult.text) && /Scaffold/.test(planResult.text));
    t.ok('desktop: plan names Integration and Tests as later stages', /Integration/.test(planResult.text) && /Tests/.test(planResult.text));

    t.ok('desktop: real app files were actually generated (Orchestrator really called Scaffold.generate)', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/package.json') && win.Engine.FS.exists('/src/auth.js'));
    t.ok('desktop: write steps were emitted for the generated files', steps.some((s) => s.kind === 'write' && s.path === '/server.js'));

    // Live per-stage progress: a UI watching onStep sees each named stage
    // start and resolve as the run actually happens, not just a summary
    // dumped at the very end.
    const taskStarts = steps.filter((s) => s.kind === 'task-start');
    const taskDones = steps.filter((s) => s.kind === 'task-done');
    t.equal('all 3 task-graph stages report a live start event', taskStarts.length, 3);
    t.ok('the live start events name Scaffold, Integration, and Tests', ['Scaffold', 'Integration', 'Tests'].every((n) => taskStarts.some((s) => s.taskName.indexOf(n) === 0)));
    t.ok('T-scaffold reports a live start BEFORE its files are written (genuinely live, not reconstructed after the fact)', steps.findIndex((s) => s.kind === 'task-start' && s.taskId === 'T-scaffold') < steps.findIndex((s) => s.kind === 'write' && s.path === '/server.js'));
    t.ok('each stage eventually reports a done event carrying its id/name/status', taskDones.every((s) => s.taskId && s.taskName && s.status));
    t.ok('a `validate` progress step is emitted before the task graph runs (keeps the generic 5-stage tracker in sync)', steps.some((s) => s.kind === 'validate'));
    t.ok('the plan-result step carries the machine-readable task graph, not just prose', Array.isArray(planResult.taskGraph) && planResult.taskGraph.length === 3);

    // No real Sovereign/npm evidence exists in this VM, so DoD's criteria
    // cannot be verified true — the honest outcome is a warn naming what
    // didn't verify, never a silent 'done' with no real evidence behind it.
    t.ok('desktop: without real build/test evidence, reports an honest warn (not a false done)', steps.some((s) => s.kind === 'warn' && /did not verify/.test(s.text)));
    t.ok('desktop: does NOT claim done without real evidence', !steps.some((s) => s.kind === 'done'));
    t.ok('desktop: run never silently produces neither done nor warn', steps.some((s) => s.kind === 'warn' || s.kind === 'done'));
  }
};
