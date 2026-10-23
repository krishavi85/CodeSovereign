/* =====================================================================
   engine.microservices.js  —  Engine.Microservices   (blueprint §5, architecture)

   Takes the SAME entities/auth the monolith scaffold produces and splits the
   running system into independently-deployable HTTP services wired by an API
   gateway:

     gateway/server.js        public entry — owns auth, rate-limit, static,
                              verifies the session and fans requests out to
                              the domain service that owns each resource
     services/<entity>/server.js   one process per domain — trusts the
                              gateway-supplied identity, serves only its
                              resource's CRUD, backed by the shared data layer
     gateway/registry.js      resource -> service URL map (env-overridable)
     docker-compose.prod.yml  gateway + one container per domain + postgres
     test/microservices.test.js  boots the gateway + every domain service on
                              real ephemeral ports and proves a cross-process
                              round trip (register -> create -> list) plus the
                              gateway's auth boundary (401 on anon mutate)

   The split is at the API / deployment boundary; every service shares one
   database (DATABASE_URL / DATA_DIR) — honest about what is and isn't
   independent. window.Engine.Microservices.generate(spec) -> { path: content }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  function Schema() { return Engine.Schema; }

  function domains(s) {
    return Schema().normalizeSpec(s).entities
      .filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; })
      .map(function (e, i) { return { name: e.name, table: e.table, port: 4330 + i, env: e.name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_SERVICE_URL' }; });
  }

  // Router shared verbatim by the gateway (fan-out) and each domain service
  // (local CRUD). `mode` is 'gateway' or 'service'.
  function resourceRouter(mode, doms, withAuth) {
    var isGw = mode === 'gateway';
    var L = [];
    L.push("    if (seg[0] === 'api') {");
    L.push("      const table = seg[1], id = seg[2];");
    L.push("      const REGISTRY = " + (isGw ? "require('./registry')" : "null") + ";");
    if (isGw) {
      L.push("      const target = REGISTRY.urlFor(table);");
      L.push("      if (!target) return send(res, 404, { error: 'unknown resource' });");
      L.push("      const mutating = req.method !== 'GET' && req.method !== 'HEAD';");
      if (withAuth) {
        L.push("      const user = await auth.userFromToken(auth.bearer(req));");
        L.push("      if (mutating && !user) return send(res, 401, { error: 'authentication required' });");
      } else {
        L.push("      const user = null;");
      }
      L.push("      const body = mutating ? await rawBody(req) : undefined;");
      L.push("      const headers = { 'content-type': 'application/json' };");
      L.push("      if (user) { headers['x-user-id'] = String(user.id); headers['x-user-role'] = user.role || 'user'; }");
      L.push("      let up;");
      L.push("      try { up = await fetch(target + req.url, { method: req.method, headers, body }); }");
      L.push("      catch (e) { return send(res, 502, { error: 'upstream ' + table + ' unavailable' }); }");
      L.push("      const text = await up.text();");
      L.push("      res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/json' });");
      L.push("      return res.end(text);");
    } else {
      L.push("      const svc = SERVICES[table];");
      L.push("      if (!svc) return send(res, 404, { error: 'unknown resource' });");
      L.push("      const uid = req.headers['x-user-id'];");
      L.push("      const user = uid ? { id: /^\\d+$/.test(uid) ? Number(uid) : uid, role: req.headers['x-user-role'] || 'user' } : null;");
      L.push("      const q = Object.fromEntries(u.searchParams);");
      L.push("      if (!id && req.method === 'GET') return send(res, 200, await svc.list(q, user));");
      L.push("      if (!id && req.method === 'POST') { " + (withAuth ? "if (!user) return send(res, 401, { error: 'authentication required' }); " : "") + "return send(res, 201, await svc.create(await readBody(req), user)); }");
      L.push("      if (id && req.method === 'GET') { const row = await svc.get(id); return row ? send(res, 200, row) : send(res, 404, { error: 'not found' }); }");
      L.push("      if (id && (req.method === 'PUT' || req.method === 'PATCH')) { " + (withAuth ? "if (!user) return send(res, 401, { error: 'authentication required' }); " : "") + "const row = await svc.update(id, await readBody(req), user); return row ? send(res, 200, row) : send(res, 404, { error: 'not found' }); }");
      L.push("      if (id && req.method === 'DELETE') { " + (withAuth ? "if (!user) return send(res, 401, { error: 'authentication required' }); " : "") + "const ok = await svc.remove(id, user); return send(res, ok ? 200 : 404, { ok }); }");
      L.push("      return send(res, 405, { error: 'method not allowed' });");
    }
    L.push("    }");
    return L.join('\n');
  }

  function common() {
    return [
      "const STARTED = Date.now();",
      "const metrics = { requests: 0, byStatus: {} };",
      "const LOG_SILENT = process.env.LOG === 'silent' || process.env.NODE_ENV === 'test';",
      "function observe(req, res) {",
      "  const t0 = Date.now(); metrics.requests++;",
      "  res.on('finish', () => {",
      "    const cls = (res.statusCode / 100 | 0) + 'xx'; metrics.byStatus[cls] = (metrics.byStatus[cls] || 0) + 1;",
      "    if (!LOG_SILENT) { try { console.log(JSON.stringify({ t: new Date().toISOString(), level: res.statusCode >= 500 ? 'error' : 'info', msg: 'request', method: req.method, path: (req.url || '').split('?')[0], status: res.statusCode, ms: Date.now() - t0 })); } catch (_) {} }",
      "  });",
      "}",
      "function metricsText() {",
      "  let out = '# TYPE app_uptime_seconds gauge\\napp_uptime_seconds ' + ((Date.now() - STARTED) / 1000).toFixed(1) + '\\n';",
      "  out += '# TYPE app_requests_total counter\\napp_requests_total ' + metrics.requests + '\\n';",
      "  for (const k of Object.keys(metrics.byStatus)) out += 'app_responses_total{class=\"' + k + '\"} ' + metrics.byStatus[k] + '\\n';",
      "  return out;",
      "}",
      "function send(res, code, body, type) {",
      "  const s = typeof body === 'string' ? body : JSON.stringify(body);",
      "  res.writeHead(code, { 'content-type': type || 'application/json' }); res.end(s);",
      "}",
      "function readBody(req) { return new Promise((resolve) => { let r = ''; req.on('data', (c) => { r += c; if (r.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(r ? JSON.parse(r) : {}); } catch (_) { resolve({}); } }); }); }",
      "function rawBody(req) { return new Promise((resolve) => { let r = ''; req.on('data', (c) => { r += c; if (r.length > 1e6) req.destroy(); }); req.on('end', () => resolve(r || '')); }); }"
    ].join('\n');
  }

  function gatewayServer(s, doms) {
    var withAuth = Schema().normalizeSpec(s).auth;
    var L = [
      "'use strict';",
      "// " + s.name + " API gateway — public entry. Owns auth + routing; fans",
      "// resource requests out to the owning domain service. Generated by CodeSovereign.",
      "const http = require('http');",
      "const fs = require('fs');",
      "const path = require('path');",
      "const db = require('../src/db');",
      withAuth ? "const auth = require('../src/auth');" : "",
      "",
      "const PORT = process.env.PORT || (process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1] || 4319;",
      "const PUBLIC = path.join(__dirname, '..', 'public');",
      "const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };",
      "",
      common(),
      "",
      "const rl = new Map();",
      "function rateLimit(req) {",
      "  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();",
      "  const now = Date.now(); const e = rl.get(ip) || { n: 0, t: now };",
      "  if (now - e.t > 60000) { e.n = 0; e.t = now; }",
      "  e.n++; rl.set(ip, e); return e.n <= 240;",
      "}",
      "",
      "const server = http.createServer(async (req, res) => {",
      "  observe(req, res);",
      "  const u = new URL(req.url, 'http://localhost'); const seg = u.pathname.split('/').filter(Boolean);",
      "  try {",
      "    if (u.pathname.startsWith('/api/') && !rateLimit(req)) return send(res, 429, { error: 'rate limit exceeded' });",
      "    if (u.pathname === '/healthz') return send(res, 200, { ok: true, service: 'gateway', uptime_s: Math.round((Date.now() - STARTED) / 1000) });",
      "    if (u.pathname === '/metrics') return send(res, 200, metricsText(), 'text/plain; version=0.0.4');"
    ];
    if (withAuth) {
      L.push("    await auth.attachUser(req);");
      L.push("    if (seg[0] === 'api' && seg[1] === 'auth') {");
      L.push("      if (seg[2] === 'register' && req.method === 'POST') { const b = await readBody(req); return send(res, 201, await auth.register(b.email, b.password)); }");
      L.push("      if (seg[2] === 'login' && req.method === 'POST') { const b = await readBody(req); return send(res, 200, await auth.login(b.email, b.password)); }");
      L.push("      if (seg[2] === 'logout' && req.method === 'POST') { return send(res, 200, await auth.logout(auth.bearer(req))); }");
      L.push("      if (seg[2] === 'me' && req.method === 'GET') { return send(res, 200, { user: req.user || null }); }");
      L.push("      return send(res, 404, { error: 'not found' });");
      L.push("    }");
    }
    L.push(resourceRouter('gateway', doms, withAuth));
    L.push("    const rel = u.pathname === '/' ? '/index.html' : u.pathname;");
    L.push("    const f = path.join(PUBLIC, rel.replace(/\\.\\./g, ''));");
    L.push("    if (f.startsWith(PUBLIC) && fs.existsSync(f) && fs.statSync(f).isFile())");
    L.push("      return send(res, 200, fs.readFileSync(f, 'utf8'), MIME[path.extname(f)] || 'text/plain');");
    L.push("    send(res, 404, { error: 'not found' });");
    L.push("  } catch (e) { send(res, e.status || 500, { error: String(e.message || e) }); }");
    L.push("});");
    L.push("");
    L.push("if (require.main === module) db.migrate().then(() => server.listen(PORT, () => console.log('" + s.name + " gateway on http://localhost:' + PORT)));");
    L.push("module.exports = { server };");
    L.push("");
    return L.filter(function (l, i) { return !(l === '' && L[i - 1] === ''); }).join('\n');
  }

  function domainServer(s, d, doms) {
    var withAuth = Schema().normalizeSpec(s).auth;
    var L = [
      "'use strict';",
      "// " + s.name + " :: " + d.name + " service — owns the '" + d.table + "' resource.",
      "// Trusts x-user-id / x-user-role from the gateway (internal network only).",
      "const http = require('http');",
      "const db = require('../../src/db');",
      "const " + d.name + "Svc = require('../../src/services/" + d.name + "');",
      "",
      "const SERVICES = { '" + d.table + "': " + d.name + "Svc };",
      "const PORT = process.env.PORT || process.env." + d.env.replace('_SERVICE_URL', '_PORT') + " || (process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1] || " + d.port + ";",
      "",
      common(),
      "",
      "const server = http.createServer(async (req, res) => {",
      "  observe(req, res);",
      "  const u = new URL(req.url, 'http://localhost'); const seg = u.pathname.split('/').filter(Boolean);",
      "  try {",
      "    if (u.pathname === '/healthz') return send(res, 200, { ok: true, service: '" + d.name + "' });",
      "    if (u.pathname === '/metrics') return send(res, 200, metricsText(), 'text/plain; version=0.0.4');",
      resourceRouter('service', doms, withAuth),
      "    send(res, 404, { error: 'not found' });",
      "  } catch (e) { send(res, e.status || 500, { error: String(e.message || e) }); }",
      "});",
      "",
      "if (require.main === module) db.migrate().then(() => server.listen(PORT, () => console.log('" + d.name + " service on http://localhost:' + PORT)));",
      "module.exports = { server };",
      ""
    ];
    return L.filter(function (l, i) { return !(l === '' && L[i - 1] === ''); }).join('\n');
  }

  function registry(doms) {
    return [
      "'use strict';",
      "// resource table -> owning domain service URL. Env vars win so the same",
      "// build runs locally, in docker-compose, and in the integration test.",
      "const MAP = {",
      doms.map(function (d) {
        return "  '" + d.table + "': () => process.env." + d.env + " || 'http://localhost:' + (process.env." + d.env.replace('_SERVICE_URL', '_PORT') + " || " + d.port + ")";
      }).join(',\n'),
      "};",
      "function urlFor(table) { return MAP[table] ? MAP[table]() : null; }",
      "module.exports = { urlFor, tables: Object.keys(MAP) };",
      ""
    ].join('\n');
  }

  function compose(s, doms) {
    var name = Schema().normalizeSpec(s).name;
    var L = [];
    L.push("# " + name + " — microservice topology. `docker compose -f docker-compose.prod.yml up`");
    L.push("services:");
    L.push("  postgres:");
    L.push("    image: postgres:16-alpine");
    L.push("    environment:");
    L.push("      POSTGRES_USER: " + name);
    L.push("      POSTGRES_PASSWORD: ${DB_PASSWORD:-devpassword}");
    L.push("      POSTGRES_DB: " + name);
    L.push("    volumes: [ pgdata:/var/lib/postgresql/data ]");
    L.push("    healthcheck:");
    L.push("      test: [\"CMD-SHELL\", \"pg_isready -U " + name + "\"]");
    L.push("      interval: 5s");
    L.push("      timeout: 3s");
    L.push("      retries: 10");
    L.push("  gateway:");
    L.push("    build: { context: ., dockerfile: gateway/Dockerfile }");
    L.push("    environment:");
    L.push("      DATABASE_URL: postgres://" + name + ":${DB_PASSWORD:-devpassword}@postgres:5432/" + name);
    doms.forEach(function (d) { L.push("      " + d.env + ": http://" + d.name + ":" + d.port); });
    L.push("    ports: [ \"4319:4319\" ]");
    L.push("    depends_on:");
    L.push("      postgres: { condition: service_healthy }");
    doms.forEach(function (d) { L.push("      " + d.name + ": { condition: service_started }"); });
    doms.forEach(function (d) {
      L.push("  " + d.name + ":");
      L.push("    build: { context: ., dockerfile: services/" + d.name + "/Dockerfile }");
      L.push("    environment:");
      L.push("      PORT: \"" + d.port + "\"");
      L.push("      DATABASE_URL: postgres://" + name + ":${DB_PASSWORD:-devpassword}@postgres:5432/" + name);
      L.push("    depends_on:");
      L.push("      postgres: { condition: service_healthy }");
    });
    L.push("volumes: { pgdata: {} }");
    L.push("");
    return L.join('\n');
  }

  function dockerfile(cmd) {
    return 'FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev || true\nCOPY . .\n' +
      'CMD ' + JSON.stringify(cmd) + '\n';
  }

  function integrationTest(s, doms) {
    var withAuth = Schema().normalizeSpec(s).auth;
    var d0 = doms[0];
    var L = [
      "'use strict';",
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-msvc-' + process.pid);",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const db = require('../src/db');",
      "",
      "const DOMS = " + JSON.stringify(doms.map(function (d) { return { name: d.name, table: d.table, env: d.env }; })) + ";",
      "",
      "test('microservices: gateway fans a request out to a real domain service process', async () => {",
      "  await db.reset(); await db.migrate();",
      "  const servers = [];",
      "  // 1. boot every domain service on an ephemeral port, publish its URL",
      "  for (const d of DOMS) {",
      "    const { server } = require('../services/' + d.name + '/server');",
      "    await new Promise((r) => server.listen(0, r));",
      "    process.env[d.env] = 'http://localhost:' + server.address().port;",
      "    servers.push(server);",
      "  }",
      "  // 2. boot the gateway (registry reads the env vars we just set, per request)",
      "  const { server: gw } = require('../gateway/server');",
      "  await new Promise((r) => gw.listen(0, r));",
      "  servers.push(gw);",
      "  const base = 'http://localhost:' + gw.address().port;",
      "  const call = (p, o) => fetch(base + p, o).then(async (x) => ({ s: x.status, j: await x.json().catch(() => null) }));",
      "  try {"
    ];
    if (withAuth) {
      L.push("    const reg = await call('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ms@ex.com', password: 'password123' }) });");
      L.push("    assert.equal(reg.s, 201, 'gateway owns auth'); assert.ok(reg.j.token);");
      L.push("    const tok = reg.j.token;");
      L.push("    const anon = await call('/api/" + d0.table + "', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });");
      L.push("    assert.equal(anon.s, 401, 'gateway rejects an unauthenticated mutation before proxying');");
      L.push("    const cr = await call('/api/" + d0.table + "', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(" + sample(s, d0) + ") });");
      L.push("    assert.equal(cr.s, 201, 'gateway proxied the create to the " + d0.name + " service');");
      L.push("    const li = await call('/api/" + d0.table + "', { headers: { authorization: 'Bearer ' + tok } });");
      L.push("    assert.equal(li.s, 200);");
      L.push("    assert.ok((li.j.rows || []).length === 1, 'the row round-tripped through two processes');");
    } else {
      L.push("    const cr = await call('/api/" + d0.table + "', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(" + sample(s, d0) + ") });");
      L.push("    assert.equal(cr.s, 201);");
      L.push("    const li = await call('/api/" + d0.table + "', {});");
      L.push("    assert.equal(li.s, 200); assert.ok((li.j.rows || []).length === 1);");
    }
    L.push("    const health = await call('/healthz', {});");
    L.push("    assert.equal(health.j.service, 'gateway');");
    L.push("  } finally {");
    L.push("    for (const srv of servers) await new Promise((r) => srv.close(r));");
    L.push("    await db.reset();");
    L.push("  }");
    L.push("});");
    L.push("");
    return L.join('\n');
  }

  function sample(s, d) {
    var e = Schema().normalizeSpec(s).entities.find(function (x) { return x.name === d.name; }) || { fields: [] };
    var o = {};
    e.fields.forEach(function (f) {
      if (['id', 'timestamp'].indexOf(f.type) >= 0) return;
      if (f.type === 'ref' && f.ref === 'user') return; // service injects owner from identity
      if (f.type === 'ref') { o[f.name] = 1; return; }
      if (f.type === 'bool') { o[f.name] = false; return; }
      if (f.type === 'int' || f.type === 'float') { o[f.name] = 1; return; }
      o[f.name] = 'sample';
    });
    return JSON.stringify(o);
  }

  function generate(spec) {
    var s = Schema().normalizeSpec(spec);
    var doms = domains(s);
    var out = {};
    out['gateway/server.js'] = gatewayServer(s, doms);
    out['gateway/registry.js'] = registry(doms);
    out['gateway/Dockerfile'] = dockerfile(['node', 'gateway/server.js', '--port=4319']);
    doms.forEach(function (d) {
      out['services/' + d.name + '/server.js'] = domainServer(s, d, doms);
      out['services/' + d.name + '/Dockerfile'] = dockerfile(['node', 'services/' + d.name + '/server.js']);
    });
    out['docker-compose.prod.yml'] = compose(s, doms);
    out['test/microservices.test.js'] = integrationTest(s, doms);
    out['docs/ARCHITECTURE.md'] =
      '# ' + s.name + ' — service topology\n\n' +
      '```\n client ──▶ gateway :4319 ──┬─▶ ' + doms.map(function (d) { return d.name + ' :' + d.port; }).join('\n' + ' '.repeat(27) + '├─▶ ') + '\n```\n\n' +
      '| resource | owning service | container |\n|---|---|---|\n' +
      doms.map(function (d) { return '| `/api/' + d.table + '` | ' + d.name + ' | `services/' + d.name + '` |'; }).join('\n') + '\n\n' +
      '- **Gateway** (`gateway/server.js`) is the only public port. It owns registration/login, ' +
      'per-IP rate limiting, static assets, and session verification. For every `/api/<resource>` call it ' +
      'looks the resource up in `gateway/registry.js`, verifies the bearer token, and forwards the request ' +
      'to the owning service with `x-user-id` / `x-user-role` headers.\n' +
      '- **Domain services** trust those headers (they are only reachable on the internal compose network) ' +
      'and serve exactly one resource each, backed by the shared data layer.\n' +
      '- **Shared database.** Every service talks to one Postgres (`DATABASE_URL`). The split is at the API ' +
      'and deployment boundary — each service scales, deploys, and fails independently — but they are not ' +
      'data-isolated. Splitting the schema per service is a follow-on migration, not generated here.\n\n' +
      '## Verify\n\n```\nnpm test              # boots the gateway + every domain service on real\n' +
      '                      # ports and round-trips a request through them\ndocker compose -f docker-compose.prod.yml up\n```\n';
    return out;
  }

  Engine.Microservices = { generate: generate, domains: domains };
  console.info('[Microservices] gateway + domain-service generator ready — Engine.Microservices');
})();
