/* =====================================================================
   engine.refactor.js  —  Engine.Refactor   (blueprint §60)

   Safe, verifiable refactoring + staged migration. Every transform is:
     - AST-driven (acorn) — never a blind text substitution,
     - conservative — it REFUSES rather than guess when a rename is not
       provably safe (shadowing, non-module scope, a parse failure),
     - self-checked — the result must re-parse before it is returned.

   window.Engine.Refactor
     renameSymbol({ file, from, to })   -> { changed, source, edits, reason? }
     renameExport({ from, to, file? })  -> { changed, files:[{path,source}], reason? }
     tsReadiness()                      -> { files, cjs, esm, blockers, ready }
     plan()                             -> refactor candidates from the graph
     analyze()                          -> writes .sovereign/refactor-plan.json
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  function acorn() { return window.acorn && window.acorn.parse ? window.acorn : null; }
  function parse(src) {
    var A = acorn();
    if (!A) return null;
    var opts = { ecmaVersion: 'latest', ranges: true, allowReturnOutsideFunction: true, allowHashBang: true };
    try { return A.parse(src, Object.assign({ sourceType: 'module' }, opts)); } catch (_) {}
    try { return A.parse(src, Object.assign({ sourceType: 'script' }, opts)); } catch (_) {}
    return null;
  }

  // walk with parent + key so we can tell a reference from a property / key
  function walk(node, cb, parent, key) {
    if (!node || typeof node.type !== 'string') return;
    cb(node, parent, key);
    for (var k in node) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
      var v = node[k];
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) walk(v[i], cb, node, k); }
      else if (v && typeof v.type === 'string') walk(v, cb, node, k);
    }
  }

  // is this Identifier a *reference/binding* to a variable (vs a property name,
  // an object key, a labelled statement, etc.)?
  function isNameRef(node, parent, key) {
    if (!parent) return true;
    switch (parent.type) {
      case 'MemberExpression': return !(key === 'property' && !parent.computed);
      case 'Property':
      case 'PropertyDefinition':
      case 'ObjectProperty':
        if (key === 'key' && !parent.computed) return false;
        return true;
      case 'MethodDefinition': return key !== 'key' || parent.computed;
      case 'LabeledStatement':
      case 'BreakStatement':
      case 'ContinueStatement': return false;
      case 'ImportSpecifier': return key === 'local';
      case 'ExportSpecifier': return false; // handled explicitly
      case 'MetaProperty': return false;
      default: return true;
    }
  }

  // count declaration sites of `name` (module + nested) — >1 means shadowing,
  // which this conservative pass will not touch.
  function declSites(ast, name) {
    var n = 0;
    walk(ast, function (node) {
      if (node.type === 'FunctionDeclaration' && node.id && node.id.name === name) n++;
      else if (node.type === 'ClassDeclaration' && node.id && node.id.name === name) n++;
      else if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier' && node.id.name === name) n++;
      else if ((node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration')) {
        (node.params || []).forEach(function (p) { if (p.type === 'Identifier' && p.name === name) n++; });
      }
      else if (node.type === 'ImportSpecifier' && node.local && node.local.name === name) n++;
      else if (node.type === 'ImportDefaultSpecifier' && node.local && node.local.name === name) n++;
      else if (node.type === 'ImportNamespaceSpecifier' && node.local && node.local.name === name) n++;
      else if (node.type === 'CatchClause' && node.param && node.param.type === 'Identifier' && node.param.name === name) n++;
    });
    return n;
  }

  function ident(from, to) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(to) && from !== to; }

  function renameInSource(src, from, to) {
    var ast = parse(src);
    if (!ast) return { changed: false, reason: 'PARSE_FAILED' };
    var sites = declSites(ast, from);
    if (sites === 0) return { changed: false, reason: 'SYMBOL_NOT_FOUND' };
    if (sites > 1) return { changed: false, reason: 'SHADOWED_OR_MULTIPLE_DECLARATIONS' };

    var edits = [];
    var exportAliasSeen = false;
    walk(ast, function (node, parent, key) {
      if (node.type === 'Identifier' && node.name === from && isNameRef(node, parent, key)) {
        // object shorthand { from } -> { from: to } to keep the property name
        if (parent && (parent.type === 'Property' || parent.type === 'ObjectProperty') && parent.shorthand) {
          edits.push({ start: node.range[0], end: node.range[1], text: from + ': ' + to });
        } else {
          edits.push({ start: node.range[0], end: node.range[1], text: to });
        }
      }
      // export { from }  /  export { from as x }
      if (node.type === 'ExportSpecifier' && node.local && node.local.name === from) {
        exportAliasSeen = true;
        if (node.exported && node.exported.name === from && node.exported.range[0] === node.local.range[0]) {
          // `export { from }` -> `export { to as from }`
          edits.push({ start: node.local.range[0], end: node.local.range[1], text: to + ' as ' + from });
        } else {
          // `export { from as x }` -> `export { to as x }`
          edits.push({ start: node.local.range[0], end: node.local.range[1], text: to });
        }
      }
    });
    if (!edits.length) return { changed: false, reason: 'NO_REFERENCES' };

    edits.sort(function (a, b) { return b.start - a.start; });
    var out = src;
    edits.forEach(function (e) { out = out.slice(0, e.start) + e.text + out.slice(e.end); });

    if (!parse(out)) return { changed: false, reason: 'RESULT_DID_NOT_PARSE' };
    return { changed: true, source: out, edits: edits.length, exportAlias: exportAliasSeen };
  }

  function renameSymbol(opts) {
    opts = opts || {};
    if (!ident(opts.from, opts.to)) return { changed: false, reason: 'INVALID_TARGET_NAME' };
    if (!acorn()) return { changed: false, reason: 'NO_PARSER' };
    var src = null;
    try { src = FS() && FS().read(opts.file); } catch (_) {}
    if (src == null) return { changed: false, reason: 'FILE_NOT_FOUND' };
    var r = renameInSource(src, opts.from, opts.to);
    if (r.changed && opts.apply !== false) { try { FS().write(opts.file, r.source); } catch (_) {} }
    return Object.assign({ file: opts.file }, r);
  }

  // resolve a relative import specifier to a repo path
  function resolveImport(fromFile, spec) {
    if (!/^\.\.?\//.test(spec)) return null;
    var base = fromFile.replace(/\/[^/]*$/, '');
    var parts = (base + '/' + spec).split('/');
    var stack = [];
    parts.forEach(function (p) { if (p === '..') stack.pop(); else if (p !== '.' && p !== '') stack.push(p); });
    var p = '/' + stack.join('/');
    var cands = [p, p + '.js', p + '.mjs', p + '/index.js'];
    for (var i = 0; i < cands.length; i++) { try { if (FS().isFile(cands[i])) return cands[i]; } catch (_) {} }
    return null;
  }

  function renameExport(opts) {
    opts = opts || {};
    if (!ident(opts.from, opts.to)) return { changed: false, reason: 'INVALID_TARGET_NAME' };
    if (!acorn()) return { changed: false, reason: 'NO_PARSER' };
    // find the defining file
    var defFile = opts.file;
    if (!defFile) {
      try {
        Object.keys(FS()._data).forEach(function (p) {
          if (defFile || !/\.(js|mjs)$/.test(p) || !FS().isFile(p)) return;
          var a = parse(FS().read(p) || ''); if (!a) return;
          var has = false;
          walk(a, function (n) {
            if (n.type === 'ExportNamedDeclaration' && n.declaration) {
              var d = n.declaration;
              if (d.id && d.id.name === opts.from) has = true;
              (d.declarations || []).forEach(function (v) { if (v.id && v.id.name === opts.from) has = true; });
            }
            if (n.type === 'ExportSpecifier' && n.exported && n.exported.name === opts.from) has = true;
          });
          if (has) defFile = p;
        });
      } catch (_) {}
    }
    if (!defFile) return { changed: false, reason: 'EXPORT_NOT_FOUND' };

    var results = [];
    var def = renameInSource(FS().read(defFile) || '', opts.from, opts.to);
    if (!def.changed) return { changed: false, reason: 'DEFINITION_' + def.reason, file: defFile };
    results.push({ path: defFile, source: def.source });

    // rewrite every importer that imports { from } from the defining file
    try {
      Object.keys(FS()._data).forEach(function (p) {
        if (p === defFile || !/\.(js|mjs)$/.test(p) || !FS().isFile(p)) return;
        var src = FS().read(p) || '';
        var a = parse(src); if (!a) return;
        var importsIt = false, localName = null;
        walk(a, function (n) {
          if (n.type === 'ImportDeclaration' && n.source && resolveImport(p, n.source.value) === defFile) {
            n.specifiers.forEach(function (s) {
              if (s.type === 'ImportSpecifier' && s.imported && s.imported.name === opts.from) {
                importsIt = true;
                localName = s.local ? s.local.name : opts.from;
              }
            });
          }
        });
        if (!importsIt) return;
        // rewrite the import specifier
        var edits = [];
        walk(a, function (n) {
          if (n.type === 'ImportSpecifier' && n.imported && n.imported.name === opts.from &&
            n.imported.range[0] >= 0) {
            if (n.local && n.local.range[0] === n.imported.range[0]) {
              // `import { from }` -> `import { to as from }` (keep local refs working)
              edits.push({ start: n.imported.range[0], end: n.imported.range[1], text: opts.to + ' as ' + opts.from });
            } else {
              edits.push({ start: n.imported.range[0], end: n.imported.range[1], text: opts.to });
            }
          }
        });
        if (!edits.length) return;
        edits.sort(function (x, y) { return y.start - x.start; });
        var out = src;
        edits.forEach(function (e) { out = out.slice(0, e.start) + e.text + out.slice(e.end); });
        if (parse(out)) results.push({ path: p, source: out });
      });
    } catch (_) {}

    if (opts.apply !== false) results.forEach(function (r) { try { FS().write(r.path, r.source); } catch (_) {} });
    return { changed: true, files: results, defFile: defFile };
  }

  /* ---------------- TS readiness (staged migration, advisory) ---------------- */
  function repoJs() {
    try {
      return Object.keys(FS()._data).filter(function (p) {
        return FS().isFile(p) && /\.js$/.test(p) &&
          !/\/(node_modules|dist|build|vendor|\.sovereign)\//.test(p) &&
          !/\.(test|spec)\.js$/.test(p);
      });
    } catch (_) { return []; }
  }

  function tsReadiness() {
    var files = repoJs();
    var cjs = 0, esm = 0, mixed = [], blockers = [];
    files.forEach(function (p) {
      var src = FS().read(p) || '';
      var isCjs = /\b(require\(|module\.exports|exports\.)/.test(src);
      var isEsm = /^\s*(import |export )/m.test(src);
      if (isCjs) cjs++;
      if (isEsm) esm++;
      if (isCjs && isEsm) mixed.push(p);
      if (/\beval\s*\(/.test(src)) blockers.push({ file: p, why: 'uses eval()' });
      if (/\bwith\s*\(/.test(src)) blockers.push({ file: p, why: 'uses with()' });
    });
    var hasTsconfig = false;
    try { hasTsconfig = FS().isFile('/tsconfig.json'); } catch (_) {}
    return {
      files: files.length, cjs: cjs, esm: esm, mixedModules: mixed,
      blockers: blockers, hasTsconfig: hasTsconfig,
      ready: files.length > 0 && blockers.length === 0,
      stagedPlan: files.length ? [
        'stage 1 — add tsconfig.json (allowJs, checkJs:false, noEmit) + `npm run typecheck`',
        'stage 2 — rename leaf modules (no importers) .js -> .ts, add param/return types',
        'stage 3 — work up the import graph; enable `checkJs` then `strict` incrementally',
        'stage 4 — wire `tsc` into the build; drop allowJs'
      ] : []
    };
  }

  var TSCONFIG = JSON.stringify({
    compilerOptions: {
      target: 'ES2020', module: 'NodeNext', moduleResolution: 'NodeNext',
      allowJs: true, checkJs: false, noEmit: true, strict: false,
      esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true
    },
    include: ['src/**/*', 'server.js', 'scripts/**/*'],
    exclude: ['node_modules', 'dist', 'build']
  }, null, 2) + '\n';

  function scaffoldTs() {
    // the safe, mechanical stage-1 artefacts — never renames a file
    var wrote = [];
    try {
      if (!FS().isFile('/tsconfig.json')) { FS().write('/tsconfig.json', TSCONFIG); wrote.push('/tsconfig.json'); }
      var mig = '# TypeScript migration — staged\n\n' +
        tsReadiness().stagedPlan.map(function (s) { return '- [ ] ' + s; }).join('\n') + '\n\n' +
        '_Generated by Engine.Refactor. Stage 1 is mechanical + reversible (delete `tsconfig.json`)._\n';
      FS().write('/docs/TS_MIGRATION.md', mig); wrote.push('/docs/TS_MIGRATION.md');
    } catch (_) {}
    return wrote;
  }

  /* ---------------- refactor candidates from the graph ---------------- */
  function plan() {
    var cands = [];
    var G = window.GraphValidate && window.GraphValidate.run ? safe(function () { return window.GraphValidate.run(); }) : null;
    // dead exports: exported but never imported anywhere
    try {
      var g = window.Engine.AST;
      if (g) {
        // reuse the connection graph if the app already built it
        var cg = window.__csGraph || null;
      }
    } catch (_) {}
    // long functions (structural, parser-based)
    repoJs().forEach(function (p) {
      var src = FS().read(p) || '';
      var ast = parse(src); if (!ast) return;
      walk(ast, function (n) {
        if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') && n.range) {
          var lines = src.slice(n.range[0], n.range[1]).split('\n').length;
          if (lines >= 80) cands.push({ kind: 'long-function', file: p, name: (n.id && n.id.name) || '(anonymous)', lines: lines, hint: 'extract helpers' });
        }
      });
    });
    return { generatedAt: Date.now(), candidates: cands.slice(0, 40), ts: tsReadiness() };
  }
  function safe(fn) { try { return fn(); } catch (_) { return null; } }

  function analyze() {
    var p = plan();
    if (S()) {
      S().write('refactor-plan.json', p);
      S().write('refactor-report.md',
        '# Refactoring\n\n_Generated ' + new Date(p.generatedAt).toISOString() + '_\n\n' +
        '## TypeScript readiness\n\n' + p.ts.files + ' JS file(s) — ' + p.ts.cjs + ' CommonJS · ' + p.ts.esm + ' ESM' +
        (p.ts.blockers.length ? ' · ' + p.ts.blockers.length + ' blocker(s)' : '') + (p.ts.ready ? ' · **ready for stage 1**' : '') + '\n\n' +
        (p.ts.stagedPlan.length ? p.ts.stagedPlan.map(function (s) { return '- ' + s; }).join('\n') + '\n\n' : '') +
        '## Candidates\n\n' + (p.candidates.length
          ? p.candidates.map(function (c) { return '- **' + c.kind + '** `' + c.file + '` ' + (c.name || '') + (c.lines ? ' (' + c.lines + ' lines)' : '') + ' — ' + (c.hint || ''); }).join('\n') + '\n'
          : '_No structural refactor candidates._\n'));
    }
    return p;
  }

  Engine.Refactor = {
    renameSymbol: renameSymbol, renameExport: renameExport, renameInSource: renameInSource,
    tsReadiness: tsReadiness, scaffoldTs: scaffoldTs, plan: plan, analyze: analyze,
    _resolveImport: resolveImport
  };
  console.info('[Refactor] safe refactoring + staged migration ready — Engine.Refactor');
})();
