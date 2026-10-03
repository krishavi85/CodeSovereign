/* =====================================================================
   engine.audit.js  —  Engine.Audit   (blueprint §54)

   The completion auditor: a per-dimension % that is rolled up from the
   REAL `.sovereign/` evidence — not from the plan. Each dimension's score
   comes from the artifact that actually measured it (the Evidence Ledger,
   execution-evidence, runtime-trace, the security / a11y / perf / quality
   scans, the delivery manifest). No evidence for a dimension → it is
   reported as "unmeasured", never silently 100%.

   window.Engine.Audit
     run()   -> { overall, dimensions:[{ name, pct, weight, basis, measured }], … }
                (also writes .sovereign/completion-audit.json + .md)
     load()  -> the written audit or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function j(p) {
    try { var v = S() && S().read(p); if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
    catch (_) { return null; }
  }
  function pct01(b) { return b ? 100 : 0; }
  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

  var WEIGHTS = {
    'Requirements': 0.25,
    'Build': 0.12,
    'Tests': 0.15,
    'Runtime': 0.13,
    'Security': 0.08,
    'Accessibility': 0.06,
    'Performance': 0.05,
    'Code Quality': 0.06,
    'Documentation': 0.05,
    'Delivery': 0.05
  };

  function requirementsDim() {
    var l = j('evidence-ledger.json');
    if (!l || !l.totals || !l.totals.requirements) return { measured: false, pct: 0, basis: 'no evidence ledger — run Engine.Ledger.build()' };
    var t = l.totals;
    // verified = full credit, partial = half
    var score = ((t.verified || 0) + 0.5 * (t.partial || 0)) / t.requirements * 100;
    return { measured: true, pct: clamp(score), basis: (t.verified || 0) + ' verified / ' + (t.partial || 0) + ' partial of ' + t.requirements + ' requirements (evidence-ledger.json)' };
  }
  function buildDim() {
    var e = j('execution-evidence.json');
    if (!e || !e.gates || e.gates.buildPasses == null) {
      var dod = j('definition-of-done.json');
      if (dod && dod.criteria && dod.criteria.buildSucceeds != null) return { measured: true, pct: pct01(dod.criteria.buildSucceeds), basis: 'definition-of-done.json#buildSucceeds' };
      return { measured: false, pct: 0, basis: 'no build execution evidence (needs the desktop app / a runtime)' };
    }
    return { measured: true, pct: pct01(e.gates.buildPasses), basis: 'execution-evidence.json#gates.buildPasses' };
  }
  function testsDim() {
    var e = j('execution-evidence.json');
    if (!e || !e.gates) return { measured: false, pct: 0, basis: 'no test execution evidence' };
    var g = e.gates;
    if (g.testsPass == null) return { measured: false, pct: 0, basis: 'tests not run' };
    var pass = e.test && e.test.pass != null ? e.test.pass : null;
    var fail = e.test && e.test.fail != null ? e.test.fail : null;
    if (pass != null && (pass + (fail || 0)) > 0) {
      return { measured: true, pct: clamp(pass / (pass + (fail || 0)) * 100), basis: pass + '/' + (pass + (fail || 0)) + ' generated tests pass (execution-evidence.json)' };
    }
    return { measured: true, pct: pct01(g.testsPass), basis: 'execution-evidence.json#gates.testsPass' };
  }
  function runtimeDim() {
    var tr = j('runtime-trace.json');
    if (!tr || !Array.isArray(tr.trace) || !tr.trace.length) return { measured: false, pct: 0, basis: 'the app was not observed running (needs the desktop app)' };
    var total = tr.trace.length;
    var real = tr.trace.filter(function (t) { return t.status === 'REAL'; }).length;
    var fake = tr.trace.filter(function (t) { return t.status === 'MOCK' || t.status === 'BROKEN'; }).length;
    var score = total ? (real - fake) / total * 100 : 0;
    return { measured: true, pct: clamp(score), basis: real + ' controls observed REAL, ' + fake + ' fake, of ' + total + ' (runtime-trace.json)' };
  }
  function scoreDim(file, key, label) {
    var r = j(file);
    if (!r) return { measured: false, pct: 0, basis: 'no ' + label + ' scan (' + file + ')' };
    if (typeof r.score === 'number') return { measured: true, pct: clamp(r.score), basis: label + ' score ' + r.score + '/100 (' + file + ')' };
    return { measured: false, pct: 0, basis: label + ' scan present but no score' };
  }
  function perfDim() {
    var p = j('perf-findings.json') || j('perf-report.json');
    if (!p) {
      var dod = j('definition-of-done.json');
      if (dod && dod.criteria && dod.criteria.performanceHealthy != null) return { measured: true, pct: pct01(dod.criteria.performanceHealthy), basis: 'definition-of-done.json#performanceHealthy' };
      return { measured: false, pct: 0, basis: 'no performance evidence' };
    }
    if (p.healthy != null) return { measured: true, pct: p.healthy ? 100 : 40, basis: 'perf-findings.json#healthy=' + p.healthy };
    if (p.leak != null) return { measured: true, pct: p.leak ? 30 : 100, basis: 'perf-findings.json#leak=' + p.leak };
    return { measured: false, pct: 0, basis: 'performance evidence present but inconclusive' };
  }
  function qualityDim() {
    var q = j('quality-findings.json');
    if (!q) return { measured: false, pct: 0, basis: 'code-quality scan not run (Engine.Quality.scan())' };
    if (q.pass) return { measured: true, pct: q.findings && q.findings.length ? 90 : 100, basis: (q.findings || []).length + ' notes, within policy (quality-findings.json)' };
    var s = q.bySeverity || {};
    return { measured: true, pct: clamp(100 - (s.serious || 0) * 20 - (s.moderate || 0) * 6 - (s.low || 0) * 1), basis: (s.serious || 0) + ' serious + ' + (s.moderate || 0) + ' moderate findings (quality-findings.json)' };
  }
  function docsDim() {
    var need = ['/README.md'];
    var nice = ['/docs/DEVELOPMENT.md', '/docs/DECISIONS.md', '/CHANGELOG.md', '/RELEASE_NOTES.md', '/docs/API.md'];
    var f = Engine.FS;
    if (!f) return { measured: false, pct: 0, basis: 'no FS' };
    var have = need.filter(function (p) { return f.exists(p); }).length + nice.filter(function (p) { return f.exists(p); }).length;
    var max = need.length + nice.length;
    if (!need.every(function (p) { return f.exists(p); })) return { measured: true, pct: clamp(have / max * 100), basis: 'README missing' };
    return { measured: true, pct: clamp(have / max * 100), basis: have + '/' + max + ' project docs present' };
  }
  function deliveryDim() {
    var m = j('delivery/manifest.json') || j('../delivery/manifest.json');
    var f = Engine.FS;
    var hasDelivery = f && Object.keys(f._data || {}).some(function (p) { return p.indexOf('/delivery/') === 0; });
    if (m && m.files) return { measured: true, pct: 100, basis: (m.files || []).length + ' files in the delivery archive (delivery/manifest.json)' };
    if (hasDelivery) return { measured: true, pct: 80, basis: 'a /delivery bundle exists (no manifest)' };
    var cert = S() && S().read('release-certificate.md');
    if (cert && /SOVEREIGN VERIFIED/.test(cert)) return { measured: true, pct: 60, basis: 'a release certificate exists; delivery archive not assembled' };
    return { measured: false, pct: 0, basis: 'no delivery bundle assembled (Engine.Delivery.write())' };
  }

  function run() {
    var dims = {
      'Requirements': requirementsDim(),
      'Build': buildDim(),
      'Tests': testsDim(),
      'Runtime': runtimeDim(),
      'Security': scoreDim('security-findings.json', 'score', 'security'),
      'Accessibility': scoreDim('a11y-findings.json', 'score', 'accessibility'),
      'Performance': perfDim(),
      'Code Quality': qualityDim(),
      'Documentation': docsDim(),
      'Delivery': deliveryDim()
    };
    var rows = Object.keys(dims).map(function (name) {
      var d = dims[name];
      return { name: name, weight: WEIGHTS[name], pct: d.pct, measured: d.measured, basis: d.basis };
    });
    // overall: weighted average over MEASURED dimensions only, then scaled by
    // coverage (how much of the total weight we could actually measure)
    var measuredWeight = rows.filter(function (r) { return r.measured; }).reduce(function (a, r) { return a + r.weight; }, 0);
    var weightedScore = rows.filter(function (r) { return r.measured; }).reduce(function (a, r) { return a + r.pct * r.weight; }, 0);
    var coverage = clamp(measuredWeight * 100);
    var overall = measuredWeight > 0 ? clamp(weightedScore / measuredWeight) : 0;
    var unmeasured = rows.filter(function (r) { return !r.measured; }).map(function (r) { return r.name; });

    var report = {
      generatedAt: Date.now(),
      capability: 'completion-audit',
      overall: overall,
      evidenceCoverage: coverage,
      dimensions: rows,
      unmeasured: unmeasured,
      summary: 'Overall ' + overall + '% complete against real evidence (' + coverage + '% of dimensions measured' +
        (unmeasured.length ? '; unmeasured: ' + unmeasured.join(', ') : '') + ').'
    };
    if (S()) {
      S().write('completion-audit.json', report);
      var md = '# Completion Audit\n\n_' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        '**Overall: ' + overall + '%** — evidence coverage ' + coverage + '%\n\n' +
        '| Dimension | % | Weight | Basis |\n|---|---|---|---|\n' +
        rows.map(function (r) { return '| ' + r.name + ' | ' + (r.measured ? r.pct + '%' : '—') + ' | ' + Math.round(r.weight * 100) + '% | ' + r.basis + ' |'; }).join('\n') + '\n';
      S().write('completion-audit.md', md);
    }
    return report;
  }

  function load() { return j('completion-audit.json'); }

  Engine.Audit = { run: run, load: load, WEIGHTS: WEIGHTS };
  console.info('[Audit] evidence-backed completion auditor ready — Engine.Audit');
})();
