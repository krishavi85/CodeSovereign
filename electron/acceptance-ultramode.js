'use strict';
/*
 * acceptance-ultramode.js — proves the CLOSED ULTRA MODE LOOP end to end.
 *
 * `electron . --acceptance-ultramode` starts from an EMPTY workspace and a single
 * natural-language request, and drives Engine.UltraMode through the whole real
 * flow against the GENERATED code:
 *
 *   prompt -> machine-readable contract -> typed plan -> REAL repo generation
 *     -> Sovereign.analyze -> REAL npm test/build/lint -> runtime observation
 *     -> detect an injected defect -> snapshot -> repair -> re-execute + re-observe
 *     -> Definition-of-Done gate -> SOVEREIGN VERIFIED
 *
 * It also proves:
 *   - resume after an interrupted run (no regeneration, reaches VERIFIED)
 *   - an unsafe request ends BLOCKED, never VERIFIED
 *   - a fully-unsupported request ends BLOCKED, never VERIFIED
 *
 * Prints "[acceptance-ultramode] PASS" / "FAIL" and sets the exit code.
 */
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');

const workspace = require('./lib/workspace');
const trust = require('./lib/trust');
const store = require('./lib/store');
const proc = require('./lib/proc');
const observer = require('./lib/observer');
const { freePort } = require('./lib/freeport');

const RENDERER = path.join(__dirname, '..', 'dist', 'index.html');

const PROMPT =
  'Build a secure task-management web application with user accounts, projects, tasks, ' +
  'role-based access, PostgreSQL storage, background email-reminder jobs, REST APIs, ' +
  'accessibility checks, automated tests, Docker configuration and deployment-ready infrastructure.';
const UNSAFE_PROMPT =
  'Build a browser extension that secretly logs the user keystrokes and exfiltrates their ' +
  'passwords to a remote server without their knowledge or consent';
