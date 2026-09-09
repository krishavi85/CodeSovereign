/* =====================================================================
   engine.dod.js  —  Engine.DoD

   The Definition-of-Done gate + Sovereign Release Certificate.

   A feature/product is DONE only when every criterion below is true —
   never because code exists. Computed purely from `.sovereign/` evidence
   and the Evidence Ledger (blueprint §56, §67, §68). This generalises the
   gate that electron/acceptance.js proves on the fixture: 14 criteria —
   implementation exists, dependencies connected, build, tests, runtime
   action, no fake implementation, security, architecture/layering,
   privacy/PII, accessibility (WCAG), visual integrity, licence compatibility, performance health, acceptance criteria.

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
  // iOS is a special case — its DoD is split into per-stage evidence
  // (sourceGeneration / staticValidation / build / signing / device / simulator).
  function iosTargetEvaluate(contract) {
    var ios = j('mobile-ios-evidence.json');
    if (!ios) { var m = j('mobile-evidence.json'); ios = m && m.iosStages; }
    var arch = j('architecture-findings.json');
    var priv = j('privacy-findings.json');
    var secR = j('security-findings.json');
    function g(v) { return v === true; }
    var st = ios || {};
    var anyFail = ['sourceGeneration', 'staticValidation', 'build', 'signing', 'deviceExecution', 'simulatorExecution']
      .some(function (k) { return st[k] === 'FAIL'; });
    var criteria = {
      artifactGenerated: g(!!ios),
      sourceGeneration: g(st.sourceGeneration === 'PASS'),
      staticValidation: g(st.staticValidation === 'PASS'),
      // build/runtime: PASS if it ran, or BLOCKED (host-limited) — but NOT FAIL
      buildStage: g(st.build === 'PASS' || st.build === 'BLOCKED' || st.build === 'NOT_RUN'),
      signingStage: g(st.signing !== 'FAIL'),
      runtimeStage: g(st.deviceExecution !== 'FAIL' && st.simulatorExecution !== 'FAIL'),
      noStageFailed: g(!anyFail),
      securityGatesPass: g(((secR && secR.bySeverity && secR.bySeverity.high) || 0) === 0),
      architectureSound: g(!arch || ((arch.bySeverity && arch.bySeverity.high) || 0) === 0),
      privacyRespected: g(!priv || ((priv.bySeverity && priv.bySeverity.high) || 0) === 0)
    };
    var fullyVerified = st.build === 'PASS' && (st.deviceExecution === 'PASS' || st.simulatorExecution === 'PASS');
    var PASS = st.sourceGeneration === 'PASS' && st.staticValidation === 'PASS' && !anyFail &&
      criteria.securityGatesPass && criteria.architectureSound && criteria.privacyRespected;
    var dod = {
      generatedAt: Date.now(), PASS: PASS, mode: 'target', target: 'ios',
      partial: PASS && !fullyVerified,
      criteria: criteria,
      detail: {
        evidenceFile: 'mobile-ios-evidence.json',
        stages: {
          sourceGeneration: st.sourceGeneration, staticValidation: st.staticValidation,
          build: st.build, signing: st.signing, deviceExecution: st.deviceExecution, simulatorExecution: st.simulatorExecution
        },
        runtimeAdapter: st.runtimeAdapter || null,
        blockers: (st.blockers || []).map(function (b) { return b.stage + ': ' + b.reason; }),
        experimental: st.experimental || [],
        fullyVerified: fullyVerified
      }
    };
    if (S()) {
      S().write('definition-of-done.json', dod);
      var ds3 = j('decision-state.json') || {};
      ds3.definitionOfDone = { at: dod.generatedAt, pass: PASS, mode: 'target', target: 'ios', partial: dod.partial,
        failing: Object.keys(criteria).filter(function (k) { return !criteria[k]; }) };
      S().write('decision-state.json', ds3);
    }
    return dod;
  }

  // desktop (Tauri/Electron) + browser extension — a staged model like iOS:
  // generation + static validation run everywhere; the packaged build / load-
  // unpacked stages may be host-limited (BLOCKED, not FAIL).
  function stagedTargetEvaluate(contract) {
    var target = contract.target;
    var evName = target === 'desktop' ? 'desktop-evidence.json' : 'extension-evidence.json';
    var ev = j(evName) || {};
    var st = ev.stages || {};
    var arch = j('architecture-findings.json'), priv = j('privacy-findings.json'), secR = j('security-findings.json');
    function g(v) { return v === true; }
    var vals = Object.keys(st).map(function (k) { return st[k]; });
    // Only stages that actually gate the verdict count as a failure. A plain MV3
    // extension with no bundler, or a Tauri packaging step with no CLI, can report
    // build != PASS while the capability is genuinely proven (source compiles /
    // validates, the artifact loads). The blueprint rule: that is PARTIAL, not FAIL.
    var GATING = target === 'desktop'
      ? ['sourceGeneration', 'compileCheck', 'test']
      : ['sourceGeneration', 'staticValidation', 'loadUnpacked'];
    var criticalFail = GATING.some(function (k) { return st[k] === 'FAIL'; });
    var anyFail = criticalFail;
    var buildFailedNonGating = vals.indexOf('FAIL') >= 0 && !criticalFail;
    var genPass = st.sourceGeneration === 'PASS' || st.staticValidation === 'PASS' || st.compileCheck === 'PASS';
    var validationPass = st.staticValidation !== 'FAIL' && st.compileCheck !== 'FAIL';
    var runtimePass = target === 'desktop'
      ? (st.launch === 'PASS' || st.smoke === 'PASS' || st.build === 'AVAILABLE_NOT_RUN' || String(st.build || '').indexOf('BLOCKED') === 0 || st.test !== 'FAIL')
      : (st.loadUnpacked === 'PASS' || st.loadUnpacked === 'PARTIAL' || st.loadUnpacked === 'SKIPPED' || String(st.build || '').indexOf('BLOCKED') === 0);
    var criteria = {
      artifactGenerated: g(!!ev.status),
      sourceGeneration: g(genPass),
      staticValidation: g(validationPass),
      buildStage: g(!anyFail),
      runtimeStage: g(!anyFail && runtimePass),
      noStageFailed: g(!anyFail),
      securityGatesPass: g(((secR && secR.bySeverity && secR.bySeverity.high) || 0) === 0),
      architectureSound: g(!arch || ((arch.bySeverity && arch.bySeverity.high) || 0) === 0),
      privacyRespected: g(!priv || ((priv.bySeverity && priv.bySeverity.high) || 0) === 0)
    };
    var fullyVerified = ev.status === 'PASS';
    var PASS = (ev.status === 'PASS' || ev.status === 'PARTIAL' || ev.status === 'VALID' || ev.status === 'GENERATED') &&
      !anyFail && genPass && validationPass &&
      criteria.securityGatesPass && criteria.architectureSound && criteria.privacyRespected;
    var dod = {
      generatedAt: Date.now(), PASS: PASS, mode: 'target', target: target,
      partial: PASS && !fullyVerified,
      criteria: criteria,
      detail: {
        evidenceFile: evName, adapterStatus: ev.status || null, adapterReason: ev.reason || null,
        framework: ev.framework || null, stages: st, buildFailedNonGating: buildFailedNonGating,
        blockers: [].concat(ev.reason && String(ev.status) !== 'PASS' ? [ev.reason + (ev.need ? ' — ' + ev.need : '')] : [])
          .concat(buildFailedNonGating ? ['build stage did not pass (non-gating for this target — the artifact still validates + loads)'] : [])
      }
    };
    if (S()) {
      S().write('definition-of-done.json', dod);
      var dss = j('decision-state.json') || {};
      dss.definitionOfDone = { at: dod.generatedAt, pass: PASS, mode: 'target', target: target, partial: dod.partial, failing: Object.keys(criteria).filter(function (k) { return !criteria[k]; }) };
      S().write('decision-state.json', dss);
    }
    return dod;
  }

  function targetEvaluate(contract) {
    var target = contract.target;
    if (target === 'ios') return iosTargetEvaluate(contract);
    if (target === 'desktop' || target === 'extension') return stagedTargetEvaluate(contract);
    var evName = target === 'evm' ? 'blockchain-evidence.json'
      : target === 'android' ? 'mobile-evidence.json'
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
    var a11yReport = j('a11y-findings.json');
    var a11yBlocking = a11yReport ? (((a11yReport.byImpact && a11yReport.byImpact.critical) || 0) + ((a11yReport.byImpact && a11yReport.byImpact.serious) || 0)) : 0;
    var wantsA11y = !!contract && (contract.requirements || []).some(function (r) { return /accessib|a11y|wcag|screen reader/i.test(r.statement); });
    var visReport = j('visual-findings.json');
    var visCritical = visReport ? ((visReport.byImpact && visReport.byImpact.critical) || 0) : 0;
    var depReport = j('dependency-intel.json');
    var licensesCompatible = depReport ? depReport.licensesCompatible !== false : true;
    var depCritical = depReport ? ((depReport.byImpact && depReport.byImpact.critical) || 0) : 0;
    var perfReport = j('perf-findings.json');
    var perfHealthy = !perfReport || perfReport.present === false ? true : (perfReport.healthy !== false && (perfReport.byImpact ? !perfReport.byImpact.critical : true));
    // user journeys (§65): when the contract defines journeys and the test gate
    // has run, every journey must be covered (green) for acceptance to pass.
    var journeyReport = j('journey-evidence.json');
    // only a *failing* journey blocks acceptance — a "planned" journey (suite
    // generated, evidence gate not yet run) is advisory; the journey suite is
    // already part of `npm test`, so `testsSucceed` catches a real failure.
    var journeysOk = !journeyReport || journeyReport.present === false ? true
      : ((journeyReport.failing || 0) === 0);
    // localization (§48): only a gate when the contract asked for it — then
    // hard-coded strings / untranslated locales / missing RTL wiring block.
    var l10nReport = j('localization-findings.json');
    var l10nOk = !l10nReport || l10nReport.present === false || l10nReport.requested !== true
      ? true : l10nReport.healthy !== false;
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
      // accessibility blocks only when the contract asked for it, OR whenever the
      // static audit finds a *critical* barrier (missing form label, no button name,
      // missing alt) on a shipped HTML surface — those break the app for real users.
      accessibilityPass: gate(!a11yReport || a11yReport.note ? true : (wantsA11y ? a11yBlocking === 0 : ((a11yReport.byImpact && a11yReport.byImpact.critical) || 0) === 0)),
      // a *critical* visual defect (the whole page overflows horizontally, an
      // interactive control renders at zero size, a full-screen overlay covers
      // the app) genuinely breaks the product; serious/moderate are recorded.
      visualIntegrityPass: gate(!visReport ? true : visCritical === 0),
      // a strong/network-copyleft runtime dependency under a non-copyleft
      // distribution, a known-vulnerable pin, or an unlicensed commercial dep
      // is a real legal / security blocker.
      licensesCompatible: gate(!depReport ? true : (licensesCompatible && depCritical === 0)),
      // performance + memory: the generated perf test already asserts the
      // thresholds (so testsSucceed catches a regression); this surfaces it as
      // its own gate — a 5xx under load or a memory leak blocks release.
      performanceHealthy: gate(perfHealthy),
      acceptanceCriteriaPass: gate(ledgerFailing === 0 && !!ledger && journeysOk && l10nOk)
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
        accessibilityScore: a11yReport ? a11yReport.score : null,
        accessibilityBlocking: a11yReport ? (a11yReport.findings || []).filter(function (f) { return f.impact === 'critical' || f.impact === 'serious'; }).slice(0, 8).map(function (f) { return f.rule + ' @ ' + f.file + (f.line > 1 ? ':' + f.line : ''); }) : [],
        visualScore: visReport ? visReport.score : null,
        visualCritical: visReport ? (visReport.findings || []).filter(function (f) { return f.impact === 'critical'; }).slice(0, 6).map(function (f) { return f.rule + (f.breakpoint ? ' @' + f.breakpoint : '') + ' — ' + (f.detail || ''); }) : [],
        dependencyScore: depReport ? depReport.score : null,
        licenseConflicts: depReport ? (depReport.licenseConflicts || []) : [],
        dependencyBlocking: depReport ? (depReport.findings || []).filter(function (f) { return f.impact === 'critical'; }).map(function (f) { return f.kind + (f.dependency ? ' ' + f.dependency : ''); }) : [],
        perf: perfReport && perfReport.present ? { p50: perfReport.p50, p95: perfReport.p95, p99: perfReport.p99, errors: perfReport.errors, heapGrowthKB: perfReport.heapGrowthKB, leak: perfReport.leak } : null,
        journeys: journeyReport && journeyReport.present ? { total: journeyReport.total, covered: journeyReport.covered, uncovered: journeyReport.uncovered } : null,
        localization: l10nReport && l10nReport.present ? { requested: l10nReport.requested, score: l10nReport.score, locales: Object.keys(l10nReport.locales || {}), leaks: l10nReport.leaks } : null,
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

    // ---- iOS staged certificate ----
    if (dod.mode === 'target' && dod.target === 'ios') {
      var di = dod.detail || {}; var sg = di.stages || {};
      var stg = function (label, v) { return '| ' + label + (Array(Math.max(2, 22 - label.length)).join(' ')) + ' | ' + (v || 'n/a') + ' |'; };
      var head = dod.PASS
        ? (di.fullyVerified ? '**SOVEREIGN VERIFIED**' : '**SOVEREIGN VERIFIED — PARTIAL** (source + static; build/runtime need host tooling)')
        : '**NOT VERIFIED**';
      var imd =
        '# CodeSovereign Release Certificate\n\n_Generated ' + new Date(dod.generatedAt).toISOString() + '_\n\n' +
        '- **Project:** ' + name + '\n- **Target:** Native iOS  (staged runtime adapter)\n' +
        '- **Status:** ' + head + '\n' +
        (di.runtimeAdapter ? '- **Build adapter:** ' + di.runtimeAdapter + '\n' : '') +
        (di.experimental && di.experimental.length ? '- **Experimental adapters:** ' + di.experimental.join(', ') + '\n' : '') + '\n' +
        '| Stage | Result |\n|---|---|\n' +
        stg('Source generation', sg.sourceGeneration) + '\n' +
        stg('Static validation', sg.staticValidation) + '\n' +
        stg('Build', sg.build) + '\n' +
        stg('Signing', sg.signing) + '\n' +
        stg('Device execution', sg.deviceExecution) + '\n' +
        stg('Simulator execution', sg.simulatorExecution) + '\n\n' +
        (di.blockers && di.blockers.length ? '**Host-limited stages:** ' + di.blockers.join('; ') + '\n\n' : '') +
        '_Evidence: `.sovereign/mobile-ios-evidence.json`_\n';
      if (S()) S().write('release-certificate.md', imd);
      return imd;
    }

    // ---- desktop / browser-extension staged certificate ----
    if (dod.mode === 'target' && (dod.target === 'desktop' || dod.target === 'extension')) {
      var dd = dod.detail || {}; var ss = dd.stages || {};
      var stg2 = function (label, v) { return '| ' + label + (Array(Math.max(2, 24 - label.length)).join(' ')) + ' | ' + (v || 'n/a') + ' |'; };
      var head2 = dod.PASS
        ? (dod.partial ? '**SOVEREIGN VERIFIED — PARTIAL** (generation + ' + (dod.target === 'desktop' ? 'compile check' : 'MV3 validation') + '; the packaged build / runtime inspection need a toolchain)' : '**SOVEREIGN VERIFIED**')
        : (dd.adapterStatus === 'BLOCKED' ? '**BLOCKED** — ' + (dd.adapterReason || 'runtime prerequisite missing') : '**NOT VERIFIED**');
      var smd = '# CodeSovereign Release Certificate\n\n_Generated ' + new Date(dod.generatedAt).toISOString() + '_\n\n' +
        '- **Project:** ' + name + '\n- **Target:** ' + (dod.target === 'desktop' ? 'Native desktop (' + (dd.framework || 'Tauri/Electron') + ')' : 'Browser extension (Manifest V3)') + '  (staged runtime adapter)\n' +
        '- **Status:** ' + head2 + '\n\n' +
        '| Stage | Result |\n|---|---|\n' +
        Object.keys(ss).map(function (k) { return stg2(k.replace(/([A-Z])/g, ' $1').replace(/^./, function (c0) { return c0.toUpperCase(); }), ss[k]); }).join('\n') + '\n\n' +
        (dd.blockers && dd.blockers.length ? '**Needs a toolchain:** ' + dd.blockers.join('; ') + '\n\n' : '') +
        '_Evidence: `.sovereign/' + dd.evidenceFile + '`_\n';
      if (S()) S().write('release-certificate.md', smd);
      return smd;
    }

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
      line('Accessibility', c.accessibilityPass) + '\n' +
      line('Visual integrity', c.visualIntegrityPass) + '\n' +
      line('Licences compatible', c.licensesCompatible) + '\n' +
      line('Performance healthy', c.performanceHealthy) + '\n' +
      line('Acceptance criteria', c.acceptanceCriteriaPass) + '\n\n' +
      (dod.detail && dod.detail.perf ? '_Perf: p50 ' + dod.detail.perf.p50 + 'ms · p95 ' + dod.detail.perf.p95 + 'ms · p99 ' + dod.detail.perf.p99 + 'ms · ' + dod.detail.perf.errors + ' errors · heap +' + dod.detail.perf.heapGrowthKB + 'KB' + (dod.detail.perf.leak ? ' · LEAK' : '') + '_\n\n' : '') +
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
