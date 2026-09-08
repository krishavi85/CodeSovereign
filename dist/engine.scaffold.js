/* =====================================================================
   engine.scaffold.js  —  Engine.Scaffold   (blueprint §5, build-flow §9-11)

   Repo-scale generation: turns a product spec into a COMPLETE, RUNNABLE,
   TESTED full-stack project — backend + data layer + migrations + auth +
   frontend + unit/integration tests + build/lint/migrate scripts + CI +
   Dockerfile. Dependency-free (Node + vanilla JS) so `npm test` really runs
   and the runtime observer can really drive it.

   window.Engine.Scaffold
     DEMO_SPEC
     normalize(spec)              -> canonical spec
     specFromContext()            -> derive a spec from .sovereign + package.json
     specFromObjective(text)      -> Promise<spec>  (uses Engine.AI when connected)
     generate(spec)               -> [{ path, content }]   (the whole repo)
     writeTo(fs, spec)            -> writes generate() into an Engine.FS-like object
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  function S() { return Engine.Schema; }
  function B() { return Engine.Backend; }
  function A() { return Engine.Auth; }

  var DEMO_SPEC = {
    name: 'taskboard', auth: true,
    entities: [
      { name: 'project', fields: [
        { name: 'name', type: 'text', required: true, max: 120 },
        { name: 'ownerId', type: 'ref', ref: 'user', required: true }
      ], indexes: [{ fields: ['name', 'ownerId'], unique: true }] },
      { name: 'task', fields: [
        { name: 'title', type: 'text', required: true, max: 200 },
        { name: 'done', type: 'bool', default: false },
        { name: 'projectId', type: 'ref', ref: 'project', required: true },
        { name: 'ownerId', type: 'ref', ref: 'user', required: true }
      ] }
    ]
  };

  var FRONTENDS = ['vanilla', 'react', 'preact', 'vue', 'svelte'];
  function normalize(spec) {
    spec = spec || DEMO_SPEC;
    var s = S().normalizeSpec(spec);
    s.jobs = !!spec.jobs;
    s.stack = spec.stack === 'node-pg' ? 'node-pg' : 'node-vanilla';
    s.frontend = FRONTENDS.indexOf(spec.frontend) >= 0 ? spec.frontend : 'vanilla';
    s.api = spec.api === 'graphql' ? 'graphql' : 'rest';
    s.websocket = !!spec.websocket;
    s.microservices = !!spec.microservices;
    s.deployTargets = Array.isArray(spec.deployTargets) && spec.deployTargets.length ? spec.deployTargets : ['docker', 'compose'];
    s.pyBackend = spec.backend === 'python';
    var names = s.entities.map(function (e) { return e.name; });
    var prepend = function (ent) {
      if (names.indexOf(ent.name) >= 0) return;
      s.entities = [S().normalizeSpec({ name: s.name, entities: [ent] }).entities[0]].concat(s.entities);
      names.unshift(ent.name);
    };
    if (s.auth) A().entities().slice().reverse().forEach(prepend);
    if (s.jobs && Engine.Jobs) prepend(Engine.Jobs.entity());
    return s;
  }

  /* ---- spec derivation ---- */
  function specFromContext() {
    var name = 'app';
    try { var pj = JSON.parse(Engine.FS.read('/package.json') || 'null'); if (pj && pj.name) name = pj.name; } catch (_) {}
    var reqs = null, ds = null;
    try { reqs = JSON.parse((Engine.Sovereign && Engine.Sovereign.read('requirements.json')) || 'null'); } catch (_) {}
    var archs = (reqs && (reqs.aiArchetypes || (reqs.detectedArchetypes || []).map(function (a) { return a.archetype; }))) || [];
    // very small archetype -> entity heuristic; falls back to the demo
    var byArch = {
      ecommerce: [{ name: 'product', fields: [{ name: 'title', type: 'text', required: true }, { name: 'priceCents', type: 'int', required: true }] },
        { name: 'order', fields: [{ name: 'total', type: 'int', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }],
      social: [{ name: 'post', fields: [{ name: 'body', type: 'longtext', required: true, max: 5000 }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }],
      education: [{ name: 'course', fields: [{ name: 'title', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] },
        { name: 'lesson', fields: [{ name: 'title', type: 'text', required: true }, { name: 'courseId', type: 'ref', ref: 'course', required: true }] }]
    };
    for (var i = 0; i < archs.length; i++) if (byArch[archs[i]]) return normalize({ name: name, auth: true, entities: byArch[archs[i]] });
    return normalize(Object.assign({}, DEMO_SPEC, { name: name }));
  }

  // Deterministic, offline: turn a Product Contract (Engine.Contract.deriveFromPrompt)
  // into a scaffold spec. No AI — the contract already carries the data model.
  function specFromContract(contract) {
    if (!contract || !Array.isArray(contract.entities)) return normalize(DEMO_SPEC);
    var st = contract.supportedStack || {};
    var ents = contract.entities
      .filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; })
      .slice(0, 5)
      .map(function (e) {
        var fields = (e.fields || []).filter(function (f) { return f && f.name && ['id', 'createdAt', 'updatedAt'].indexOf(f.name) < 0; });
        if (st.auth && !fields.some(function (f) { return f.type === 'ref' && f.ref === 'user'; })) {
          fields.push({ name: 'ownerId', type: 'ref', ref: 'user', required: true });
        }
        return { name: e.name, fields: fields };
      });
    if (!ents.length) ents = DEMO_SPEC.entities;
    return normalize({
      name: (contract.product && contract.product.name) || 'app',
      auth: st.auth !== false,
      jobs: !!st.jobs,
      stack: (contract.storage && contract.storage.choice) === 'postgres' ? 'node-pg' : 'node-vanilla',
      frontend: FRONTENDS.indexOf(st.frontend) >= 0 ? st.frontend : 'vanilla',
      api: st.api === 'graphql' ? 'graphql' : 'rest',
      websocket: !!st.websocket,
      microservices: st.architecture === 'multi-service',
      deployTargets: st.deployTargets || ['docker', 'compose'],
      entities: ents
    });
  }

  function specFromObjective(text) {
    var AI = Engine.AI;
    var fallback = function () { return normalize(Object.assign({}, DEMO_SPEC, { name: (String(text || '').split(/\s+/).slice(0, 2).join('-').replace(/[^a-z0-9-]/gi, '').toLowerCase()) || 'app' })); };
    if (!AI || !AI.ready || !AI.ready() || !AI.json) return Promise.resolve(fallback());
    var ask = 'Design the data model for this app. Return ONLY JSON:\n' +
      '{"name":"kebab-name","auth":true,"entities":[{"name":"singular","fields":[' +
      '{"name":"field","type":"text|longtext|int|float|bool|timestamp|ref","required":true,"max":200,"ref":"otherEntitySingular"}]}]}\n' +
      'Rules: 1-4 entities besides user. Give each user-owned entity an "ownerId" ref:"user". No id/createdAt (added automatically).\n\n' +
      'App: ' + String(text || '');
    return AI.json(ask, { maxTokens: 1100 }).then(function (j) {
      if (!j || !Array.isArray(j.entities) || !j.entities.length) return fallback();
      return normalize({ name: j.name || 'app', auth: j.auth !== false, entities: j.entities.slice(0, 5) });
    }).catch(fallback);
  }

  /* ---- frontend ---- */
  function frontend(s) {
    var forms = s.entities.filter(function (e) { return ['user','session','job'].indexOf(e.name) < 0; }).map(function (e) {
      var editable = e.fields.filter(function (f) { return ['id', 'timestamp'].indexOf(f.type) < 0 && !(f.type === 'ref' && f.ref === 'user'); });
      var inputs = editable.map(function (f) {
        if (f.type === 'bool') return '<label><input type="checkbox" data-f="' + f.name + '"> ' + f.name + '</label>';
        var t = (f.type === 'int' || f.type === 'float') ? 'number' : 'text';
        return '<input data-f="' + f.name + '" type="' + t + '" placeholder="' + f.name + (f.type === 'ref' ? ' (id)' : '') + '"' + (f.required ? ' required' : '') + '>';
      }).join('\n        ');
      return {
        name: e.name, table: e.table,
        html: '  <section class="card" data-entity="' + e.name + '">\n' +
          '    <h2>' + e.name + '</h2>\n' +
          '    <form class="create">\n        ' + inputs + '\n        <button type="submit">Add ' + e.name + '</button>\n    </form>\n' +
          '    <div class="err" hidden></div>\n    <ul class="list"></ul>\n  </section>\n',
        fields: editable.map(function (f) { return { name: f.name, type: f.type }; })
      };
    });
    var authFrag = s.auth ? A().uiFragment() : { html: '', js: '' };
    var html =
      '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + s.name + '</title>\n<link rel="stylesheet" href="app.css">\n</head>\n<body>\n' +
      '  <h1>' + s.name + '</h1>\n' + authFrag.html +
      (s.auth ? '  <div id="entities" hidden>\n' : '  <div id="entities">\n') +
      forms.map(function (f) { return f.html; }).join('') +
      '  </div>\n  <script src="app.js"></script>\n</body>\n</html>\n';
    var js = [
      "'use strict';",
      s.auth ? authFrag.js : "function authHeaders() { return { 'content-type': 'application/json' }; }",
      "",
      "const ENTITIES = " + JSON.stringify(forms.map(function (f) { return { name: f.name, table: f.table, fields: f.fields }; })) + ";",
      "",
      "async function loadEntity(cfg) {",
      "  const sec = document.querySelector('[data-entity=\"' + cfg.name + '\"]');",
      "  const list = sec.querySelector('.list'); list.innerHTML = '<li>Loading…</li>';",
      "  try {",
      "    const res = await fetch('/api/' + cfg.table + '?limit=100', { headers: authHeaders() });",
      "    const j = await res.json();",
      "    const rows = j.rows || [];",
      "    list.innerHTML = rows.length ? rows.map((r) => renderRow(cfg, r)).join('') : '<li class=\"empty\">Nothing yet</li>';",
      "    list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => del(cfg, b.dataset.del)));",
      "  } catch (e) { list.innerHTML = '<li class=\"error\">Could not load</li>'; }",
      "}",
      "function renderRow(cfg, r) {",
      "  const main = cfg.fields.map((f) => r[f.name]).filter((v) => v != null).slice(0, 3).join(' · ');",
      "  return '<li>' + escapeHtml(String(main || ('#' + r.id))) + ' <button data-del=\"' + r.id + '\">delete</button></li>';",
      "}",
      "function escapeHtml(s) { return s.replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c])); }",
      "async function del(cfg, id) {",
      "  await fetch('/api/' + cfg.table + '/' + id, { method: 'DELETE', headers: authHeaders() });",
      "  loadEntity(cfg);",
      "}",
      "ENTITIES.forEach((cfg) => {",
      "  const sec = document.querySelector('[data-entity=\"' + cfg.name + '\"]');",
      "  sec.querySelector('form.create').addEventListener('submit', async (e) => {",
      "    e.preventDefault();",
      "    const err = sec.querySelector('.err'); err.hidden = true;",
      "    const body = {};",
      "    sec.querySelectorAll('[data-f]').forEach((el) => { body[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; });",
      "    const btn = e.target.querySelector('button'); btn.disabled = true;",
      "    try {",
      "      const res = await fetch('/api/' + cfg.table, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });",
      "      const j = await res.json();",
      "      if (!res.ok) throw new Error(j.error || 'failed');",
      "      e.target.reset(); loadEntity(cfg);",
      "    } catch (e2) { err.textContent = e2.message; err.hidden = false; } finally { btn.disabled = false; }",
      "  });",
      "});",
      s.auth
        ? "window.onSignedIn = () => { document.getElementById('entities').hidden = false; ENTITIES.forEach(loadEntity); };"
        : "ENTITIES.forEach(loadEntity);"
    ].join('\n') + '\n';
    var css = "*{box-sizing:border-box}body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111}" +
      "h1{margin:0 0 16px}.card{border:1px solid #ddd;border-radius:10px;padding:16px;margin-bottom:16px}" +
      "h2{margin:0 0 10px;font-size:16px;text-transform:capitalize}form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}" +
      "input:not([type=checkbox]){flex:1;min-width:120px;padding:7px 9px;border:1px solid #ccc;border-radius:7px}" +
      "button{padding:7px 12px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:7px;cursor:pointer}" +
      "button[data-del]{background:transparent;color:#b91c1c;border-color:#e5b4b4;padding:2px 8px;font-size:12px}" +
      "ul{list-style:none;padding:0;margin:0}li{padding:6px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}" +
      ".error,.err{color:#b91c1c}.empty{color:#888}.userbar{display:flex;gap:10px;align-items:center;margin-bottom:12px;font-size:13px}\n";
    return { 'public/index.html': html, 'public/app.js': js, 'public/app.css': css };
  }

  /* ---- tests ---- */
  function tests(s) {
    var out = {};
    var first = s.entities.filter(function (e) { return ['user','session','job'].indexOf(e.name) < 0; })[0];
    // each test file gets its own data dir — real isolation, no shared-.data races
    var head = function (tag) {
      return "'use strict';\n" +
        "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-" + tag + "-' + process.pid);\n" +
        "const test = require('node:test');\nconst assert = require('node:assert');\n";
    };
    out['test/db.test.js'] =
      head('db') + "const db = require('../src/db');\n\n" +
      "test('data layer: migrate + required validation + crud', async () => {\n" +
      "  await db.reset(); await db.migrate();\n" +
      (s.auth
        ? "  const u = await db.create('user', { email: 'a@b.co', passwordHash: 'scrypt$x$y', role: 'admin' });\n" +
          (first ? "  await assert.rejects(() => db.create('" + first.name + "', {}), /required/);\n" +
            "  const row = await db.create('" + first.name + "', " + sampleFor(first, 'u.id') + ");\n" +
            "  assert.ok(row.id > 0);\n" +
            "  const l = await db.list('" + first.name + "', {}); assert.equal(l.total, 1);\n" +
            "  await db.remove('user', u.id);\n" +
            "  const after = await db.list('" + first.name + "', {}); assert.equal(after.total, 0, 'ON DELETE CASCADE');\n" : "")
        : (first ? "  await assert.rejects(() => db.create('" + first.name + "', {}), /required/);\n" +
          "  const row = await db.create('" + first.name + "', " + sampleFor(first, '1') + "); assert.ok(row.id > 0);\n" : "")) +
      "  await db.reset();\n});\n";
    if (s.auth) {
      out['test/auth.test.js'] =
        head('auth') + "const db = require('../src/db');\nconst auth = require('../src/auth');\n\n" +
        "test('auth: register, login, wrong password, session', async () => {\n" +
        "  await db.reset(); await db.migrate();\n" +
        "  const r = await auth.register('user@ex.com', 'hunter2hunter');\n" +
        "  assert.equal(r.user.email, 'user@ex.com');\n" +
        "  assert.equal(r.user.role, 'admin', 'first user is admin');\n" +
        "  await assert.rejects(() => auth.login('user@ex.com', 'wrong'), /invalid/);\n" +
        "  const l = await auth.login('user@ex.com', 'hunter2hunter');\n" +
        "  const me = await auth.userFromToken(l.token); assert.equal(me.email, 'user@ex.com');\n" +
        "  await auth.logout(l.token);\n" +
        "  assert.equal(await auth.userFromToken(l.token), null);\n" +
        "  await db.reset();\n});\n";
    }
    out['test/api.test.js'] =
      head('api') + "const db = require('../src/db');\nconst { server } = require('../server');\n\n" +
      "test('api: server boots and answers', async () => {\n" +
      "  await db.reset(); await db.migrate();\n" +
      "  await new Promise((r) => server.listen(0, r));\n" +
      "  const port = server.address().port;\n" +
      "  const get = (p, o) => fetch('http://localhost:' + port + p, o).then(async (x) => ({ s: x.status, j: await x.json().catch(() => null) }));\n" +
      (s.auth
        ? "  const reg = await get('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@y.co', password: 'password123' }) });\n" +
          "  assert.equal(reg.s, 201); assert.ok(reg.j.token);\n" +
          (first ? "  const cr = await get('/api/" + first.table + "', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + reg.j.token }, body: JSON.stringify(" + sampleFor(first, 'reg.j.user.id') + ") });\n" +
            "  assert.equal(cr.s, 201);\n" +
            "  const li = await get('/api/" + first.table + "', { headers: { authorization: 'Bearer ' + reg.j.token } });\n" +
            "  assert.equal(li.s, 200); assert.equal(li.j.rows.length, 1);\n" : "")
        : (first ? "  const cr = await get('/api/" + first.table + "', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(" + sampleFor(first, '1') + ") });\n  assert.equal(cr.s, 201);\n" : "")) +
      "  await new Promise((r) => server.close(r));\n" +
      "  await db.reset();\n});\n";
    return out;
  }
  function sampleFor(e, ownerExpr) {
    var o = {};
    e.fields.forEach(function (f) {
      if (f.type === 'id' || f.type === 'timestamp') return;
      if (f.type === 'ref' && f.ref === 'user') { o[f.name] = '__OWNER__'; return; }
      if (f.type === 'ref') { o[f.name] = 1; return; }
      if (f.type === 'bool') { o[f.name] = false; return; }
      if (f.type === 'int' || f.type === 'float') { o[f.name] = 1; return; }
      o[f.name] = 'sample';
    });
    return JSON.stringify(o).replace('"__OWNER__"', ownerExpr);
  }

  /* ---- scripts / meta ---- */
  function meta(s) {
    var scripts = {
      dev: 'node server.js --port=4319', start: 'node server.js --port=4319',
      migrate: 'node scripts/migrate.js', test: 'node --test --test-concurrency=1',
      build: 'node scripts/build.js', lint: 'node scripts/lint.js'
    };
    if (s.jobs) scripts.worker = 'node src/worker.js';
    var pj = { name: s.name, version: '0.1.0', private: true,
      description: 'Generated by CodeSovereign — full-stack' + (s.stack === 'node-pg' ? ' (Node + Postgres)' : ', dependency-free') + '.',
      scripts: scripts };
    if (s.stack === 'node-pg') pj.optionalDependencies = { pg: '^8.11.0' };
    return {
      'package.json': JSON.stringify(pj, null, 2) + '\n',
      'scripts/migrate.js': "'use strict';\nrequire('../src/db').migrate().then((t) => console.log('migrated:', t.join(', ')));\n",
      'scripts/build.js':
        "'use strict';\nconst fs = require('fs'); const path = require('path');\nconst root = path.join(__dirname, '..'); const out = path.join(root, 'dist');\n" +
        "fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });\n" +
        "for (const f of fs.readdirSync(path.join(root, 'public'))) fs.copyFileSync(path.join(root, 'public', f), path.join(out, f));\n" +
        "fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), files: fs.readdirSync(out) }, null, 2));\n" +
        "console.log('built', fs.readdirSync(out).length, 'files -> dist/');\n",
      'scripts/lint.js':
        "'use strict';\nconst fs = require('fs'); const path = require('path'); const vm = require('vm');\nconst root = path.join(__dirname, '..');\n" +
        "function walk(d) { let r = []; for (const n of fs.readdirSync(d)) { const p = path.join(d, n); const st = fs.statSync(p); if (st.isDirectory()) { if (!/node_modules|\\.data|dist/.test(n)) r = r.concat(walk(p)); } else if (n.endsWith('.js')) r.push(p); } return r; }\n" +
        "let problems = 0;\nfor (const f of walk(path.join(root, 'src')).concat([path.join(root, 'server.js')], walk(path.join(root, 'scripts')))) {\n" +
        "  const src = fs.readFileSync(f, 'utf8');\n  try { new vm.Script(src, { filename: f }); } catch (e) { console.error('PARSE ' + f + ': ' + e.message); problems++; continue; }\n" +
        "  src.split('\\n').forEach((l, i) => { if (/^\\s*var\\s/.test(l)) { console.error('NO-VAR ' + f + ':' + (i + 1)); problems++; } });\n}\n" +
        "console.log(problems ? problems + ' lint problem(s)' : 'lint clean'); process.exit(problems ? 1 : 0);\n",
      '.gitignore': 'node_modules/\ndist/\n.data/\n',
      '.env.example': '# ' + s.name + '\nPORT=4319\n# For production, point the data layer at Postgres:\n# DATABASE_URL=postgres://user:pass@host:5432/' + s.name + '\n',
      'Dockerfile':
        'FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev || true\nCOPY . .\nRUN node scripts/migrate.js\nEXPOSE 4319\n' +
        'HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4319/ || exit 1\nCMD ["node", "server.js", "--port=4319"]\n',
      '.github/workflows/ci.yml':
        'name: CI\non:\n  push: { branches: [main] }\n  pull_request:\njobs:\n' +
        '  quality:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 20 }\n' +
        '      - run: npm ci || npm install\n      - run: npm run lint\n      - run: npm run migrate\n      - run: npm test\n' +
        '  build:\n    needs: [quality]\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 20 }\n' +
        '      - run: npm ci || npm install\n      - run: npm run build\n      - uses: actions/upload-artifact@v4\n        with: { name: dist, path: dist/ }\n' +
        '  deploy:\n    needs: [build]\n    runs-on: ubuntu-latest\n    environment: production\n    steps:\n      - run: echo "deploy here"\n',
      'README.md':
        '# ' + s.name + '\n\nGenerated by **CodeSovereign** — a complete, dependency-free full-stack app.\n\n' +
        '- **Backend** `server.js` — REST API, ' + (s.auth ? 'session auth + RBAC, ' : '') + 'CRUD per entity\n' +
        '- **Data layer** `src/db.js` — schema-enforced JSON store (swap for Postgres via `DATABASE_URL`)\n' +
        '- **Migrations** `db/migrations/*.sql` — real SQL, apply with `npm run migrate`\n' +
        (s.auth ? '- **Auth** `src/auth.js` — scrypt hashing, opaque sessions, `requireAuth` / `requireRole`\n' : '') +
        '- **Frontend** `public/` — real fetch with loading / error / empty states\n\n' +
        '## Entities\n\n' + s.entities.map(function (e) { return '- **' + e.name + '** — ' + e.fields.map(function (f) { return f.name + ':' + f.type; }).join(', '); }).join('\n') + '\n\n' +
        '## Run\n\n```\nnpm install   # (no deps, but sets up)\nnpm run migrate\nnpm test\nnpm run dev   # http://localhost:4319\n```\n'
    };
  }

  function generate(spec) {
    var s = normalize(spec);
    var files = {};
    var add = function (obj) { Object.keys(obj).forEach(function (k) { files['/' + k] = obj[k]; }); };

    add(S().migrationsSQL(s));
    files['/src/schema.js'] = S().schemaModule(s);
    if (s.stack === 'node-pg') {
      files['/src/db.js'] = S().dbShim();
      files['/src/db.json.js'] = S().dbModule(s);
      files['/src/db.pg.js'] = S().pgModule(s);
    } else {
      files['/src/db.js'] = S().dbModule(s);
    }
    if (s.auth) files['/src/auth.js'] = A().module();
    s.entities.filter(function (e) { return e.name !== 'user' && e.name !== 'session' && e.name !== 'job'; }).forEach(function (e) {
      files['/src/services/' + e.name + '.js'] = B().serviceModule(e);
    });
    if (s.jobs && Engine.Jobs) {
      var J = Engine.Jobs;
      files['/src/queue.js'] = J.queueModule();
      files['/src/worker.js'] = J.workerModule();
      files['/src/events.js'] = J.eventsModule();
      files['/src/jobs/welcome.js'] = J.sampleJob();
      files['/test/worker.test.js'] = J.workerTest();
    }
    files['/server.js'] = B().serverModule(s);
    // frontend: a component framework (react/preact/vue) if asked, else vanilla
    if (s.frontend && s.frontend !== 'vanilla' && Engine.Frontends) {
      add(Engine.Frontends.generate(s));
    } else if (s.frontend === 'svelte' && Engine.Frontends) {
      // Svelte needs a compiler — fall back to the react-compatible runtime and
      // record it (the contract already carries the substitution note).
      var sv = Engine.Frontends.generate(Object.assign({}, s, { frontend: 'react' }));
      add(sv);
    } else {
      add(frontend(s));
    }
    // GraphQL layer over the same entities (REST is still emitted)
    if (s.api === 'graphql' && Engine.GraphQL) {
      var gq = Engine.GraphQL.generate(s);
      Object.keys(gq).forEach(function (k) { files['/' + k] = gq[k]; });
    }
    // real WebSocket endpoint + round-trip test
    if (s.websocket && Engine.Realtime) {
      var rt = Engine.Realtime.generate(s);
      Object.keys(rt).forEach(function (k) { files['/' + k] = rt[k]; });
    }
    add(tests(s));
    add(meta(s));

    var an = S().analyze(s);
    files['/docs/DATA_MODEL.md'] = '# Data model\n\n' + s.entities.map(function (e) {
      return '## ' + e.name + ' (`' + e.table + '`)\n\n' + e.fields.map(function (f) {
        return '- `' + f.name + '` ' + f.type + (f.ref ? ' → ' + f.ref : '') + (f.required ? ' **required**' : '');
      }).join('\n');
    }).join('\n\n') + '\n\n## Analysis\n\n' + (an.hints.length ? an.hints.map(function (h) { return '- **' + h.kind + '** ' + (h.entity || '') + (h.field ? '.' + h.field : '') + (h.note ? ' — ' + h.note : ''); }).join('\n') : '- no issues') + '\n';

    return Object.keys(files).sort().map(function (p) { return { path: p, content: files[p] }; });
  }

  function writeTo(fsLike, spec) {
    var g = generate(spec);
    g.forEach(function (f) { fsLike.write(f.path, f.content); });
    return g.map(function (f) { return f.path; });
  }

  Engine.Scaffold = { DEMO_SPEC: DEMO_SPEC, normalize: normalize, specFromContext: specFromContext, specFromObjective: specFromObjective, specFromContract: specFromContract, generate: generate, writeTo: writeTo };
  console.info('[Scaffold] repo-scale generator ready — Engine.Scaffold');
})();
