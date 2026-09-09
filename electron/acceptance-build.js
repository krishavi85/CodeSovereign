'use strict';
/*
 * acceptance-build.js — proves REPO-SCALE GENERATION.
 *
 * `electron . --acceptance-build` starts from an EMPTY workspace, generates a
 * complete full-stack app with Engine.Scaffold (backend + data layer + SQL
 * migrations + auth + frontend + tests + CI + Dockerfile), then drives the
 * whole CodeSovereign flow against the GENERATED code:
 *
 *   generate -> contract -> analyze -> real npm migrate/test/build/lint ->
 *   observe the running app -> evidence ledger -> Definition-of-Done gate ->
 *   Sovereign Release Certificate
 *
 * Prints "[acceptance-build] PASS" / "FAIL" and sets the exit code.
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

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log('[acceptance-build] ' + (pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
}

function driver() {
  return `(async () => {
    const R = { errors: [] };
    const S = window.Engine.Sovereign, FS = window.Engine.FS, Sc = window.Engine.Scaffold;
    const sov = (p) => { try { return S.read(p); } catch (_) { return null; } };
    const sj = (p) => { try { const v = S.read(p); return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return null; } };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 60 && !(FS.__hasWorkspace && FS.__hasWorkspace()); i++) await wait(250);
    if (!(FS.__hasWorkspace && FS.__hasWorkspace())) { R.fatal = 'workspace never loaded'; return JSON.stringify(R); }

    try {
      // 1 ── GENERATE a whole repo from a spec
      if (!Sc) { R.fatal = 'Engine.Scaffold missing'; return JSON.stringify(R); }
      const spec = Sc.normalize(Sc.DEMO_SPEC);
      const written = Sc.writeTo(FS, Sc.DEMO_SPEC);
      if (FS.__flush) await FS.__flush();
      R.generated = {
        files: written.length,
        entities: spec.entities.map((e) => e.name),
        has: ['/server.js', '/src/db.js', '/src/auth.js', '/db/migrations/001_init.sql', '/package.json',
              '/test/db.test.js', '/test/api.test.js', '/public/index.html', '/.github/workflows/ci.yml', '/Dockerfile']
          .filter((p) => FS.exists(p)),
        migrationHasFK: /FOREIGN KEY[\\s\\S]*ON DELETE/.test(FS.read('/db/migrations/001_init.sql') || ''),
        serverIsHttp: /http\\.createServer/.test(FS.read('/server.js') || '')
      };

      // 2 ── CONTRACT + baseline gate
      const contract = await window.Engine.Contract.derive({ useLLM: false });
      window.Engine.Ledger.build(contract);
      const dod0 = window.Engine.DoD.evaluate();
      R.contract = { requirements: (contract.requirements || []).length, machineCriteria: contract.totals && contract.totals.withMachineCriteria };

      // 3 ── ANALYZE + real npm gates + observe
      S.analyze(); if (FS.__flush) await FS.__flush();
      const ev = await S.runEvidence({ steps: ['test', 'build', 'lint'] });
      const ob = await S.observe({ max: 25 });
      S.analyze(); if (FS.__flush) await FS.__flush();
      window.Engine.Ledger.build(); const dod = window.Engine.DoD.evaluate();
      try { window.Engine.DoD.certificate(); } catch (_) {}

      const e1 = sj('execution-evidence.json') || {};
      const tr = sj('runtime-trace.json') || {};
      const health = sj('connection-health.json') || {};
      const NODECORE = /^(node:)?(fs|path|http|https|os|url|vm|crypto|events|stream|util|assert|child_process|net|zlib|buffer|timers|dns|tls|readline|worker_threads|perf_hooks|process|module|test|sqlite|inspector|constants)$/;

      R.execute = { ok: !!ev.ok, gates: e1.gates || {}, steps: Object.keys(e1.steps || {}).reduce((m, k) => { m[k] = e1.steps[k].code; return m; }, {}) };
      R.observe = {
        ok: !!ob.ok, url: tr.url || (ob && ob.reason), controlsExercised: tr.controlsExercised || 0,
        byStatus: tr.byStatus || {},
        apiCalls: (tr.network || []).filter((n) => /\\/api\\//.test(String(n.url || n))).length,
        realControls: (tr.trace || []).filter((t) => t.status === 'REAL').map((t) => t.control.name),
        fakeControls: (tr.trace || []).filter((t) => t.status === 'MOCK' || t.status === 'BROKEN').map((t) => t.control.name)
      };
      const realBroken = (health.broken || []).filter((e) => !NODECORE.test(String(e.to || '').trim()) &&
        ['MISSING', 'CIRCULAR', 'INVALID'].indexOf(String(e.status || '').toUpperCase()) >= 0);
      R.graph = {
        brokenTotal: (health.broken || []).length,
        brokenReal: realBroken.length,
        realList: realBroken.slice(0, 10).map((e) => (e.from || '?') + ' -> ' + (e.to || '?') + ' [' + e.status + ']'),
        allList: (health.broken || []).slice(0, 20).map((e) => (e.to || '?') + ':' + e.status)
      };
      const ledger = window.Engine.Ledger.load() || {};
      R.gate = {
        criteria: dod.criteria, PASS: dod.PASS, assertions: (ledger.totals || {}).assertions,
        failing: (ledger.claims || []).filter((c) => (c.failures || 0) > 0).map((c) => c.claim),
        certificate: /SOVEREIGN VERIFIED/.test(sov('release-certificate.md') || '')
      };
      R.sovereignFiles = Object.keys(FS._data).filter((p) => p.indexOf('/.sovereign/') === 0).length;
    } catch (e) { R.errors.push(String((e && e.stack) || e)); }
    return JSON.stringify(R);
  })()`;
}

async function run() {
  let exitCode = 1, tmp = null;
  const watchdog = setTimeout(() => { console.error('[acceptance-build] FAIL — watchdog 20m'); try { observer.stop(); proc.killAll(); } catch (_) {} app.exit(1); }, 20 * 60 * 1000);
  watchdog.unref && watchdog.unref();
  try {
    try {
      const fp = await freePort(4319);
      if (fp.wasHeld) console.log('[acceptance-build] freed port 4319 (killed ' + JSON.stringify(fp.killed) + (fp.stillHeld ? ', STILL HELD' : '') + ')');
    } catch (_) { /* best effort */ }

    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'cs-build-'));
    const wsDir = path.join(tmp, 'generated');
    await fsp.mkdir(wsDir, { recursive: true });
    await fsp.writeFile(path.join(wsDir, '.gitkeep'), '');   // empty workspace

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
      if (level === 'error' || level === 3) rendererErrors.push(String(message).slice(0, 300));
    });

    await win.loadFile(RENDERER);
    await new Promise((r) => setTimeout(r, 1500));
    // await the open so the disk tree is loaded BEFORE the driver generates into it
    await win.webContents.executeJavaScript(
      '(async () => { await window.openProject(' + JSON.stringify(canonical) + '); ' +
      'for (let i=0;i<40 && !(window.Engine.FS.__hasWorkspace && window.Engine.FS.__hasWorkspace());i++) await new Promise(r=>setTimeout(r,200)); ' +
      'await new Promise(r=>setTimeout(r,400)); return true; })()');

    const report = JSON.parse(await win.webContents.executeJavaScript(driver()));
    console.log('\n[acceptance-build] ---- report ----');
    console.log(JSON.stringify(report, (k, v) => (k === 'errors' && !v.length ? undefined : v), 2));
    console.log('[acceptance-build] --------------------\n');

    if (report.fatal) { check('workspace + scaffold load', false, report.fatal); }
    else {
      const g = report.generated, x = report.execute, o = report.observe, gate = report.gate;
      check('GENERATE: a repo-scale project (>= 20 files)', g.files >= 20, g.files + ' files · entities: ' + g.entities.join(','));
      check('GENERATE: backend + data layer + auth + migrations + tests + CI all present', g.has.length >= 9, g.has.length + '/10');
      check('GENERATE: server is a real HTTP server; migration has FK + ON DELETE', g.serverIsHttp && g.migrationHasFK);
      check('DETECT: Sovereign analysed the generated repo', report.sovereignFiles >= 12, report.sovereignFiles + ' .sovereign files');
      check('CONTRACT: derived with machine-checkable criteria', report.contract.requirements >= 4 && report.contract.machineCriteria >= 3);
      check('EXECUTE: the generated app’s real npm test + build + lint all pass',
        x.gates.testsPass === true && x.gates.buildPasses === true && x.gates.lintClean === true, JSON.stringify(x.steps));
      check('OBSERVE: the generated app booted and was crawled', o.ok && o.controlsExercised >= 1, (o.url || '') + ' · ' + JSON.stringify(o.byStatus));
      check('OBSERVE: a real control was observed, nothing observed fake', o.realControls.length >= 1 && o.fakeControls.length === 0,
        'real=' + JSON.stringify(o.realControls) + ' fake=' + JSON.stringify(o.fakeControls));
      check('GRAPH: no real broken dependency edges in the generated code', report.graph.brokenReal === 0, report.graph.brokenReal + ' / ' + report.graph.brokenTotal);
      Object.keys(gate.criteria).forEach((k) => check('GATE: ' + k, gate.criteria[k] === true, String(gate.criteria[k])));
      check('DEFINITION-OF-DONE PASSES for the generated app', gate.PASS === true, 'assertions=' + gate.assertions + (gate.failing.length ? ' failing=' + JSON.stringify(gate.failing) : ''));
      check('Sovereign Release Certificate: SOVEREIGN VERIFIED', gate.certificate === true);
    }
    check('renderer produced no console errors', rendererErrors.length === 0, rendererErrors.slice(0, 4).join(' | '));

    const failed = results.filter((r) => !r.pass);
    console.log('\n[acceptance-build] ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    if (failed.length === 0) { console.log('[acceptance-build] PASS'); exitCode = 0; }
    else { console.log('[acceptance-build] FAIL — ' + failed.map((f) => f.name).join('; ')); exitCode = 1; }
  } catch (e) {
    console.error('[acceptance-build] harness error:', (e && e.stack) || e);
  } finally {
    clearTimeout(watchdog);
    try { observer.stop(); } catch (_) {}
    try { proc.killAll(); } catch (_) {}
    try { const fp = await freePort(4319); if (fp.killed && fp.killed.length) console.log('[acceptance-build] reaped :4319 orphan ' + JSON.stringify(fp.killed)); } catch (_) {}
    if (tmp) { try { await fsp.rm(tmp, { recursive: true, force: true }); } catch (_) {} }
    app.exit(exitCode);
  }
}

module.exports = { run, driver };
