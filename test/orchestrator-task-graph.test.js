'use strict';
/* Phase D (part 1) of the Generate-App unification: Engine.Orchestrator's
 * task loop previously just processed opts.tasks in array order — a task's
 * `dependsOn` field was carried on universal-DAG-derived tasks but never
 * actually consulted for scheduling, and every task shared one run-level
 * maxCyclesPerTask with no per-task override. Both are now real:
 *   - a topological sort orders tasks so a task never runs before every
 *     task named in its dependsOn, regardless of input array order;
 *   - task.maxCycles overrides the run-level default for that task alone.
 * (dist/engine.orchestrator.js's topoSort()/cyclesFor())
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const data = {};
  const win = {
    console,
    setTimeout, clearTimeout,
    Engine: {
      FS: {
        _data: data,
        read: (p) => (data[p] ? data[p].content : null),
        write: (p, c) => { data[p] = { content: String(c) }; },
        exists: (p) => p in data
      }
    }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(distDir, 'engine.orchestrator.js'), 'utf8'), ctx, { filename: 'engine.orchestrator.js' });
  return win;
}

module.exports = async function (t) {
  // ---- dependsOn ordering: given out of order, still runs in dependency order ----
  {
    const win = load();
    const order = [];
    const tasks = [
      { id: 'T-frontend', name: 'Frontend', dependsOn: ['T-backend'], generate: () => { order.push('T-frontend'); return []; } },
      { id: 'T-backend', name: 'Backend', dependsOn: ['T-database'], generate: () => { order.push('T-backend'); return []; } },
      { id: 'T-database', name: 'Database', dependsOn: [], generate: () => { order.push('T-database'); return []; } }
    ];
    const record = await win.Engine.Orchestrator.run({ tasks, deferProof: true, desktop: false });
    t.equal('task list given [frontend, backend, database] executes as [database, backend, frontend]', order.join(','), 'T-database,T-backend,T-frontend');
    t.ok('all 3 tasks recorded', record.tasks.length === 3);
  }

  // ---- a real (non-cyclic, non-trivial) dependency graph resolves correctly ----
  {
    const win = load();
    const order = [];
    const tasks = [
      { id: 'T-tests', name: 'Tests', dependsOn: ['T-frontend', 'T-backend'], generate: () => { order.push('T-tests'); return []; } },
      { id: 'T-frontend', name: 'Frontend', dependsOn: ['T-scaffold'], generate: () => { order.push('T-frontend'); return []; } },
      { id: 'T-backend', name: 'Backend', dependsOn: ['T-scaffold'], generate: () => { order.push('T-backend'); return []; } },
      { id: 'T-scaffold', name: 'Scaffold', dependsOn: [], generate: () => { order.push('T-scaffold'); return []; } }
    ];
    await win.Engine.Orchestrator.run({ tasks, deferProof: true, desktop: false });
    t.equal('scaffold always runs first', order[0], 'T-scaffold');
    t.equal('tests always runs last', order[3], 'T-tests');
    t.ok('frontend and backend both ran between scaffold and tests', order.indexOf('T-frontend') > 0 && order.indexOf('T-frontend') < 3 && order.indexOf('T-backend') > 0 && order.indexOf('T-backend') < 3);
  }

  // ---- a cyclic graph degrades to the given array order instead of crashing ----
  {
    const win = load();
    const order = [];
    const tasks = [
      { id: 'T-a', name: 'A', dependsOn: ['T-b'], generate: () => { order.push('T-a'); return []; } },
      { id: 'T-b', name: 'B', dependsOn: ['T-a'], generate: () => { order.push('T-b'); return []; } }
    ];
    const record = await win.Engine.Orchestrator.run({ tasks, deferProof: true, desktop: false });
    t.ok('a cyclic dependsOn does not throw — run() still completes', record.tasks.length === 2);
    t.equal('cyclic graph falls back to the original given order', order.join(','), 'T-a,T-b');
  }

  // ---- per-task maxCycles overrides the run-level default ----
  {
    const win = load();
    let cycles = 0;
    const tasks = [{
      id: 'T-never-satisfied',
      name: 'Never satisfied',
      maxCycles: 2,
      generate: () => { cycles++; return [{ path: '/x.txt', content: 'v' + cycles }]; },
      check: () => false
    }];
    const record = await win.Engine.Orchestrator.run({ tasks, deferProof: false, desktop: false, maxCyclesPerTask: 5 });
    t.equal('task.maxCycles=2 wins over run-level maxCyclesPerTask=5', cycles, 2);
    t.equal('the task is reported FAILED after its own cycle budget, not the run default', record.tasks[0].status, 'FAILED');
  }

  // ---- without a per-task override, the run-level default still applies ----
  {
    const win = load();
    let cycles = 0;
    const tasks = [{
      id: 'T-default-cycles',
      name: 'Default cycles',
      generate: () => { cycles++; return []; },
      check: () => false
    }];
    await win.Engine.Orchestrator.run({ tasks, deferProof: false, desktop: false, maxCyclesPerTask: 3 });
    t.equal('no task.maxCycles falls back to the run-level maxCyclesPerTask', cycles, 3);
  }

  // ---- onTaskStart/onTaskDone fire live, in dependency order, with the
  // task's own id/name/status attached — this is what a UI subscribes to
  // for real per-stage progress during a run, not just a summary at the end ----
  {
    const win = load();
    const events = [];
    const tasks = [
      { id: 'T-b', name: 'B', dependsOn: ['T-a'], generate: () => { events.push('generate:T-b'); return []; } },
      { id: 'T-a', name: 'A', dependsOn: [], generate: () => { events.push('generate:T-a'); return []; } }
    ];
    const record = await win.Engine.Orchestrator.run({
      tasks, deferProof: true, desktop: false,
      onTaskStart: (tr) => events.push('start:' + tr.id),
      onTaskDone: (tr) => events.push('done:' + tr.id + ':' + tr.status)
    });
    // Both tasks first go GENERATED (files written) live, in dependency
    // order; only the shared final batch reproof (no real check() given, so
    // it falls back to the DoD gate — absent here — hence FAILED) resolves
    // their real outcome, also in order.
    t.equal('start/generate/done fire in strict dependency order for both tasks',
      events.join(','),
      'start:T-a,generate:T-a,done:T-a:GENERATED,start:T-b,generate:T-b,done:T-b:GENERATED,done:T-a:FAILED,done:T-b:FAILED');
    t.ok('run() still resolves normally with callbacks attached', record.tasks.length === 2);
  }

  // ---- onTaskDone fires a second time for a deferred task once the shared
  // final batch reproof resolves its real COMPLETE/FAILED outcome — the
  // GENERATED notification is provisional ("written, verifying next"), not
  // final. check() must reflect post-generation state, not a task that was
  // already "met" before it ever ran (which would report ALREADY_MET instead). ----
  {
    const win = load();
    const doneStatuses = [];
    let generated = false;
    const tasks = [{ id: 'T-x', name: 'X', generate: () => { generated = true; return []; }, check: () => generated }];
    await win.Engine.Orchestrator.run({
      tasks, deferProof: true, desktop: false,
      onTaskDone: (tr) => doneStatuses.push(tr.status)
    });
    t.equal('onTaskDone fires GENERATED first (provisional), then COMPLETE (final, post-verification)', doneStatuses.join(','), 'GENERATED,COMPLETE');
  }

  // ---- a callback that throws never breaks the run itself ----
  {
    const win = load();
    const tasks = [{ id: 'T-y', name: 'Y', generate: () => [] }];
    const record = await win.Engine.Orchestrator.run({
      tasks, deferProof: true, desktop: false,
      onTaskStart: () => { throw new Error('boom'); },
      onTaskDone: () => { throw new Error('boom'); }
    });
    t.ok('a throwing onTaskStart/onTaskDone does not abort the run', record.tasks.length === 1);
  }

  // ---- a task whose generate() REJECTS (a real network/LLM failure, the
  // common case once tasks call out to a model) must fail only that task,
  // not crash the whole multi-task run — sibling tasks still get to run
  // and the failure reason is recorded, not swallowed. ----
  {
    const win = load();
    const order = [];
    const tasks = [
      { id: 'T-fails', name: 'Fails', dependsOn: [], generate: () => { order.push('T-fails'); return Promise.reject(new Error('model timed out')); } },
      { id: 'T-dependent', name: 'Dependent', dependsOn: ['T-fails'], generate: () => { order.push('T-dependent'); return []; } },
      { id: 'T-chained', name: 'Chained', dependsOn: ['T-dependent'], generate: () => { order.push('T-chained'); return []; } },
      { id: 'T-independent', name: 'Independent', dependsOn: [], generate: () => { order.push('T-independent'); return [{ path: '/ok.txt', content: 'ok' }]; } }
    ];
    const record = await win.Engine.Orchestrator.run({ tasks, deferProof: true, desktop: false });
    // Policy changed 2026-10-02: a task that DEPENDS on a failed one is skipped
    // (live, dependents spent an hour building on a backend that didn't
    // exist); independent tasks still run, and the run never throws.
    t.equal('the run does not throw; independent tasks still run; dependents do not', order.join(','), 'T-fails,T-independent');
    t.equal('all tasks are recorded in the result', record.tasks.length, 4);
    const dep = record.tasks.find((t2) => t2.id === 'T-dependent');
    const chained = record.tasks.find((t2) => t2.id === 'T-chained');
    t.ok('a direct dependent is SKIPPED, naming the failed task', dep.status === 'SKIPPED' && /depends on "Fails", which produced nothing/.test(dep.notes.join(' ')));
    t.ok('the skip cascades down the chain', chained.status === 'SKIPPED' && /depends on "Dependent", which was skipped/.test(chained.notes.join(' ')));
    const failedTr = record.tasks.find((t2) => t2.id === 'T-fails');
    t.ok('the failing task records the real error reason in its notes', failedTr.notes.some((n) => /generate failed.*model timed out/.test(n)));
  }

  // ---- runsAfter orders without skipping: live 2026-10-02 the tests stage
  // produced nothing and the end-to-end check was skipped with it. ----
  {
    const win = load();
    const order = [];
    const tasks = [
      { id: 'T-check', name: 'Check', dependsOn: ['T-build'], runsAfter: ['T-tests'], generate: () => { order.push('T-check'); return []; } },
      { id: 'T-tests', name: 'Tests', dependsOn: ['T-build'], generate: () => { order.push('T-tests'); return Promise.reject(new Error('no file plan')); } },
      { id: 'T-build', name: 'Build', dependsOn: [], generate: () => { order.push('T-build'); return [{ path: '/a.txt', content: 'a' }]; } }
    ];
    const record = await win.Engine.Orchestrator.run({ tasks, deferProof: true, desktop: false });
    t.equal('runsAfter is honored in the order, even when listed first', order.join(','), 'T-build,T-tests,T-check');
    t.ok('a failed runsAfter task does not skip the task waiting on it', record.tasks.find((x) => x.id === 'T-check').status !== 'SKIPPED');
  }
};
