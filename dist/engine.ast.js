/* =====================================================================
   engine.ast.js  —  real AST analysis (acorn), replacing regex where it can.

   Engine.AST.parse(src, filename) -> {
     ok, imports[], requires[], dynamicImports[], reexports[{source}],
     exports[], routes[{method,path}], functions[], classes[], calls[]
   }

   Also upgrades window.Graph.build(): for .js/.mjs/.cjs it swaps the regex
   import/export/route extraction for the parsed result (accurate re-exports,
   `export {x} from`, dynamic import(), nested route calls). .ts/.jsx/.tsx and
   anything acorn can't parse keep the regex result. Shape-compatible — every
   existing Graph consumer works unchanged.
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine;
  if (!Engine) { console.error('[AST] Engine missing'); return; }

  function acornReady() { return typeof window.acorn !== 'undefined' && typeof window.acorn.parse === 'function'; }

  var ROUTE_METHODS = { get:1, post:1, put:1, patch:1, delete:1, options:1, head:1, all:1, use:1 };

  function walk(node, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (var k in node) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
      var v = node[k];
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) if (v[i] && typeof v[i].type === 'string') walk(v[i], visit); }
      else if (v && typeof v.type === 'string') walk(v, visit);
    }
  }

  function strLit(n) { return n && (n.type === 'Literal' ? (typeof n.value === 'string' ? n.value : null)
    : n.type === 'TemplateLiteral' && n.quasis.length === 1 ? n.quasis[0].value.cooked : null); }

  function tryParse(src) {
    var opts = { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true };
    try { return window.acorn.parse(src, opts); } catch (_) {}
    try { return window.acorn.parse(src, Object.assign({}, opts, { sourceType: 'script' })); } catch (_) {}
    var loose = window.acorn && window.acorn.loose;
    if (loose && loose.parse) {
      try { return loose.parse(src, { ecmaVersion: 'latest' }); } catch (_) {}
    }
    return null;
  }

  var MAX_SRC = 1.5 * 1024 * 1024;   // don't parse huge bundled/minified files
  function parse(src, filename) {
    var empty = { ok: false, imports: [], requires: [], dynamicImports: [], reexports: [], exports: [], routes: [], functions: [], classes: [], calls: [] };
    if (!acornReady() || typeof src !== 'string' || !src) return empty;
    if (src.length > MAX_SRC) return empty;                       // size guard (proxy for a time limit)
    if (/(^|\/)\.sovereign\//.test(filename || '')) return empty; // never analyze our own memory
    // acorn has no JSX/TS grammar; don't even try for those.
    if (/\.(tsx|jsx)$/.test(filename || '')) return empty;
    var ast = tryParse(src);
    if (!ast) return empty;

    var out = { ok: true, imports: [], requires: [], dynamicImports: [], reexports: [], exports: [], routes: [], functions: [], classes: [], calls: [] };

    walk(ast, function (n) {
      switch (n.type) {
        case 'ImportDeclaration':
          if (n.source && typeof n.source.value === 'string') out.imports.push(n.source.value);
          break;
        case 'ExportNamedDeclaration':
          if (n.source && typeof n.source.value === 'string') {
            out.reexports.push({ source: n.source.value });
          } else if (n.declaration) {
            var d = n.declaration;
            if (d.type === 'FunctionDeclaration' && d.id) out.exports.push(d.id.name);
            else if (d.type === 'ClassDeclaration' && d.id) out.exports.push(d.id.name);
            else if (d.type === 'VariableDeclaration') d.declarations.forEach(function (v) { if (v.id && v.id.name) out.exports.push(v.id.name); });
          } else if (n.specifiers) {
            n.specifiers.forEach(function (s) { if (s.exported && s.exported.name) out.exports.push(s.exported.name); });
          }
          break;
        case 'ExportDefaultDeclaration': out.exports.push('default'); break;
        case 'ExportAllDeclaration':
          if (n.source && typeof n.source.value === 'string') out.reexports.push({ source: n.source.value });
          break;
        case 'ImportExpression':
          { var s = strLit(n.source); if (s) out.dynamicImports.push(s); }
          break;
        case 'FunctionDeclaration': if (n.id) out.functions.push(n.id.name); break;
        case 'ClassDeclaration': if (n.id) out.classes.push(n.id.name); break;
        case 'CallExpression': {
          var c = n.callee;
          // require('x')
          if (c && c.type === 'Identifier' && c.name === 'require') {
            var r = strLit(n.arguments[0]); if (r) out.requires.push(r);
          }
          // app.get('/x', ...) / router.post(...) / server.use(...)
          if (c && c.type === 'MemberExpression' && c.property && !c.computed &&
              ROUTE_METHODS[String(c.property.name).toLowerCase()]) {
            var p = strLit(n.arguments[0]);
            if (p && p.charAt(0) === '/') out.routes.push({ method: String(c.property.name).toUpperCase(), path: p });
          }
          if (c && c.type === 'MemberExpression' && c.property && !c.computed) {
            out.calls.push((c.object && c.object.name ? c.object.name + '.' : '') + c.property.name);
          }
          break;
        }
      }
    });
    return out;
  }

  Engine.AST = { parse: parse, ready: acornReady };
  window.AST = Engine.AST;

  /* ---------- upgrade Graph.build ---------- */
  function upgradeGraph() {
    var G = window.Graph;
    if (!G || !G.build || G.build.__astWrapped) return;
    var orig = G.build.bind(G);
    var FS = Engine.FS;

    G.build = function () {
      var summary = orig();                 // regex pass fills everything
      if (!acornReady()) return summary;
      G.ast = G.ast || {};
      var upgraded = 0;
      (G.files || []).forEach(function (p) {
        if (!/\.(js|mjs|cjs)$/.test(p)) return;
        if (/(^|\/)(\.sovereign|node_modules|vendor|dist|build)\//.test(p)) return;
        var res = parse(FS.read(p) || '', p);
        if (!res.ok) return;
        G.ast[p] = res;
        G.imports[p] = res.imports
          .concat(res.requires)
          .concat(res.dynamicImports)
          .concat(res.reexports.map(function (x) { return x.source; }));
        G.exports[p] = res.exports.slice();
        G.routes = G.routes.filter(function (rt) { return rt.file !== p; })
          .concat(res.routes.map(function (rt) { return { file: p, method: rt.method, path: rt.path }; }));
        upgraded++;
      });
      summary.astUpgradedFiles = upgraded;
      summary.importCount = Object.values(G.imports).reduce(function (a, b) { return a + b.length; }, 0);
      summary.routeCount = G.routes.length;
      return summary;
    };
    G.build.__astWrapped = true;
    console.info('[AST] Graph.build upgraded — acorn for .js/.mjs/.cjs, regex fallback elsewhere');
  }

  if (acornReady()) upgradeGraph();
  else {
    var tries = 0;
    var t = setInterval(function () { if (acornReady() || ++tries > 40) { clearInterval(t); upgradeGraph(); } }, 50);
  }
  // Graph is defined by engine.recovery.js which loads before us, but guard anyway.
  window.addEventListener('load', upgradeGraph);
})();
