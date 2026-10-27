/* =====================================================================
 * engine.repointel.js  —  Engine.RepoIntel   (native agent, M5)
 *
 * Repository intelligence for the native coding agent: a symbol index, an
 * import/dependency graph and goal-driven context selection. DOM-free; it only
 * needs a file accessor, so it runs in the renderer, in the eval harness and
 * in tests alike.
 *
 *   var idx = Engine.RepoIntel.create({ list: () => ['/a.js', ...], read: (p) => text|null });
 *   idx.refresh()                       -> parses new/changed files only (cached by content signature)
 *   idx.findSymbol('slugify')           -> [{ name, kind, path, line, exported, signature }]
 *   idx.references('slugify')           -> [{ path, line, text }]   (word-bounded, definition lines excluded)
 *   idx.deps('/src/format.js')          -> { imports: [{spec, path|null, names}], importedBy: [paths], external: [pkg] }
 *   idx.rank(goal, { limit, focus })    -> [{ path, score, reasons: [] }]
 *   idx.contextBlock(goal, { maxChars, focus }) -> string for a prompt
 *   idx.impacted(changedPaths)          -> [{ path, because: [changed paths it imports] }]
 *
 * Languages: JavaScript/TypeScript and Python get symbols + imports; every
 * other file is still listed and searchable. Parsing is line/regex based by
 * design: it is a navigation aid for a model, not a compiler, and it never
 * throws on malformed input.
 * ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  var SKIP = /(^|\/)(node_modules|\.git|\.sovereign|\.codesovereign|\.data|coverage|\.next|\.cache|__pycache__|\.venv|venv)(\/|$)/;
  var DIST = /(^|\/)(dist|build|out)\/.*\.(min\.js|map)$|\.min\.(js|css)$|\.map$/;
  var JS_EXT = /\.(?:[cm]?jsx?|tsx?)$/;
  var PY_EXT = /\.py$/;
  var TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;
  var MAX_FILE = 200000, MAX_FILES = 2500;
  var STOP = {};
  ('the a an and or of to in on for with from by at is are was be it this that these those as into not no do does did make makes made add adds fix fixes ' +
    'should must can could would will when then than so if else new old use uses used using file files function functions code project bug issue ' +
    'currently still also its their there here which what where who how all any each one two just only please need needs want wants get gets set sets ' +
    'return returns returned include includes included update updates change changes test tests pass passes failing fail fails run runs result').split(' ').forEach(function (w) { STOP[w] = 1; });

  function sig(text) {                         // cheap content signature
    var h = 5381, n = text.length;
    for (var i = 0; i < n; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return n + ':' + h;
  }
  function dirname(p) { var i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
  function normalize(p) {
    var out = [];
    p.split('/').forEach(function (s) { if (s === '' || s === '.') return; if (s === '..') out.pop(); else out.push(s); });
    return '/' + out.join('/');
  }
  function lineOf(text, index) { var n = 1; for (var i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return n; }
  function words(s) {                          // identifier / prose -> lower-case word parts (camelCase and snake_case split)
    var out = [];
    String(s || '').replace(/[A-Za-z][A-Za-z0-9]*/g, function (tok) {
      var parts = tok.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ');
      parts.forEach(function (p) { p = p.toLowerCase(); if (p.length >= 3 && !STOP[p]) out.push(p); });
      var whole = tok.toLowerCase(); if (parts.length > 1 && whole.length >= 3 && !STOP[whole]) out.push(whole);
    });
    return out;
  }
  function uniq(a) { var seen = {}; return a.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); }

  /* ------------------------------------------------------- extraction */

  function extractJS(text) {
    var symbols = [], imports = [], exported = {}, lines = text.split('\n');
    var add = function (name, kind, line, isExp) {
      if (!name) return;
      symbols.push({ name: name, kind: kind, line: line, exported: !!isExp, signature: (lines[line - 1] || '').trim().slice(0, 140) });
    };
    lines.forEach(function (ln, i) {
      var n = i + 1, m;
      if ((m = /^\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(ln))) { add(m[2], 'function', n, !!m[1]); if (m[1]) exported[m[2]] = 1; }
      else if ((m = /^\s*(export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(ln))) { add(m[2], 'class', n, !!m[1]); if (m[1]) exported[m[2]] = 1; }
      else if ((m = /^\s*(export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(ln))) { add(m[2], 'type', n, !!m[1]); if (m[1]) exported[m[2]] = 1; }
      else if ((m = /^(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(async\s*)?(\(|function\b|[A-Za-z_$][\w$]*\s*=>)?/.exec(ln))) {
        add(m[2], m[4] ? 'function' : 'variable', n, !!m[1]); if (m[1]) exported[m[2]] = 1;
      }
      else if ((m = /^\s+(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|. ]+)?\s*\{/.exec(ln)) && !/^\s*(if|for|while|switch|catch|function|return)\b/.test(ln)) add(m[1], 'method', n, false);
      if ((m = /^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/.exec(ln))) exported[m[1]] = 1;
    });
    var me = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?/.exec(text);
    if (me) me[1].split(',').forEach(function (p) { var k = /^\s*([A-Za-z_$][\w$]*)/.exec(p); if (k) exported[k[1]] = 1; });
    else if ((me = /module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;?/.exec(text))) exported[me[1]] = 1;
    var ed = /export\s*\{([^}]*)\}/g, em;
    while ((em = ed.exec(text))) em[1].split(',').forEach(function (p) { var k = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/.exec(p); if (k) exported[k[2] || k[1]] = 1; });
    symbols.forEach(function (s) { if (exported[s.name]) s.exported = true; });

    var re = /(?:const|let|var)\s*(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)|import\s+(?:([\w$*\s{},]+?)\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g, m2;
    while ((m2 = re.exec(text))) {
      var spec = m2[2] || m2[4] || m2[5], names = [];
      var clause = m2[1] || m2[3] || '';
      var br = /\{([^}]*)\}/.exec(clause);
      if (br) br[1].split(',').forEach(function (p) { var k = /^\s*([A-Za-z_$][\w$]*)/.exec(p.replace(/^\s*type\s+/, '')); if (k) names.push(k[1]); });
      // a bare identifier (const math = require('./math'), import math from './math') binds the whole module or its
      // default: it names nothing the target must export, so it is not a named import
      if (spec && !imports.some(function (x) { return x.spec === spec && x.line === lineOf(text, m2.index); })) imports.push({ spec: spec, names: names, line: lineOf(text, m2.index) });
    }
    return { symbols: symbols, imports: imports };
  }

  function extractPy(text) {
    var symbols = [], imports = [], lines = text.split('\n');
    lines.forEach(function (ln, i) {
      var n = i + 1, m;
      if ((m = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(ln))) symbols.push({ name: m[1], kind: 'function', line: n, exported: m[1].charAt(0) !== '_', signature: ln.trim().slice(0, 140) });
      else if ((m = /^class\s+([A-Za-z_]\w*)/.exec(ln))) symbols.push({ name: m[1], kind: 'class', line: n, exported: m[1].charAt(0) !== '_', signature: ln.trim().slice(0, 140) });
      else if ((m = /^\s+(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(ln))) symbols.push({ name: m[1], kind: 'method', line: n, exported: false, signature: ln.trim().slice(0, 140) });
      else if ((m = /^from\s+(\.*[\w.]*)\s+import\s+(.+)$/.exec(ln))) imports.push({ spec: m[1], names: m[2].replace(/[()]/g, '').split(',').map(function (s) { return s.trim().split(/\s+as\s+/)[0]; }).filter(Boolean), line: n });
      else if ((m = /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/.exec(ln))) m[1].split(',').forEach(function (s) { imports.push({ spec: s.trim(), names: [], line: n }); });
    });
    return { symbols: symbols, imports: imports };
  }

  /* ------------------------------------------------------------ index */

  function create(env) {
    var cache = {};                 // path -> { sig, lang, symbols, imports }
    var paths = [], fileSet = {};
    var graph = { out: {}, inn: {} }, externals = {};
    var dirtyGraph = true, lastStats = { files: 0, parsed: 0, reused: 0 };

    function listFiles() {
      var all = (env.list ? env.list() : []) || [];
      return all.filter(function (p) { return typeof p === 'string' && !SKIP.test(p) && !DIST.test(p); }).slice(0, MAX_FILES);
    }

    function refresh() {
      var list = listFiles(), parsed = 0, reused = 0, seen = {};
      list.forEach(function (p) {
        seen[p] = 1;
        var lang = JS_EXT.test(p) ? 'js' : PY_EXT.test(p) ? 'py' : null;
        if (!lang) { if (!cache[p]) cache[p] = { sig: '', lang: null, symbols: [], imports: [] }; return; }
        var text = null; try { text = env.read(p); } catch (_) {}
        if (text == null || text.length > MAX_FILE) { cache[p] = { sig: 'x', lang: lang, symbols: [], imports: [] }; return; }
        var s = sig(text);
        if (cache[p] && cache[p].sig === s) { reused++; return; }
        var ex; try { ex = lang === 'js' ? extractJS(text) : extractPy(text); } catch (_) { ex = { symbols: [], imports: [] }; }
        cache[p] = { sig: s, lang: lang, symbols: ex.symbols, imports: ex.imports };
        parsed++; dirtyGraph = true;
      });
      Object.keys(cache).forEach(function (p) { if (!seen[p]) { delete cache[p]; dirtyGraph = true; } });
      if (paths.length !== list.length || paths.some(function (p, i) { return p !== list[i]; })) dirtyGraph = true;
      paths = list; fileSet = {}; list.forEach(function (p) { fileSet[p] = 1; });
      lastStats = { files: list.length, parsed: parsed, reused: reused };
      if (dirtyGraph) buildGraph();
      return lastStats;
    }

    function resolveJS(from, spec) {
      if (spec.charAt(0) !== '.' && spec.charAt(0) !== '/') return null;
      var base = normalize(spec.charAt(0) === '/' ? spec : dirname(from) + '/' + spec);
      var tries = [base].concat(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json'].map(function (e) { return base + e; }),
        ['/index.js', '/index.mjs', '/index.ts', '/index.tsx', '/index.jsx'].map(function (e) { return base + e; }));
      // TS-style "./x.js" that really means ./x.ts
      if (/\.js$/.test(base)) tries.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
      for (var i = 0; i < tries.length; i++) if (fileSet[tries[i]]) return tries[i];
      return null;
    }
    function resolvePy(from, spec) {
      var base;
      if (spec.charAt(0) === '.') {
        var dots = /^\.+/.exec(spec)[0].length, rest = spec.slice(dots).replace(/\./g, '/'), d = dirname(from);
        for (var k = 1; k < dots; k++) d = dirname(d);
        base = normalize(d + '/' + rest);
      } else base = normalize('/' + spec.replace(/\./g, '/'));
      var tries = [base + '.py', base + '/__init__.py'];
      for (var i = 0; i < tries.length; i++) if (fileSet[tries[i]]) return tries[i];
      return null;
    }

    function buildGraph() {
      graph = { out: {}, inn: {} }; externals = {};
      paths.forEach(function (p) {
        var c = cache[p]; if (!c || !c.lang) return;
        graph.out[p] = [];
        c.imports.forEach(function (im) {
          var target = c.lang === 'js' ? resolveJS(p, im.spec) : resolvePy(p, im.spec);
          if (target) {
            graph.out[p].push({ spec: im.spec, path: target, names: im.names, line: im.line });
            (graph.inn[target] = graph.inn[target] || []).push(p);
          } else if (c.lang === 'js' ? (im.spec.charAt(0) !== '.' && im.spec.charAt(0) !== '/') : im.spec.charAt(0) !== '.') {
            var pkg = c.lang === 'js' ? (im.spec.charAt(0) === '@' ? im.spec.split('/').slice(0, 2).join('/') : im.spec.split('/')[0]) : im.spec.split('.')[0];
            (externals[p] = externals[p] || []).indexOf(pkg) < 0 && externals[p].push(pkg);
          } else graph.out[p].push({ spec: im.spec, path: null, names: im.names, line: im.line });
        });
      });
      Object.keys(graph.inn).forEach(function (k) { graph.inn[k] = uniq(graph.inn[k]).sort(); });
      dirtyGraph = false;
    }

    /* ---- queries ---- */

    function findSymbol(name) {
      refresh();
      var q = String(name || '').trim(), low = q.toLowerCase(), out = [];
      if (!q) return out;
      paths.forEach(function (p) {
        (cache[p].symbols || []).forEach(function (s) {
          var n = s.name.toLowerCase();
          var rank = s.name === q ? 0 : n === low ? 1 : n.indexOf(low) >= 0 ? 2 : -1;
          if (rank >= 0) out.push({ name: s.name, kind: s.kind, path: p, line: s.line, exported: s.exported, signature: s.signature, rank: rank });
        });
      });
      out.sort(function (a, b) { return a.rank - b.rank || (b.exported - a.exported) || (TEST_FILE.test(a.path) - TEST_FILE.test(b.path)) || a.path.localeCompare(b.path) || a.line - b.line; });
      return out.slice(0, 30).map(function (x) { delete x.rank; return x; });
    }

    function references(name, limit) {
      refresh();
      var q = String(name || '').trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(q)) return [];
      var re = new RegExp('(^|[^\\w$])' + q.replace(/\$/g, '\\$') + '(?![\\w$])'), out = [], max = limit || 40;
      var defs = {};
      paths.forEach(function (p) { (cache[p].symbols || []).forEach(function (s) { if (s.name === q) defs[p + ':' + s.line] = 1; }); });
      for (var i = 0; i < paths.length && out.length < max; i++) {
        var p = paths[i], c = cache[p];
        if (!c || !c.lang) continue;
        var text = null; try { text = env.read(p); } catch (_) {}
        if (!text || text.length > MAX_FILE || !re.test(text)) continue;
        text.split('\n').forEach(function (ln, j) {
          if (out.length >= max || !re.test(ln) || defs[p + ':' + (j + 1)]) return;
          out.push({ path: p, line: j + 1, text: ln.trim().slice(0, 160) });
        });
      }
      return out;
    }

    function deps(path) {
      refresh();
      var out = (graph.out[path] || []).map(function (x) { return { spec: x.spec, path: x.path, names: x.names }; });
      return { imports: out, importedBy: (graph.inn[path] || []).slice(), external: (externals[path] || []).slice() };
    }

    function exportsOf(path) { return ((cache[path] && cache[path].symbols) || []).filter(function (s) { return s.exported; }).map(function (s) { return s.name; }); }

    // Named imports of project files that the target does not provide. High precision on purpose:
    //  - "declared but not exported": the target defines the name (function/class/const) yet does not export it
    //    (the classic half-finished change: a helper added to one file, used from another)
    //  - "not provided": the target has an explicit export list that lacks the name and no re-export / spread
    //    / dynamic module.exports that could supply it
    // -> [{ from, to, name, line, why: 'declared-not-exported' | 'not-provided' }]
    function importProblems(only) {
      refresh();
      var out = [], want = only ? {} : null;
      (only || []).forEach(function (p) { want[p] = 1; });
      paths.forEach(function (p) {
        if (want && !want[p]) return;
        var c = cache[p]; if (!c || c.lang !== 'js') return;
        (graph.out[p] || []).forEach(function (e) {
          if (!e.path || !e.names.length) return;
          var tc = cache[e.path]; if (!tc || tc.lang !== 'js' || /\.json$/.test(e.path)) return;
          var exp = {}; exportsOf(e.path).forEach(function (n) { exp[n] = 1; });
          var declared = {}; (tc.symbols || []).forEach(function (s) { if (s.kind !== 'method') declared[s.name] = 1; });
          var text = ''; try { text = env.read(e.path) || ''; } catch (_) {}
          // anything that can supply names we cannot see: leave it alone
          var opaque = /export\s*\*|module\.exports\s*=\s*(?![\s{])|module\.exports\s*=\s*\{[^}]*\.\.\.|Object\.assign\(\s*(?:module\.)?exports|exports\s*\[|export\s+default\b/.test(text);
          e.names.forEach(function (n) {
            if (exp[n] || n === 'default') return;
            if (declared[n]) out.push({ from: p, to: e.path, name: n, line: e.line, why: 'declared-not-exported' });
            else if (!opaque && Object.keys(exp).length) out.push({ from: p, to: e.path, name: n, line: e.line, why: 'not-provided' });
          });
        });
      });
      return out;
    }

    // which other files depend on the files that were changed (and were not changed themselves)?
    function impacted(changed) {
      refresh();
      var ch = {}; (changed || []).forEach(function (p) { ch[p] = 1; });
      var out = {};
      (changed || []).forEach(function (p) {
        if (TEST_FILE.test(p)) return;
        (graph.inn[p] || []).forEach(function (d) { if (ch[d]) return; (out[d] = out[d] || []).push(p); });
      });
      return Object.keys(out).sort().map(function (d) { return { path: d, because: uniq(out[d]), test: TEST_FILE.test(d) }; });
    }

    function rank(goal, o) {
      refresh();
      o = o || {};
      var text = String(goal || ''), toks = uniq(words(text)), scores = {}, why = {};
      var bump = function (p, n, reason) { scores[p] = (scores[p] || 0) + n; (why[p] = why[p] || []); if (reason && why[p].indexOf(reason) < 0 && why[p].length < 4) why[p].push(reason); };
      var low = text.toLowerCase();
      paths.forEach(function (p) {
        var c = cache[p]; if (!c) return;
        var base = p.slice(p.lastIndexOf('/') + 1), baseNoExt = base.replace(/\.[^.]+$/, '');
        if (low.indexOf(p.slice(1).toLowerCase()) >= 0) bump(p, 12, 'named in the request');
        else if (base.length > 3 && low.indexOf(base.toLowerCase()) >= 0) bump(p, 10, 'named in the request');
        else if (baseNoExt.length > 3 && new RegExp('(^|[^\\w])' + baseNoExt.toLowerCase().replace(/[^a-z0-9]/g, '.') + '([^\\w]|$)').test(low)) bump(p, 5, 'name matches the request');
        var segs = uniq(words(p.replace(/\.[^.]+$/, '')));
        toks.forEach(function (t) { if (segs.indexOf(t) >= 0) bump(p, 3, 'path: ' + t); });
        (c.symbols || []).forEach(function (s) {
          var sw = words(s.name);
          if (text.indexOf(s.name) >= 0 && s.name.length > 3) bump(p, 8, 'defines ' + s.name);
          else toks.forEach(function (t) { if (sw.indexOf(t) >= 0) bump(p, s.exported ? 2 : 1, 'symbol: ' + s.name); });
        });
      });
      (o.focus || []).forEach(function (p) { if (cache[p]) bump(p, 9, 'in focus (open / failing / changed)'); });
      // neighbours of the strongest seeds: what they import, and who imports them
      var seeds = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; }).filter(function (p) { return scores[p] >= 5; }).slice(0, 4);
      seeds.forEach(function (s) {
        var sc = scores[s];
        (graph.out[s] || []).forEach(function (e) { if (e.path) bump(e.path, Math.max(2, Math.round(sc * 0.4)), 'imported by ' + s.slice(1)); });
        (graph.inn[s] || []).forEach(function (d) { bump(d, Math.max(2, Math.round(sc * 0.45)), 'imports ' + s.slice(1)); });
      });
      var ranked = Object.keys(scores).map(function (p) { return { path: p, score: scores[p] - (TEST_FILE.test(p) ? 1 : 0), reasons: why[p] || [] }; })
        .filter(function (x) { return x.score > 0; })
        .sort(function (a, b) { return b.score - a.score || a.path.localeCompare(b.path); });
      return ranked.slice(0, o.limit || 8);
    }

    function describe(p, withSymbols) {
      var c = cache[p] || {}, ex = exportsOf(p), g = graph.out[p] || [], inn = graph.inn[p] || [];
      var parts = [];
      if (ex.length) parts.push('exports ' + ex.slice(0, 8).join(', '));
      var local = g.filter(function (e) { return e.path; });
      if (local.length) parts.push('uses ' + local.slice(0, 5).map(function (e) { return e.path.slice(1) + (e.names.length ? ' (' + e.names.slice(0, 4).join(', ') + ')' : ''); }).join('; '));
      if (inn.length) parts.push('used by ' + inn.slice(0, 5).map(function (x) { return x.slice(1); }).join(', '));
      var line = '- ' + p.slice(1) + (parts.length ? ' — ' + parts.join('; ') : '');
      if (withSymbols && c.symbols && c.symbols.length) {
        var sigs = c.symbols.filter(function (s) { return s.kind !== 'method' && (s.exported || c.symbols.length <= 6); }).slice(0, 6).map(function (s) { return '    ' + s.signature + '  (line ' + s.line + ')'; });
        if (sigs.length) line += '\n' + sigs.join('\n');
      }
      return line;
    }

    // a compact block for a prompt: the files most relevant to the goal, how they connect
    function contextBlock(goal, o) {
      o = o || {};
      var max = o.maxChars || 3200, ranked = rank(goal, { limit: o.limit || 7, focus: o.focus });
      if (!ranked.length) return '';
      var lines = ['Relevant code (from the project index; the files are linked by imports, so a change to one may need changes in the others):'], used = lines[0].length;
      ranked.forEach(function (r, i) {
        var d = describe(r.path, i < 4);
        if (used + d.length > max) return;
        lines.push(d); used += d.length + 1;
      });
      return lines.length > 1 ? lines.join('\n') : '';
    }

    function stats() { return Object.assign({ symbols: paths.reduce(function (n, p) { return n + ((cache[p] && cache[p].symbols) || []).length; }, 0), edges: Object.keys(graph.out).reduce(function (n, k) { return n + graph.out[k].filter(function (e) { return e.path; }).length; }, 0) }, lastStats); }

    return { refresh: refresh, findSymbol: findSymbol, references: references, deps: deps, exportsOf: exportsOf, impacted: impacted, importProblems: importProblems, rank: rank, contextBlock: contextBlock, stats: stats };
  }

  Engine.RepoIntel = { create: create, extractJS: extractJS, extractPy: extractPy, words: words, TEST_FILE: TEST_FILE };
})();
