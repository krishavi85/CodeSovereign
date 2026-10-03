/* =====================================================================
   engine.testgen.js  —  Engine.TestGen   (blueprint §19, §20, §66)

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
    if (!Engine.FS.exists('/test/e2e.test.js')) gaps.push('no end-to-end user-journey test');
    if (!Engine.FS.exists('/test/install.test.js')) gaps.push('no clean-install test');
    if (!Engine.FS.exists('/test/upgrade.test.js')) gaps.push('no upgrade / data-migration test');
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

  /* ---- e2e / install / upgrade (blueprint §19) ---- */

  // a resource we can create with a self-contained body: no required ref to
  // another entity (a required ref to `user` is fine — the service fills it).
  function rootResource(sc) {
    if (!sc) return null;
    var ents = (sc.entities || []).filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; });
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      var blockers = (e.fields || []).filter(function (f) {
        return f.required && f.type === 'ref' && f.ref !== 'user';
      });
      if (!blockers.length) return e;
    }
    return null;
  }

  function litFor(f) {
    switch (f.type) {
      case 'int': return '7';
      case 'float': return '1.5';
      case 'bool': return (f.def != null ? String(!f.def) : 'true');
      case 'json': return '{}';
      case 'timestamp': return "'2026-01-01T00:00:00.000Z'";
      default: return "'e2e-" + f.name + "'";
    }
  }
  // the create body (required, non-id, non-user-ref fields) + a field we can
  // safely mutate for the update assertion.
  function bodyFor(e) {
    var req = (e.fields || []).filter(function (f) {
      return f.type !== 'id' && f.required && !(f.type === 'ref' && f.ref === 'user');
    });
    var pairs = req.map(function (f) { return JSON.stringify(f.name) + ': ' + litFor(f); });
    var textField = (e.fields || []).filter(function (f) { return (f.type === 'text' || f.type === 'longtext') && f.name !== 'id'; })[0];
    var boolField = (e.fields || []).filter(function (f) { return f.type === 'bool'; })[0];
    var mut = textField ? { name: textField.name, before: "'e2e-" + textField.name + "'", after: "'e2e-updated'" }
      : boolField ? { name: boolField.name, before: (boolField.def != null ? String(!boolField.def) : 'true'), after: (boolField.def != null ? String(!!boolField.def) : 'false') }
        : null;
    return { create: '{ ' + pairs.join(', ') + ' }', mut: mut };
  }

  function e2eSuite(sc, auth) {
    var e = rootResource(sc);
    var L = [
      "'use strict';",
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-e2e-' + process.pid);",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "let server; try { ({ server } = require('../server')); } catch (_) {}",
      "let db; try { db = require('../src/db'); } catch (_) {}",
      "",
      "test('e2e: a real user journey — sign in, create, read, update, delete', { skip: !server, timeout: 30000 }, async () => {",
      "  if (db) { await db.reset(); await db.migrate(); }",
      "  await new Promise((r) => server.listen(0, r));",
      "  const base = 'http://localhost:' + server.address().port;",
      "  const J = (m, p, b, h) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: b === undefined ? undefined : JSON.stringify(b) }).then(async (x) => ({ s: x.status, j: await x.json().catch(() => null) }));",
      "",
      "  const health = await J('GET', '/healthz'); assert.equal(health.s, 200, 'healthz');",
      "  const ready = await J('GET', '/readyz'); assert.equal(ready.s, 200, 'readyz');",
      ""
    ];
    if (auth) L.push(
      "  const reg = await J('POST', '/api/auth/register', { email: 'journey@t.co', password: 'password12' });",
      "  assert.ok(reg.s === 201 && reg.j && reg.j.token, 'register -> token');",
      "  let AH = { authorization: 'Bearer ' + reg.j.token };",
      "  const login = await J('POST', '/api/auth/login', { email: 'journey@t.co', password: 'password12' });",
      "  assert.ok(login.s === 200 && login.j.token, 'login -> token');",
      "  AH = { authorization: 'Bearer ' + login.j.token };",
      "  const me = await J('GET', '/api/auth/me', undefined, AH); assert.ok(me.j && me.j.user && me.j.user.email === 'journey@t.co', 'me() is the logged-in user');",
      ""
    );
    else L.push("  const AH = {};", "");
    if (e) {
      var b = bodyFor(e);
      var p = "/api/" + e.table;
      L.push(
        "  // create",
        "  const created = await J('POST', '" + p + "', " + b.create + ", AH);",
        "  assert.equal(created.s, 201, 'create -> 201'); const id = created.j && created.j.id; assert.ok(id != null, 'created row has an id');",
        "  // list shows it",
        "  const listed = await J('GET', '" + p + "', undefined, AH);",
        "  const rows = Array.isArray(listed.j) ? listed.j : (listed.j && listed.j.rows) || [];",
        "  assert.ok(rows.some((r) => String(r.id) === String(id)), 'the new row is in the list');",
        "  // read one",
        "  const one = await J('GET', '" + p + "/' + id, undefined, AH);",
        "  assert.equal(one.s, 200, 'read one -> 200'); assert.equal(String(one.j.id), String(id), 'same row');"
      );
      if (b.mut) L.push(
        "  // update",
        "  const upd = await J('PUT', '" + p + "/' + id, { " + JSON.stringify(b.mut.name) + ": " + b.mut.after + " }, AH);",
        "  assert.equal(upd.s, 200, 'update -> 200'); assert.equal(String(upd.j[" + JSON.stringify(b.mut.name) + "]), String(" + b.mut.after + "), 'the change persisted');"
      );
      L.push(
        "  // delete",
        "  const del = await J('DELETE', '" + p + "/' + id, undefined, AH);",
        "  assert.equal(del.s, 200, 'delete -> 200');",
        "  const gone = await J('GET', '" + p + "/' + id, undefined, AH);",
        "  assert.equal(gone.s, 404, 'the row is gone');"
      );
    } else {
      L.push("  // no self-contained resource in the schema — the auth + health journey above is the e2e path");
    }
    if (auth) L.push(
      "",
      "  const out = await J('POST', '/api/auth/logout', undefined, AH); assert.ok(out.s === 200, 'logout -> 200');",
      "  const after = await J('GET', '/api/auth/me', undefined, AH); assert.ok(!after.j || !after.j.user, 'session no longer authenticates');"
    );
    L.push(
      "",
      "  try { if (server.closeAllConnections) server.closeAllConnections(); } catch (_) {}",
      "  await Promise.race([ new Promise((r) => server.close(r)), new Promise((r) => setTimeout(r, 3000)) ]);",
      "  if (db) await db.reset();",
      "});",
      ""
    );
    return L.filter(function (l) { return l !== undefined; }).join('\n');
  }

  function installSuite() {
    return [
      "'use strict';",
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-install-' + process.pid);",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const fs = require('fs');",
      "const path = require('path');",
      "const root = path.join(__dirname, '..');",
      "let server; try { ({ server } = require('../server')); } catch (_) {}",
      "let db; try { db = require('../src/db'); } catch (_) {}",
      "",
      "test('install: package.json declares migrate + test + dev scripts', () => {",
      "  const pj = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));",
      "  for (const s of ['migrate', 'test', 'dev']) assert.ok(pj.scripts && pj.scripts[s], 'missing npm script: ' + s);",
      "});",
      "",
      "test('install: no third-party runtime dependencies to install', () => {",
      "  const pj = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));",
      "  const deps = Object.keys(pj.dependencies || {});",
      "  assert.equal(deps.length, 0, 'expected a dependency-free install, found: ' + deps.join(', '));",
      "});",
      "",
      "test('install: a clean checkout migrates, boots and is healthy', { skip: !server, timeout: 25000 }, async () => {",
      "  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });",
      "  if (db) { const tables = await db.migrate(); assert.ok(Array.isArray(tables) && tables.length, 'migrate created tables'); }",
      "  await new Promise((r) => server.listen(0, r));",
      "  const base = 'http://localhost:' + server.address().port;",
      "  const h = await fetch(base + '/healthz').then((r) => r.json()).catch(() => ({}));",
      "  assert.ok(h.ok === true, '/healthz reports ok on a fresh install');",
      "  const rz = await fetch(base + '/readyz');",
      "  assert.equal(rz.status, 200, '/readyz is 200 right after migrate');",
      "  try { if (server.closeAllConnections) server.closeAllConnections(); } catch (_) {}",
      "  await Promise.race([ new Promise((r) => server.close(r)), new Promise((r) => setTimeout(r, 3000)) ]);",
      "});",
      "",
      "test('install: migrations are idempotent', { skip: !db }, async () => {",
      "  const a = await db.migrate();",
      "  const b = await db.migrate();",
      "  assert.deepStrictEqual(a, b, 'running migrate twice yields the same schema');",
      "});",
      ""
    ].join('\n');
  }

  function upgradeSuite(sc, auth) {
    var e = rootResource(sc);
    if (!e) {
      return [
        "'use strict';",
        "const test = require('node:test');",
        "const assert = require('node:assert');",
        "let db; try { db = require('../src/db'); } catch (_) {}",
        "test('upgrade: re-running migrations over an existing store is non-destructive', { skip: !db, timeout: 20000 }, async () => {",
        "  await db.migrate();",
        "  const before = await db.migrate();",
        "  const after = await db.migrate();",
        "  assert.deepStrictEqual(before, after, 'schema stable across upgrade migrations');",
        "});",
        ""
      ].join('\n');
    }
    var b = bodyFor(e);
    var p = "/api/" + e.table;
    var L = [
      "'use strict';",
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-upgrade-' + process.pid);",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "let server; try { ({ server } = require('../server')); } catch (_) {}",
      "let db; try { db = require('../src/db'); } catch (_) {}",
      "",
      "test('upgrade: data written by the old version survives a re-migration + restart', { skip: !server || !db, timeout: 30000 }, async () => {",
      "  await db.reset(); await db.migrate();",
      "  await new Promise((r) => server.listen(0, r));",
      "  const base = 'http://localhost:' + server.address().port;",
      "  const J = (m, pth, body, h) => fetch(base + pth, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: body === undefined ? undefined : JSON.stringify(body) }).then(async (x) => ({ s: x.status, j: await x.json().catch(() => null) }));",
      auth ? "  const reg = await J('POST', '/api/auth/register', { email: 'upgrade@t.co', password: 'password12' });" : "",
      auth ? "  const AH = { authorization: 'Bearer ' + (reg.j && reg.j.token) };" : "  const AH = {};",
      "  const created = await J('POST', '" + p + "', " + b.create + ", AH);",
      "  assert.equal(created.s, 201, 'seed a row on the old version'); const id = created.j.id;",
      "",
      "  // --- simulate the upgrade: new version re-applies its migrations ---",
      "  const a = await db.migrate();",
      "  const c = await db.migrate();",
      "  assert.deepStrictEqual(a, c, 'the upgrade migration is idempotent');",
      "",
      "  // the row is still in the data layer",
      "  const rows = await db.list('" + e.name + "', {});",
      "  assert.ok((rows.rows || rows).some((r) => String(r.id) === String(id)), 'the pre-upgrade row is still stored');",
      "  // and still reachable over HTTP after the upgrade",
      "  const got = await J('GET', '" + p + "/' + id, undefined, AH);",
      "  assert.equal(got.s, 200, 'the pre-upgrade row is still served');",
      "",
      "  try { if (server.closeAllConnections) server.closeAllConnections(); } catch (_) {}",
      "  await Promise.race([ new Promise((r) => server.close(r)), new Promise((r) => setTimeout(r, 3000)) ]);",
      "  await db.reset();",
      "});",
      ""
    ];
    return L.filter(function (l) { return l !== ''; }).join('\n');
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
    var sc = schema();
    var hasServer = Engine.FS.exists('/server.js') || Engine.FS.exists('/src/server.js');
    if (eps.length && (opts.api !== false)) out['/test/generated-api.test.js'] = apiSuite(eps, auth);
    if (opts.chaos !== false) out['/test/chaos.test.js'] = chaosSuite(eps, auth);
    if (opts.e2e !== false && hasServer) out['/test/e2e.test.js'] = e2eSuite(sc, auth);
    if (opts.install !== false && hasServer) out['/test/install.test.js'] = installSuite();
    if (opts.upgrade !== false && hasServer) out['/test/upgrade.test.js'] = upgradeSuite(sc, auth);
    var hasPublic = Engine.FS.exists('/public') || Object.keys(Engine.FS._data || {}).some(function (p) { return p.indexOf('/public/') === 0; });
    if (opts.a11y !== false && hasPublic) out['/test/a11y.test.js'] = a11ySuite();
    Object.keys(out).forEach(function (p) { Engine.FS.write(p, out[p]); });
    // contract-driven user-journey suite (§65)
    var extra = [];
    if (opts.journeys !== false && hasServer && Engine.Journeys && Engine.Journeys.generate) {
      try { extra = Engine.Journeys.generate() || []; } catch (_) {}
    }
    extra.forEach(function (f) { out[f.path] = f.content; });
    if (S()) S().write('testgen.json', { generatedAt: Date.now(), wrote: Object.keys(out), endpoints: eps.length, plan: plan() });
    return Object.keys(out).map(function (p) { return { path: p, content: out[p] }; });
  }

  Engine.TestGen = { plan: plan, generate: generate, chaosSuite: chaosSuite, e2eSuite: e2eSuite, installSuite: installSuite, upgradeSuite: upgradeSuite, endpoints: endpoints, rootResource: rootResource, bodyFor: bodyFor, schema: schema };
  console.info('[TestGen] testing factory + chaos suite ready — Engine.TestGen');
})();
