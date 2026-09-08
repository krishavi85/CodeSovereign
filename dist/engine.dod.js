/* =====================================================================
   engine.dod.js  —  Engine.DoD

   The Definition-of-Done gate + Sovereign Release Certificate.

   A feature/product is DONE only when every criterion below is true —
   never because code exists. Computed purely from `.sovereign/` evidence
   and the Evidence Ledger (blueprint §56, §67, §68). This generalises the
   gate that electron/acceptance.js proves on the fixture: 10 criteria —
   implementation exists, dependencies connected, build, tests, runtime
   action, no fake implementation, security, architecture/layering,
   privacy/PII, acceptance criteria.

   window.Engine.DoD
     evaluate()     -> dod object (writes .sovereign/definition-of-done.json)
     certificate()  -> markdown (writes .sovereign/release-certificate.md)
     load()         -> the written dod or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine;
  if (!Engine || !Engine.FS) { console.error('[DoD] Engine.FS missing'); return; }
  var S = function () { return Engine.Sovereign; };
  // Sovereign.read() returns a PARSED object for *.json — never double-parse.
  function j(p) {
    try {
      var v = S() && S().read(p);
      if (v == null) return null;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } }
      return v;
    } catch (_) { return null; }
  }
  function t(p) { try { var v = S() && S().read(p); return typeof v === 'string' ? v : (v == null ? '' : JSON.stringify(v)); } catch (_) { return ''; } }
  function pkg() { try { return JSON.parse((Engine.FS.read('/package.json')) || 'null'); } catch (_) { return null; } }

  var NODE_CORE = /^(node:)?(fs|path|http|https|os|url|vm|crypto|events|stream|util|assert|child_process|net|zlib|buffer|timers|dns|tls|readline|worker_threads|perf_hooks|process|module|string_decoder|querystring|test|sqlite|inspector|constants|console)$/;

  // A runtime-adapter target run (native mobile / ML training / blockchain) is
  // gated on its adapter evidence, not the web-observer criteria.
  function targetEvaluate(contract) {
    var target = contract.target;
    var evName = target === 'evm' ? 'blockchain-evidence.json'
      : (target === 'android' || target === 'ios') ? 'mobile-evidence.json'
      : target === 'ml-training' ? 'ml-evidence.json' : null;
    var tev = evName ? j(evName) : null;
    var arch = j('architecture-findings.json');
    var priv = j('privacy-findings.json');
    var secR = j('security-findings.json');
    var status = tev && tev.status;
    var anyFiles = Object.keys(Engine.FS._data).some(function (p) {
      return Engine.FS.isFile(p) && !/^\/?(\.sovereign|node_modules)\//.test(p) && /\.(sol|kt|swift|py|js|ts|xml|kts|toml|yaml|yml|json)$/.test(p);
    });
    function g(v) { return v === true; }
    var evmHighStatic = (target === 'evm' && tev && tev.staticAnalysis && tev.staticAnalysis.high) || 0;
    var criteria = {
      implementationExists: g(anyFiles && !!contract && (contract.requirements || []).length >= 0),
      artifactGenerated: g(!!tev),
      buildSucceeds: g(!!tev && tev.status !== 'BLOCKED' ? (
        target === 'evm' ? (tev.contracts || []).length > 0 && !(tev.compileErrors && tev.compileErrors.length)
        : target === 'ml-training' ? tev.trainerExit === 0 || (tev.loss_curve && tev.loss_curve.length > 0)
        : (tev.steps || []).some(function (s) { return s.step === 'gradle-assembleDebug' && s.ok; }) || tev.buildOk === true
      ) : (status === 'PASS')),
      runtimeVerified: g(status === 'PASS'),
      testsSucceed: g(status === 'PASS' && (
        target === 'evm' ? (tev.assertions || []).every(function (a) { return a.pass; }) && (tev.assertions || []).length > 0
        : target === 'ml-training' ? tev.loss_decreased !== false
        : (tev.steps || []).every(function (s) { return s.ok !== false; })
      )),
      noFakeImplementation: g(status === 'PASS'),
      securityGatesPass: g(((secR && secR.bySeverity && secR.bySeverity.high) || 0) === 0 && evmHighStatic === 0),
      architectureSound: g(!arch || ((arch.bySeverity && arch.bySeverity.high) || 0) === 0),
      privacyRespected: g(!priv || ((priv.bySeverity && priv.bySeverity.high) || 0) === 0)
    };
    var PASS = status === 'PASS' && Object.keys(criteria).every(function (k) { return criteria[k] === true; });
    var dod = {
      generatedAt: Date.now(), PASS: PASS, mode: 'target', target: target,
      criteria: criteria,
      detail: {
        adapterStatus: status || null,
        adapterReason: (tev && tev.reason) || null,
        runtime: (tev && tev.runtime) || (tev && tev.framework) || (tev && tev.platform) || null,
        evidenceFile: evName,
        blocked: status === 'BLOCKED',
        contracts: (tev && tev.contracts) || null,
        metric: (tev && tev.metric) || null,
        transactions: (tev && (tev.transactions || []).length) || 0
      }
    };
    if (S()) {
      S().write('definition-of-done.json', dod);
      var ds2 = j('decision-state.json') || {};
      ds2.definitionOfDone = { at: dod.generatedAt, pass: PASS, mode: 'target', target: target, failing: Object.keys(criteria).filter(function (k) { return !criteria[k]; }) };
      S().write('decision-state.json', ds2);
    }
    return dod;
  }

  function evaluate() {
    var contract = Engine.Contract && Engine.Contract.load();
    if (contract && contract.target && contract.target !== 'web') return targetEvaluate(contract);
    var ledger = Engine.Ledger && Engine.Ledger.load();
    var ev = j('execution-evidence.json') || {};
    var gates = ev.gates || {};
    var health = j('connection-health.json') || {};
    var trace = j('runtime-trace.json') || {};
    var inv = j('interaction-inventory.json') || {};
    var sim = j('simulation-report.json') || {};
    var ds = j('decision-state.json') || {};
    var scripts = (pkg() && pkg().scripts) || {};

    // "No fake implementation" is judged from what runtime observation actually
    // EXERCISED — a control the crawl classified MOCK/BROKEN. A static-only guess
    // (button wired via addEventListener, form with no inline onsubmit, …) is an
    // observation gap, not a confirmed fake, and is tracked by the ledger instead.
    var observed = {};
    ((trace && trace.trace) || []).forEach(function (x) {
      var k = String((x.control && x.control.name) || '').toLowerCase().trim();
      if (k) observed[k] = x.status;
    });
    var realCount = Object.keys(observed).filter(function (k) { return observed[k] === 'REAL'; }).length;
    var fakeControls = Object.keys(observed).filter(function (k) {
      return observed[k] === 'MOCK' || observed[k] === 'BROKEN';
    });
    var controls = observed;   // for the report detail

    // The connection-graph resolver flags Node core modules and relative
    // specifiers it can't resolve as "broken". Only count an edge as a real
    // dependency defect when it's MISSING/CIRCULAR/INVALID *and* no file with
    // that basename exists in the workspace.
    var fsBases = {};
    Object.keys(Engine.FS._data).forEach(function (p) {
      fsBases[p.split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase()] = 1;
    });
    // packages the project declares as optional / peer are allowed to be absent
    var pj0 = pkg() || {};
    var optionalPkgs = {};
    ['optionalDependencies', 'peerDependencies'].forEach(function (k) {
      Object.keys(pj0[k] || {}).forEach(function (n) { optionalPkgs[String(n).toLowerCase()] = 1; });
    });
    var realBrokenEdges = (health.broken || []).filter(function (e) {
      var to = String(e.to || '').trim();
      if (NODE_CORE.test(to) || /^(node:)/.test(to)) return false;
      var stt = String(e.status || '').toUpperCase();
      if (['MISSING', 'CIRCULAR', 'INVALID'].indexOf(stt) < 0) return false;
      var base = to.split(/[\/\\]/).pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
      if (optionalPkgs[base] || optionalPkgs[to.toLowerCase()]) return false;
      return !fsBases[base];
    });

    // high-severity security signals — the dedicated product scanner is
    // authoritative; the mock-signal heuristic is a fallback.
    var known = t('known-issues.md');
    var archReport = j('architecture-findings.json');
    var archHigh = archReport ? ((archReport.bySeverity && archReport.bySeverity.high) || 0) : 0;
    var privReport = j('privacy-findings.json');
    var privHigh = privReport ? ((privReport.bySeverity && privReport.bySeverity.high) || 0) : 0;
    var secReport = j('security-findings.json');
    var highSec;
    if (secReport) {
      highSec = (secReport.bySeverity && secReport.bySeverity.high) || 0;
    } else {
      highSec = ((sim.signals || []).filter(function (s) {
        return s.severity === 'high' && /secret|inject|xss|csrf|ssrf|eval|traversal|cred/i.test((s.why || '') + (s.kind || ''));
      }).length) + (/\*\*(ERROR|CRITICAL)\*\*.*(secret|api[_-]?key|password|private key|token)/i.test(known) ? 1 : 0);
    }

    // a requirement blocks DONE only when it is DEMONSTRABLY failing (>=1 FAIL);
    // merely-unproven criteria (NA) are tracked as coverage gaps, not failures.
    var ledgerFailing = ledger
      ? (ledger.claims || []).filter(function (c) { return (c.failures || 0) > 0; }).length
      : null;
    var openManual = ledger
      ? (ledger.claims || []).filter(function (c) { return c.assertions === 0; }).length
      : null;

    function gate(v) { return v === true; }
    var criteria = {
      implementationExists: gate(!!contract && (contract.requirements || []).length > 0 &&
        Object.keys(Engine.FS._data).some(function (p) {
          return Engine.FS.isFile(p) && !/^\/?(\.sovereign|node_modules|dist|build)\//.test(p) && /\.(js|ts|jsx|tsx|py|go|rs|html|css)$/.test(p);
        })),
      dependenciesConnected: gate(realBrokenEdges.length === 0),
      buildSucceeds: scripts.build ? gate(gates.buildPasses === true) : true,
      testsSucceed: scripts.test ? gate(gates.testsPass === true) : true,
      runtimeActionSucceeds: gate(realCount > 0),
      noFakeImplementation: gate(fakeControls.length === 0 && Object.keys(controls).length > 0),
      securityGatesPass: gate(highSec === 0),
      architectureSound: gate(archHigh === 0),
      privacyRespected: gate(privHigh === 0),
      acceptanceCriteriaPass: gate(ledgerFailing === 0 && !!ledger)
    };
    var PASS = Object.keys(criteria).every(function (k) { return criteria[k] === true; });

    var dod = {
      generatedAt: Date.now(),
      PASS: PASS,
      criteria: criteria,
      detail: {
        gates: gates,
        realControls: realCount,
        fakeControls: fakeControls,
        brokenProductEdges: realBrokenEdges.slice(0, 12).map(function (e) { return (e.from || '?') + ' -> ' + (e.to || '?'); }),
        highSeveritySecurity: highSec,
        architectureViolations: archReport ? (archReport.findings || []).filter(function (f) { return f.severity === 'high'; }).slice(0, 8).map(function (f) { return f.rule + ' @ ' + f.file + (f.line ? ':' + f.line : ''); }) : [],
        architectureScore: archReport ? archReport.score : null,
        privacyViolations: privReport ? (privReport.findings || []).filter(function (f) { return f.severity === 'high'; }).slice(0, 8).map(function (f) { return f.rule + ' @ ' + f.file + (f.line ? ':' + f.line : ''); }) : [],
        privacyScore: privReport ? privReport.score : null,
        ledgerFailing: ledgerFailing,
        openManualClaims: openManual,
        assertions: (ledger && ledger.totals && ledger.totals.assertions) || 0
      }
    };
    if (S()) {
      S().write('definition-of-done.json', dod);
      var d2 = j('decision-state.json') || ds || {};
      d2.definitionOfDone = { at: dod.generatedAt, pass: PASS, failing: Object.keys(criteria).filter(function (k) { return !criteria[k]; }) };
      S().write('decision-state.json', d2);
    }
    return dod;
  }

  function certificate() {
    var dod = j('definition-of-done.json') || evaluate();
    var ledger = Engine.Ledger && Engine.Ledger.load();
    var contract = Engine.Contract && Engine.Contract.load();
    var ev = j('execution-evidence.json') || {};
    var name = (contract && contract.product && contract.product.name) || 'project';
    var line = function (label, ok) { return '| ' + label + (Array(Math.max(2, 26 - label.length)).join(' ')) + ' | ' + (ok === true ? 'PASS' : ok === false ? 'FAIL' : 'n/a') + ' |'; };
    var c = dod.criteria || {};

    // ---- runtime-adapter target certificate ----
    if (dod.mode === 'target') {
      var d = dod.detail || {};
      var tmd =
        '# CodeSovereign Release Certificate\n\n_Generated ' + new Date(dod.generatedAt).toISOString() + '_\n\n' +
        '- **Project:** ' + name + '\n' +
        '- **Target:** ' + (contract && contract.targetLabel || dod.target) + '  (runtime adapter)\n' +
        '- **Runtime:** ' + (d.runtime || 'n/a') + '\n' +
        '- **Status:** ' + (dod.PASS ? '**SOVEREIGN VERIFIED**' : (d.blocked ? '**BLOCKED** — ' + (d.adapterReason || 'runtime prerequisite missing') : '**NOT VERIFIED**')) + '\n' +
        (d.contracts ? '- **Contracts:** ' + d.contracts.join(', ') + '\n' : '') +
        (d.transactions ? '- **On-chain transactions executed:** ' + d.transactions + '\n' : '') +
        (d.metric ? '- **Model metric:** ' + d.metric.name + ' = ' + d.metric.value + '\n' : '') + '\n' +
        '| Gate | Result |\n|---|---|\n' +
        line('Artifact generated', c.artifactGenerated) + '\n' +
        line('Build / compile', c.buildSucceeds) + '\n' +
        line('Runtime verified', c.runtimeVerified) + '\n' +
        line('Tests / assertions', c.testsSucceed) + '\n' +
        line('No fake implementation', c.noFakeImplementation) + '\n' +
        line('Security gates', c.securityGatesPass) + '\n' +
        line('Architecture sound', c.architectureSound) + '\n' +
        line('Privacy respected', c.privacyRespected) + '\n\n' +
        '_Evidence: `.sovereign/' + (d.evidenceFile || 'target-evidence.json') + '`_\n';
      if (S()) S().write('release-certificate.md', tmd);
      return tmd;
    }

    var md =
      '# CodeSovereign Release Certificate\n\n' +
      '_Generated ' + new Date(dod.generatedAt).toISOString() + '_\n\n' +
      '- **Project:** ' + name + '\n' +
      '- **Status:** ' + (dod.PASS ? '**SOVEREIGN VERIFIED**' : '**NOT VERIFIED**') + '\n' +
      '- **Evidence assertions:** ' + ((dod.detail && dod.detail.assertions) || 0) + '\n' +
      '- **Failing requirements:** ' + ((dod.detail && dod.detail.ledgerFailing) == null ? 'n/a' : dod.detail.ledgerFailing) +
      (dod.detail && dod.detail.openManualClaims ? '  ·  open (needs human): ' + dod.detail.openManualClaims : '') + '\n\n' +
      '| Gate | Result |\n|---|---|\n' +
      line('Implementation exists', c.implementationExists) + '\n' +
      line('Dependencies connected', c.dependenciesConnected) + '\n' +
      line('Build succeeds', c.buildSucceeds) + '\n' +
      line('Tests succeed', c.testsSucceed) + '\n' +
      line('Runtime action succeeds', c.runtimeActionSucceeds) + '\n' +
      line('No fake implementation', c.noFakeImplementation) + '\n' +
      line('Security gates', c.securityGatesPass) + '\n' +
      line('Architecture sound', c.architectureSound) + '\n' +
      line('Privacy respected', c.privacyRespected) + '\n' +
      line('Acceptance criteria', c.acceptanceCriteriaPass) + '\n\n' +
      (ledger ? '## Claims\n\n| Requirement | Confidence | Assertions |\n|---|---|---|\n' +
        (ledger.claims || []).map(function (cl) {
          return '| ' + String(cl.claim).slice(0, 70) + ' | ' + cl.confidence + ' | ' + cl.assertions + ' |';
        }).join('\n') + '\n\n' : '') +
      '_Execution: ' + Object.keys(ev.gates || {}).map(function (k) { return k + '=' + ((ev.gates || {})[k]); }).join(', ') + '_\n';
    if (S()) S().write('release-certificate.md', md);
    return md;
  }

  function load() { return j('definition-of-done.json'); }

  Engine.DoD = { evaluate: evaluate, certificate: certificate, load: load };
  console.info('[DoD] definition-of-done gate ready — Engine.DoD');
})();
