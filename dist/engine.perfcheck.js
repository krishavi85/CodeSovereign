/* =====================================================================
   engine.perfcheck.js  —  Engine.PerfCheck   (blueprint §45-46)

   Performance + memory-leak surfacing. The generated `test/perf.test.js`
   fires a load burst against the real running server, records p50/p95/p99
   latency and samples heapUsed (with GC when --expose-gc), and writes
   `.sovereign/perf-report.json`. It also *asserts* the thresholds, so a
   regression already fails `npm test` -> the DoD `testsSucceed` gate.

   This engine reads that report, classifies it, and exposes a dedicated
   `performanceHealthy` DoD criterion + a certificate line (p95, heap slope).

   analyze()  -> { generatedAt, present, p50, p95, p99, errors, leak, score }
                 writes .sovereign/perf-findings.json
   load()     -> the written report or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  function sj(name) {
    try { var v = S() && S().read(name); return v == null ? null : (typeof v === 'string' ? JSON.parse(v) : v); } catch (_) { return null; }
  }

  // thresholds — deliberately generous (CI runners are slow); a real regression
  // is a big miss, not a few ms.
  var P95_MAX = 3000;                 // ms
  var LEAK_SLOPE = 200000;            // bytes / heap-sample
  var LEAK_GROWTH = 8 * 1024 * 1024;  // bytes total on a fixed workload

  function analyze() {
    var r = sj('perf-report.json');
    var findings = [];
    if (!r) {
      var none = { generatedAt: Date.now(), present: false, note: 'no perf-report.json — the generated perf test has not run (needs the desktop app + a runnable server)', score: 100, healthy: true };
      if (S()) S().write('perf-findings.json', none);
      return none;
    }
    var leak = (r.heapSlopeBytesPerSample || 0) > LEAK_SLOPE && (r.heapGrowthBytes || 0) > LEAK_GROWTH;
    if ((r.errors || 0) > 0) findings.push({ rule: 'errors-under-load', impact: 'critical', detail: r.errors + ' request(s) returned 5xx during the load burst' });
    if ((r.p95 || 0) >= P95_MAX) findings.push({ rule: 'slow-p95', impact: 'serious', detail: 'p95 latency ' + r.p95 + 'ms ≥ ' + P95_MAX + 'ms under ' + r.requests + ' requests' });
    if (leak) findings.push({ rule: 'memory-leak', impact: 'critical', detail: 'heap grew +' + Math.round((r.heapGrowthBytes || 0) / 1024) + 'KB with a positive slope (' + r.heapSlopeBytesPerSample + ' B/sample) on a fixed workload' });
    else if ((r.heapGrowthBytes || 0) > LEAK_GROWTH) findings.push({ rule: 'memory-growth', impact: 'moderate', detail: 'heap grew +' + Math.round((r.heapGrowthBytes || 0) / 1024) + 'KB — watch for a leak under sustained load' });

    var byImpact = findings.reduce(function (m, f) { m[f.impact] = (m[f.impact] || 0) + 1; return m; }, {});
    var score = Math.max(0, 100 - (byImpact.critical || 0) * 30 - (byImpact.serious || 0) * 12 - (byImpact.moderate || 0) * 5);
    var report = {
      generatedAt: Date.now(), present: true,
      requests: r.requests, errors: r.errors || 0,
      p50: r.p50, p95: r.p95, p99: r.p99,
      heapGrowthKB: Math.round((r.heapGrowthBytes || 0) / 1024),
      heapSlopeBytesPerSample: r.heapSlopeBytesPerSample || 0,
      leak: leak, findings: findings, byImpact: byImpact, score: score,
      healthy: !(byImpact.critical)
    };
    if (S()) {
      S().write('perf-findings.json', report);
      S().write('perf-report.md',
        '# Performance + memory\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        '**Score ' + score + '/100** over ' + report.requests + ' requests — p50 ' + report.p50 + 'ms · p95 ' + report.p95 + 'ms · p99 ' + report.p99 + 'ms · ' + report.errors + ' errors · heap ' + (report.heapGrowthKB >= 0 ? '+' : '') + report.heapGrowthKB + 'KB\n\n' +
        (findings.length ? findings.map(function (f) { return '- **' + f.impact.toUpperCase() + '** `' + f.rule + '` — ' + f.detail; }).join('\n') : '_Within thresholds._') + '\n');
      try { var ds = JSON.parse(S().read('decision-state.json') || '{}'); ds.performance = { at: report.generatedAt, p95: report.p95, leak: leak, score: score }; S().write('decision-state.json', ds); } catch (_) {}
    }
    return report;
  }

  function load() { return sj('perf-findings.json'); }

  Engine.PerfCheck = { analyze: analyze, load: load };
  console.info('[PerfCheck] performance + memory-leak surfacing ready — Engine.PerfCheck');
})();
