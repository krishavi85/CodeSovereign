'use strict';
/* engine.frontends + engine.graphql + engine.realtime + engine.deploy (k8s/helm/tf)
 * + the contract's expanded stack detection. Generates each variant, parses every
 * emitted JS/YAML, and RUNS the generated test suites (frontend / graphql / ws)
 * with real `node --test`. This proves the added stacks produce working software. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

function loadEngines(names, extra) {
  const dist = path.join(__dirname, '..', 'dist');
  const win = { console, setTimeout, clearTimeout };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  win.Engine = {
    FS: { _data: data, isFile: (p) => !!data[p], exists: (p) => p in data, read: (p) => (data[p] ? data[p].content : null),
      write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {}, count: () => 0, __flush: () => Promise.resolve() },
    Sovereign: { read: (p) => (sov[p] ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null), write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); } }
  };
  Object.assign(win, extra || {});
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(dist, n), 'utf8'), win, { filename: n });
  return win;
}

function writeAndRun(map, testFile, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-' + tag + '-'));
  try {
    Object.keys(map).forEach((p) => {
      const abs = path.join(dir, p.replace(/^\//, ''));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, map[p]);
    });
    if (map['/scripts/migrate.js'] || map['scripts/migrate.js']) {
      try { cp.execFileSync('node', ['scripts/migrate.js'], { cwd: dir, stdio: 'pipe', timeout: 30000 }); } catch (_) {}
    }
    const r = cp.spawnSync('node', ['--test', testFile], { cwd: dir, encoding: 'utf8', timeout: 40000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const pass = Number((out.match(/(?:ℹ |# )?pass (\d+)/) || [])[1] || 0);
    const fail = Number((out.match(/(?:ℹ |# )?fail (\d+)/) || [])[1] || 0);
    return { exit: r.status, pass, fail, out };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = async function (t) {
  /* ---------- 1. contract detects the expanded stack ---------- */
  {
    const win = loadEngines(['engine-universal.js', 'engine.contract.js']);
    const c = await win.Engine.Contract.deriveFromPrompt(
      'Build a React web app with accounts, projects and tasks, a GraphQL API, PostgreSQL, WebSockets for live updates and a Kubernetes deployment', { useLLM: false });
    t.equal('contract: frontend detected', c.supportedStack.frontend, 'react');
    t.equal('contract: api detected', c.supportedStack.api, 'graphql');
    t.equal('contract: websocket detected', c.supportedStack.websocket, true);
    t.ok('contract: kubernetes in deploy targets', c.supportedStack.deployTargets.indexOf('kubernetes') >= 0);
    t.equal('contract: verdict buildable', c.verdict, 'buildable');

    const py = await win.Engine.Contract.deriveFromPrompt('Build a Python FastAPI service for orders with SQLite', { useLLM: false });
    t.equal('contract: python backend detected', py.supportedStack.backend, 'python');

    const ios = await win.Engine.Contract.deriveFromPrompt('Build a native iOS app in Swift, no web version at all', { useLLM: false });
    t.equal('contract: native mobile still BLOCKS', ios.verdict, 'unsupported');
    t.ok('contract: mobile reason is specific', /native mobile/.test((ios.unsupported[0] || {}).reason || ''));

    const ml = await win.Engine.Contract.deriveFromPrompt('Build a tool to train an ML model on our dataset', { useLLM: false });
    t.equal('contract: ML training still BLOCKS', ml.verdict, 'unsupported');

    const vue = await win.Engine.Contract.deriveFromPrompt('Build a Vue dashboard for tracking expenses with a REST API', { useLLM: false });
    t.equal('contract: vue detected', vue.supportedStack.frontend, 'vue');
  }

  /* ---------- 2. React + Vue frontends generate + render ---------- */
  {
    const win = loadEngines(['engine.frontends.js']);
    for (const fw of ['react', 'vue']) {
      const spec = { name: 'shop', frontend: fw, auth: true, entities: [
        { name: 'user', fields: [] }, { name: 'session', fields: [] },
        { name: 'product', fields: [{ name: 'title', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user' }], table: 'products' }
      ] };
      const g = win.Engine.Frontends.generate(spec);
      const paths = Object.keys(g);
      t.ok(fw + ': emits index.html + app.js + vendored runtime + a test',
        paths.some((p) => /index\.html$/.test(p)) && paths.some((p) => /app\.js$/.test(p)) &&
        paths.some((p) => /vendor\//.test(p)) && paths.some((p) => /frontend\.test\.js$/.test(p)));
      paths.filter((p) => /\.js$/.test(p)).forEach((p) => {
        try { new vm.Script(g[p], { filename: p }); }
        catch (e) { t.ok(fw + ': ' + p + ' parses — ' + e.message, false); }
      });
      const idx = g[paths.find((p) => /index\.html$/.test(p))];
      t.ok(fw + ': html has lang + no un-alt-ed img', /<html[^>]*\blang=/.test(idx) && !/<img(?![^>]*\balt=)[^>]*>/.test(idx));
      const r = writeAndRun(g, 'test/frontend.test.js', fw);
      t.ok(fw + ': generated frontend test passes (' + r.pass + '/' + (r.pass + r.fail) + ')', r.exit === 0 && r.pass >= 2 && r.fail === 0);
    }
  }

  /* ---------- 3. GraphQL layer generates + the executor works ---------- */
  {
    const win = loadEngines(['engine.graphql.js']);
    const spec = { name: 'shop', auth: true, entities: [
      { name: 'user', fields: [] }, { name: 'session', fields: [] },
      { name: 'product', fields: [{ name: 'title', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user' }], table: 'products' }
    ] };
    const g = win.Engine.GraphQL.generate(spec);
    t.ok('graphql: emits schema.graphql + resolvers + executor + handler + test',
      ['src/graphql/schema.graphql', 'src/graphql/resolvers.js', 'src/graphql/execute.js', 'src/graphql/handler.js', 'test/graphql.test.js']
        .every((p) => p in g));
    t.match('graphql: SDL has Query + Mutation', g['src/graphql/schema.graphql'], /type Query[\s\S]*type Mutation/);
    Object.keys(g).filter((p) => /\.js$/.test(p)).forEach((p) => {
      try { new vm.Script(g[p], { filename: p }); } catch (e) { t.ok('graphql: ' + p + ' parses — ' + e.message, false); }
    });
    // executor round-trip in isolation
    const m = { exports: {} };
    new Function('module', 'exports', 'require', g['src/graphql/execute.js'])(m, m.exports, require);
    const parsed = m.exports.parse('mutation($n: String){ createProduct(title: $n) { id title } }');
    t.equal('graphql: parser reads the operation', parsed.op, 'mutation');
    const resolvers = { Query: { products: () => [{ id: 1, title: 'x' }] }, Mutation: { createProduct: (_r, a) => ({ id: 2, title: a.title }) } };
    const out = await m.exports.execute(resolvers, 'mutation($n: String){ createProduct(title: $n) { id title } }', { n: 'Widget' }, {});
    t.deepEqual('graphql: executor resolves mutation + variables + selection',
      out, { data: { createProduct: { id: 2, title: 'Widget' } } });
    const q = await m.exports.execute(resolvers, '{ products { id } }', {}, {});
    t.equal('graphql: executor resolves a query list', q.data.products.length, 1);
    const bad = await m.exports.execute(resolvers, '{ nope }', {}, {});
    t.ok('graphql: unknown field -> null, no crash', bad.data && bad.data.nope === null);
  }

  /* ---------- 4. WebSocket server generates + round-trips a real socket ---------- */
  {
    const win = loadEngines(['engine.realtime.js']);
    const g = win.Engine.Realtime.generate({ name: 'shop' });
    t.ok('ws: emits src/ws.js + public/ws-client.js + test/ws.test.js',
      ['src/ws.js', 'public/ws-client.js', 'test/ws.test.js'].every((p) => p in g));
    Object.keys(g).filter((p) => /\.js$/.test(p)).forEach((p) => {
      try { new vm.Script(g[p], { filename: p }); } catch (e) { t.ok('ws: ' + p + ' parses — ' + e.message, false); }
    });
    const r = writeAndRun(g, 'test/ws.test.js', 'ws');
    t.ok('ws: generated handshake + echo + broadcast test passes', r.exit === 0 && r.pass >= 1 && r.fail === 0);
  }

  /* ---------- 4b. Python (stdlib) backend generates + pytest/unittest passes ---------- */
  {
    const hasPy = (() => { try { return cp.spawnSync('python', ['--version'], { encoding: 'utf8' }).status === 0; } catch (_) { return false; } })();
    const win = loadEngines(['engine.pybackend.js']);
    const spec = { name: 'shop', auth: true, entities: [
      { name: 'user', fields: [] }, { name: 'session', fields: [] },
      { name: 'order', fields: [{ name: 'amountCents', type: 'int', required: true }, { name: 'ownerId', type: 'ref', ref: 'user' }], table: 'orders' }
    ] };
    const g = win.Engine.PyBackend.generate(spec);
    t.ok('python: emits app/main.py + app/db.py + app/auth.py + a per-entity service + tests',
      ['app/main.py', 'app/db.py', 'app/auth.py', 'app/services/order.py', 'tests/test_api.py'].every((p) => p in g));
    t.match('python: package.json test script shells to unittest', g['package.json'], /python -m unittest discover/);
    if (hasPy) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-py-'));
      try {
        Object.keys(g).forEach((p) => { const abs = path.join(dir, p); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, g[p]); });
        fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<!doctype html><html lang=en><body>ok</body></html>');
        const comp = cp.spawnSync('python', ['-m', 'compileall', '-q', 'app'], { cwd: dir, encoding: 'utf8', timeout: 20000 });
        t.equal('python: every generated module compiles', comp.status, 0);
        const r = cp.spawnSync('python', ['-m', 'unittest', 'discover', '-s', 'tests', '-t', '.'], { cwd: dir, encoding: 'utf8', timeout: 40000 });
        t.equal('python: the generated end-to-end test passes (real HTTP + sqlite + auth)', r.status, 0);
      } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    } else {
      t.ok('python: not installed on this runner — generation verified, execution skipped', true);
    }
  }

  /* ---------- 5. Deploy: kubernetes / helm / terraform IaC ---------- */
  {
    const win = loadEngines(['engine.deploy.js']);
    win.Engine.FS.write('/package.json', JSON.stringify({ name: 'shop', scripts: { build: 'x', migrate: 'y' } }));
    win.Engine.FS.write('/server.js', 'server.listen(4319)');
    t.ok('deploy: k8s / helm / terraform are targets',
      ['kubernetes', 'helm', 'terraform'].every((k) => k in win.Engine.Deploy.TARGETS));

    const k = win.Engine.Deploy.artifacts('kubernetes', {});
    t.ok('deploy: k8s emits namespace/deployment/service/ingress/hpa/postgres',
      ['namespace', 'deployment', 'service', 'ingress', 'hpa', 'postgres'].every((n) => k.some((f) => f.path.indexOf('k8s/' + n + '.yaml') >= 0)));
    // every k8s YAML parses
    const yaml = tryYaml();
    if (yaml) {
      k.filter((f) => /\.yaml$/.test(f.path)).forEach((f) => {
        try { yaml.loadAll(f.content); } catch (e) { t.ok('deploy: ' + f.path + ' is valid YAML — ' + e.message, false); }
      });
      t.ok('deploy: all k8s manifests are valid YAML', true);
    }
    const h = win.Engine.Deploy.artifacts('helm', {});
    t.ok('deploy: helm chart has Chart.yaml + values.yaml + templates',
      h.some((f) => /chart\/Chart\.yaml$/.test(f.path)) && h.some((f) => /chart\/values\.yaml$/.test(f.path)) && h.some((f) => /chart\/templates\/deployment\.yaml$/.test(f.path)));
    h.filter((f) => /\.yaml$/.test(f.path)).forEach((f) => {
      t.equal('helm: {{ }} balanced in ' + f.path.split('/').pop(),
        (f.content.match(/\{\{/g) || []).length, (f.content.match(/\}\}/g) || []).length);
    });
    const tf = win.Engine.Deploy.artifacts('terraform', {});
    const mainTf = tf.find((f) => /main\.tf$/.test(f.path)).content;
    t.equal('terraform: braces balanced in main.tf', (mainTf.match(/\{/g) || []).length, (mainTf.match(/\}/g) || []).length);
    t.match('terraform: uses templatefile (no fragile nested heredoc)', mainTf, /templatefile\(/);
    t.ok('terraform: emits variables.tf + tfvars example + deploy script',
      tf.some((f) => /variables\.tf$/.test(f.path)) && tf.some((f) => /tfvars\.example$/.test(f.path)) && tf.some((f) => /deploy\/terraform\.sh$/.test(f.path)));
  }

  /* ---------- 6. Microservices: gateway + per-domain services, real cross-process round trip ---------- */
  {
    const win = loadEngines(['engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.scaffold.js']);
    const spec = { name: 'shop', auth: true, microservices: true, entities: [
      { name: 'product', fields: [{ name: 'title', type: 'text', required: true }, { name: 'priceCents', type: 'int', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] },
      { name: 'review', fields: [{ name: 'body', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }
    ] };
    const g = win.Engine.Scaffold.generate(spec);
    const map = {}; g.forEach((f) => { map[f.path] = f.content; });
    t.ok('microservices: emits a gateway + one service per domain + compose + integration test',
      ['/gateway/server.js', '/gateway/registry.js', '/services/product/server.js', '/services/review/server.js', '/docker-compose.prod.yml', '/test/microservices.test.js'].every((p) => p in map));
    const yaml = tryYaml();
    if (yaml) {
      let ok = true, doc = null;
      try { doc = yaml.load(map['/docker-compose.prod.yml']); } catch (e) { ok = false; t.ok('microservices: compose is valid YAML — ' + e.message, false); }
      if (ok) t.ok('microservices: compose wires gateway + product + review + postgres',
        doc && doc.services && ['gateway', 'product', 'review', 'postgres'].every((k) => k in doc.services));
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-msvc-'));
    try {
      Object.keys(map).forEach((p) => { const abs = path.join(dir, p.replace(/^\//, '')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, map[p]); });
      try { cp.execFileSync('node', ['scripts/migrate.js'], { cwd: dir, stdio: 'pipe', timeout: 30000 }); } catch (_) {}
      const r = cp.spawnSync('node', ['--test', 'test/microservices.test.js'], { cwd: dir, encoding: 'utf8', timeout: 40000 });
      t.equal('microservices: gateway proxies a real request to a separate service process (register -> create -> list)', r.status, 0);
      if (r.status !== 0) console.log(r.stdout + '\n' + r.stderr);
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  }

  /* ---------- 7. Architecture rules: generated repos are layer-clean; violations are caught + gate the DoD ---------- */
  {
    const win = loadEngines(['engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.scaffold.js', 'engine.archrules.js', 'engine.contract.js', 'engine.ledger.js', 'engine.dod.js']);
    const spec = { name: 'a', auth: true, frontend: 'react', microservices: true, entities: [
      { name: 'product', fields: [{ name: 'title', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] },
      { name: 'review', fields: [{ name: 'body', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }
    ] };
    win.Engine.Scaffold.generate(spec).forEach((f) => win.Engine.FS.write(f.path, f.content));
    const clean = win.Engine.ArchRules.scan();
    t.equal('archrules: a generated react + microservices repo has zero layering violations', clean.findings.length, 0);
    t.ok('archrules: it detected the real layers', clean.layers.presentation > 0 && clean.layers.data > 0 && clean.layers.service > 0 && clean.layers.gateway > 0);

    // inject a genuine boundary break: the browser layer importing server code + reading server env
    win.Engine.FS.write('/public/leak.js', "import db from '../src/db';\nconst url = process.env.DATABASE_URL;\n");
    const bad = win.Engine.ArchRules.scan();
    t.ok('archrules: frontend importing the data layer is a HIGH finding', (bad.bySeverity.high || 0) >= 1 && bad.findings.some((f) => f.rule === 'frontend-imports-server-code'));
    t.ok('archrules: frontend reading a server env var is flagged', bad.findings.some((f) => f.rule === 'frontend-reads-server-env'));

    // the DoD gate must now fail on architecture
    const dod = win.Engine.DoD.evaluate();
    t.equal('DoD: architectureSound FAILS while the boundary break exists', dod.criteria.architectureSound, false);
    win.Engine.FS.remove('/public/leak.js'); delete win.Engine.FS._data['/public/leak.js'];
    win.Engine.ArchRules.scan();
    t.equal('DoD: architectureSound PASSES once the layer-clean repo is restored', win.Engine.DoD.evaluate().criteria.architectureSound, true);
  }

  /* ---------- 8. Privacy / PII: generated repos are clean; leaks are caught + gate the DoD ---------- */
  {
    const win = loadEngines(['engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.scaffold.js', 'engine.privacy.js', 'engine.contract.js', 'engine.ledger.js', 'engine.dod.js']);
    const spec = { name: 'crm', auth: true, frontend: 'react', entities: [
      { name: 'customer', fields: [{ name: 'email', type: 'text', required: true }, { name: 'phone', type: 'text' }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }
    ] };
    win.Engine.Scaffold.generate(spec).forEach((f) => win.Engine.FS.write(f.path, f.content));
    const clean = win.Engine.Privacy.scan();
    t.equal('privacy: a generated auth + PII-collecting repo has zero PII-handling findings', clean.findings.filter((f) => f.severity !== 'low').length, 0);

    win.Engine.FS.write('/src/track.js', "console.log('signup', req.body);\nfetch('https://ads.example.com/p?email=' + user.email);\n");
    const bad = win.Engine.Privacy.scan();
    t.ok('privacy: a whole request body in a log is HIGH', bad.findings.some((f) => f.rule === 'pii-in-logs' && f.severity === 'high'));
    t.ok('privacy: PII in a query string is HIGH', bad.findings.some((f) => f.rule === 'pii-in-url'));
    t.ok('privacy: server-side egress to a third-party host is flagged', bad.findings.some((f) => f.rule === 'third-party-egress'));

    const dod = win.Engine.DoD.evaluate();
    t.equal('DoD: privacyRespected FAILS while PII leaks exist', dod.criteria.privacyRespected, false);
    delete win.Engine.FS._data['/src/track.js'];
    win.Engine.Privacy.scan();
    t.equal('DoD: privacyRespected PASSES once the leaks are gone', win.Engine.DoD.evaluate().criteria.privacyRespected, true);
  }

  /* ---------- 9. Universal.buildPlan reflects the real contract stack (20-stage -> Ultra Mode) ---------- */
  {
    const win = loadEngines(['engine.contract.js', 'engine-universal.js']);
    const U = win.Universal || win.Engine.Universal;
    const react = await win.Engine.Contract.deriveFromPrompt('A React SPA with a GraphQL API and live WebSocket updates, user accounts, products. Node backend, Postgres, Docker + Kubernetes.', { useLLM: false });
    const rp = U.buildPlan(react);
    t.ok('buildPlan: react + graphql + websocket show up in the stack summary',
      /react/i.test(rp.stack.frontend) && /GraphQL/.test(rp.stack.api) && /WebSocket/.test(rp.stack.api));
    t.ok('buildPlan: it plans the graphql + ws + frontend files', rp.files.some((f) => /graphql\/execute\.js/.test(f)) && rp.files.some((f) => /\/src\/ws\.js/.test(f)) && rp.files.some((f) => /vendor\/vdom\.js/.test(f)));
    t.ok('buildPlan: architecture + privacy scan steps are in the plan', rp.steps.some((s) => s.kind === 'architecture-scan') && rp.steps.some((s) => s.kind === 'privacy-scan'));
    t.ok('buildPlan: every step still carries a requirementIds array', rp.steps.every((s) => Array.isArray(s.requirementIds)));

    const py = await win.Engine.Contract.deriveFromPrompt('A Python FastAPI backend with user accounts and orders, background jobs, Postgres.', { useLLM: false });
    const pp = U.buildPlan(py);
    t.ok('buildPlan: python backend -> app/main.py, not server.js', pp.files.some((f) => /\/app\/main\.py/.test(f)) && !pp.files.some((f) => f === '/server.js') && /Python/.test(pp.stack.backend));

    const micro = await win.Engine.Contract.deriveFromPrompt('Split into microservices: an orders service and a catalog service, user accounts, Node, Postgres, Docker Compose.', { useLLM: false });
    const mp = U.buildPlan(micro);
    t.ok('buildPlan: microservices -> gateway + compose in the file plan', mp.files.some((f) => /gateway\/server\.js/.test(f)) && mp.files.some((f) => /docker-compose\.prod\.yml/.test(f)) && /gateway/.test(mp.stack.architecture));
  }

  /* ---------- 10. Cross-platform packaging: win + mac + linux targets + scripts ---------- */
  {
    const pj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    t.ok('packaging: dist scripts for win + mac + linux + all', ['dist:win', 'dist:mac', 'dist:linux', 'dist:all'].every((s) => pj.scripts[s]));
    t.ok('packaging: build config targets all three OSes', pj.build && pj.build.win && pj.build.mac && pj.build.linux);
    t.ok('packaging: mac builds x64 + arm64', JSON.stringify(pj.build.mac.target).includes('arm64') && JSON.stringify(pj.build.mac.target).includes('x64'));
    t.equal('packaging: mac is configured for an unsigned build (identity null)', pj.build.mac.identity, null);
    t.ok('packaging: linux emits AppImage + deb', JSON.stringify(pj.build.linux.target).includes('AppImage') && JSON.stringify(pj.build.linux.target).includes('deb'));
    const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'desktop.yml'), 'utf8');
    t.ok('packaging: CI has build-mac + build-linux jobs on their native runners', /build-mac:/.test(wf) && /macos-latest/.test(wf) && /build-linux:/.test(wf));
  }

  function tryYaml() {
    try {
      const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'vendor', 'js-yaml.min.js'), 'utf8');
      const m = { exports: {} }; const w = { window: {}, self: {} };
      new Function('module', 'exports', 'window', 'self', src)(m, m.exports, w, w);
      return m.exports || w.window.jsyaml || w.self.jsyaml;
    } catch (_) { return null; }
  }
};
