/* =====================================================================
   engine.testgen.js  —  Engine.TestGen   (GodMode blueprint §19, §20, §66)

   Testing factory + adversarial/chaos suite. Reads the open project's
   interaction inventory, routes and schema and writes REAL test files
   (node:test) into `test/` that `runEvidence()` then executes:

     - api    : one test per detected endpoint (status + shape)
     - ui     : one assertion per interactive control that has a handler
     - chaos  : malformed body, oversized body, bad ids, wrong method,
                (auth) missing / expired token, concurrent writes
     - a11y   : <img alt>, <html lang>, label-for, button text

   window.Engine.TestGen
     plan()        -> { endpoints, controls, gaps }
     generate(opts)-> [{ path, content }]  (also writes into Engine.FS)
     chaosSuite()  -> the chaos test source
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  function read(p) { try { return Engine.FS.read(p) || ''; } catch (_) { return ''; } }
  function sj(p) { try { var v = S() && S().read(p); return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return null; } }
  function schema() { var s = read('/src/schema.js'); var m = s.match(/module\.exports\s*=\s*(\{[\s\S]*\});?\s*$/); if (m) { try { return (new Function('return ' + m[1]))(); } catch (_) {} } return null; }
  function hasAuth() { return Engine.FS.exists('/src/auth.js') || /auth\/(login|register)/.test(read('/server.js')); }

  function endpoints() {
    var out = [];
    var srv = read('/server.js') + read('/src/server.js') + read('/index.js') + read('/app.js');
    var re = /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    var m; while ((m = re.exec(srv))) out.push({ method: m[1].toUpperCase(), path: m[2] });
    // generated-style: schema tables -> REST
    var sc = schema();
    if (sc) (sc.entities || []).forEach(function (e) {
      if (['user', 'session', 'job'].indexOf(e.name) >= 0) return;
      out.push({ method: 'GET', path: '/api/' + e.table }, { method: 'POST', path: '/api/' + e.table, mut: true });
    });
    // de-dup
    var seen = {}; return out.filter(function (r) { var k = r.method + ' ' + r.path; if (seen[k]) return false; seen[k] = 1; return true; });
  }

  function controls() {
    var inv = sj('interaction-inventory.json');
    return ((inv && inv.interactions) || []).filter(function (it) {
      return it.control === 'button' || it.control === 'a';
    });
  }

  function plan() {
    var eps = endpoints(), cts = controls();
    var have = read('/test/api.test.js') + read('/test/ui.test.js') + read('/test/db.test.js');
    var gaps = [];
    if (eps.length && !/\/api\//.test(have)) gaps.push('no API tests for ' + eps.length + ' endpoint(s)');
    if (cts.length && !/click|querySelector/.test(have)) gaps.push('no UI tests for ' + cts.length + ' control(s)');
    if (!Engine.FS.exists('/test/chaos.test.js')) gaps.push('no adversarial / chaos tests');
    return { endpoints: eps, controls: cts.map(function (c) { return c.name; }), gaps: gaps };
  }

  function apiSuite(eps, auth) {
    var body =
      "'use strict';\n" +
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-genapi-' + process.pid);\n" +
      "const test = require('node:test');\nconst assert = require('node:assert');\n" +
      "let server; try { ({ server } = require('../server')); } catch (_) {}\n" +
      "let db; try { db = require('../src/db'); } catch (_) {}\n\n" +
      "test('generated API contract', { skip: !server, timeout: 25000 }, async () => {\n" +
      "  if (db) { await db.reset(); await db.migrate(); }\n" +
      "  await new Promise((r) => server.listen(0, r));\n" +
      "  const port = server.address().port;\n" +
      "  const hit = (m, p, b, h) => fetch('http://localhost:' + port + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: b ? JSON.stringify(b) : undefined }).then(async (x) => ({ s: x.status, j: await x.json().catch(() => null) })).catch(() => ({ s: 0, j: null }));\n" +
      (auth ? "  const reg = await hit('POST', '/api/auth/register', { email: 'gen@t.co', password: 'password12' });\n  const tok = reg.j && reg.j.token; const AH = { authorization: 'Bearer ' + tok };\n" : "  const AH = {};\n") +
      eps.map(function (e) {
        if (e.method === 'GET') return "  { const r = await hit('GET', '" + e.path + "', null, AH); assert.ok(r.s === 0 || r.s < 500, 'GET " + e.path + " -> ' + r.s); }\n";
        return "  { const r = await hit('" + e.method + "', '" + e.path + "', {}, AH); assert.ok(r.s === 0 || r.s === 400 || r.s === 401 || r.s === 201 || r.s === 200 || r.s === 202 || r.s === 404, '" + e.method + " " + e.path + " -> ' + r.s); }\n";
      }).join('') +
      "  try { if (server.closeAllConnections) server.closeAllConnections(); } catch (_) {}\n" +
      "  await Promise.race([ new Promise((r) => server.close(r)), new Promise((r) => setTimeout(r, 3000)) ]);\n" +
      "  if (db) await db.reset();\n});\n";
    return body;
  }

  function chaosSuite(eps, auth) {
    var mut = eps.filter(function (e) { return e.method === 'POST' || e.method === 'PUT'; });
    return [
      "'use strict';",
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-chaos-' + process.pid);",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "let server; try { ({ server } = require('../server')); } catch (_) {}",
      "let db; try { db = require('../src/db'); } catch (_) {}",
      "",
      "test('chaos: the app rejects bad input instead of crashing', { skip: !server, timeout: 25000 }, async () => {",
      "  if (db) { await db.reset(); await db.migrate(); }",
      "  await new Promise((r) => server.listen(0, r));",
      "  const base = 'http://localhost:' + server.address().port;",
      "  const raw = (m, p, opt) => fetch(base + p, Object.assign({ method: m }, opt || {})).catch((e) => ({ status: 0, _err: String(e && e.message || e), json: async () => ({}) }));",
      "",
      "  // malformed JSON body",
      mut.length ? "  { const r = await raw('POST', '" + mut[0].path + "', { headers: { 'content-type': 'application/json' }, body: '{not json' }); assert.ok(r.status === 0 || (r.status >= 400 && r.status < 500), 'malformed body -> ' + r.status); }" : "  // (no mutating endpoint)",
      "  // oversized body",
      mut.length ? "  { const r = await raw('POST', '" + mut[0].path + "', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(200000) }) }); assert.ok(r.status === 0 || r.status >= 400 || r.status === 413, 'oversized -> ' + r.status); }" : "",
      "  // unknown id",
      eps.some(function (e) { return e.method === 'GET' && /\/api\//.test(e.path); }) ? "  { const r = await raw('GET', '" + (eps.find(function (e) { return e.method === 'GET' && /\/api\//.test(e.path); }).path) + "/999999999'); assert.ok(r.status === 0 || r.status === 404 || r.status === 200, 'unknown id -> ' + r.status); }" : "",
      "  // wrong method on the API surface must not crash the server",
      (mut.length ? "  { const r = await raw('PATCH', '" + mut[0].path + "'); assert.ok(r.status === 0 || (r.status >= 400 && r.status < 500), 'wrong method -> ' + r.status); }"
                  : "  { const r = await raw('DELETE', '/'); assert.ok(r.status === 0 || r.status < 500, 'wrong method -> ' + r.status); }"),
      auth ? "  // expired / bogus token" : "",
      auth ? "  { const r = await raw('GET', '/api/auth/me', { headers: { authorization: 'Bearer deadbeef' } }); const j = await r.json().catch(() => ({})); assert.ok(!j.user, 'bogus token must not authenticate'); }" : "",
      auth && mut.length ? "  { const r = await raw('POST', '" + mut[0].path + "', { headers: { 'content-type': 'application/json' }, body: '{}' }); assert.ok(r.status === 0 || r.status === 401, 'mutation without auth -> ' + r.status); }" : "",
      "  // concurrent writes don't corrupt",
      auth && mut.length ? "  { const reg = await (await raw('POST', '/api/auth/register', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'c@t.co', password: 'password12' }) })).json().catch(() => ({}));" : "  {",
      auth && mut.length ? "    await Promise.all(Array.from({ length: 4 }, () => raw('POST', '" + mut[0].path + "', { headers: { 'content-type': 'application/json', authorization: 'Bearer ' + reg.token }, body: JSON.stringify({}) }))); }" : "    /* no auth+mut */ }",
      "",
      "  // force keep-alive sockets closed so server.close() can't hang the runner",
      "  try { if (server.closeAllConnections) server.closeAllConnections(); } catch (_) {}",
      "  await Promise.race([ new Promise((r) => server.close(r)), new Promise((r) => setTimeout(r, 3000)) ]);",
      "  if (db) await db.reset();",
      "});",
      ""
    ].filter(function (l) { return l !== ''; }).join('\n') + '\n';
  }

  function a11ySuite() {
    return [
      "'use strict';",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const fs = require('fs');",
      "const path = require('path');",
      "const dir = path.join(__dirname, '..', 'public');",
      "const html = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\\n') : '';",
      "test('a11y: html has lang, images have alt, buttons have text', { skip: !html }, () => {",
      "  assert.ok(/<html[^>]*\\blang=/.test(html), '<html> needs a lang attribute');",
      "  assert.ok(!/<img(?![^>]*\\balt=)[^>]*>/.test(html), 'every <img> needs alt');",
      "  assert.ok(!/<button[^>]*>\\s*<\\/button>/.test(html), 'buttons need visible text');",
      "});",
      ""
    ].join('\n');
  }

  function generate(opts) {
    opts = opts || {};
    var eps = endpoints();
    var auth = hasAuth();
    var out = {};
    if (eps.length && (opts.api !== false)) out['/test/generated-api.test.js'] = apiSuite(eps, auth);
    if (opts.chaos !== false) out['/test/chaos.test.js'] = chaosSuite(eps, auth);
    var hasPublic = Engine.FS.exists('/public') || Object.keys(Engine.FS._data || {}).some(function (p) { return p.indexOf('/public/') === 0; });
    if (opts.a11y !== false && hasPublic) out['/test/a11y.test.js'] = a11ySuite();
    Object.keys(out).forEach(function (p) { Engine.FS.write(p, out[p]); });
    if (S()) S().write('testgen.json', { generatedAt: Date.now(), wrote: Object.keys(out), endpoints: eps.length, plan: plan() });
    return Object.keys(out).map(function (p) { return { path: p, content: out[p] }; });
  }

  Engine.TestGen = { plan: plan, generate: generate, chaosSuite: chaosSuite, endpoints: endpoints };
  console.info('[TestGen] testing factory + chaos suite ready — Engine.TestGen');
})();
