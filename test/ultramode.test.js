'use strict';
/* engine.ultramode.js — the closed-loop coordinator's STATE MACHINE.
 *
 * Real engines used: Contract (deriveFromPrompt), Universal (buildPlan),
 * Schema/Auth/Jobs/Backend/Scaffold (generate), TestGen, Deploy.
 * Stubbed (too heavy / environment-bound): Sovereign.analyze/runEvidence/observe,
 * Ledger, DoD, Recovery — driven by a mutable `world` so every branch of the
 * machine (repair, rollback, limits, cancel, resume, negative paths, browser
 * degradation, determinism) is exercised deterministically.
 *
 * The REAL end-to-end integration (real npm + real observer) is proven by
 * `npm run acceptance:ultramode`.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEnv(world) {
  const dist = path.join(__dirname, '..', 'dist');
  const load = (n) => fs.readFileSync(path.join(dist, n), 'utf8');

  // ---- disk-backed-ish FS shim with the write-behind contract the coordinator relies on ----
  const data = {};                 // path -> { type:'file', content }
  const FS = {
    _data: data,
    isFile: (p) => !!data[p] && data[p].type === 'file',
    exists: (p) => p in data,
    read: (p) => (data[p] ? data[p].content : null),
    write: (p, c) => { data[p] = { type: 'file', content: String(c) }; },
    remove: (p) => { delete data[p]; Object.keys(data).forEach((k) => { if (k.indexOf(p + '/') === 0) delete data[k]; }); },
    count: () => Object.keys(data).length,
    __flush: () => Promise.resolve(),
    __hasWorkspace: () => true
  };

  // ---- Sovereign shim: real read/write of .sovereign/*, stubbed analyze/runEvidence/observe ----
  const sov = {};
  const Sovereign = {
    read: (p) => { const v = sov[p]; return v == null ? null : (/\.json$/.test(p) ? JSON.parse(v) : v); },
    write: (p, d) => { if (d == null) { delete sov[p]; return true; } sov[p] = typeof d === 'string' ? d : JSON.stringify(d); return true; },
    analyze: () => {
      world.analyzeCalls++;
      // model reality: a rolled-back bad repair (regression.js gone) restores the
      // evidence to its pre-regression state on the next analysis.
      if (world._regressed && !FS.exists('/public/regression.js')) {
        world.ledgerFailing = world._preRegressFailing.slice();
        world.validatorErrors = world._preRegressErrors;
        world._regressed = false;
      }
      Sovereign.write('decision-state.json', { counts: { errors: world.validatorErrors, warnings: world.validatorWarnings, mockSignals: world.mockSignals } });
      return { ok: true };
    },
    runEvidence: () => { world.execCalls++; Sovereign.write('execution-evidence.json', { gates: world.gates }); return Promise.resolve({ ok: true }); },
    observe: () => { world.observeCalls++; Sovereign.write('runtime-trace.json', { trace: world.trace }); return Promise.resolve({ ok: true }); }
  };

  const win = { console, setTimeout, clearTimeout, setInterval, clearInterval };
  win.window = win;
  win.localStorage = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })();
  win.CSExec = world.desktop ? { available: () => true } : undefined;
  win.CSObserve = world.desktop ? { available: () => true, stop: () => {} } : undefined;
  win.desktop = world.desktop ? {
    isDesktop: true,
    snapshots: { create: (r) => { world.snapshots.push(r); return Promise.resolve({ ok: true, id: 'snap-' + world.snapshots.length }); } }
  } : undefined;

  // ---- runtime-adapter bridge shim (native mobile / ML / blockchain), driven by `world` ----
  win.CSAdapters = world.desktop ? {
    available: () => true, isDesktop: () => true,
    probe: () => Promise.resolve(world.adapterProbe || { host: { platform: 'test' }, evm: { available: true }, android: { available: true, canRun: !!world.adapterCanRun }, ios: { available: false, canRun: false }, ml: { available: true } }),
    evm: () => Promise.resolve(world.adapterResult || { status: 'BLOCKED', reason: 'NO_WORLD_RESULT' }),
    android: () => Promise.resolve(world.adapterResult || { status: 'BLOCKED', reason: 'NO_WORLD_RESULT' }),
    ios: () => Promise.resolve(world.adapterResult || {
      status: 'PARTIAL', capability: 'native-mobile', platform: 'ios', partial: true,
      reason: 'RUNTIME_STAGES_NEED_APPLE_TOOLING',
      evidenceFile: 'mobile-ios-evidence.json',
      stages: { target: 'ios', support: 'SUPPORTED', host: 'windows', projectType: 'swiftui',
        sourceGeneration: 'PASS', staticValidation: 'PASS', build: 'BLOCKED', signing: 'NOT_RUN',
        deviceExecution: 'BLOCKED', simulatorExecution: 'BLOCKED', runtimeAdapter: null,
        blockers: [{ stage: 'build', reason: 'MACOS_XCODE_REQUIRED' }, { stage: 'simulator', reason: 'MACOS_SIMULATOR_REQUIRED' }] },
      evidence: { target: 'ios', status: 'PARTIAL', sourceGeneration: 'PASS', staticValidation: 'PASS', build: 'BLOCKED', signing: 'NOT_RUN', deviceExecution: 'BLOCKED', simulatorExecution: 'BLOCKED', blockers: [{ stage: 'build', reason: 'MACOS_XCODE_REQUIRED' }] },
      note: 'Native iOS — SUPPORTED WITH TARGET-SPECIFIC EXECUTION. source generation: PASS · static validation: PASS · build: BLOCKED · simulator: BLOCKED'
    }),
    ml: () => Promise.resolve(world.adapterResult || { status: 'BLOCKED', reason: 'NO_WORLD_RESULT' })
  } : undefined;

  win.Engine = { FS, Sovereign };
  vm.createContext(win);
  for (const f of ['engine-universal.js', 'engine.schema.js', 'engine.auth.js', 'engine.jobs.js',
                   'engine.backend.js', 'engine.scaffold.js', 'engine.testgen.js', 'engine.deploy.js',
                   'engine.intent.js', 'engine.contract.js', 'engine.runtime-router.js', 'engine.blockchain.js',
                   'engine.mobile.ios.js', 'engine.mobile.js', 'engine.ml.js']) {
    vm.runInContext(load(f), win, { filename: f });
  }

  // ---- stubbed verification engines, driven by `world` ----
  win.Engine.Ledger = {
    build: () => {
      const led = {
        totals: { assertions: world.assertions, requirements: 12 },
        claims: (world.ledgerFailing || []).map((id) => ({ requirementId: id, claim: id, failures: 1, confidence: 'FAILING' }))
      };
      Sovereign.write('evidence-ledger.json', led);
      return led;
    },
    load: () => Sovereign.read('evidence-ledger.json')
  };
  win.Engine.DoD = {
    evaluate: () => {
      // runtime-adapter target run: gate on the adapter evidence
      const contract = Sovereign.read('product-contract.json');
      if (contract && contract.target === 'ios') {
        const iev = Sovereign.read('mobile-ios-evidence.json') || (Sovereign.read('mobile-evidence.json') || {}).iosStages || {};
        const anyFail = ['sourceGeneration', 'staticValidation', 'build', 'signing', 'deviceExecution', 'simulatorExecution'].some((k) => iev[k] === 'FAIL');
        const full = iev.build === 'PASS' && (iev.deviceExecution === 'PASS' || iev.simulatorExecution === 'PASS');
        const PASS = iev.sourceGeneration === 'PASS' && iev.staticValidation === 'PASS' && !anyFail;
        const dod = { PASS, mode: 'target', target: 'ios', partial: PASS && !full,
          criteria: { artifactGenerated: !!iev.sourceGeneration, sourceGeneration: iev.sourceGeneration === 'PASS', staticValidation: iev.staticValidation === 'PASS', noStageFailed: !anyFail, securityGatesPass: true, architectureSound: true, privacyRespected: true },
          detail: { stages: iev, fullyVerified: full } };
        Sovereign.write('definition-of-done.json', dod);
        return dod;
      }
      const tev = Sovereign.read('blockchain-evidence.json') || Sovereign.read('mobile-evidence.json') || Sovereign.read('ml-evidence.json');
      if (contract && contract.target && contract.target !== 'web') {
        const ok = tev && tev.status === 'PASS';
        const crit = { artifactGenerated: !!tev, buildSucceeds: ok, runtimeVerified: ok, testsSucceed: ok, noFakeImplementation: ok, securityGatesPass: true, architectureSound: true, privacyRespected: true };
        const dod = { PASS: !!ok, mode: 'target', target: contract.target, criteria: crit, generatedAt: Date.now() };
        Sovereign.write('definition-of-done.json', dod);
        return dod;
      }
      const crit = {
        implementationExists: true, dependenciesConnected: true,
        buildSucceeds: !!world.gates.buildPasses, testsSucceed: !!world.gates.testsPass,
        runtimeActionSucceeds: (world.trace || []).some((t) => t.status === 'REAL'),
        noFakeImplementation: !(world.trace || []).some((t) => t.status === 'MOCK' || t.status === 'BROKEN'),
        securityGatesPass: !world.highSecurity,
        acceptanceCriteriaPass: (world.ledgerFailing || []).length === 0
      };
      const PASS = world.dodPass && Object.keys(crit).every((k) => crit[k] === true);
      const dod = { PASS, criteria: crit, generatedAt: Date.now() };
      Sovereign.write('definition-of-done.json', dod);
      return dod;
    },
    certificate: () => {
      const dod = Sovereign.read('definition-of-done.json') || win.Engine.DoD.evaluate();
      const md = '# Certificate\n\nStatus: ' + (dod.PASS ? '**SOVEREIGN VERIFIED**' : '**NOT VERIFIED**') + '\n';
      Sovereign.write('release-certificate.md', md);
      return md;
    },
    load: () => Sovereign.read('definition-of-done.json')
  };
  win.Engine.Recovery = {
    run: () => {
      world.repairCalls++;
      if (world.repairMakesWorse) {
        // regress: add a file and add failing requirements
        world._regressed = true;
        world._preRegressFailing = (world.ledgerFailing || []).slice();
        world._preRegressErrors = world.validatorErrors;
        FS.write('/public/regression.js', 'console.log("bad repair")');
        world.ledgerFailing = ['REQ-001', 'REQ-002', 'REQ-003', 'REQ-004'];
        world.validatorErrors = 5;
        return { status: 'PARTIAL', repairedCount: 1, rolledBack: false };
      }
      world.repairsNeeded = Math.max(0, (world.repairsNeeded || 0) - 1);
      if (world.repairsNeeded === 0) {
        world.dodPass = true; world.ledgerFailing = []; world.validatorWarnings = 0; world.validatorErrors = 0;
        world.trace = [{ control: { name: 'need an account?' }, status: 'REAL' }];
      }
      // repair touches a generated file (proves "touched real source")
      const idx = FS.read('/public/index.html') || '';
      if (idx) FS.write('/public/index.html', idx.replace('<img ', '<img alt="logo" '));
      return { status: 'REPAIRED', repairedCount: 2, rolledBack: false };
    }
  };

  win.Engine.Autonomy = { get: () => 'engineer', allows: () => true };

  vm.runInContext(load('engine.ultramode.js'), win, { filename: 'engine.ultramode.js' });
  return { win, world, sov, data, FS };
}

function baseWorld(over) {
  return Object.assign({
    desktop: true,
    dodPass: true,
    gates: { testsPass: true, buildPasses: true, lintClean: true },
    trace: [{ control: { name: 'need an account?' }, status: 'REAL' }],
    ledgerFailing: [],
    assertions: 9,
    validatorErrors: 0, validatorWarnings: 0, mockSignals: 0,
    highSecurity: false,
    repairsNeeded: 0, repairMakesWorse: false,
    analyzeCalls: 0, execCalls: 0, observeCalls: 0, repairCalls: 0,
    snapshots: []
  }, over || {});
}

const PROMPT = 'Build a secure task-management web application with user accounts, projects, tasks, ' +
  'role-based access, PostgreSQL storage, background email-reminder jobs, REST APIs, accessibility checks, ' +
  'automated tests, Docker configuration and deployment-ready infrastructure.';

module.exports = async function (t) {
  /* ---------- 1. HAPPY PATH: prompt -> VERIFIED ---------- */
  {
    const { win, world, FS } = makeEnv(baseWorld());
    const GM = win.Engine.UltraMode;
    const run = await GM.start({ prompt: PROMPT, useLLM: false });
    t.equal('happy path reaches VERIFIED', run.state, 'VERIFIED');
    t.equal('result is VERIFIED', run.result, 'VERIFIED');
    t.ok('a real repo was generated', (run.artifacts.generatedFiles || []).length >= 15);
    t.ok('server + db + auth + migrations generated',
      FS.exists('/server.js') && FS.exists('/src/auth.js') && FS.exists('/db/migrations/001_init.sql'));
    t.ok('async infra generated (jobs in prompt)', FS.exists('/src/queue.js') && FS.exists('/src/worker.js'));
    t.ok('deploy IaC generated', FS.exists('/Dockerfile') && FS.exists('/docker-compose.prod.yml'));
    t.ok('chaos + a11y test suites generated', FS.exists('/test/chaos.test.js') && FS.exists('/test/a11y.test.js'));
    t.ok('real execution ran', world.execCalls >= 1);
    t.ok('runtime observation ran', world.observeCalls >= 1);
    t.ok('a pre-generate snapshot was taken', run.snapshots.some((s) => s.phase === 'pre-generate'));
    t.ok('contract persisted with machine criteria', (win.Engine.Contract.load().totals.withMachineCriteria) >= 8);
    t.ok('plan persisted + traceable', !!win.Engine.Sovereign.read('ultramode-plan.json'));
    t.ok('report written', /SOVEREIGN|Ultra Mode run/.test(win.Engine.Sovereign.read('ultramode-report.md') || ''));
    const st = GM.status();
    t.equal('status() reports terminal VERIFIED', st.state, 'VERIFIED');
    t.ok('history recorded every transition', run.history.length >= 8);
    // state order sanity
    const seq = run.history.map((h) => h.to);
    ['ANALYZING', 'CONTRACT_READY', 'PLANNING', 'GENERATING', 'VALIDATING', 'EXECUTING', 'OBSERVING', 'REVERIFYING', 'VERIFIED']
      .forEach((s) => t.ok('passed through ' + s, seq.indexOf(s) >= 0));
  }

  /* ---------- 2. DEFECT -> REPAIR -> VERIFIED (bounded, traceable) ---------- */
  {
    const { win, world, FS } = makeEnv(baseWorld({
      dodPass: false, ledgerFailing: ['REQ-005'], validatorWarnings: 3, repairsNeeded: 2,
      trace: [{ control: { name: 'need an account?' }, status: 'REAL' }]
    }));
    const GM = win.Engine.UltraMode;
    const run = await GM.start({ prompt: PROMPT, useLLM: false });
    t.equal('defect path still reaches VERIFIED', run.state, 'VERIFIED');
    t.ok('converged within the repair budget', run.attempts.repair >= 1 && run.attempts.repair <= 3);
    t.ok('one repair attempt clears everything Recovery can (loops run() internally)',
      run.artifacts.steps.some((s) => s.kind === 'repair' && s.passes >= 2), JSON.stringify(run.artifacts.steps.filter((s) => s.kind === 'repair').map((s) => s.passes)));
    t.ok('each repair attempt took a pre-repair snapshot',
      run.snapshots.filter((s) => /^pre-repair-/.test(s.phase)).length === run.attempts.repair);
    t.ok('repair steps recorded in artifacts', run.artifacts.steps.filter((s) => s.kind === 'repair').length === run.attempts.repair);
    t.ok('evidence timeline shows the improvement',
      run.evidence.timeline.some((e) => e.label === 'post-validate') &&
      run.evidence.timeline.some((e) => /post-repair/.test(e.label)) &&
      run.evidence.latest.dodPass === true);
  }

  /* ---------- 3. REPAIR BUDGET EXHAUSTED -> FAILED (never VERIFIED) ---------- */
  {
    const { win } = makeEnv(baseWorld({ dodPass: false, ledgerFailing: ['REQ-005'], validatorWarnings: 4, repairsNeeded: 99 }));
    const GM = win.Engine.UltraMode;
    const run = await GM.start({ prompt: PROMPT, useLLM: false, bounds: { maxRepairAttempts: 2 } });
    t.equal('exhausted repair budget -> FAILED', run.state, 'FAILED');
    t.notEqual('never falsely VERIFIED', run.result, 'VERIFIED');
    t.equal('stopped at the repair limit', run.attempts.repair, 2);
    t.ok('failure reason is honest', /Definition-of-Done gate did not pass/.test(run.resultReason));
  }

  /* ---------- 4. ROLLBACK: a repair that makes evidence worse is reverted ---------- */
  {
    const { win, world, FS } = makeEnv(baseWorld({
      dodPass: false, ledgerFailing: ['REQ-005'], validatorWarnings: 3, repairMakesWorse: true
    }));
    const GM = win.Engine.UltraMode;
    const run = await GM.start({ prompt: PROMPT, useLLM: false, bounds: { maxRepairAttempts: 1 } });
    t.ok('regression file was rolled back', !FS.exists('/public/regression.js'));
    t.ok('a rollback was recorded', run.artifacts.steps.some((s) => s.kind === 'repair' && s.rolledBack === true));
    t.ok('evidence timeline shows a post-rollback reading', run.evidence.timeline.some((e) => /post-rollback/.test(e.label)));
    t.notEqual('a worse-after-repair run is not VERIFIED', run.result, 'VERIFIED');
  }

  /* ---------- 5. CANCELLATION (while paused for input) ---------- */
  {
    const { win } = makeEnv(baseWorld());
    const GM = win.Engine.UltraMode;
    // a prompt with a real blocking question parks the run at NEEDS_INPUT
    const paused = await GM.start({
      prompt: 'Build a web app where customers checkout and pay for products with real payments',
      useLLM: false
    });
    t.equal('run parked at NEEDS_INPUT', paused.state, 'NEEDS_INPUT');
    GM.cancel();
    const run = await GM.resume({ force: true });
    t.equal('cancel while paused -> CANCELLED', run.state, 'CANCELLED');
    t.equal('result CANCELLED', run.result, 'CANCELLED');
    t.ok('cancel reason recorded', /cancelled/i.test(run.resultReason || ''));
  }

  /* ---------- 5b. CANCELLATION (mid-run, cross-call) ---------- */
  {
    const { win } = makeEnv(baseWorld({ dodPass: false, repairsNeeded: 99, ledgerFailing: ['REQ-005'] }));
    const GM = win.Engine.UltraMode;
    const p = GM.start({ prompt: PROMPT, useLLM: false, bounds: { maxRepairAttempts: 5 } });
    GM.cancel();               // fired synchronously, before the async driver loop advances far
    const run = await p;
    t.equal('mid-run cancel -> CANCELLED', run.state, 'CANCELLED');
    t.ok('cancelled before exhausting the repair budget', run.attempts.repair < 5);
  }

  /* ---------- 6. RESUME AFTER INTERRUPTION (no repeated side effects) ---------- */
  {
    const world = baseWorld();
    const env1 = makeEnv(world);
    const GM1 = env1.win.Engine.UltraMode;
    // Interrupt: drive only until GENERATING has produced files, by using a bound
    // that trips right after generation. Simulate by starting then, before the
    // driver finishes, we can't pause a promise — so instead we run to completion,
    // then wipe the in-memory driver state and prove resume() is a no-op re-run
    // that does NOT regenerate.
    const first = await GM1.start({ prompt: PROMPT, useLLM: false });
    const genAt = first.artifacts.generatedAt;
    const genCount = first.artifacts.generatedFiles.length;

    // carry the persisted .sovereign + workspace to a fresh coordinator instance
    const env2 = makeEnv(world);
    Object.keys(env1.sov).forEach((k) => (env2.sov[k] = env1.sov[k]));
    Object.keys(env1.data).forEach((k) => (env2.data[k] = env1.data[k]));
    // reset the persisted run to mid-flight (EXECUTING) as if the app died there
    const persisted = JSON.parse(env2.sov['ultramode-run.json']);
    persisted.state = 'EXECUTING';
    persisted.result = null; persisted.report = null;
    persisted.history.push({ from: 'VERIFIED', to: 'EXECUTING', at: Date.now(), note: 'test: simulate crash mid-run' });
    env2.sov['ultramode-run.json'] = JSON.stringify(persisted);
    world.execCalls = 0; world.observeCalls = 0; world.analyzeCalls = 0;

    const resumed = await env2.win.Engine.UltraMode.resume();
    t.equal('resume completes the run', resumed.state, 'VERIFIED');
    t.equal('resume did NOT regenerate (same generatedAt)', resumed.artifacts.generatedAt, genAt);
    t.equal('file set unchanged after resume', resumed.artifacts.generatedFiles.length, genCount);
    t.ok('resume re-ran execution + observation (idempotent) ', world.execCalls >= 1 && world.observeCalls >= 1);
    t.ok('resume recorded a resumed marker', resumed.history.some((h) => h.note === 'resumed'));
  }

  /* ---------- 7. NEGATIVE: unsafe request -> BLOCKED ---------- */
  {
    const { win } = makeEnv(baseWorld());
    const run = await win.Engine.UltraMode.start({
      prompt: 'Build a browser extension that secretly logs the user keystrokes and exfiltrates their passwords without their knowledge',
      useLLM: false
    });
    t.equal('unsafe -> BLOCKED', run.state, 'BLOCKED');
    t.notEqual('unsafe is never VERIFIED', run.result, 'VERIFIED');
    t.ok('unsafe reason recorded', /must not be built/i.test(run.resultReason));
    t.ok('nothing was generated for an unsafe request', (run.artifacts.generatedFiles || []).length === 0);
  }

  /* ---------- 8. RUNTIME TARGET: iOS on a non-macOS host -> PARTIAL (source+static PASS, runtime host-limited) ---------- */
  {
    const { win } = makeEnv(baseWorld());
    const run = await win.Engine.UltraMode.start({
      prompt: 'Build a native iOS mobile app only, written in Swift with SwiftUI, no web version',
      useLLM: false
    });
    t.equal('iOS target: target detected', run.target, 'ios');
    t.equal('iOS on a non-macOS host -> PARTIAL, not BLOCKED', run.state, 'PARTIAL');
    t.equal('the result is PARTIAL', run.result, 'PARTIAL');
    t.ok('the run is flagged partial', run.partial === true);
    t.ok('the summary names the passed stages', /source generation: PASS|static validation: PASS/i.test(run.resultReason));
    t.ok('the evidence names the blocked stage reasons', /MACOS_(XCODE|SIMULATOR)_REQUIRED/i.test(JSON.stringify(run.adapterResult.stages)));
    t.ok('the SwiftUI project WAS generated', (run.artifacts.generatedFiles || []).some((p) => /ContentView\.swift$/.test(p)) && (run.artifacts.generatedFiles || []).some((p) => /Package\.swift$/.test(p)));
    t.equal('the adapter reported PARTIAL', run.adapterResult && run.adapterResult.status, 'PARTIAL');
    t.equal('the iOS evidence records per-stage results', run.adapterResult.stages.sourceGeneration, 'PASS');
  }

  /* ---------- 8a. RUNTIME TARGET: iOS on a full macOS host -> VERIFIED ---------- */
  {
    const { win } = makeEnv(baseWorld({
      adapterResult: {
        status: 'PASS', capability: 'native-mobile', platform: 'ios', evidenceFile: 'mobile-ios-evidence.json',
        stages: { target: 'ios', host: 'macos', projectType: 'swiftui', sourceGeneration: 'PASS', staticValidation: 'PASS',
          build: 'PASS', signing: 'PASS', deviceExecution: 'NOT_RUN', simulatorExecution: 'PASS', runtimeAdapter: 'xcode', blockers: [] },
        evidence: { target: 'ios', status: 'PASS', sourceGeneration: 'PASS', staticValidation: 'PASS', build: 'PASS', signing: 'PASS', simulatorExecution: 'PASS', deviceExecution: 'NOT_RUN', blockers: [] }
      }
    }));
    const run = await win.Engine.UltraMode.start({ prompt: 'a native iOS SwiftUI app for tasks', useLLM: false });
    t.equal('iOS full verification -> VERIFIED', run.state, 'VERIFIED');
    t.equal('result VERIFIED', run.result, 'VERIFIED');
  }

  /* ---------- 8b. RUNTIME TARGET: blockchain adapter PASS -> VERIFIED ---------- */
  {
    const { win } = makeEnv(baseWorld({
      adapterResult: {
        status: 'PASS', capability: 'blockchain', evidenceFile: 'blockchain-evidence.json',
        evidence: { capability: 'blockchain', status: 'PASS', runtime: 'ethereumjs-local', solcVersion: '0.8.28',
          contracts: ['AcmeToken'], transactions: [{ kind: 'deploy' }, { kind: 'tx' }],
          assertions: [{ step: 'transfer(address,uint256)', pass: true }],
          staticAnalysis: { tool: 'cs-lint', findings: [], high: 0 }, failure: null }
      }
    }));
    const run = await win.Engine.UltraMode.start({
      prompt: 'Build an ERC-20 token smart contract called AcmeToken with mint, transfer and approve',
      useLLM: false
    });
    t.equal('blockchain target detected', run.target, 'evm');
    t.ok('the Solidity contract was generated', (run.artifacts.generatedFiles || []).some((p) => /\.sol$/.test(p)));
    t.equal('adapter PASS -> VERIFIED', run.state, 'VERIFIED');
    t.equal('result is VERIFIED', run.result, 'VERIFIED');
    t.equal('the run recorded a PASS adapter result', run.adapterResult && run.adapterResult.status, 'PASS');
  }

  /* ---------- 8c. RUNTIME TARGET: ML adapter FAIL -> FAILED ---------- */
  {
    const { win } = makeEnv(baseWorld({
      adapterResult: { status: 'FAIL', capability: 'ml-training', reason: 'LOSS_DID_NOT_DECREASE', evidenceFile: 'ml-evidence.json',
        evidence: { capability: 'ml-training', status: 'FAIL', loss_decreased: false } }
    }));
    const run = await win.Engine.UltraMode.start({ prompt: 'Train a transformer language model from scratch', useLLM: false });
    t.equal('ML target detected', run.target, 'ml-training');
    t.equal('adapter FAIL -> FAILED', run.state, 'FAILED');
    t.ok('the FAILED reason carries the adapter reason', /LOSS_DID_NOT_DECREASE|verification failed/i.test(run.resultReason));
  }

  /* ---------- 9. CLARIFICATION: blocking question -> NEEDS_INPUT -> answer -> continue ---------- */
  {
    const { win } = makeEnv(baseWorld());
    const GM = win.Engine.UltraMode;
    const run = await GM.start({
      prompt: 'Build a web app where customers can checkout and pay for products with real payments and subscriptions',
      useLLM: false
    });
    t.equal('payment ambiguity -> NEEDS_INPUT', run.state, 'NEEDS_INPUT');
    const st = GM.status();
    t.ok('a billing question is surfaced', st.blockingQuestions.some((q) => q.kind === 'billing'));
    const qid = st.blockingQuestions[0].id;
    const after = await GM.answer({ [qid]: 'Record payments only (no provider)' });
    t.notEqual('answering leaves NEEDS_INPUT', after.state, 'NEEDS_INPUT');
    t.ok('the run proceeded to a terminal state', after.terminal || ['GENERATING', 'VALIDATING', 'EXECUTING', 'OBSERVING', 'REVERIFYING', 'VERIFIED'].indexOf(after.state) >= 0);
    t.ok('the answer is recorded', after.clarification.answered[qid] === 'Record payments only (no provider)');
  }

  /* ---------- 10. BROWSER MODE: honest degradation, never VERIFIED ---------- */
  {
    const { win, world } = makeEnv(baseWorld({ desktop: false }));
    const run = await win.Engine.UltraMode.start({ prompt: PROMPT, useLLM: false });
    t.equal('browser mode cannot VERIFY -> BLOCKED', run.state, 'BLOCKED');
    t.ok('degraded flags set', run.degraded.execution === true && run.degraded.observation === true);
    t.ok('the code was still generated in browser mode', (run.artifacts.generatedFiles || []).length >= 15);
    t.ok('reason names the missing capability', /desktop app/i.test(run.resultReason));
    t.equal('no real execution was attempted', world.execCalls, 0);
  }

  /* ---------- 11. DETERMINISM: same prompt -> same requirement IDs + entities ---------- */
  {
    const a = makeEnv(baseWorld());
    const b = makeEnv(baseWorld());
    const ca = await a.win.Engine.Contract.deriveFromPrompt(PROMPT, { useLLM: false });
    const cb = await b.win.Engine.Contract.deriveFromPrompt(PROMPT, { useLLM: false });
    t.deepEqual('requirement ids are stable across runs',
      ca.requirements.map((r) => r.id), cb.requirements.map((r) => r.id));
    t.deepEqual('entities are stable across runs',
      ca.entities.map((e) => e.name), cb.entities.map((e) => e.name));
    t.deepEqual('acceptance-criteria ids are stable',
      ca.acceptanceCriteria.map((x) => x.id), cb.acceptanceCriteria.map((x) => x.id));
  }

  /* ---------- 12. TRACEABILITY: every mandatory requirement maps to an artifact ---------- */
  {
    const { win } = makeEnv(baseWorld());
    await win.Engine.UltraMode.start({ prompt: PROMPT, useLLM: false });
    const plan = win.Engine.Sovereign.read('ultramode-plan.json');
    const contract = win.Engine.Contract.load();
    contract.requirements.filter((r) => r.priority === 'mandatory').forEach((r) => {
      const tr = plan.traceability[r.id];
      t.ok('mandatory ' + r.id + ' traces to an artifact', tr && tr.artifacts && tr.artifacts.length >= 1);
    });
    t.ok('plan steps carry requirement ids', plan.steps.every((s) => Array.isArray(s.requirementIds)));
  }

  /* ---------- 13. SECRET REDACTION: prompt-borne secret never lands in evidence ---------- */
  {
    const { win, sov } = makeEnv(baseWorld());
    const secret = 'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH1234';
    await win.Engine.UltraMode.start({ prompt: PROMPT + ' Use the API key ' + secret, useLLM: false });
    const blob = Object.keys(sov).map((k) => sov[k]).join('\n');
    t.ok('the raw secret is not in any .sovereign file', blob.indexOf(secret) < 0);
  }
};
