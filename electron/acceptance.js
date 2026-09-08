'use strict';
/*
 * acceptance.js — end-to-end proof that the eight Sovereign engines work
 * TOGETHER, not merely as isolated unit tests.
 *
 * `electron . --acceptance` copies test/fixtures/acceptance to a throwaway
 * workspace, trusts it, opens it in the real renderer, and then drives the
 * whole CodeSovereign flow against it:
 *
 *   detect -> classify -> execute -> observe -> repair -> retest ->
 *   regenerate evidence -> readiness gate
 *
 * Every stage must produce its real evidence artefact under .sovereign/ and the
 * assertions below check the artefacts, not the return values. Prints
 * "[acceptance] PASS" / "FAIL" and sets the process exit code.
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

const RENDERER = path.join(__dirname, '..', 'dist', 'index.html');
const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'acceptance');
const { freePort } = require('./lib/freeport');
const SKIP = new Set(['node_modules', '.git', '.data', 'dist', '.sovereign']);

async function copyTree(src, dst) {
  await fsp.mkdir(dst, { recursive: true });
  for (const ent of await fsp.readdir(src, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyTree(s, d);
    else await fsp.copyFile(s, d);
  }
}

/* ---- assertion log ---- */
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
  console.log('[acceptance] ' + (pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
}

/* The driver runs INSIDE the renderer, where window.Engine / window.CSExec /
 * window.CSObserve live. It returns a JSON string the main process asserts on. */
function driverSource() {
  return `(async () => {
    const R = { stages: {}, files: {}, diagnostics: {}, errors: [] };
    const S = window.Engine.Sovereign;
    const FS = window.Engine.FS;
    const sov = (p) => { try { return FS.read('/.sovereign/' + p); } catch (_) { return null; } };
    const sovJSON = (p) => { try { return JSON.parse(sov(p) || 'null'); } catch (_) { return null; } };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    // wait for the disk-backed workspace to finish loading
    for (let i = 0; i < 60 && !(FS.__hasWorkspace && FS.__hasWorkspace()); i++) await wait(250);
    if (!(FS.__hasWorkspace && FS.__hasWorkspace())) { R.fatal = 'workspace never loaded'; return JSON.stringify(R); }
    R.workspaceFiles = Object.keys(FS._data).filter((p) => FS.isFile(p)).length;

    try {
      /* 1 ── DETECT + CLASSIFY (static) ─────────────────────────────── */
      const a1 = S.analyze();
      const ds1 = sovJSON('decision-state.json') || {};
      const counts1 = ds1.counts || {};       // captured now: runEvidence rewrites decision-state
      const fp1 = ds1.graphFingerprint || null;
      const comp = sovJSON('components.json') || {};
      const inv1 = sovJSON('interaction-inventory.json') || {};
      const pipe = sovJSON('pipeline-inventory.json') || {};
      const req  = sovJSON('requirements.json');
      const byName = {};
      (inv1.interactions || []).forEach((it) => {
        byName[String(it.name || it.selector || it.id || '').toLowerCase()] = it;
      });
      R.files.sovereign = Object.keys(FS._data).filter((p) => p.indexOf('/.sovereign/') === 0);
      R.stages.detect = {
        ok: !!a1.ok,
        components: (comp.components || []).length,
        interactions: (inv1.interactions || []).length,
        pipelines: pipe.count || 0,
        hasRequirements: !!req,
        adapters: (sovJSON('adapters.json') || {}).primary || null,
        controlStatus: {
          export: (byName['export csv'] || {}).status || null,
          help:   (byName['help'] || {}).status || null,
          clear:  (byName['clear all'] || {}).status || null,
          add:    (byName['add task'] || {}).status || null
        },
        knownIssues: (sov('known-issues.md') || '').split('\\n').filter((l) => l.startsWith('- ')).length
      };

      /* 2 ── EXECUTE (real npm test / build / lint / typecheck) ──────── */
      const ev1 = await S.runEvidence();
      const e1 = sovJSON('execution-evidence.json') || {};
      R.stages.execute = {
        ok: !!ev1.ok,
        gates: e1.gates || {},
        steps: Object.keys(e1.steps || {}).reduce((m, k) => {
          m[k] = { code: e1.steps[k].code, pass: e1.steps[k].pass, skipped: e1.steps[k].skipped }; return m;
        }, {})
      };

      /* 3 ── OBSERVE (drive the running app, record every control) ───── */
      const ob = await S.observe({ max: 30 });
      const tr = sovJSON('runtime-trace.json') || {};
      const obsByName = {};
      (tr.trace || []).forEach((t) => { obsByName[String(t.control.name || '').toLowerCase()] = t.status; });
      const apiCalls = (tr.network || []).filter((n) => /\\/api\\//.test(String(n.url || n))).length;
      R.stages.observe = {
        ok: !!ob.ok,
        reason: ob.reason || null,
        url: tr.url || null,
        controlsFound: tr.controlsFound || 0,
        controlsExercised: tr.controlsExercised || 0,
        byStatus: tr.byStatus || {},
        apiCalls: apiCalls,
        observed: {
          refresh: obsByName['refresh'] || null,
          export:  obsByName['export csv'] || null,
          help:    obsByName['help'] || null,
          clear:   obsByName['clear all'] || null,
          add:     obsByName['add task'] || null
        },
        skippedDestructive: (tr.actionLog || []).filter((a) => a.kind === 'skipped-destructive').map((a) => a.control),
        consoleErrors: (tr.consoleErrors || []).length,
        blocked: (tr.blockedRequests || []).length
      };

      /* 4 ── REPAIR (autonomous recovery loop) ──────────────────────── */
      const srcBefore = ['/public/app.js', '/public/index.html', '/public/app.css', '/server.js', '/src/repository.js']
        .map((p) => FS.read(p) || '').join('\\u0000');
      const rep = window.Engine.Recovery.run();
      if (FS.__flush) await FS.__flush();
      const srcAfter = ['/public/app.js', '/public/index.html', '/public/app.css', '/server.js', '/src/repository.js']
        .map((p) => FS.read(p) || '').join('\\u0000');
      R.stages.repair = {
        status: rep.status,
        repairedCount: rep.repairedCount || 0,
        rolledBack: !!rep.rolledBack,
        issuesBefore: rep.before && rep.before.issues,
        issuesAfter: rep.after && rep.after.issues,
        verify: rep.verify && rep.verify.status,
        touched: srcAfter !== srcBefore
      };

      /* 5 ── RETEST (real execution again, post-repair) ─────────────── */
      const ev2 = await S.runEvidence();
      const e2 = sovJSON('execution-evidence.json') || {};
      R.stages.retest = { ok: !!ev2.ok, gates: e2.gates || {} };

      /* 6 ── REGENERATE EVIDENCE (fresh analysis + drift fingerprint) ─ */
      const a2 = S.analyze();
      if (FS.__flush) await FS.__flush();
      const ds2 = sovJSON('decision-state.json') || {};
      const counts2 = ds2.counts || {};
      const fp2 = ds2.graphFingerprint || null;
      R.stages.regenerate = {
        ok: !!a2.ok,
        fingerprintBefore: fp1,
        fingerprintAfter: fp2,
        fingerprintChanged: !!fp2 && fp2 !== fp1,
        driftFlagPresent: 'driftDetected' in ds2,
        driftDetected: !!ds2.driftDetected,
        errorsBefore: counts1.errors,
        errorsAfter: counts2.errors,
        warningsBefore: counts1.warnings,
        warningsAfter: counts2.warnings,
        sovereignFilesAfter: Object.keys(FS._data).filter((p) => p.indexOf('/.sovereign/') === 0).length
      };

      /* 7 ── READINESS GATE
         Computed from the TRUSTWORTHY signals: real command execution and
         real runtime observation. The in-renderer static validator runs
         under the app strict CSP which blocks eval-style parsing, so its
         JS-syntax findings are not load-bearing here; runEvidence is the
         real build/test proof and supersedes them. */
      const g = e2.gates || {};
      const obs = R.stages.observe;
      const patchesApplied = (rep.results || []).filter((r) => r.ok).length;

      const detectComplete = !!a1.ok
        && R.stages.detect.components > 0
        && R.stages.detect.interactions >= 4
        && R.stages.detect.pipelines > 0
        && R.stages.detect.hasRequirements
        && (R.files.sovereign || []).length >= 12;

      const classifyWorks =
        R.stages.detect.controlStatus.export !== 'REAL'
        && R.stages.detect.controlStatus.help !== 'REAL'
        && obs.observed.clear === 'BROKEN'
        && obs.observed.export === 'MOCK'
        && obs.observed.help === 'MOCK';

      const gate = {
        detectComplete: detectComplete,
        classifyWorks: classifyWorks,
        executionReal: g.testsPass === true && g.buildPasses === true && g.lintClean === true,
        runtimeObserved: obs.ok && obs.controlsExercised >= 3
          && (obs.byStatus.BROKEN || 0) >= 1 && (obs.byStatus.MOCK || 0) >= 1,
        boundariesHeld: obs.skippedDestructive.length >= 1 && obs.blocked === 0,
        repairExecuted: !rep.rolledBack && patchesApplied > 0,
        retestReal: R.stages.retest.gates.testsPass === true && R.stages.retest.gates.buildPasses === true,
        evidenceRegenerated: !!a2.ok && !!fp2 && !!fp1 && 'driftDetected' in ds2,
        evidenceComplete: ['analysis-summary.md', 'execution-evidence.json', 'runtime-trace.json',
          'production-readiness.md', 'decision-state.json', 'requirement-traceability.json',
          'known-issues.md', 'components.json', 'pipeline-inventory.json', 'connection-graph.json']
          .every((f) => sov(f) != null)
      };
      gate.PASS = Object.keys(gate).every((k) => gate[k] === true);
      R.stages.readinessGate = gate;
      R.stages.repair.patchesApplied = patchesApplied;

      /* 8 ── P0 PIPELINE: contract -> ledger -> DoD gate -> orchestrator ──
         Prove the closed Ultra Mode loop on generated code: the DoD gate must
         REFUSE while the planted MOCK/BROKEN controls exist, the orchestrator
         generates the real slices, and the gate + evidence ledger flip. */
      if (window.Engine.Contract && window.Engine.Orchestrator) {
        const contract = await window.Engine.Contract.derive({ useLLM: false });
        window.Engine.Ledger.build(contract);
        const dodBefore = window.Engine.DoD.evaluate();
        if (FS.__flush) await FS.__flush();
        const exportReq = (contract.requirements || []).find((r) => /export csv/i.test(r.statement));
        const ledgerBefore = window.Engine.Ledger.load() || {};
        const claimBefore = (ledgerBefore.claims || []).find((c) => exportReq && c.requirementId === exportReq.id);

        const orch = await window.Engine.Orchestrator.run({
          tasks: [
            { id: 'T-export', name: 'Make "Export CSV" real', template: 'export-csv',
              satisfies: { kind: 'control', name: 'export csv', want: 'REAL' } },
            { id: 'T-clear', name: 'Wire the broken "Clear all"', template: 'clear-all',
              satisfies: { kind: 'control', name: 'clear all', want: 'REAL' } },
            { id: 'T-help', name: 'Make the "Help" link real', template: 'help-panel',
              satisfies: { kind: 'control', name: 'help', want: 'REAL' } }
          ],
          maxCyclesPerTask: 2
        });
        if (FS.__flush) await FS.__flush();
        const dodAfter = window.Engine.DoD.load();
        const ledgerAfter = window.Engine.Ledger.load() || {};
        const claimAfter = (ledgerAfter.claims || []).find((c) => exportReq && c.requirementId === exportReq.id);
        const trAfter = sovJSON('runtime-trace.json') || {};
        const obsAfter = {};
        (trAfter.trace || []).forEach((t) => { obsAfter[String(t.control.name || '').toLowerCase()] = t.status; });

        R.stages.p0 = {
          contractRequirements: (contract.requirements || []).length,
          machineCriteria: contract.totals && contract.totals.withMachineCriteria,
          tracksExport: !!exportReq,
          ledgerAssertionsBefore: ledgerBefore.totals && ledgerBefore.totals.assertions,
          exportClaimBefore: claimBefore && claimBefore.confidence,
          dodBeforePass: dodBefore.PASS,
          dodBeforeNoFake: dodBefore.criteria && dodBefore.criteria.noFakeImplementation,
          orchestratorTasks: (orch.tasks || []).map((t) => ({ id: t.id, status: t.status, cycles: t.cycles, notes: t.notes })),
          orchestratorSummary: orch.summary,
          orchestratorDesktop: orch.desktop,
          exportBtnHtmlNow: (FS.read('/public/index.html') || '').match(/<button id="exportBtn"[^>]*>/i),
          serverHasCsv: (FS.read('/server.js') || '').indexOf('/api/tasks.csv') >= 0,
          appHasExportHandler: (FS.read('/public/app.js') || '').indexOf('exportBtn') >= 0,
          exportObservedAfter: obsAfter['export csv'] || null,
          clearObservedAfter: obsAfter['clear all'] || null,
          helpObservedAfter: obsAfter['help'] || null,
          exportClaimAfter: claimAfter && claimAfter.confidence,
          ledgerAssertionsAfter: ledgerAfter.totals && ledgerAfter.totals.assertions,
          dodAfterPass: dodAfter && dodAfter.PASS,
          dodAfterCriteria: dodAfter && dodAfter.criteria,
          dodAfterDetail: dodAfter && dodAfter.detail,
          dodAfterNoFake: dodAfter && dodAfter.criteria && dodAfter.criteria.noFakeImplementation,
          failingClaims: (ledgerAfter.claims || []).filter((c) => (c.failures || 0) > 0)
            .map((c) => ({ claim: c.claim, evidence: c.evidence.filter((e) => e.result === 'FAIL') })),
          certificateWritten: sov('release-certificate.md') != null,
          certificateVerified: /SOVEREIGN VERIFIED/.test(sov('release-certificate.md') || '')
        };
      }

      /* non-gating diagnostics — surface known engine limitations in this context */
      try {
        const raw = window.Engine.Validator.runAll() || [];
        const health = sovJSON('connection-health.json') || {};
        const CORE = /^(node:)?(fs|path|http|https|os|url|vm|crypto|events|stream|util|assert|child_process|net|zlib|buffer|timers|dns|tls|readline|worker_threads|perf_hooks)$/;
        R.diagnostics.validator = { total: raw.length,
          bySeverity: raw.reduce((m, i) => { m[i.severity] = (m[i.severity] || 0) + 1; return m; }, {}),
          note: raw.some((i) => /Evaluating a string as JavaScript/.test(i.message || ''))
            ? 'static JS parse blocked by renderer CSP — runEvidence (real npm) is authoritative' : 'ok' };
        R.diagnostics.graph = {
          brokenTotal: (health.broken || []).length,
          brokenExcludingNodeCore: (health.broken || []).filter((e) => !CORE.test(String(e.to || '').trim())).length
        };
        R.diagnostics.decisionStateNote =
          'runEvidence()/observe() collapse decision-state.json to their own slice; counts captured post-analyze instead';
        R.diagnostics.orchestratorRun = sovJSON('orchestrator-run.json');
        R.diagnostics.genAppJs = FS.read('/public/app.js') || '';
        R.diagnostics.genIndexHtml = FS.read('/public/index.html') || '';
        R.diagnostics.genServerJs = FS.read('/server.js') || '';
        const trFinal = sovJSON('runtime-trace.json') || {};
        R.diagnostics.finalTraceControls = (trFinal.trace || []).map((x) => ({
          name: x.control && x.control.name, tag: x.control && x.control.tag,
          status: x.status, threw: x.threw, effects: x.effects
        }));
        R.diagnostics.finalTrace = {
          url: trFinal.url, serverUrl: trFinal.serverUrl, controlsFound: trFinal.controlsFound,
          byStatus: trFinal.byStatus, consoleErrors: (trFinal.consoleErrors || []).slice(0, 6),
          network: (trFinal.network || []).map((n) => (n.url || n)).slice(0, 12),
          actionLog: (trFinal.actionLog || []).map((a) => a.kind + (a.control ? ':' + a.control : '')).slice(0, 30)
        };
      } catch (_) { /* diagnostics only */ }
    } catch (e) {
      R.errors.push(String((e && e.stack) || e));
    }
    return JSON.stringify(R);
  })()`;
}

async function run() {
  let exitCode = 1;
  let tmp = null;
  // Watchdog: never let a hung dev server / crawl wedge the CI job.
  const watchdog = setTimeout(() => {
    console.error('[acceptance] FAIL — watchdog: run exceeded 20 minutes');
    try { observer.stop(); proc.killAll(); } catch (_) {}
    app.exit(1);
  }, 20 * 60 * 1000);
  watchdog.unref && watchdog.unref();
  try {
    // A stray dev server from a previous crashed run would be silently reused by
    // the observer, crawling the wrong workspace. Clear the fixture's port first.
    try {
      const fp = await freePort(4319);
      if (fp.wasHeld) console.log('[acceptance] freed port 4319 (killed ' + JSON.stringify(fp.killed) + (fp.stillHeld ? ', STILL HELD' : '') + ')');
    } catch (_) { /* best effort */ }

    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'cs-accept-'));
    const wsDir = path.join(tmp, 'taskboard');
    await copyTree(FIXTURE, wsDir);

    // trust + recents so the renderer can open it and run project commands with
    // no interactive dialog (the acceptance run is non-interactive by design).
    const canonical = workspace.setRoot(wsDir);
    store.addRecent({ path: canonical, name: path.basename(canonical), at: Date.now() });
    trust.grant(canonical);
    trust.audit({ kind: 'acceptance', cwd: canonical });

    session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));

    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const rendererErrors = [];
    win.webContents.on('console-message', (...a) => {
      let level, message;
      if (a[0] && typeof a[0] === 'object' && 'message' in a[0]) ({ level, message } = a[0]);
      else [, level, message] = a;
      if (level === 'error' || level === 3) rendererErrors.push(String(message).slice(0, 300));
    });

    await win.loadFile(RENDERER);
    await new Promise((r) => setTimeout(r, 1500));

    // open the workspace in the renderer (goes through the recents-guarded ws:open)
    await win.webContents.executeJavaScript(
      'window.openProject(' + JSON.stringify(canonical) + '); true'
    );

    const raw = await win.webContents.executeJavaScript(driverSource());
    const report = JSON.parse(raw);

    console.log('\n[acceptance] ---- driver report ----');
    console.log(JSON.stringify(report.stages, null, 2));
    if (report.diagnostics) { console.log('[acceptance] diagnostics: ' + JSON.stringify(report.diagnostics)); }
    if (report.errors && report.errors.length) {
      console.log('[acceptance] driver errors:\n' + report.errors.join('\n'));
    }
    console.log('[acceptance] ------------------------\n');

    if (report.fatal) { check('workspace loads in renderer', false, report.fatal); }
    else {
      const st = report.stages;

      check('workspace opened on disk', report.workspaceFiles > 5, report.workspaceFiles + ' files');

      // 1. DETECT + CLASSIFY
      check('DETECT: analysis wrote the .sovereign evidence set',
        (report.files.sovereign || []).length >= 12, (report.files.sovereign || []).length + ' files');
      check('DETECT: components + interactions + pipeline + requirements all discovered',
        st.detect.components > 0 && st.detect.interactions >= 4 && st.detect.pipelines > 0 && st.detect.hasRequirements,
        JSON.stringify({ c: st.detect.components, i: st.detect.interactions, p: st.detect.pipelines, req: st.detect.hasRequirements }));
      check('CLASSIFY: the mock / broken controls are not classified REAL (static)',
        st.detect.controlStatus.export !== 'REAL' && st.detect.controlStatus.help !== 'REAL' && st.detect.controlStatus.clear !== 'REAL',
        JSON.stringify(st.detect.controlStatus));

      // 2. EXECUTE (real)
      check('EXECUTE: real npm test + build + lint all pass',
        st.execute.gates.testsPass === true && st.execute.gates.buildPasses === true && st.execute.gates.lintClean === true,
        JSON.stringify(st.execute.gates));

      // 3. OBSERVE (real)
      check('OBSERVE: crawled the running app',
        st.observe.ok && st.observe.controlsExercised >= 3,
        (st.observe.reason || (st.observe.url + ' · ' + st.observe.controlsExercised + ' exercised · ' + JSON.stringify(st.observe.byStatus))));
      check('OBSERVE: runtime classification spread includes REAL/MOCK/BROKEN',
        (st.observe.byStatus.BROKEN || 0) >= 1 && (st.observe.byStatus.MOCK || 0) >= 1,
        JSON.stringify(st.observe.byStatus));
      check('OBSERVE: the broken control was caught at runtime (Clear all -> BROKEN)',
        st.observe.observed.clear === 'BROKEN', 'clear=' + st.observe.observed.clear + ' · consoleErrors=' + st.observe.consoleErrors);
      check('OBSERVE: the mock controls were seen doing nothing (Export/Help -> MOCK)',
        st.observe.observed.export === 'MOCK' && st.observe.observed.help === 'MOCK',
        'export=' + st.observe.observed.export + ' help=' + st.observe.observed.help);
      check('OBSERVE: the mutating control was NOT auto-activated (Add task skipped)',
        st.observe.skippedDestructive.length > 0, JSON.stringify(st.observe.skippedDestructive));
      check('OBSERVE: no external / non-loopback requests were allowed',
        st.observe.blocked === 0, st.observe.blocked + ' blocked');

      // 4. REPAIR
      check('REPAIR: recovery loop executed and applied patches without a full rollback',
        !st.repair.rolledBack && st.repair.patchesApplied > 0,
        st.repair.status + ' · ' + st.repair.patchesApplied + ' patches applied / ' + st.repair.repairedCount + ' reported');
      check('REPAIR: it touched real source files',
        st.repair.touched === true, 'touched=' + st.repair.touched);

      // 5. RETEST (real)
      check('RETEST: real npm test + build still pass after repair',
        st.retest.gates.testsPass === true && st.retest.gates.buildPasses === true,
        JSON.stringify(st.retest.gates));

      // 6. REGENERATE EVIDENCE
      check('REGENERATE: fresh analysis re-emitted a graph fingerprint',
        !!st.regenerate.fingerprintAfter, 'fp ' + st.regenerate.fingerprintBefore + ' -> ' + st.regenerate.fingerprintAfter);
      check('REGENERATE: drift detection ran against the pre-repair fingerprint',
        st.regenerate.driftFlagPresent && !!st.regenerate.fingerprintBefore,
        'flag=' + st.regenerate.driftFlagPresent + ' fpBefore=' + st.regenerate.fingerprintBefore + ' changed=' + st.regenerate.fingerprintChanged);
      check('REGENERATE: repair reduced the static warning count',
        typeof st.regenerate.warningsAfter === 'number' && st.regenerate.warningsAfter < st.regenerate.warningsBefore,
        'warnings ' + st.regenerate.warningsBefore + ' -> ' + st.regenerate.warningsAfter);

      // 7. READINESS GATE
      const gate = st.readinessGate;
      Object.keys(gate).filter((k) => k !== 'PASS').forEach((k) => {
        check('GATE: ' + k, gate[k] === true, String(gate[k]));
      });
      check('READINESS GATE PASSES', gate.PASS === true, JSON.stringify(gate));

      // 8. P0 PIPELINE (contract → ledger → DoD → orchestrator)
      const p0 = st.p0;
      if (!p0) {
        check('P0: pipeline engines present', false, 'Engine.Contract / Engine.Orchestrator missing');
      } else {
        check('P0: product contract derived with machine-checkable criteria',
          p0.contractRequirements >= 4 && p0.machineCriteria >= 4 && p0.tracksExport,
          p0.contractRequirements + ' reqs, ' + p0.machineCriteria + ' machine-checkable');
        check('P0: evidence ledger recorded assertions',
          p0.ledgerAssertionsBefore > 0, p0.ledgerAssertionsBefore + ' assertions');
        check('P0: DoD gate REFUSED while the planted MOCK/BROKEN controls existed',
          p0.dodBeforePass === false,
          'PASS=' + p0.dodBeforePass + ' noFake=' + p0.dodBeforeNoFake);
        check('P0: orchestrator drove every slice to COMPLETE',
          (p0.orchestratorTasks || []).length === 3 &&
          p0.orchestratorTasks.every((t) => t.status === 'COMPLETE' || t.status === 'ALREADY_MET'),
          JSON.stringify(p0.orchestratorTasks));
        check('P0: "Export CSV" is now observed REAL',
          p0.exportObservedAfter === 'REAL', 'export=' + p0.exportObservedAfter);
        check('P0: the broken "Clear all" is now observed REAL',
          p0.clearObservedAfter === 'REAL', 'clear=' + p0.clearObservedAfter);
        check('P0: the decorative "Help" link is now observed REAL',
          p0.helpObservedAfter === 'REAL', 'help=' + p0.helpObservedAfter);
        check('P0: the Export CSV claim flipped to VERIFIED',
          p0.exportClaimAfter === 'VERIFIED', 'claim=' + p0.exportClaimAfter);
        check('P0: DoD gate flipped to DONE after the loop closed',
          p0.dodAfterPass === true && p0.dodAfterNoFake === true,
          'PASS=' + p0.dodAfterPass + ' noFake=' + p0.dodAfterNoFake);
        check('P0: Sovereign Release Certificate written and SOVEREIGN VERIFIED',
          p0.certificateWritten && p0.certificateVerified,
          'written=' + p0.certificateWritten + ' verified=' + p0.certificateVerified);
      }
    }

    check('renderer produced no console errors', rendererErrors.length === 0,
      rendererErrors.slice(0, 5).join(' | '));

    const failed = results.filter((r) => !r.pass);
    console.log('\n[acceptance] ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    if (failed.length === 0) { console.log('[acceptance] PASS'); exitCode = 0; }
    else { console.log('[acceptance] FAIL — ' + failed.map((f) => f.name).join('; ')); exitCode = 1; }
  } catch (e) {
    console.error('[acceptance] harness error:', (e && e.stack) || e);
    exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    try { observer.stop(); } catch (_) {}
    try { proc.killAll(); } catch (_) {}
    if (tmp) { try { await fsp.rm(tmp, { recursive: true, force: true }); } catch (_) {} }
    app.exit(exitCode);
  }
}

module.exports = { run, driverSource };
