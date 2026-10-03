/* =====================================================================
   engine.conventions.js  —  Engine.Conventions   (blueprint §57)

   Sovereign memory captured arch decisions, the design language and
   rejected approaches — but the project's *coding conventions* were only
   ever implicit. This makes them explicit and machine-readable, so a
   later generation or repair pass writes code that matches what is
   already there instead of imposing a house style.

   infer()      -> scans the workspace source (JS/TS + the package.json +
                   the test files) and derives the conventions actually in
                   use: indentation, quotes, semicolons, module system,
                   declaration keyword, string-in-UI routing, file- and
                   function-name casing, the test framework, the async
                   style, the error-handling shape, the import style.
   analyze()    -> writes .sovereign/conventions.json + conventions.md and
                   folds a one-line summary into decision-state.json.
   load()       -> the record or null
   rules()      -> a flat list of "<key>: <value>" a generator can honour

   Every value carries the sample size it was inferred from and a
   confidence; a field with too little signal is reported as `unknown`
   rather than guessed.
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function FS() { return Engine.FS; }
  function fread(p) { try { return (FS() && FS().read(p)) || ''; } catch (_) { return ''; } }
  function fjson(p) { try { var r = fread(p); return r ? JSON.parse(r) : null; } catch (_) { return null; } }
  function listFiles(re) {
    try {
      return Object.keys((FS() && FS()._data) || {}).filter(function (p) {
        return FS().isFile(p) && re.test(p) && !/\/(node_modules|\.sovereign|\.git|dist|build|vendor|coverage)\//.test(p);
      });
    } catch (_) { return []; }
  }

  // pick the dominant value of a tally, with confidence + total
  function dominant(tally) {
    var keys = Object.keys(tally);
    var total = keys.reduce(function (n, k) { return n + tally[k]; }, 0);
    if (!total) return { value: 'unknown', confidence: 0, total: 0, tally: tally };
    keys.sort(function (a, b) { return tally[b] - tally[a]; });
    var top = keys[0];
    return { value: top, confidence: Math.round(tally[top] / total * 100) / 100, total: total, tally: tally };
  }

  // strip block + line comments and string/template literals so we count
  // real code, not prose inside quotes
  function decomment(src) {
    return String(src)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')          // keep http:// etc.
      .replace(/`(?:\\.|[^`\\])*`/g, '``')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/"(?:\\.|[^"\\])*"/g, '""');
  }

  function baseName(p) { return String(p).replace(/^.*\//, ''); }
  function stem(p) { return baseName(p).replace(/\.[a-z0-9]+$/i, '').replace(/\.(test|spec|d)$/i, ''); }

  function casingOf(name) {
    if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(name)) return 'kebab-case';
    if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(name)) return 'snake_case';
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
    if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) return 'camelCase';
    if (/^[a-z0-9]+$/.test(name)) return 'lowercase';
    return null;
  }

  function infer() {
    var jsFiles = listFiles(/\.(js|mjs|cjs|jsx|ts|tsx)$/);
    var pkg = fjson('/package.json') || {};

    var indent = { tab: 0, '2': 0, '4': 0 };
    var quote = { single: 0, double: 0 };
    var semi = { yes: 0, no: 0 };
    var mod = { esm: 0, cjs: 0 };
    var decl = { const: 0, let: 0, var: 0 };
    var asyncStyle = { 'async-await': 0, 'promise-then': 0, callbacks: 0 };
    var errShape = { 'try-catch': 0, 'promise-catch': 0, 'error-first-cb': 0 };
    var strictDirective = { yes: 0, no: 0 };
    var fileCase = {};
    var fnCase = {};
    var sampled = 0;

    jsFiles.forEach(function (p) {
      var raw = fread(p);
      if (!raw || raw.length > 400000) return;
      sampled++;
      var code = decomment(raw);
      var lines = raw.split('\n');

      // indentation — first indented line of each file wins one vote
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^(\t+|  +)\S/);
        if (m) {
          if (m[1][0] === '\t') indent.tab++;
          else if (m[1].length % 4 === 0) indent['4']++;
          else indent['2']++;
          break;
        }
      }

      // quote style (from the original, decommented removed the literals)
      var sq = (raw.match(/'/g) || []).length;
      var dq = (raw.match(/"/g) || []).length;
      if (sq || dq) (sq >= dq ? quote.single++ : quote.double++);

      // semicolons: lines ending in `;` vs statement-ish lines with none
      var withSemi = (code.match(/;\s*$/gm) || []).length;
      var stmtNoSemi = (code.match(/^[ \t]*(?:return|const|let|var|[\w.$\]]+\s*=|[\w.$]+\([^)]*\))[^;{}\n]*[^;{}\s]\s*$/gm) || []).length;
      if (withSemi + stmtNoSemi >= 3) (withSemi >= stmtNoSemi ? semi.yes++ : semi.no++);

      // module system
      if (/\b(import\s.+\sfrom\s|export\s+(default|const|function|class|\{)|import\s*\()/.test(code)) mod.esm++;
      else if (/\b(require\(|module\.exports|exports\.\w+\s*=)/.test(code)) mod.cjs++;

      // declaration keyword
      decl.const += (code.match(/\bconst\s/g) || []).length;
      decl.let += (code.match(/\blet\s/g) || []).length;
      decl.var += (code.match(/\bvar\s/g) || []).length;

      // async style
      asyncStyle['async-await'] += (code.match(/\bawait\s/g) || []).length;
      asyncStyle['promise-then'] += (code.match(/\.then\s*\(/g) || []).length;
      asyncStyle.callbacks += (code.match(/function\s*\([^)]*\berr(or)?\b[^)]*\)/g) || []).length;

      // error handling
      errShape['try-catch'] += (code.match(/\btry\s*\{/g) || []).length;
      errShape['promise-catch'] += (code.match(/\.catch\s*\(/g) || []).length;
      errShape['error-first-cb'] += (code.match(/\(\s*err(or)?\s*,/g) || []).length;

      // 'use strict'
      (/^[\s]*['"]use strict['"]/.test(raw) ? strictDirective.yes++ : strictDirective.no++);

      // file-name casing (skip index / dotfiles)
      var s = stem(p);
      if (s && s !== 'index' && s[0] !== '.') { var fc = casingOf(s); if (fc) fileCase[fc] = (fileCase[fc] || 0) + 1; }

      // function-name casing
      (code.match(/\bfunction\s+([A-Za-z_$][\w$]*)/g) || []).forEach(function (d) {
        var nm = d.replace(/\bfunction\s+/, '');
        var c = casingOf(nm); if (c) fnCase[c] = (fnCase[c] || 0) + 1;
      });
      (code.match(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g) || []).forEach(function (d) {
        var nm = (d.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)/) || [])[1];
        var c = nm && casingOf(nm); if (c) fnCase[c] = (fnCase[c] || 0) + 1;
      });
    });

    // test framework
    var testFw = 'unknown';
    var td = Object.assign({}, pkg.devDependencies || {}, pkg.dependencies || {});
    if (td.vitest) testFw = 'vitest';
    else if (td.jest) testFw = 'jest';
    else if (td.mocha) testFw = 'mocha';
    else if (td.ava) testFw = 'ava';
    else if (td.tap || td.tape) testFw = 'tap';
    else if (listFiles(/\.(test|spec)\.(js|ts|mjs)$/).some(function (p) { return /require\(['"]node:test['"]\)|from ['"]node:test['"]/.test(fread(p)); })) testFw = 'node:test';
    else if (listFiles(/\.(test|spec)\.(js|ts)$/).length) testFw = 'custom';

    // UI string routing (does the frontend send user-facing strings through t()/i18n?)
    var uiFiles = listFiles(/\/public\/[^/]+\.(js|html)$/).filter(function (p) { return !/\/i18n\.js$/.test(p); });
    var uiRouted = 0, uiTotal = 0;
    uiFiles.forEach(function (p) {
      uiTotal++;
      if (/\bt\(\s*['"][a-z][\w.]*['"]|data-i18n=/.test(fread(p))) uiRouted++;
    });

    var lang = listFiles(/\.(ts|tsx)$/).length > jsFiles.length / 2 ? 'typescript' : 'javascript';

    var conv = {
      language: lang,
      indent: dominant(indent),
      quotes: dominant({ single: quote.single, double: quote.double }),
      semicolons: dominant(semi),
      moduleSystem: dominant(mod),
      declarationKeyword: dominant(decl),
      strictDirective: dominant(strictDirective),
      fileNaming: dominant(fileCase),
      functionNaming: dominant(fnCase),
      asyncStyle: dominant(asyncStyle),
      errorHandling: dominant(errShape),
      testFramework: testFw,
      uiStringRouting: uiTotal ? { value: uiRouted === uiTotal ? 'i18n' : (uiRouted ? 'mixed' : 'inline'), routed: uiRouted, total: uiTotal } : { value: 'n/a', routed: 0, total: 0 },
      sampledFiles: sampled
    };
    return conv;
  }

  // a flat, generator-consumable list — only the fields we are confident about
  function rules() {
    var c = load() || analyze();
    if (!c || !c.sampledFiles) return [];
    var out = [];
    var pick = function (label, field, min) {
      var f = c[field];
      if (f && f.value && f.value !== 'unknown' && (f.confidence == null || f.confidence >= (min || 0.6))) out.push(label + ': ' + f.value);
    };
    pick('indent', 'indent', 0.5);
    pick('quotes', 'quotes', 0.55);
    pick('semicolons', 'semicolons', 0.6);
    pick('module system', 'moduleSystem', 0.6);
    pick('declaration keyword', 'declarationKeyword', 0.5);
    pick('file naming', 'fileNaming', 0.55);
    pick('function naming', 'functionNaming', 0.55);
    pick('async style', 'asyncStyle', 0.55);
    pick('error handling', 'errorHandling', 0.5);
    if (c.testFramework && c.testFramework !== 'unknown') out.push('test framework: ' + c.testFramework);
    if (c.uiStringRouting && c.uiStringRouting.value === 'i18n') out.push('UI strings: routed through i18n t()');
    if (c.language) out.push('language: ' + c.language);
    return out;
  }

  function mdReport(c) {
    var row = function (k, f) {
      if (!f) return '| ' + k + ' | — | — |';
      var v = (f.value != null ? f.value : '—');
      var conf = f.confidence != null ? Math.round(f.confidence * 100) + '% of ' + (f.total || 0) : (f.total != null ? f.total + ' sample(s)' : '—');
      return '| ' + k + ' | `' + v + '` | ' + conf + ' |';
    };
    return [
      '# Coding conventions', '',
      '_Inferred by `Engine.Conventions` from ' + (c.sampledFiles || 0) + ' source file(s). ' +
      'These are the conventions **already in the code** — a later generation or repair pass should match them._', '',
      '| Convention | Value | Confidence |', '|---|---|---|',
      row('Language', { value: c.language }),
      row('Indentation', c.indent),
      row('Quotes', c.quotes),
      row('Semicolons', c.semicolons),
      row('Module system', c.moduleSystem),
      row('Declaration keyword', c.declarationKeyword),
      row("'use strict'", c.strictDirective),
      row('File naming', c.fileNaming),
      row('Function naming', c.functionNaming),
      row('Async style', c.asyncStyle),
      row('Error handling', c.errorHandling),
      row('Test framework', { value: c.testFramework }),
      row('UI string routing', c.uiStringRouting),
      ''
    ].join('\n');
  }

  function analyze() {
    var c = infer();
    var record = { generatedAt: Date.now(), conventions: c, rules: null };
    if (!c.sampledFiles) {
      record.note = 'no source files in the workspace — nothing to infer';
      if (S()) S().write('conventions.json', record);
      return c;
    }
    // rules() reads load(); write first so it does not recurse
    if (S()) S().write('conventions.json', record);
    record.rules = rules();
    if (S()) {
      S().write('conventions.json', record);
      S().write('conventions.md', mdReport(c));
      try {
        var ds = JSON.parse(S().read('decision-state.json') || '{}');
        ds.conventions = {
          at: record.generatedAt,
          summary: [
            c.indent && c.indent.value, c.quotes && (c.quotes.value + '-quote'),
            c.semicolons && ('semi:' + c.semicolons.value), c.moduleSystem && c.moduleSystem.value,
            c.testFramework
          ].filter(Boolean).join(' · '),
          rules: record.rules
        };
        S().write('decision-state.json', ds);
      } catch (_) {}
    }
    return c;
  }

  function load() {
    try {
      var v = S() && S().read('conventions.json');
      v = (v && typeof v === 'string') ? JSON.parse(v) : v;
      return (v && v.conventions) ? v.conventions : null;
    } catch (_) { return null; }
  }

  Engine.Conventions = { infer: infer, analyze: analyze, load: load, rules: rules, _dominant: dominant, _casingOf: casingOf };
  console.info('[Conventions] coding-convention capture ready — Engine.Conventions');
})();
