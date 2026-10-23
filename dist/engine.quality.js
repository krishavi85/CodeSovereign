/* =====================================================================
   engine.quality.js  —  Engine.Quality   (blueprint §51)

   Configurable code-quality governance. A policy (defaults, or
   `.sovereign/quality-policy.json`) sets thresholds; scan() checks every
   generated JS file against it and writes `.sovereign/quality-findings.json`.
   When the policy has `"gate": true` (or the contract asks for code-quality
   governance) Engine.DoD reads it as a blocking criterion.

     - max function length / file length
     - cyclomatic-complexity estimate per function
     - max parameters per function
     - no `console.*` in production code (configurable)
     - no bare TODO / FIXME without a ticket ref
     - no circular imports        (via Engine.GraphValidate)
     - no dead exports            (via Engine.GraphValidate)

   window.Engine.Quality
     DEFAULT_POLICY
     policy()            -> the effective policy
     scan(opts?)         -> findings object (also writes the evidence file)
     load()              -> the written findings or null
     gateActive()        -> bool  (does DoD treat this as blocking?)
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  var DEFAULT_POLICY = {
    maxFunctionLines: 60,
    maxFileLines: 400,
    maxComplexity: 12,
    maxParams: 5,
    allowConsole: false,          // console.warn/error are always allowed
    allowTodo: false,
    noCircularDeps: true,
    noDeadCode: true,
    // paths that are exempt (generated vendor runtimes, migrations, tests)
    exclude: ['/public/vendor/', '/node_modules/', '/db/migrations/', '/.sovereign/', '/dist/'],
    gate: false                   // informational unless explicitly turned on
  };

  function sovJSON(p) {
    try { var v = S() && S().read(p); if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
    catch (_) { return null; }
  }

  function policy() {
    var p = sovJSON('quality-policy.json') || {};
    var out = Object.assign({}, DEFAULT_POLICY, p);
    // the contract can turn the gate on without a policy file
    try {
      var c = Engine.Contract && Engine.Contract.load && Engine.Contract.load();
      if (c && /code[- ]?quality (gate|governance|policy|budget|standard|enforc)|complexity budget|enforce .{0,25}lint|dead[- ]code (gate|check|policy)|maximum function (length|size)|strict lint(ing)? (gate|policy)/i.test(JSON.stringify(c))) out.gate = true;
    } catch (_) {}
    if (!Array.isArray(out.exclude)) out.exclude = DEFAULT_POLICY.exclude;
    return out;
  }

  function gateActive() { return !!policy().gate; }

  function jsFiles(pol) {
    var f = FS();
    if (!f || !f._data) return [];
    return Object.keys(f._data)
      .filter(function (p) { return /\.(js|mjs)$/.test(p) && f.isFile(p); })
      .filter(function (p) { return !(pol.exclude || []).some(function (x) { return p.indexOf(x) >= 0; }); })
      .filter(function (p) { return !/\.(test|spec)\.(js|mjs)$/.test(p); });
  }

  // cheap cyclomatic-complexity estimate: 1 + branch/decision points
  function complexityOf(body) {
    var pts = (body.match(/\b(if|for|while|case|catch)\b/g) || []).length
      + (body.match(/&&|\|\||\?\s*[^.]/g) || []).length
      + (body.match(/\.(then|catch)\s*\(/g) || []).length;
    return 1 + pts;
  }

  // find function-ish spans and measure them (heuristic, no parser)
  function functionsIn(src) {
    var out = [];
    var re = /(?:^|[\s=:(,])(?:async\s+)?function\s*([A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*\{|(?:^|[\s=:(,])(?:async\s*)?\(([^)]*)\)\s*=>\s*\{|([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      var start = m.index + m[0].indexOf('{', m[0].length - m[0].length >= 0 ? 0 : 0);
      // find matching brace
      var open = src.indexOf('{', m.index);
      if (open < 0) continue;
      var depth = 0, i = open, end = -1;
      for (; i < src.length && i < open + 20000; i++) {
        var ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) continue;
      var body = src.slice(open, end + 1);
      var name = m[1] || m[4] || '(anonymous)';
      var params = (m[2] || m[3] || m[5] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var lines = (body.match(/\n/g) || []).length + 1;
      out.push({ name: name, lines: lines, params: params.length, complexity: complexityOf(body), at: m.index });
      re.lastIndex = open + 1;   // allow nested matches
    }
    return out;
  }

  function scan(opts) {
    opts = opts || {};
    var pol = policy();
    var findings = [];
    var files = jsFiles(pol);
    var perFile = {};

    files.forEach(function (p) {
      var src = FS().read(p) || '';
      var fileLines = (src.match(/\n/g) || []).length + 1;
      var fileFindings = [];
      if (fileLines > pol.maxFileLines) {
        fileFindings.push({ rule: 'file-too-long', impact: 'moderate', detail: fileLines + ' lines (limit ' + pol.maxFileLines + ')' });
      }
      // console usage (warn/error always allowed — they are the log path)
      if (!pol.allowConsole) {
        var cons = (src.match(/console\.(log|info|debug|trace)\s*\(/g) || []).length;
        if (cons) fileFindings.push({ rule: 'no-console', impact: 'low', detail: cons + ' console.log/info/debug call(s)' });
      }
      if (!pol.allowTodo) {
        var todos = (src.match(/\/\/\s*(TODO|FIXME|XXX|HACK)\b(?![^\n]*#\d)/gi) || []).length;
        if (todos) fileFindings.push({ rule: 'no-todo', impact: 'low', detail: todos + ' TODO/FIXME without a ticket ref' });
      }
      functionsIn(src).forEach(function (fn) {
        if (fn.lines > pol.maxFunctionLines) fileFindings.push({ rule: 'function-too-long', impact: fn.lines > 2 * pol.maxFunctionLines ? 'serious' : 'moderate', fn: fn.name, detail: fn.lines + ' lines (limit ' + pol.maxFunctionLines + ')' });
        if (fn.complexity > pol.maxComplexity) fileFindings.push({ rule: 'complexity', impact: fn.complexity > 2 * pol.maxComplexity ? 'serious' : 'moderate', fn: fn.name, detail: 'cyclomatic ~' + fn.complexity + ' (limit ' + pol.maxComplexity + ')' });
        if (fn.params > pol.maxParams) fileFindings.push({ rule: 'too-many-params', impact: 'low', fn: fn.name, detail: fn.params + ' params (limit ' + pol.maxParams + ')' });
      });
      if (fileFindings.length) { perFile[p] = fileFindings; fileFindings.forEach(function (x) { findings.push(Object.assign({ file: p }, x)); }); }
    });

    // circular deps + dead code from the graph validator
    var circular = 0, deadExports = 0;
    try {
      if (Engine.GraphValidate && Engine.GraphValidate.run) {
        var gv = Engine.GraphValidate.run();
        (gv.edges || []).forEach(function (e) {
          if (e.status === 'CIRCULAR' && pol.noCircularDeps) { circular++; findings.push({ file: e.from, rule: 'circular-import', impact: 'serious', detail: 'circular import with ' + e.to }); }
          if (e.status === 'UNUSED' && pol.noDeadCode) { deadExports++; if (deadExports <= 20) findings.push({ file: e.from, rule: 'dead-export', impact: 'low', detail: 'export "' + e.to + '" is never imported' }); }
        });
      }
    } catch (_) {}

    var bySeverity = findings.reduce(function (a, f) { a[f.impact] = (a[f.impact] || 0) + 1; return a; }, {});
    // the gate fails on any 'serious' finding, or when moderate findings exceed the budget
    var seriousCount = bySeverity.serious || 0;
    var moderateCount = bySeverity.moderate || 0;
    var pass = seriousCount === 0 && moderateCount <= (pol.moderateBudget != null ? pol.moderateBudget : 6);

    var report = {
      generatedAt: Date.now(),
      capability: 'code-quality',
      policy: pol,
      gate: pol.gate,
      filesScanned: files.length,
      findings: findings,
      bySeverity: bySeverity,
      circularImports: circular,
      deadExports: deadExports,
      pass: pass,
      summary: pass
        ? (findings.length ? findings.length + ' minor code-quality note(s), within budget' : 'clean against the policy')
        : (seriousCount + ' serious + ' + moderateCount + ' moderate code-quality finding(s) — over budget')
    };
    if (S()) S().write('quality-findings.json', report);
    return report;
  }

  function load() { return sovJSON('quality-findings.json'); }

  Engine.Quality = { DEFAULT_POLICY: DEFAULT_POLICY, policy: policy, scan: scan, load: load, gateActive: gateActive };
  console.info('[Quality] configurable code-quality governance ready — Engine.Quality');
})();
