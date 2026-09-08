/* =====================================================================
   engine.ultramode.js  —  Engine.UltraMode

   The closed Ultra Mode loop, as one connected coordinator with an explicit,
   persisted state machine:

     natural-language prompt
       -> requirements normalization + machine-readable Product Contract
       -> progressive clarification only when genuinely blocked
       -> typed build plan (Universal stages 5-12)
       -> REAL repository generation (Engine.Scaffold)
       -> tests / security / deployment config generation
       -> REAL test / build / lint execution (Engine.Sovereign.runEvidence)
       -> runtime observation (Engine.Sovereign.observe)
       -> evidence collection + failure classification
       -> snapshot -> repair (Engine.Recovery) -> re-execute -> re-observe
       -> Definition-of-Done gate (Engine.DoD)
       -> SOVEREIGN VERIFIED, or an honest BLOCKED / FAILED result.

   It does NOT re-implement any engine — it sequences the ones that exist.
   State + inputs + decisions + evidence are written to
   `.sovereign/ultramode-run.json` after every transition, so the run resumes
   safely after an application restart without repeating side effects.

   window.Engine.UltraMode
     STATES
     start({ prompt, answers?, bounds?, injectedContext? })  -> Promise<run>
     resume(opts?)                                            -> Promise<run>
     answer(answers)                                          -> Promise<run>
     cancel()                                                 -> run
     status()                                                 -> compact status
     load() / reset()
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine;
  if (!Engine || !Engine.FS) { console.error('[UltraMode] Engine.FS missing'); return; }
  var FS = Engine.FS;
  var S = function () { return Engine.Sovereign; };

  var SCHEMA_VERSION = 1;
  var RUN_FILE = 'ultramode-run.json';
  var REPORT_FILE = 'ultramode-report.md';

  var STATES = [
    'RECEIVED', 'ANALYZING', 'NEEDS_INPUT', 'CONTRACT_READY', 'PLANNING',
    'GENERATING', 'VALIDATING', 'EXECUTING', 'OBSERVING', 'REPAIRING',
    'REVERIFYING', 'VERIFIED', 'BLOCKED', 'FAILED', 'CANCELLED'
  ];
  var TERMINAL = { VERIFIED: 1, BLOCKED: 1, FAILED: 1, CANCELLED: 1 };

  var DEFAULT_BOUNDS = {
    maxRepairAttempts: 3,
    runTimeoutMs: 25 * 60 * 1000,
    observeMax: 25
  };

  /* ---------------- helpers ---------------- */
  // Belt-and-braces secret scrub for anything the coordinator persists itself
  // (Sovereign.write also redacts these files, but never trust one layer).
  var SECRET_RE = [
    /\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g,
    /\b(sk-(?:ant-)?[A-Za-z0-9_-]{20,})\b/g,
    /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    /\b(AKIA[0-9A-Z]{16})\b/g,
    /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g,
    /(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----)/g,
    /\b((?:api[_-]?key|token|secret|password)\s*[=:]\s*)["']?([A-Za-z0-9_\-./+]{12,})["']?/gi
  ];
  function scrub(s) {
    var o = String(s == null ? '' : s);
    SECRET_RE.forEach(function (re, i) { o = o.replace(re, i === SECRET_RE.length - 1 ? '$1[REDACTED]' : '[REDACTED]'); });
    return o;
  }
  function now() { return Date.now(); }
  function wait(ms) {
    return new Promise(function (r) {
      if (typeof setTimeout === 'function') setTimeout(r, ms);
      else { var end = Date.now() + ms; while (Date.now() < end) { /* spin (test shim only) */ } r(); }
    });
  }
  function flush() { return (FS.__flush ? FS.__flush() : Promise.resolve()); }
  function sread(p) {
    try {
      var v = S() && S().read(p);
      if (v == null) return null;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return v; } }
      return v;
    } catch (_) { return null; }
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function isDesktop() { return !!(window.desktop && window.desktop.isDesktop); }
  function execAvailable() { return !!(window.CSExec && window.CSExec.available && window.CSExec.available()); }
  function observeAvailable() { return !!(window.CSObserve && window.CSObserve.available && window.CSObserve.available()); }

  var _running = false;         // re-entrancy guard for the driver
  var _cancelRequested = false; // cross-call cancellation flag (survives a new load())

  /* ---------------- persistence ---------------- */
  function persist(run) {
    run.updatedAt = now();
    if (S()) S().write(RUN_FILE, run);
    return flush();
  }
  function load() { return sread(RUN_FILE); }
  function reset() { if (S()) S().write(RUN_FILE, null); return flush(); }

  function transition(run, next, note) {
    if (run.state === next) return;
    run.history.push({ from: run.state, to: next, at: now(), note: note || null });
    run.state = next;
    if (run.history.length > 400) run.history = run.history.slice(-400);
    try { if (window.__UM_TRACE) console.log('[um-driver] -> ' + next + (note ? ' (' + note + ')' : '')); } catch (_) {}
  }

  function newRun(input) {
    input = input || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      runId: 'gm_' + now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: now(),
      updatedAt: now(),
      state: 'RECEIVED',
      prompt: scrub(String(input.prompt || '').trim()),
      promptRaw: undefined,   // never persisted
      input: {
        answers: input.answers || {},
        injectedContext: input.injectedContext || null,
        autonomy: (Engine.Autonomy && Engine.Autonomy.get && Engine.Autonomy.get()) || 'engineer'
      },
      bounds: Object.assign({}, DEFAULT_BOUNDS, input.bounds || {}, { startedAt: now() }),
      history: [],
      degraded: { browserMode: !isDesktop(), execution: false, observation: false, reasons: [] },
      target: null,               // 'web' | 'android' | 'ios' | 'evm' | 'ml-training'
      adapterResult: null,        // { status, reason, need, ... } for a runtime-adapter run
      contract: null,             // summary; full contract in product-contract.json
      plan: null,                 // summary; full plan in ultramode-plan.json
      clarification: { blockingQuestions: [], answered: {}, assumptions: [], unsupported: [], unsafe: [] },
      artifacts: { generatedFiles: [], generatedAt: null, steps: [] },
      snapshots: [],              // { phase, at, id, memKeys }
      attempts: { repair: 0 },
      evidence: { timeline: [] },  // successive DoD/ledger readings
      control: { cancelRequested: false },
      result: null,               // VERIFIED | BLOCKED | FAILED | CANCELLED
      resultReason: null,
      report: null
    };
  }

  /* ---------------- in-memory + durable snapshots ---------------- */
  // Capture the text contents of every workspace file so a repair that makes
  // the evidence worse can be rolled back exactly. Also fires the desktop's
  // durable snapshot for the audit trail.
  function snapshot(run, phase) {
    if ((run.snapshots || []).some(function (s) { return s.phase === phase; })) return Promise.resolve(null);
    var mem = {};
    Object.keys(FS._data || {}).forEach(function (p) {
      var e = FS._data[p];
      if (e && e.type === 'file' && typeof e.content === 'string') mem[p] = e.content;
    });
    var rec = { phase: phase, at: now(), id: null, memKeys: Object.keys(mem).length };
    run.__mem = run.__mem || {};
    run.__mem[phase] = mem;
    run.snapshots.push(rec);
    var durable = Promise.resolve();
    if (isDesktop() && window.desktop.snapshots && window.desktop.snapshots.create) {
      durable = window.desktop.snapshots.create('ultramode:' + phase)
        .then(function (r) { if (r && r.id) rec.id = r.id; })
        .catch(function () {});
    }
    return durable;
  }
  function rollback(run, phase) {
    var mem = run.__mem && run.__mem[phase];
    if (!mem) return Promise.resolve(false);
    var current = Object.keys(FS._data || {});
    // restore captured contents
    Object.keys(mem).forEach(function (p) {
      try { FS.write(p, mem[p]); } catch (_) {}
    });
    // remove files that did not exist at snapshot time
    current.forEach(function (p) {
      var e = FS._data[p];
      if (e && e.type === 'file' && !(p in mem) && !/^\/\.sovereign\//.test(p)) {
        try { FS.remove(p); } catch (_) {}
      }
    });
    return flush().then(function () { return true; });
  }

  /* ---------------- evidence readings ---------------- */
  function readGate() {
    var dod = null, ledger = null;
    try { if (Engine.Ledger && Engine.Ledger.build) Engine.Ledger.build(); } catch (_) {}
    try { if (Engine.DoD && Engine.DoD.evaluate) dod = Engine.DoD.evaluate(); } catch (_) {}
    try { ledger = Engine.Ledger && Engine.Ledger.load && Engine.Ledger.load(); } catch (_) {}
    var failing = ledger ? (ledger.claims || []).filter(function (c) { return (c.failures || 0) > 0; }).map(function (c) { return c.requirementId; }) : [];
    var ds = sread('decision-state.json') || {};
    var passCount = dod ? Object.keys(dod.criteria || {}).filter(function (k) { return dod.criteria[k] === true; }).length : 0;
    return {
      at: now(),
      dodPass: !!(dod && dod.PASS),
      dodPassCount: passCount,
      dodCriteria: dod ? Object.keys(dod.criteria || {}).length : 0,
      dodFailing: dod ? Object.keys(dod.criteria || {}).filter(function (k) { return dod.criteria[k] !== true; }) : [],
      ledgerFailing: failing,
      ledgerAssertions: (ledger && ledger.totals && ledger.totals.assertions) || 0,
      validatorErrors: (ds.counts && ds.counts.errors) || 0,
      validatorWarnings: (ds.counts && ds.counts.warnings) || 0,
      mockSignals: (ds.counts && ds.counts.mockSignals) || 0
    };
  }
  function recordEvidence(run, label) {
    var e = readGate();
    e.label = label;
    run.evidence.timeline.push(e);
    if (run.evidence.timeline.length > 40) run.evidence.timeline = run.evidence.timeline.slice(-40);
    run.evidence.latest = e;
    return e;
  }
  // "worse" = strictly more failing requirements, or the DoD lost passing criteria,
  // or new validator errors appeared.
  function worse(before, after) {
    if (!before) return false;
    if ((after.ledgerFailing || []).length > (before.ledgerFailing || []).length) return true;
    if (after.dodPassCount < before.dodPassCount) return true;
    if ((after.validatorErrors || 0) > (before.validatorErrors || 0)) return true;
    return false;
  }
  function clean(e) {
    return e && e.dodPass === true && (e.ledgerFailing || []).length === 0;
  }
  // A DoD-passing run can still have auto-repairable hygiene findings (a stray
  // console.log, an <img> with no alt). We do ONE repair pass for those, then
  // accept whatever residue Recovery genuinely cannot fix.
  function hasHygieneFindings(e) {
    return !!e && ((e.validatorErrors || 0) > 0 || (e.validatorWarnings || 0) > 0);
  }
  function hasRepairableIssues(e) {
    return !!e && (!e.dodPass || (e.ledgerFailing || []).length > 0 || hasHygieneFindings(e));
  }
  // did the last repair attempt actually change anything?
  function lastRepairProgress(run) {
    var steps = (run.artifacts.steps || []).filter(function (s) { return s.kind === 'repair'; });
    var last = steps[steps.length - 1];
    if (!last) return true;
    if (last.rolledBack) return false;
    return (last.repaired || 0) > 0;
  }

  // Are the remaining DoD failures things a repair can't fix here (they need a
  // human / credentials / a different environment)?  If so -> BLOCKED not FAILED.
  function externalBlockers(e, run) {
    var out = [];
    if (run.degraded.execution) out.push('real test/build/lint execution is unavailable (desktop app + open folder required)');
    if (run.degraded.observation) out.push('runtime observation is unavailable (desktop app + open folder required)');
    return out;
  }

  /* ---------------- runtime-adapter target runs ----------------
     Native mobile / ML training / blockchain don't run in the web observer.
     When contract.target != 'web' the loop routes through Engine.RuntimeRouter
     to the matching adapter (Engine.Mobile / Engine.ML / Engine.Blockchain),
     which generates the real artifact, runs it in a real runtime, and returns
     PASS / FAIL / BLOCKED with evidence. */
  function isTargetRun(run) { return !!(run && run.target && run.target !== 'web'); }
  function routerFor(run) {
    var R = window.Engine && Engine.RuntimeRouter;
    if (!R) return null;
    var contract = Engine.Contract.load();
    return R.route(contract || { target: run.target });
  }

  /* ---------------- state handlers ---------------- */
  var HANDLERS = {

    RECEIVED: function (run) {
      if (!run.prompt || run.prompt.length < 8) {
        run.resultReason = 'The request is empty or too short to build from.';
        transition(run, 'BLOCKED', 'empty prompt');
        return Promise.resolve();
      }
      run.degraded.browserMode = !isDesktop();
      transition(run, 'ANALYZING');
      return Promise.resolve();
    },

    ANALYZING: function (run) {
      if (!Engine.Contract || !Engine.Contract.deriveFromPrompt) {
        run.resultReason = 'Engine.Contract.deriveFromPrompt is not available.';
        transition(run, 'FAILED', 'missing contract engine');
        return Promise.resolve();
      }
      var answers = Object.assign({}, run.input.answers || {}, run.clarification.answered || {});
      return Engine.Contract.deriveFromPrompt(run.prompt, { useLLM: run.input.useLLM !== false })
        .then(function (contract) {
          run.contract = {
            name: contract.product.name,
            type: contract.product.type,
            objective: contract.product.objective,
            verdict: contract.verdict,
            requirements: (contract.requirements || []).length,
            withMachineCriteria: (contract.totals && contract.totals.withMachineCriteria) || 0,
            mandatory: (contract.totals && contract.totals.mandatory) || 0,
            entities: (contract.entities || []).map(function (e) { return e.name; }),
            stack: contract.supportedStack
          };
          run.clarification.assumptions = contract.assumptions || [];
          run.clarification.unsupported = contract.unsupported || [];
          run.clarification.unsafe = contract.unsafe || [];
          run.target = contract.target || 'web';
          run.contract.target = run.target;
          run.contract.targetLabel = contract.targetLabel || null;
          run.contract.targetRuntime = contract.targetRuntime || null;

          // 1) hard safety stop
          if (contract.verdict === 'unsafe') {
            run.resultReason = 'The request asks for functionality that must not be built: ' +
              (contract.unsafe || []).map(function (u) { return u.reason; }).join('; ') + '.';
            transition(run, 'BLOCKED', 'unsafe request');
            return;
          }
          // 2) whole request is outside the supported stack
          if (contract.verdict === 'unsupported') {
            run.resultReason = 'The core of this request is outside what CodeSovereign can generate today: ' +
              (contract.unsupported || []).map(function (u) { return u.reason; }).join('; ') +
              '. Supported: vanilla web frontend + Node.js REST backend + SQLite/Postgres.';
            transition(run, 'BLOCKED', 'unsupported request');
            return;
          }
          // 3) genuinely-blocking questions with no answer yet
          var open = (contract.blockingQuestions || []).filter(function (q) {
            return !answers[q.id] && !(run.clarification.answered || {})[q.id];
          });
          run.clarification.blockingQuestions = contract.blockingQuestions || [];
          if (open.length) {
            run.resultReason = null;
            transition(run, 'NEEDS_INPUT', open.length + ' blocking question(s)');
            return;
          }
          transition(run, 'CONTRACT_READY');
        });
    },

    NEEDS_INPUT: function (run) {
      // The driver stops here; answer() re-enters at ANALYZING.
      return Promise.resolve();
    },

    CONTRACT_READY: function (run) {
      transition(run, 'PLANNING');
      return Promise.resolve();
    },

    PLANNING: function (run) {
      var contract = Engine.Contract.load();

      // ---- runtime-adapter target: a short, adapter-specific plan ----
      if (isTargetRun(run)) {
        var route = routerFor(run);
        if (!route || !route.engine) {
          run.resultReason = 'No runtime adapter is registered for target "' + run.target + '".';
          transition(run, 'FAILED', 'no adapter');
          return Promise.resolve();
        }
        var tplan = {
          schemaVersion: 1, generatedAt: now(),
          target: run.target, adapter: route.adapter, label: route.label,
          runtimeRequirements: route.requirements || [],
          steps: [
            { id: 'STEP-001', kind: 'generate-artifact', agent: route.adapter, produces: [], requirementIds: (contract.requirements || []).map(function (r) { return r.id; }) },
            { id: 'STEP-002', kind: 'runtime-verify', agent: route.adapter, produces: [], requirementIds: [] }
          ],
          files: [], buildCommands: [], observationTargets: []
        };
        if (S()) S().write('ultramode-plan.json', tplan);
        run.plan = { steps: tplan.steps.map(function (s) { return { id: s.id, kind: s.kind, agent: s.agent, produces: 0, requirementIds: s.requirementIds }; }),
          files: 0, stack: { target: run.target, adapter: route.adapter }, target: run.target, runtimeRequirements: tplan.runtimeRequirements };
        transition(run, 'GENERATING', 'target: ' + run.target);
        return flush();
      }

      var U = window.Universal || Engine.Universal;
      var plan = (U && U.buildPlan) ? U.buildPlan(contract) : null;
      if (!plan) {
        run.resultReason = 'Could not produce a build plan from the contract.';
        transition(run, 'FAILED', 'no plan');
        return Promise.resolve();
      }
      if (S()) S().write('ultramode-plan.json', plan);
      run.plan = {
        steps: plan.steps.map(function (s) { return { id: s.id, kind: s.kind, agent: s.agent, produces: s.produces.length, requirementIds: s.requirementIds }; }),
        files: plan.files.length,
        stack: plan.stack,
        buildCommands: plan.buildCommands,
        observationTargets: plan.observationTargets
      };
      transition(run, 'GENERATING');
      return flush();
    },

    GENERATING: function (run) {
      // ---- runtime-adapter target: generate the real artifact via the adapter ----
      if (isTargetRun(run)) {
        if (Engine.Autonomy && Engine.Autonomy.allows && !Engine.Autonomy.allows('generate')) {
          run.resultReason = 'Autonomy level "' + Engine.Autonomy.get() + '" does not permit code generation.';
          transition(run, 'BLOCKED', 'autonomy: generate denied');
          return Promise.resolve();
        }
        var route = routerFor(run);
        var contract = Engine.Contract.load();
        return snapshot(run, 'pre-generate').then(function () {
          var written = [];
          try {
            var spec = Engine.Scaffold && Engine.Scaffold.specFromContract ? Engine.Scaffold.specFromContract(contract) : { name: (contract.product && contract.product.name) || 'app', entities: contract.entities || [] };
            spec.prompt = (contract.product && contract.product.prompt) || run.prompt;
            var files = route.engine.generate(spec);
            files.forEach(function (f) { FS.write(f.path, f.content); written.push(f.path); });
            run.artifacts.steps.push({ kind: 'generate-artifact', at: now(), adapter: route.adapter, target: run.target, files: files.length });
          } catch (e) {
            run.resultReason = run.target + ' artifact generation failed: ' + (e && e.message || e);
            transition(run, 'FAILED', 'adapter generate error');
            return;
          }
          run.artifacts.generatedFiles = Array.from(new Set(written)).sort();
          run.artifacts.generatedAt = now();
          transition(run, 'VALIDATING', 'target artifact generated');
          return flush();
        });
      }

      // resume-safe: if the repo is already on disk from a prior run, don't regenerate
      var alreadyGenerated = run.artifacts.generatedAt && FS.exists('/server.js') && FS.exists('/package.json');
      if (alreadyGenerated) {
        run.artifacts.steps.push({ kind: 'scaffold', at: now(), note: 'skipped — artifacts already present (resume)' });
        transition(run, 'VALIDATING', 'resume: generation already done');
        return Promise.resolve();
      }
      if (Engine.Autonomy && Engine.Autonomy.allows && !Engine.Autonomy.allows('generate')) {
        run.resultReason = 'Autonomy level "' + Engine.Autonomy.get() + '" does not permit code generation.';
        transition(run, 'BLOCKED', 'autonomy: generate denied');
        return Promise.resolve();
      }
      var contract = Engine.Contract.load();
      var plan = sread('ultramode-plan.json');
      return snapshot(run, 'pre-generate').then(function () {
        var written = [];
        // 1) scaffold — the runnable repo
        try {
          var spec = Engine.Scaffold.specFromContract(contract);
          var files = Engine.Scaffold.generate(spec);
          files.forEach(function (f) { FS.write(f.path, f.content); written.push(f.path); });
          run.artifacts.steps.push({ kind: 'scaffold', at: now(), files: files.length, entities: spec.entities.map(function (e) { return e.name; }) });
        } catch (e) {
          run.resultReason = 'Scaffold generation failed: ' + (e && e.message || e);
          transition(run, 'FAILED', 'scaffold error');
          return;
        }
        // 2) testgen — API contract + chaos (+ a11y) suites
        try {
          if (Engine.TestGen && Engine.TestGen.generate) {
            var tg = Engine.TestGen.generate({});
            (tg || []).forEach(function (f) { written.push(f.path); });
            run.artifacts.steps.push({ kind: 'testgen', at: now(), files: (tg || []).length });
          }
        } catch (e) { run.artifacts.steps.push({ kind: 'testgen', at: now(), error: String(e && e.message || e) }); }
        // 3) deployment IaC (generated, never pushed)
        try {
          if (Engine.Deploy && Engine.Deploy.apply && plan && (plan.steps || []).some(function (s) { return s.kind === 'deploy-iac'; })) {
            var dep = Engine.Deploy.apply('compose', {});
            (dep.wrote || []).forEach(function (p) { written.push(p); });
            run.artifacts.steps.push({ kind: 'deploy-iac', at: now(), files: (dep.wrote || []).length, target: 'compose' });
          }
        } catch (e) { run.artifacts.steps.push({ kind: 'deploy-iac', at: now(), error: String(e && e.message || e) }); }

        run.artifacts.generatedFiles = Array.from(new Set(written)).sort();
        run.artifacts.generatedAt = now();
        transition(run, 'VALIDATING');
        return flush();
      });
    },

    VALIDATING: function (run) {
      try { S().analyze(); } catch (e) {
        run.resultReason = 'Static analysis failed: ' + (e && e.message || e);
        transition(run, 'FAILED', 'analyze error');
        return Promise.resolve();
      }
      return flush().then(function () {
        recordEvidence(run, 'post-validate');
        transition(run, 'EXECUTING');
      });
    },

    EXECUTING: function (run) {
      // ---- runtime-adapter target: run the artifact in its real runtime ----
      if (isTargetRun(run)) {
        var route = routerFor(run);
        var probe = (Engine.RuntimeRouter && Engine.RuntimeRouter.probe) ? Engine.RuntimeRouter.probe(run.target) : Promise.resolve(null);
        return probe.then(function (pr) {
          run.artifacts.steps.push({ kind: 'runtime-probe', at: now(), target: run.target, canRun: pr && pr.canRun, missing: (pr && pr.missing) || [] });
          return route.engine.verify({});
        }).then(function (res) {
          res = res || { status: 'FAIL', reason: 'ADAPTER_NO_RESULT' };
          run.adapterResult = {
            status: res.status, reason: res.reason || null, need: res.need || null,
            evidenceFile: res.evidenceFile || null, platform: res.platform || null,
            note: res.note || null
          };
          // Persist the adapter evidence into the Sovereign store (the real adapter
          // already wrote it to .sovereign/ on disk; this keeps the in-memory store
          // and any resumed run consistent, and feeds Engine.DoD).
          var evFile = res.evidenceFile || ({ evm: 'blockchain-evidence.json', android: 'mobile-evidence.json', ios: 'mobile-evidence.json', 'ml-training': 'ml-evidence.json' })[run.target];
          if (evFile && res.evidence && S()) { try { S().write(evFile, res.evidence); } catch (_) {} }
          run.artifacts.steps.push({ kind: 'runtime-verify', at: now(), target: run.target, status: res.status, reason: res.reason || null, evidenceFile: evFile || null });
          try { S().analyze(); } catch (_) {}
          return flush();
        }).then(function () {
          recordEvidence(run, 'post-runtime-verify');
          transition(run, 'REVERIFYING', 'adapter result: ' + (run.adapterResult && run.adapterResult.status));
        }).catch(function (e) {
          run.adapterResult = { status: 'FAIL', reason: 'ADAPTER_EXCEPTION', need: String(e && e.message || e) };
          run.artifacts.steps.push({ kind: 'runtime-verify', at: now(), target: run.target, error: String(e && e.message || e) });
          transition(run, 'REVERIFYING', 'adapter exception');
        });
      }

      if (!execAvailable()) {
        run.degraded.execution = true;
        if (run.degraded.reasons.indexOf('execution') < 0) run.degraded.reasons.push('execution');
        run.artifacts.steps.push({ kind: 'execute', at: now(), note: 'skipped — real execution needs the desktop app with a folder open' });
        transition(run, 'OBSERVING', 'execution unavailable (degraded)');
        return Promise.resolve();
      }
      return S().runEvidence({ steps: ['test', 'build', 'lint'] }).catch(function (e) {
        run.artifacts.steps.push({ kind: 'execute', at: now(), error: String(e && e.message || e) });
      }).then(function () {
        try { S().analyze(); } catch (_) {}
        return flush();
      }).then(function () {
        recordEvidence(run, 'post-execute');
        transition(run, 'OBSERVING');
      });
    },

    OBSERVING: function (run) {
      var afterObserve = function () {
        try { S().analyze(); } catch (_) {}
        return flush().then(function () {
          var e = recordEvidence(run, 'post-observe');
          // Repair when: the DoD is failing (always, if budget allows), OR there
          // are auto-repairable hygiene findings AND we have not yet tried a repair
          // pass. Once we have repaired at least once, a DoD-passing run with only
          // residual hygiene warnings is accepted — no point burning the budget.
          var needsRepair = !clean(e)
            ? hasRepairableIssues(e)
            : (hasHygieneFindings(e) && run.attempts.repair === 0);
          if (!needsRepair || run.attempts.repair >= run.bounds.maxRepairAttempts) {
            transition(run, 'REVERIFYING',
              (!clean(e) && run.attempts.repair >= run.bounds.maxRepairAttempts) ? 'no repair budget left — verify honestly'
              : (clean(e) ? 'DoD passes — verify' : 'first pass clean'));
            return;
          }
          transition(run, 'REPAIRING', clean(e) ? 'DoD passes but hygiene findings remain' : 'issues after first pass');
        });
      };
      if (!observeAvailable()) {
        run.degraded.observation = true;
        if (run.degraded.reasons.indexOf('observation') < 0) run.degraded.reasons.push('observation');
        run.artifacts.steps.push({ kind: 'observe', at: now(), note: 'skipped — runtime observation needs the desktop app with a folder open' });
        return afterObserve();
      }
      return S().observe({ max: run.bounds.observeMax }).catch(function (e) {
        run.artifacts.steps.push({ kind: 'observe', at: now(), error: String(e && e.message || e) });
      }).then(afterObserve);
    },

    REPAIRING: function (run) {
      if (Engine.Autonomy && Engine.Autonomy.allows && !Engine.Autonomy.allows('repair')) {
        run.artifacts.steps.push({ kind: 'repair', at: now(), note: 'autonomy level does not permit repair — verifying as-is' });
        transition(run, 'REVERIFYING', 'autonomy: repair denied');
        return Promise.resolve();
      }
      var attempt = run.attempts.repair + 1;
      var before = run.evidence.latest || recordEvidence(run, 'pre-repair');
      var phase = 'pre-repair-' + attempt;
      return snapshot(run, phase).then(function () {
        var rec = { kind: 'repair', attempt: attempt, at: now(), passes: 0 };
        try {
          if (Engine.Recovery && Engine.Recovery.run) {
            // Recovery fixes a bounded number of findings per run(); loop it (up to
            // 4×) within ONE repair attempt so every auto-repairable finding is
            // cleared before we spend real npm time re-verifying.
            var total = 0, last = 1, r = null;
            for (var i = 0; i < 4 && last > 0; i++) {
              r = Engine.Recovery.run();
              last = r.repairedCount || 0;
              total += last;
              rec.passes++;
              if (r.rolledBack) break;
            }
            rec.status = r ? r.status : 'NO_RECOVERY';
            rec.repaired = total;
            rec.rolledBack = !!(r && r.rolledBack);
          } else { rec.status = 'NO_RECOVERY'; }
        } catch (e) { rec.status = 'ERROR'; rec.error = String(e && e.message || e); }
        run.attempts.repair = attempt;
        try { S().analyze(); } catch (_) {}
        return flush().then(function () {
          var after = recordEvidence(run, 'post-repair-' + attempt);
          if (worse(before, after)) {
            return rollback(run, phase).then(function () {
              rec.rolledBack = true; rec.note = 'repair made the evidence worse — rolled back to ' + phase;
              try { S().analyze(); } catch (_) {}
              return flush();
            }).then(function () {
              recordEvidence(run, 'post-rollback-' + attempt);
              run.artifacts.steps.push(rec);
              transition(run, 'REVERIFYING', 'repair rolled back');
            });
          }
          run.artifacts.steps.push(rec);
          transition(run, 'REVERIFYING', 'repair attempt ' + attempt + ' applied');
        });
      });
    },

    REVERIFYING: function (run) {
      // ---- runtime-adapter target: the adapter result IS the verdict ----
      if (isTargetRun(run)) {
        var ar = run.adapterResult || { status: 'FAIL', reason: 'NO_ADAPTER_RESULT' };
        try { S().analyze(); } catch (_) {}
        var cert = '';
        try { if (Engine.DoD && Engine.DoD.certificate) cert = Engine.DoD.certificate(); } catch (_) {}
        return flush().then(function () {
          recordEvidence(run, 'post-reverify');
          var route = routerFor(run);
          var reqLines = (route && route.requirements || []).map(function (r) { return r.tool + ' — ' + r.install; });
          if (ar.status === 'BLOCKED') {
            run.resultReason = 'Runtime BLOCKED (' + (ar.reason || 'PREREQUISITE_MISSING') + '): ' + (ar.need || 'a required runtime is not available on this host') +
              (ar.note ? ' — ' + ar.note : '') +
              '. This capability IS supported; the artifact is generated and ready. Provide the runtime to complete verification:\n  ' + reqLines.join('\n  ');
            transition(run, 'BLOCKED', 'runtime prerequisite missing: ' + ar.reason);
            return;
          }
          if (ar.status === 'FAIL') {
            run.resultReason = 'The ' + run.target + ' artifact ran but verification failed' +
              (ar.reason ? ' (' + ar.reason + ')' : '') + (ar.need ? ': ' + ar.need : '') + '.';
            transition(run, 'FAILED', 'adapter verification failed');
            return;
          }
          // PASS — the DoD gate must also agree (it now reads the *-evidence.json)
          var e = run.evidence.latest || {};
          if (e.dodPass && /SOVEREIGN VERIFIED/.test(cert || '')) {
            transition(run, 'VERIFIED', run.target + ' verified on its real runtime + DoD gate passed');
            return;
          }
          run.resultReason = 'The ' + run.target + ' artifact PASSED its runtime verification but the Definition-of-Done gate did not clear: ' +
            ((e.dodFailing || []).join(', ') || 'no certificate') + '.';
          transition(run, 'FAILED', 'DoD gate did not pass on a PASS adapter result');
        });
      }

      var chain = Promise.resolve();
      if (execAvailable()) chain = chain.then(function () { return S().runEvidence({ steps: ['test', 'build', 'lint'] }).catch(function () {}); });
      if (observeAvailable()) {
        chain = chain
          .then(function () { try { window.CSObserve.stop(); } catch (_) {} })
          .then(function () { return wait(1200); })
          .then(function () { return S().observe({ max: run.bounds.observeMax }).catch(function () {}); });
      }
      return chain.then(function () {
        try { S().analyze(); } catch (_) {}
        return flush();
      }).then(function () {
        var e = recordEvidence(run, 'post-reverify');

        // A run that never ran real execution + real observation CANNOT be
        // SOVEREIGN VERIFIED — say so honestly instead of trusting stale state.
        var ext = externalBlockers(e, run);
        if (ext.length) {
          run.resultReason = 'The generated project could not be fully verified in this environment: ' + ext.join('; ') +
            '. Re-run in the desktop app to complete real execution + runtime observation.';
          transition(run, 'BLOCKED', 'environment cannot verify');
          return;
        }

        var cert = '';
        try { if (Engine.DoD && Engine.DoD.certificate) cert = Engine.DoD.certificate(); } catch (_) {}

        // VERIFIED needs the DoD gate to pass with a real certificate. Residual
        // hygiene warnings that Recovery genuinely cannot fix do NOT block it.
        if (clean(e) && /SOVEREIGN VERIFIED/.test(cert || '')) {
          transition(run, 'VERIFIED', 'DoD gate passed + certificate written');
          return;
        }
        // keep repairing only while there is budget AND the last attempt made progress
        if (!clean(e) && run.attempts.repair < run.bounds.maxRepairAttempts && lastRepairProgress(run) && hasRepairableIssues(e)) {
          transition(run, 'REPAIRING', 'still failing — another repair attempt');
          return;
        }
        run.resultReason = 'The Definition-of-Done gate did not pass after ' + run.attempts.repair +
          ' repair attempt(s). Failing: ' + (e.dodFailing || []).join(', ') +
          (e.ledgerFailing && e.ledgerFailing.length ? '; failing requirements: ' + e.ledgerFailing.join(', ') : '') + '.';
        transition(run, 'FAILED', 'DoD not met after repair budget');
      });
    }
  };

  /* ---------------- report ---------------- */
  function writeReport(run) {
    var e = run.evidence.latest || {};
    var contract = Engine.Contract && Engine.Contract.load();
    var lines = [
      '# Ultra Mode run — ' + run.runId,
      '',
      '_' + new Date(run.updatedAt).toISOString() + '_',
      '',
      '- **Request:** ' + run.prompt,
      '- **State:** ' + run.state + (run.result ? ' (' + run.result + ')' : ''),
      '- **Product:** ' + (run.contract ? run.contract.name + ' — ' + run.contract.type : 'n/a'),
      '- **Repair attempts:** ' + run.attempts.repair + ' / ' + run.bounds.maxRepairAttempts,
      run.degraded.reasons.length ? '- **Degraded:** ' + run.degraded.reasons.join(', ') + ' unavailable in this environment' : '- **Degraded:** none',
      ''
    ];
    if (run.resultReason) lines.push('> ' + run.resultReason, '');
    if ((run.clarification.assumptions || []).length) {
      lines.push('## Assumptions made', '');
      run.clarification.assumptions.forEach(function (a) { lines.push('- **' + a.about + ':** ' + a.decision + ' — _' + a.rationale + '_'); });
      lines.push('');
    }
    if ((run.clarification.blockingQuestions || []).length) {
      lines.push('## Blocking questions', '');
      run.clarification.blockingQuestions.forEach(function (q) {
        lines.push('- **[' + q.kind + ']** ' + q.question + (run.clarification.answered[q.id] ? '\n  - answered: ' + run.clarification.answered[q.id] : '  _(unanswered)_'));
      });
      lines.push('');
    }
    if ((run.clarification.unsupported || []).length) {
      lines.push('## Not generated (outside the supported stack)', '');
      run.clarification.unsupported.forEach(function (u) { lines.push('- ' + u.request + ' — ' + u.reason); });
      lines.push('');
    }
    if ((run.clarification.unsafe || []).length) {
      lines.push('## Refused (unsafe)', '');
      run.clarification.unsafe.forEach(function (u) { lines.push('- ' + u.request + ' — ' + u.reason); });
      lines.push('');
    }
    lines.push('## Evidence', '',
      '| Reading | DoD pass | DoD criteria | Failing reqs | Assertions | Validator err/warn |',
      '|---|---|---|---|---|---|');
    (run.evidence.timeline || []).forEach(function (r) {
      lines.push('| ' + r.label + ' | ' + (r.dodPass ? 'yes' : 'no') + ' | ' + r.dodPassCount + (r.dodCriteria ? '/' + r.dodCriteria : '') + ' | ' +
        (r.ledgerFailing || []).length + ' | ' + r.ledgerAssertions + ' | ' + r.validatorErrors + '/' + r.validatorWarnings + ' |');
    });
    lines.push('');
    if (contract) {
      lines.push('## Requirement traceability', '', '| Requirement | Priority | Confidence |', '|---|---|---|');
      (contract.requirements || []).forEach(function (r) {
        lines.push('| ' + String(r.statement).slice(0, 70) + ' | ' + (r.priority || 'mandatory') + ' | ' + (r.status || 'unverified') + ' |');
      });
      lines.push('');
    }
    lines.push('_Full evidence: `.sovereign/product-contract.json`, `ultramode-plan.json`, `evidence-ledger.json`, `definition-of-done.json`, `release-certificate.md`._');
    run.report = lines.join('\n');
    if (S()) S().write(REPORT_FILE, run.report);
  }

  function finishTerminal(run) {
    run.result = run.state;
    if (run.state === 'VERIFIED') run.resultReason = run.resultReason || 'All Definition-of-Done gates passed with real execution + runtime evidence.';
    writeReport(run);
    return persist(run).then(function () { return run; });
  }

  /* ---------------- the driver ---------------- */
  function drive(run) {
    if (_running) return Promise.resolve(run);
    _running = true;

    function loop() {
      // cancellation (either the persisted flag or a cross-call request)
      if ((run.control.cancelRequested || _cancelRequested) && !TERMINAL[run.state]) {
        run.control.cancelRequested = true;
        run.resultReason = run.resultReason || 'The run was cancelled.';
        transition(run, 'CANCELLED', 'cancel requested');
        return persist(run).then(function () { return finishTerminal(run); });
      }
      // overall run timeout
      if (!TERMINAL[run.state] && run.state !== 'NEEDS_INPUT' &&
          now() - run.bounds.startedAt > run.bounds.runTimeoutMs) {
        run.resultReason = 'The run exceeded its overall time budget (' + Math.round(run.bounds.runTimeoutMs / 60000) + ' min).';
        transition(run, 'FAILED', 'run timeout');
        return persist(run).then(function () { return finishTerminal(run); });
      }
      if (run.state === 'NEEDS_INPUT') { return persist(run).then(function () { return run; }); }
      if (TERMINAL[run.state]) { return finishTerminal(run); }

      var h = HANDLERS[run.state];
      if (!h) {
        run.resultReason = 'No handler for state ' + run.state;
        transition(run, 'FAILED', 'internal');
        return persist(run).then(function () { return finishTerminal(run); });
      }
      return Promise.resolve()
        .then(function () { return h(run); })
        .catch(function (err) {
          run.resultReason = 'Unhandled error in ' + run.state + ': ' + (err && err.stack || err);
          transition(run, 'FAILED', 'exception');
        })
        .then(function () { return persist(run); })
        .then(loop);
    }

    return loop().then(function (r) { _running = false; return r; }, function (e) { _running = false; throw e; });
  }

  /* ---------------- public API ---------------- */
  function start(input) {
    _cancelRequested = false;
    var run = newRun(input);
    return persist(run).then(function () { return drive(run); });
  }

  function resume(opts) {
    opts = opts || {};
    var run = load();
    if (!run) return start(opts);
    if (run.schemaVersion !== SCHEMA_VERSION) {
      // schema drift: keep the record, restart the run from the same prompt
      var fresh = newRun({ prompt: run.prompt, answers: (run.clarification && run.clarification.answered) || {} });
      fresh.history.push({ from: 'schema-v' + run.schemaVersion, to: 'RECEIVED', at: now(), note: 'schema migration — restarted' });
      return persist(fresh).then(function () { return drive(fresh); });
    }
    _cancelRequested = !!(run.control && run.control.cancelRequested);
    if (TERMINAL[run.state] && !opts.force) return Promise.resolve(run);
    run.__mem = run.__mem || {};   // in-memory snapshots don't survive a restart; rollback for NEW attempts still works
    if (opts.bounds) run.bounds = Object.assign({}, run.bounds, opts.bounds);
    run.history.push({ from: run.state, to: run.state, at: now(), note: 'resumed' });
    return persist(run).then(function () { return drive(run); });
  }

  function answer(answers) {
    var run = load();
    if (!run) return Promise.reject(new Error('no run to answer'));
    run.clarification.answered = Object.assign({}, run.clarification.answered || {}, answers || {});
    if (run.state === 'NEEDS_INPUT') transition(run, 'ANALYZING', 'answers supplied');
    return persist(run).then(function () { return drive(run); });
  }

  function cancel() {
    _cancelRequested = true;
    var run = load();
    if (!run) return null;
    run.control.cancelRequested = true;
    persist(run);
    if (!_running && !TERMINAL[run.state]) {
      run.resultReason = run.resultReason || 'The run was cancelled.';
      transition(run, 'CANCELLED', 'cancel (idle)');
      finishTerminal(run);
    }
    return load() || run;
  }

  function status() {
    var run = load();
    if (!run) return { state: 'NONE' };
    var e = run.evidence && run.evidence.latest;
    return {
      runId: run.runId,
      state: run.state,
      result: run.result,
      resultReason: run.resultReason,
      prompt: run.prompt,
      product: run.contract && run.contract.name,
      verdict: run.contract && run.contract.verdict,
      target: run.target || 'web',
      targetLabel: run.contract && run.contract.targetLabel || null,
      targetRuntime: run.contract && run.contract.targetRuntime || null,
      adapterResult: run.adapterResult || null,
      requirements: run.contract && run.contract.requirements,
      blockingQuestions: (run.clarification.blockingQuestions || []).filter(function (q) { return !(run.clarification.answered || {})[q.id]; }),
      assumptions: run.clarification.assumptions || [],
      unsupported: run.clarification.unsupported || [],
      unsafe: run.clarification.unsafe || [],
      plan: run.plan,
      artifacts: { files: (run.artifacts.generatedFiles || []).length, steps: run.artifacts.steps },
      repairAttempts: run.attempts.repair,
      maxRepairAttempts: run.bounds.maxRepairAttempts,
      degraded: run.degraded,
      evidence: e || null,
      history: run.history.slice(-24),
      terminal: !!TERMINAL[run.state]
    };
  }

  Engine.UltraMode = {
    STATES: STATES,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_BOUNDS: DEFAULT_BOUNDS,
    start: start,
    resume: resume,
    answer: answer,
    cancel: cancel,
    status: status,
    load: load,
    reset: reset,
    // exposed for tests / tooling
    _readGate: readGate,
    _worse: worse
  };
  console.info('[UltraMode] closed-loop coordinator ready — Engine.UltraMode');
})();