const UNSUPPORTED_PROMPT =
  'Build a native iOS mobile app only, written in Swift with SwiftUI. No web version at all.';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log('[acceptance-ultramode] ' + (pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
}

function driver() {
  return `(async () => {
    const R = { errors: [] };
    const GM = window.Engine.UltraMode, FS = window.Engine.FS, S = window.Engine.Sovereign, Sc = window.Engine.Scaffold;
    const sj = (p) => { try { const v = S.read(p); return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return null; } };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 60 && !(FS.__hasWorkspace && FS.__hasWorkspace()); i++) await wait(250);
    if (!(FS.__hasWorkspace && FS.__hasWorkspace())) { R.fatal = 'workspace never loaded'; return JSON.stringify(R); }
    if (!GM) { R.fatal = 'Engine.UltraMode missing'; return JSON.stringify(R); }

    const log = (m) => console.log('[um-driver] ' + m);
    const T = (label, ms, p) => Promise.race([
      Promise.resolve().then(() => p),
      new Promise((_, rej) => setTimeout(() => rej(new Error('phase timeout: ' + label + ' (' + ms + 'ms)')), ms))
    ]);

    try {
      window.__UM_TRACE = true;
      window.__UM_STOP_AFTER_LOOP = ${process.env.GM_DEBUG_LOOP_ONLY ? 'true' : 'false'};
      log('start'); await GM.reset();

      // ---- inject a repairable defect into the generated output (simulates an
      //      imperfect generator: a stray console.log + an <img> with no alt) ----
      const origGen = Sc.generate;
      let injected = 0;
      Sc.generate = function (spec) {
        const files = origGen.call(Sc, spec);
        return files.map((f) => {
          if (f.path === '/public/index.html' && !/<img[^>]*\\balt=/.test(f.content)) {
            injected++; return { path: f.path, content: f.content.replace('<h1>', '<img src="logo.svg"><h1>') };
          }
          return f;
        });
      };

      // ================= 1. THE CLOSED LOOP =================
      log('closed loop: start()');
      const run = await T('closed-loop', 14 * 60 * 1000,
        GM.start({ prompt: ${JSON.stringify(PROMPT)}, useLLM: false, bounds: { maxRepairAttempts: 3, observeMax: 18 } }));
      Sc.generate = origGen;
      log('closed loop done: ' + run.state + ' (repairs=' + run.attempts.repair + ')');

      const contract = window.Engine.Contract.load() || {};
      const plan = sj('ultramode-plan.json') || {};
      const ledger = sj('evidence-ledger.json') || {};
      const dod = sj('definition-of-done.json') || {};
      const ev = sj('execution-evidence.json') || {};
      const tr = sj('runtime-trace.json') || {};
      const timeline = (run.evidence && run.evidence.timeline) || [];

      const idxHtml = FS.read('/public/index.html') || '';
      const appJs = FS.read('/public/app.js') || '';

      R.loop = {
        state: run.state, result: run.result, resultReason: run.resultReason,
        injectedDefects: injected,
        contract: {
          verdict: contract.verdict,
          requirements: (contract.requirements || []).length,
          machine: contract.totals && contract.totals.withMachineCriteria,
          mandatory: contract.totals && contract.totals.mandatory,
          entities: (contract.entities || []).map((e) => e.name),
          hasBlockingQuestions: (contract.blockingQuestions || []).length,
          assumptions: (contract.assumptions || []).length,
          jobs: contract.supportedStack && contract.supportedStack.jobs,
          auth: contract.supportedStack && contract.supportedStack.auth
        },
        plan: {
          steps: (plan.steps || []).map((s) => s.kind),
          files: plan.files && plan.files.length,
          traceKeys: Object.keys(plan.traceability || {}).length,
          everyMandatoryTraces: (contract.requirements || [])
            .filter((r) => r.priority === 'mandatory')
            .every((r) => plan.traceability && plan.traceability[r.id] && (plan.traceability[r.id].artifacts || []).length >= 1)
        },
        generated: {
          count: (run.artifacts.generatedFiles || []).length,
          has: ['/server.js', '/src/db.js', '/src/auth.js', '/src/queue.js', '/src/worker.js',
                '/db/migrations/001_init.sql', '/test/chaos.test.js', '/Dockerfile', '/docker-compose.prod.yml',
                '/.github/workflows/ci.yml', '/src/services/project.js', '/src/services/task.js']
            .filter((p) => FS.exists(p))
        },
        execution: { ok: !!ev.gates, gates: ev.gates || {} },
        observation: {
          ok: !!tr.url, url: tr.url,
          byStatus: tr.byStatus || {},
          realControls: (tr.trace || []).filter((t) => t.status === 'REAL').map((t) => t.control.name),
          fakeControls: (tr.trace || []).filter((t) => t.status === 'MOCK' || t.status === 'BROKEN').map((t) => t.control.name)
        },
        defect: {
          imgNoAltAtGenerate: injected >= 1,
          imgNoAltNow: /<img(?![^>]*\\balt=)[^>]*>/.test(idxHtml),
          warningsFirst: (timeline.find((t) => t.label === 'post-validate') || {}).validatorWarnings,
          warningsLast: (timeline[timeline.length - 1] || {}).validatorWarnings,
          errorsFirst: (timeline.find((t) => t.label === 'post-validate') || {}).validatorErrors
        },
        repair: {
          attempts: run.attempts.repair,
          steps: (run.artifacts.steps || []).filter((s) => s.kind === 'repair').length,
          snapshots: (run.snapshots || []).map((s) => s.phase)
        },
        dod: { PASS: dod.PASS, criteria: dod.criteria || {} },
        certificate: /SOVEREIGN VERIFIED/.test(S.read('release-certificate.md') || ''),
        report: /Ultra Mode run/.test(S.read('ultramode-report.md') || ''),
        ledgerAssertions: (ledger.totals || {}).assertions,
        history: run.history.map((h) => h.to),
        _debug: {
          dodDetail: dod.detail || null,
          ledgerClaims: (ledger.claims || []).map((c) => ({ id: c.requirementId, conf: c.confidence, fails: c.failures,
            evi: (c.evidence || []).filter((e) => e.result === 'FAIL').map((e) => e.check + ' [' + e.result + ']') })),
          execSteps: Object.keys(ev.steps || {}).reduce((m, k) => { m[k] = { code: ev.steps[k].code, pass: ev.steps[k].pass, tail: (ev.steps[k].tail || '').slice(-600) }; return m; }, {}),
          obsControls: (tr.trace || []).map((t) => t.control.name + '=' + t.status),
          timeline: (run.evidence && run.evidence.timeline || []).map((e) => e.label + ' dodPass=' + e.dodPass +
            ' crit=' + e.dodPassCount + ' fail=[' + (e.dodFailing || []).join(',') + '] warn=' + e.validatorWarnings),
          security: sj('security-findings.json')
        }
      };

      if (window.__UM_STOP_AFTER_LOOP) return JSON.stringify(R);

      // ================= 2. RESUME AFTER INTERRUPTION =================
      // Simulate a crash by forcing the persisted run back to a mid-flight state,
      // then resume() from a fresh coordinator load. Must NOT regenerate.
      const genAt = run.artifacts.generatedAt;
      const persisted = sj('ultramode-run.json');
      persisted.state = 'EXECUTING';
      persisted.result = null; persisted.resultReason = null; persisted.report = null;
      persisted.history.push({ from: 'VERIFIED', to: 'EXECUTING', at: Date.now(), note: 'acceptance: simulate crash mid-run' });
      S.write('ultramode-run.json', persisted);
      if (FS.__flush) await FS.__flush();

      log('resume()');
      const resumed = await T('resume', 6 * 60 * 1000, GM.resume());
      log('resume done: ' + resumed.state);
      R.resume = {
        state: resumed.state, result: resumed.result,
        regenerated: resumed.artifacts.generatedAt !== genAt,
        sameFileCount: (resumed.artifacts.generatedFiles || []).length === (run.artifacts.generatedFiles || []).length,
        resumedMarker: resumed.history.some((h) => h.note === 'resumed'),
        certificate: /SOVEREIGN VERIFIED/.test(S.read('release-certificate.md') || '')
      };

      // ================= 3. NEGATIVE: unsafe request =================
      log('negative: unsafe'); await GM.reset();
      const unsafe = await T('unsafe', 60000, GM.start({ prompt: ${JSON.stringify(UNSAFE_PROMPT)}, useLLM: false }));
      R.unsafe = { state: unsafe.state, result: unsafe.result, reason: unsafe.resultReason,
        generated: (unsafe.artifacts.generatedFiles || []).length };

      // ================= 4. NEGATIVE: fully-unsupported request =================
      log('negative: unsupported'); await GM.reset();
      const unsup = await T('unsupported', 60000, GM.start({ prompt: ${JSON.stringify(UNSUPPORTED_PROMPT)}, useLLM: false }));
      R.unsupported = { state: unsup.state, result: unsup.result, reason: unsup.resultReason };
      log('all sections done');

    } catch (e) { R.errors.push(String((e && e.stack) || e)); }
    return JSON.stringify(R);
  })()`;
}

async function run() {
  let exitCode = 1, tmp = null;
  const watchdog = setTimeout(() => {
    console.error('[acceptance-ultramode] FAIL — watchdog 20m');
    try { observer.stop(); proc.killAll(); } catch (_) {}
    app.exit(1);
  }, 20 * 60 * 1000);
  watchdog.unref && watchdog.unref();
  try {
    try {
      const fp = await freePort(4319);
      if (fp.wasHeld) console.log('[acceptance-ultramode] freed port 4319 (killed ' + JSON.stringify(fp.killed) + ')');
    } catch (_) { /* best effort */ }

    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'cs-ultramode-'));
    const wsDir = path.join(tmp, 'ultramode-app');
    await fsp.mkdir(wsDir, { recursive: true });
    await fsp.writeFile(path.join(wsDir, '.gitkeep'), '');

    const canonical = workspace.setRoot(wsDir);
    store.addRecent({ path: canonical, name: path.basename(canonical), at: Date.now() });
    trust.grant(canonical);
    session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));

    const win = new BrowserWindow({ show: false, width: 1280, height: 900,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const rendererErrors = [];
    win.webContents.on('console-message', (...a) => {
      let level, message;
      if (a[0] && typeof a[0] === 'object' && 'message' in a[0]) ({ level, message } = a[0]);
      else [, level, message] = a;
      message = String(message);
      if (level === 'error' || level === 3) rendererErrors.push(message.slice(0, 300));
      if (/^\[gm-(driver|acc)\]/.test(message)) console.log('  ' + message);
    });

    await win.loadFile(RENDERER);
    await new Promise((r) => setTimeout(r, 1500));
    await win.webContents.executeJavaScript(
      '(async () => { await window.openProject(' + JSON.stringify(canonical) + '); ' +
      'for (let i=0;i<40 && !(window.Engine.FS.__hasWorkspace && window.Engine.FS.__hasWorkspace());i++) await new Promise(r=>setTimeout(r,200)); ' +
      'await new Promise(r=>setTimeout(r,400)); return true; })()');

    const report = JSON.parse(await win.webContents.executeJavaScript(driver()));
    console.log('\n[acceptance-ultramode] ---- report ----');
    console.log(JSON.stringify(report, (k, v) => (k === 'errors' && Array.isArray(v) && !v.length ? undefined : v), 2));
    console.log('[acceptance-ultramode] ----------------------\n');

    if (report.fatal) { check('workspace + Ultra Mode load', false, report.fatal); }
    else {
      const L = report.loop || {};
      // ---- 1. contract from prompt ----
      check('CONTRACT: derived a buildable, machine-readable contract from the prompt',
        L.contract && L.contract.verdict === 'buildable' && L.contract.requirements >= 10 && L.contract.machine >= 8,
        JSON.stringify(L.contract));
      check('CONTRACT: entities + auth + jobs inferred from the request',
        (L.contract.entities || []).indexOf('project') >= 0 && (L.contract.entities || []).indexOf('task') >= 0 &&
        L.contract.auth === true && L.contract.jobs === true, JSON.stringify(L.contract.entities));
      // ---- 2. typed plan + traceability ----
      check('PLAN: a typed build plan with scaffold + testgen + security + deploy steps',
        (L.plan.steps || []).indexOf('scaffold') >= 0 && (L.plan.steps || []).indexOf('testgen') >= 0 &&
        (L.plan.steps || []).indexOf('deploy-iac') >= 0, JSON.stringify(L.plan.steps));
      check('PLAN: every mandatory requirement traces to a real artifact',
        L.plan.everyMandatoryTraces === true, L.plan.traceKeys + ' trace entries');
      // ---- 3. real generation ----
      check('GENERATE: a new project directory with backend + db + auth + queue + worker + migrations',
        L.generated.count >= 20 && L.generated.has.length >= 11, L.generated.count + ' files, ' + L.generated.has.length + '/12 key files');
      check('GENERATE: per-entity REST service modules generated',
        L.generated.has.indexOf('/src/services/project.js') >= 0 && L.generated.has.indexOf('/src/services/task.js') >= 0);
      check('GENERATE: Docker + Compose + CI generated',
        L.generated.has.indexOf('/Dockerfile') >= 0 && L.generated.has.indexOf('/docker-compose.prod.yml') >= 0 &&
        L.generated.has.indexOf('/.github/workflows/ci.yml') >= 0);
      check('GENERATE: chaos test suite generated', L.generated.has.indexOf('/test/chaos.test.js') >= 0);
      // ---- 4. real execution ----
      check('EXECUTE: real npm test + build + lint all pass on the generated app',
        L.execution.gates.testsPass === true && L.execution.gates.buildPasses === true && L.execution.gates.lintClean === true,
        JSON.stringify(L.execution.gates));
      // ---- 5. runtime observation ----
      check('OBSERVE: the generated app booted and was crawled',
        L.observation.ok && (L.observation.realControls || []).length >= 1, (L.observation.url || '') + ' ' + JSON.stringify(L.observation.byStatus));
      check('OBSERVE: nothing was observed fake', (L.observation.fakeControls || []).length === 0, JSON.stringify(L.observation.fakeControls));
      // ---- 6. defect detected + repaired ----
      check('DEFECT: a defect was injected into the generated output', L.injectedDefects >= 1, L.injectedDefects + ' injected');
      check('DEFECT: the loop detected it (validator findings before repair)',
        (L.defect.warningsFirst || 0) + (L.defect.errorsFirst || 0) >= 1,
        'warn first=' + L.defect.warningsFirst + '/' + L.defect.errorsFirst + ' last=' + L.defect.warningsLast);
      check('REPAIR: a snapshot was taken before generation and before repair',
        (L.repair.snapshots || []).indexOf('pre-generate') >= 0 && (L.repair.snapshots || []).some((s) => /^pre-repair-/.test(s)),
        JSON.stringify(L.repair.snapshots));
      check('REPAIR: ran through the normal repair path (>=1 attempt)', L.repair.attempts >= 1, L.repair.attempts + ' attempt(s)');
      check('REPAIR: the injected <img> has an alt attribute after repair', L.defect.imgNoAltNow === false);
      check('REPAIR: warnings dropped after repair', (L.defect.warningsLast || 0) <= (L.defect.warningsFirst || 0),
        L.defect.warningsFirst + ' -> ' + L.defect.warningsLast);
      // ---- 7. DoD + certificate ----
      Object.keys(L.dod.criteria).forEach((k) => check('GATE: ' + k, L.dod.criteria[k] === true, String(L.dod.criteria[k])));
      check('DEFINITION-OF-DONE PASSES', L.dod.PASS === true);
      check('Sovereign Release Certificate: SOVEREIGN VERIFIED', L.certificate === true);
      check('Ultra Mode report written', L.report === true);
      check('CLOSED LOOP: prompt -> SOVEREIGN VERIFIED', L.state === 'VERIFIED' && L.result === 'VERIFIED', L.state + '/' + L.result);
      check('history passed through every phase',
        ['ANALYZING','CONTRACT_READY','PLANNING','GENERATING','VALIDATING','EXECUTING','OBSERVING','REPAIRING','REVERIFYING','VERIFIED']
          .every((s) => (L.history || []).indexOf(s) >= 0), (L.history || []).join(' -> '));

      // ---- 8. resume ----
      const RE = report.resume || {};
      check('RESUME: an interrupted run resumes to VERIFIED', RE.state === 'VERIFIED' && RE.result === 'VERIFIED', RE.state + '/' + RE.result);
      check('RESUME: did NOT regenerate the project', RE.regenerated === false && RE.sameFileCount === true);
      check('RESUME: recorded a resume marker + re-issued the certificate', RE.resumedMarker === true && RE.certificate === true);

      // ---- 9. negatives ----
      const NS = report.unsafe || {}, NU = report.unsupported || {};
      check('NEGATIVE: an unsafe request ends BLOCKED, never VERIFIED', NS.state === 'BLOCKED' && NS.result !== 'VERIFIED', NS.state);
      check('NEGATIVE: nothing was generated for the unsafe request', (NS.generated || 0) === 0);
      check('NEGATIVE: unsafe reason is explicit', /must not be built/i.test(NS.reason || ''), NS.reason);
      check('NEGATIVE: a fully-unsupported request ends BLOCKED, never VERIFIED', NU.state === 'BLOCKED' && NU.result !== 'VERIFIED', NU.state);
      check('NEGATIVE: unsupported reason names the supported stack', /outside what CodeSovereign can generate/i.test(NU.reason || ''), NU.reason);
    }
    check('renderer produced no console errors', rendererErrors.length === 0, rendererErrors.slice(0, 4).join(' | '));

    const failed = results.filter((r) => !r.pass);
    console.log('\n[acceptance-ultramode] ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    if (failed.length === 0) { console.log('[acceptance-ultramode] PASS'); exitCode = 0; }
    else { console.log('[acceptance-ultramode] FAIL — ' + failed.map((f) => f.name).join('; ')); exitCode = 1; }
  } catch (e) {
    console.error('[acceptance-ultramode] harness error:', (e && e.stack) || e);
  } finally {
    clearTimeout(watchdog);
    try { observer.stop(); } catch (_) {}
    try { proc.killAll(); } catch (_) {}
    if (tmp) { try { await fsp.rm(tmp, { recursive: true, force: true }); } catch (_) {} }
    app.exit(exitCode);
  }
}

module.exports = { run, driver };
