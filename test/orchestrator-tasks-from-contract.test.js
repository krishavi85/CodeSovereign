'use strict';
/* Phase D (part 2): Engine.Orchestrator.tasksFromContract(contract) maps a
 * Contract (entities/requirements/supportedStack) onto a real task list for
 * Engine.Orchestrator.run() — this is what lets the offline "substantial
 * build" path (engine.js's base Agent.run()) go through the actual Build
 * Graph -> Executor -> Observer -> Validator -> Repair system instead of
 * its own bespoke one-shot generate()-then-Validator-gate flow.
 *
 * Engine.Scaffold.generate() already builds frontend + backend + data layer
 * + auth + tests + CI together from one spec — it isn't decomposable into
 * independent per-layer generation without a much larger rework of Scaffold
 * itself — so "Scaffold" is one real task (task.scaffold = the actual spec
 * Engine.Scaffold.specFromContract() would produce), and Integration/Tests
 * are separate verification-only tasks that depend on it. Per the
 * architecture doc's explicit anti-triangulation warning, their `check`
 * functions read Engine.DoD's already-computed per-criterion booleans —
 * they must NOT invent a fourth "is it done" score.
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
  run('engine.scaffold.js');
  run('engine.orchestrator.js');
  return win;
}

module.exports = async function (t) {
  const win = load();
  win.Engine.Proj.create('tasks-from-contract', 'saas-dashboard');

  // ---- graceful no-op when there is nothing to build from ----
  t.ok('tasksFromContract(null) returns an empty list, not a throw', Array.isArray(win.Engine.Orchestrator.tasksFromContract(null)) && win.Engine.Orchestrator.tasksFromContract(null).length === 0);

  const contract = await win.Engine.Contract.deriveFromPrompt(
    'Build a project management tool with tasks, projects, and comments, with user accounts and admin roles',
    { useLLM: false }
  );
  t.ok('the test contract actually has entities (sanity check on the fixture)', contract.entities && contract.entities.length >= 2);

  const tasks = win.Engine.Orchestrator.tasksFromContract(contract);
  t.equal('produces exactly 3 tasks (Scaffold, Integration, Tests)', tasks.length, 3);

  const byId = {};
  tasks.forEach((tk) => { byId[tk.id] = tk; });
  t.ok('T-scaffold, T-integration, T-tests are all present', byId['T-scaffold'] && byId['T-integration'] && byId['T-tests']);

  t.ok('T-scaffold has no dependencies (it runs first)', Array.isArray(byId['T-scaffold'].dependsOn) && byId['T-scaffold'].dependsOn.length === 0);
  t.ok('T-integration depends on T-scaffold', byId['T-integration'].dependsOn.indexOf('T-scaffold') >= 0);
  t.ok('T-tests depends on T-scaffold', byId['T-tests'].dependsOn.indexOf('T-scaffold') >= 0);

  t.ok('T-scaffold.scaffold is a real spec, not a placeholder', byId['T-scaffold'].scaffold && typeof byId['T-scaffold'].scaffold === 'object');
  const expectedSpec = win.Engine.Scaffold.specFromContract(contract);
  t.equal('T-scaffold.scaffold matches what specFromContract() would build for this contract', JSON.stringify(byId['T-scaffold'].scaffold), JSON.stringify(expectedSpec));
  t.ok('T-scaffold names the actual detected entities, not a generic label', tasks[0].name.indexOf('project') >= 0 && tasks[0].name.indexOf('task') >= 0);

  // T-integration/T-tests are verification-only — their `check` is what
  // determines completion, not any file output — but they still need a
  // (no-op) `generate` or Engine.Orchestrator.resolveGenerator() marks them
  // BLOCKED before check() ever runs, and BLOCKED is not the same as
  // "verified true": a blocked check must not be mistaken for success.
  t.ok('T-integration uses `check` as its real completion gate', typeof byId['T-integration'].check === 'function');
  t.ok('T-integration has a no-op generate so it is never BLOCKED before check() runs', typeof byId['T-integration'].generate === 'function' && byId['T-integration'].generate().length === 0);
  t.ok('T-tests uses `check` as its real completion gate', typeof byId['T-tests'].check === 'function');
  t.ok('T-tests has a no-op generate so it is never BLOCKED before check() runs', typeof byId['T-tests'].generate === 'function' && byId['T-tests'].generate().length === 0);

  // ---- the check functions read Engine.DoD's own criteria, never a 4th score ----
  win.Engine.DoD = { load: () => ({ criteria: { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: false, testsSucceed: true } }) };
  t.ok('T-integration.check() is true when DoD says dependenciesConnected + runtimeActionSucceeds', byId['T-integration'].check() === true);
  t.ok('T-tests.check() is false when DoD says buildSucceeds is false, even though testsSucceed is true', byId['T-tests'].check() === false);
  win.Engine.DoD = { load: () => ({ criteria: { dependenciesConnected: true, runtimeActionSucceeds: false, buildSucceeds: true, testsSucceed: true } }) };
  t.ok('T-integration.check() is false when runtimeActionSucceeds is false', byId['T-integration'].check() === false);
  t.ok('T-tests.check() is true when both its criteria are true', byId['T-tests'].check() === true);
  win.Engine.DoD = { load: () => null };
  t.ok('check() degrades to false (not a throw) when no DoD evaluation exists yet', byId['T-integration'].check() === false && byId['T-tests'].check() === false);
};
