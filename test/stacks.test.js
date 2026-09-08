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

    // native mobile / ML training / blockchain are now SUPPORTED targets that route
    // through a runtime adapter — not "unsupported". The contract records contract.target.
    const ios = await win.Engine.Contract.deriveFromPrompt('Build a native iOS app in Swift, no web version at all', { useLLM: false });
    t.equal('contract: iOS is a buildable target, not unsupported', ios.verdict, 'buildable');
    t.equal('contract: iOS target detected', ios.target, 'ios');
    t.ok('contract: iOS target names its runtime', /Xcode/i.test(ios.targetRuntime || ''));

    const ml = await win.Engine.Contract.deriveFromPrompt('Build a tool to train an ML model from scratch on our dataset', { useLLM: false });
    t.equal('contract: ML training is a buildable target', ml.verdict, 'buildable');
    t.equal('contract: ML target detected', ml.target, 'ml-training');

    const evm = await win.Engine.Contract.deriveFromPrompt('Build an ERC-20 token smart contract with mint and transfer', { useLLM: false });
    t.equal('contract: blockchain is a buildable target', evm.verdict, 'buildable');
    t.equal('contract: evm target detected', evm.target, 'evm');

    const android = await win.Engine.Contract.deriveFromPrompt('Build a native Android app for tracking workouts', { useLLM: false });
    t.equal('contract: android target detected', android.target, 'android');

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

  /* ---------- 11. Ops: generated backends expose /healthz + /readyz + /metrics + structured logs ---------- */
  {
    const win = loadEngines(['engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.scaffold.js']);
    const nodeSpec = { name: 'ops', auth: true, entities: [{ name: 'note', fields: [{ name: 'body', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }] };
    const g = win.Engine.Scaffold.generate(nodeSpec);
    const map = {}; g.forEach((f) => { map[f.path] = f.content; });
    const server = map['/server.js'];
    t.ok('ops(node): server exposes /healthz, /readyz and /metrics', /'\/healthz'/.test(server) && /'\/readyz'/.test(server) && /'\/metrics'/.test(server));
    t.ok('ops(node): Prometheus text format + a request counter', /app_requests_total/.test(server) && /text\/plain; version=0\.0\.4/.test(server));
    t.ok('ops(node): structured JSON access log, silenced under test', /msg: 'request'/.test(server) && /LOG_SILENT/.test(server));
    t.ok('ops(node): per-request tracing — spans, a trace id header, a /debug/traces ring buffer', /function span\(req, name, fn\)/.test(server) && /res\.setHeader\('x-trace-id'/.test(server) && /'\/debug\/traces'/.test(server) && /span\(req, r\.ent \+ '\.list'/.test(server));
    t.ok('ops(node): crash capture — uncaughtException/unhandledRejection -> a structured record + counter', /process\.on\('uncaughtException'/.test(server) && /function recordCrash/.test(server) && /app_crashes_total/.test(server));
    t.ok('ops(node): p50/p95/p99 latency in /metrics', /app_request_latency_ms\{quantile="0\.95"\}/.test(server));
    t.ok('ops(node): a generated perf + memory-leak test', map['/test/perf.test.js'] && /heapSlopeBytesPerSample|no runaway heap growth/.test(map['/test/perf.test.js']));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-ops-'));
    try {
      Object.keys(map).forEach((p) => { const abs = path.join(dir, p.replace(/^\//, '')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, map[p]); });
      cp.execFileSync('node', ['scripts/migrate.js'], { cwd: dir, stdio: 'pipe', timeout: 30000 });
      fs.writeFileSync(path.join(dir, 'ops-probe.test.js'), [
        "'use strict';",
        "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'ops-probe-' + process.pid);",
        "process.env.LOG = 'silent';",
        "const test = require('node:test'); const assert = require('node:assert');",
        "const { server } = require('./server');",
        "test('ops endpoints', async () => {",
        "  await new Promise((r) => server.listen(0, r));",
        "  const b = 'http://localhost:' + server.address().port;",
        "  const h = await fetch(b + '/healthz'); const hj = await h.json();",
        "  assert.equal(h.status, 200); assert.equal(hj.ok, true);",
        "  const rd = await fetch(b + '/readyz'); assert.equal(rd.status, 200);",
        "  const m = await fetch(b + '/metrics'); const mt = await m.text();",
        "  assert.match(m.headers.get('content-type') || '', /text\\/plain/);",
        "  assert.match(mt, /app_requests_total \\d/);",
        "  await new Promise((r) => server.close(r));",
        "});"
      ].join('\n'));
      const r = cp.spawnSync('node', ['--test', 'ops-probe.test.js'], { cwd: dir, encoding: 'utf8', timeout: 25000 });
      t.equal('ops(node): a booted server answers /healthz + /readyz + /metrics for real', r.status, 0);
      if (r.status !== 0) console.log(r.stdout + r.stderr);
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

    const pg = {}; win.Engine.Scaffold.generate({ name: 'pyops', auth: true, backend: 'python', entities: nodeSpec.entities }).forEach((f) => { pg[f.path] = f.content; });
    t.ok('ops(python): app/main.py exposes /healthz + /readyz + /metrics + JSON access log', /"\/healthz"/.test(pg['/app/main.py']) && /"\/metrics"/.test(pg['/app/main.py']) && /_metrics_text/.test(pg['/app/main.py']) && /json\.dumps\(rec\)/.test(pg['/app/main.py']));
  }

  /* ---------- 12. Accessibility gate (§47): generated frontends pass WCAG; violations block the DoD ---------- */
  {
    const win = loadEngines(['engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.scaffold.js', 'engine.a11y.js', 'engine.contract.js', 'engine.ledger.js', 'engine.dod.js']);
    const clearFS = () => Object.keys(win.Engine.FS._data).forEach((k) => delete win.Engine.FS._data[k]);
    for (const fw of ['vanilla', 'react', 'vue']) {
      clearFS();
      win.Engine.Scaffold.generate({ name: 'acc', auth: true, frontend: fw === 'vanilla' ? undefined : fw, entities: [{ name: 'note', fields: [{ name: 'body', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }] }).forEach((f) => win.Engine.FS.write(f.path, f.content));
      const r = win.Engine.A11y.audit();
      t.equal('a11y(' + fw + '): the generated frontend has no critical or serious WCAG violations', ((r.byImpact.critical || 0) + (r.byImpact.serious || 0)), 0);
      t.ok('a11y(' + fw + '): score >= 96', r.score >= 96);
    }
    // contrast maths
    t.ok('a11y: contrastRatio(#000,#fff) ≈ 21', Math.abs(win.Engine.A11y.contrastRatio('#000000', '#ffffff') - 21) < 0.1);
    t.ok('a11y: contrastRatio flags #999 on #fff as < 4.5', win.Engine.A11y.contrastRatio('#999999', '#ffffff') < 4.5);

    // an injected barrier -> critical -> DoD accessibilityPass fails
    clearFS();
    win.Engine.FS.write('/public/index.html', '<!doctype html><html lang="en"><body><main><img src="x.png"><form><input type="text"></form></main></body></html>');
    const bad = win.Engine.A11y.audit();
    t.ok('a11y: an <img> with no alt + an unlabelled input are CRITICAL', (bad.byImpact.critical || 0) >= 2);
    const dod = win.Engine.DoD.evaluate();
    t.equal('DoD: accessibilityPass FAILS while the critical barriers exist', dod.criteria.accessibilityPass, false);
    win.Engine.FS.write('/public/index.html', '<!doctype html><html lang="en"><body><a href="#m" class="skip-link">skip</a><header><h1>x</h1></header><main id="m"><img src="x.png" alt="a chart"><form><label for="q">Query</label><input id="q" type="text"></form></main></body></html>');
    win.Engine.A11y.audit();
    t.equal('DoD: accessibilityPass PASSES once the frontend is clean', win.Engine.DoD.evaluate().criteria.accessibilityPass, true);
  }

  /* ---------- 13. Visual validation (§12-13): generated frontends are clean; defects gate the DoD ---------- */
  {
    const win = loadEngines(['engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.scaffold.js', 'engine.visualcheck.js', 'engine.contract.js', 'engine.ledger.js', 'engine.dod.js']);
    win.document = { createElement: () => ({ getContext: () => ({}) }) };
    const clr = () => Object.keys(win.Engine.FS._data).forEach((k) => delete win.Engine.FS._data[k]);
    for (const fw of ['vanilla', 'react', 'vue']) {
      clr();
      win.Engine.Scaffold.generate({ name: 'vis', auth: true, frontend: fw === 'vanilla' ? undefined : fw, entities: [{ name: 'note', fields: [{ name: 'body', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }] }).forEach((f) => win.Engine.FS.write(f.path, f.content));
      const r = win.Engine.VisualCheck.analyze();
      t.equal('visual(' + fw + '): the generated frontend has zero critical/serious visual defects', ((r.byImpact.critical || 0) + (r.byImpact.serious || 0)), 0);
    }
    // ingest a live observer probe with a runtime critical, then a clean one
    clr();
    win.Engine.Scaffold.generate({ name: 'vis', auth: true, entities: [{ name: 'note', fields: [{ name: 'body', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }] }).forEach((f) => win.Engine.FS.write(f.path, f.content));
    win.Engine.VisualCheck.ingest({ breakpoints: [{ name: 'mobile', viewport: { w: 375, h: 812 }, findings: [{ rule: 'page-horizontal-overflow', impact: 'critical', detail: 'document is 900px wide at a 375px viewport' }, { rule: 'zero-size-control', impact: 'critical', el: 'button#add', detail: 'interactive element rendered 0x0' }], elementCount: 30 }] });
    const withDefect = win.Engine.VisualCheck.load();
    t.ok('visual: a runtime page-overflow + a zero-size control are CRITICAL', (withDefect.byImpact.critical || 0) >= 2);
    t.equal('DoD: visualIntegrityPass FAILS on a critical visual defect', win.Engine.DoD.evaluate().criteria.visualIntegrityPass, false);
    win.Engine.VisualCheck.ingest({ breakpoints: [{ name: 'mobile', viewport: { w: 375, h: 812 }, findings: [], elementCount: 30 }, { name: 'desktop', viewport: { w: 1280, h: 900 }, findings: [], elementCount: 30 }] });
    t.equal('DoD: visualIntegrityPass PASSES once the render is clean at every breakpoint', win.Engine.DoD.evaluate().criteria.visualIntegrityPass, true);
  }

  /* ---------- 14. Dependency + licence intelligence (§10 + §52) ---------- */
  {
    const win = loadEngines(['engine.depintel.js', 'engine.contract.js', 'engine.ledger.js', 'engine.dod.js']);
    const clr = () => Object.keys(win.Engine.FS._data).forEach((k) => delete win.Engine.FS._data[k]);

    // classifier
    t.equal('depintel: MIT -> permissive', win.Engine.DepIntel.classifyLicense('MIT').class, 'permissive');
    t.equal('depintel: GPL-3.0 -> strong-copyleft', win.Engine.DepIntel.classifyLicense('GPL-3.0').class, 'strong-copyleft');
    t.equal('depintel: AGPL-3.0 -> network-copyleft', win.Engine.DepIntel.classifyLicense('AGPL-3.0-or-later').class, 'network-copyleft');
    t.equal('depintel: "(MIT OR Apache-2.0)" -> permissive (least restrictive of an OR)', win.Engine.DepIntel.classifyLicense('(MIT OR Apache-2.0)').class, 'permissive');

    // a dependency-free generated app is clean + compatible
    clr();
    win.Engine.FS.write('/package.json', JSON.stringify({ name: 'gen', private: true, dependencies: {} }));
    const clean = win.Engine.DepIntel.analyze();
    t.ok('depintel: a zero-dependency generated app has no findings', clean.findings.length === 0 && clean.licensesCompatible === true);
    t.equal('DoD: licensesCompatible PASSES for a clean project', win.Engine.DoD.evaluate().criteria.licensesCompatible, true);

    // a proprietary product + a GPL runtime dep + an abandoned dep + a vuln pin
    clr();
    win.Engine.FS.write('/package.json', JSON.stringify({ name: 'x', license: 'MIT', dependencies: { request: '^2.88.0', 'node-ffmpeg': '^1.0.0', lodash: '4.17.10' } }));
    win.Engine.FS.write('/package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'x' }, 'node_modules/request': { version: '2.88.2', license: 'Apache-2.0' }, 'node_modules/node-ffmpeg': { version: '1.0.0', license: 'GPL-2.0' }, 'node_modules/lodash': { version: '4.17.10', license: 'MIT' } } }));
    const messy = win.Engine.DepIntel.analyze();
    t.ok('depintel: flags an abandoned package (request)', messy.findings.some((f) => f.kind === 'abandoned' && f.dependency === 'request'));
    t.ok('depintel: flags a known-vulnerable pin (lodash < 4.17.21)', messy.findings.some((f) => f.kind === 'vulnerable' && f.dependency === 'lodash'));
    t.ok('depintel: a GPL runtime dep in an MIT product is a CRITICAL licence-conflict', messy.findings.some((f) => f.kind === 'license-conflict' && f.impact === 'critical'));
    t.equal('depintel: licensesCompatible is false', messy.licensesCompatible, false);
    t.equal('DoD: licensesCompatible FAILS on a copyleft conflict', win.Engine.DoD.evaluate().criteria.licensesCompatible, false);
    t.ok('depintel: license-report.json classifies every dependency', (() => { const lr = win.Engine.Sovereign.read('license-report.json'); return lr && lr.dependencies.length === 3 && lr.compatible === false; })());
  }

  /* ---------- 15. Model-driven intent (§2-3): rules fallback + model enrichment ---------- */
  {
    // rules-only (no provider): behaves exactly like the deterministic Normalizer/Classifier
    const win = loadEngines(['engine-universal.js', 'engine.intent.js', 'engine.contract.js']);
    const r1 = await win.Engine.Intent.resolve('build a todo app with projects and tasks', { useLLM: false });
    t.equal('intent: with no provider, source is "rules"', r1.source, 'rules');
    t.ok('intent: the rule-based normalize still runs', r1.normalized && r1.normalized.coreCapabilities && r1.classification.primaryType);
    t.equal('intent: no model -> no entitiesHint / corrections', (r1.entitiesHint || r1.corrections) || null, null);

    // model connected: enrich the fuzzy fields, keep the rule backbone
    const win2 = loadEngines(['engine-universal.js', 'engine.intent.js', 'engine.contract.js']);
    win2.Engine.AI = {
      ready: () => true,
      json: async () => ({
        corrected: 'build a recipe box app with recipes and ingredients',
        projectGoal: 'A personal recipe box',
        applicationCategory: 'web_application',
        targetPlatforms: ['web'],
        primaryActors: ['cook'],
        coreCapabilities: ['save recipe', 'search recipe', 'plan meals'],
        entitiesHint: [{ name: 'recipe', fields: ['title', 'servings', 'instructions'] }, { name: 'ingredient', fields: ['name', 'quantity'] }],
        unknownRequirements: ['import from a URL?'],
        designLanguage: { tone: 'warm', density: 'comfortable', darkMode: null }
      }),
      chat: async () => ({ text: 'build a recipe box app with recipes and ingredients' })
    };
    const r2 = await win2.Engine.Intent.resolve('biuld a recipie box app wiht recipies and ingrediants', {});
    t.equal('intent: with a provider, source is "model+rules"', r2.source, 'model+rules');
    t.ok('intent: the model corrected the typos', /recipe box app with recipes and ingredients/i.test(r2.corrections || ''));
    t.equal('intent: the model goal is adopted', r2.normalized.projectGoal, 'A personal recipe box');
    t.ok('intent: capabilities merged (model + rules)', r2.normalized.coreCapabilities.indexOf('save recipe') >= 0);
    t.ok('intent: the entity-model hint is captured', (r2.entitiesHint || []).some((e) => e.name === 'recipe') && (r2.entitiesHint || []).some((e) => e.name === 'ingredient'));
    t.ok('intent: the design language is captured', r2.design && r2.design.tone === 'warm');

    // the contract picks up the model's entity hint
    const c = await win2.Engine.Contract.deriveFromPrompt('biuld a recipie box app wiht recipies and ingrediants', {});
    t.ok('contract: uses the model-inferred entities', (c.entities || []).some((e) => e.name === 'recipe') && (c.entities || []).some((e) => e.name === 'ingredient'));
    t.equal('contract: records the intent source', c.intent && c.intent.source, 'model+rules');
    t.ok('contract: still deterministic + safe (verdict buildable, no fake auth)', c.verdict === 'buildable');
  }

  /* ---------- 16. Perf + memory-leak surfacing (§45-46) — Engine.PerfCheck -> DoD ---------- */
  {
    const win = loadEngines(['engine.perfcheck.js', 'engine.contract.js', 'engine.ledger.js', 'engine.dod.js']);
    // no report yet -> not applicable, gate passes
    t.equal('perfcheck: with no perf-report.json, performanceHealthy passes (not applicable)', win.Engine.DoD.evaluate().criteria.performanceHealthy, true);
    // a healthy report
    win.Engine.Sovereign.write('perf-report.json', { requests: 300, errors: 0, p50: 4, p95: 18, p99: 40, heapStartBytes: 5e6, heapEndBytes: 6e6, heapGrowthBytes: 1e6, heapSlopeBytesPerSample: 12000 });
    const ok = win.Engine.PerfCheck.analyze();
    t.ok('perfcheck: a healthy run scores 100 + healthy', ok.score === 100 && ok.healthy === true);
    t.equal('DoD: performanceHealthy passes for a healthy run', win.Engine.DoD.evaluate().criteria.performanceHealthy, true);
    // 5xx under load -> critical
    win.Engine.Sovereign.write('perf-report.json', { requests: 300, errors: 7, p50: 4, p95: 18, p99: 40, heapGrowthBytes: 1e6, heapSlopeBytesPerSample: 12000 });
    win.Engine.PerfCheck.analyze();
    t.equal('DoD: performanceHealthy FAILS when the server 5xx-ed under load', win.Engine.DoD.evaluate().criteria.performanceHealthy, false);
    // a memory leak -> critical
    win.Engine.Sovereign.write('perf-report.json', { requests: 300, errors: 0, p50: 4, p95: 18, p99: 40, heapGrowthBytes: 30 * 1024 * 1024, heapSlopeBytesPerSample: 900000 });
    const leaky = win.Engine.PerfCheck.analyze();
    t.ok('perfcheck: a positive heap slope + large growth on a fixed workload is a leak', leaky.leak === true && leaky.findings.some((f) => f.rule === 'memory-leak'));
    t.equal('DoD: performanceHealthy FAILS on a detected memory leak', win.Engine.DoD.evaluate().criteria.performanceHealthy, false);
  }

  /* ---------- 17. Documentation factory (§49) — Engine.Docs ---------- */
  {
    const win = loadEngines(['engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.deploy.js', 'engine.scaffold.js', 'engine.docs.js']);
    const spec = { name: 'shopdesk', auth: true, jobs: true, api: 'graphql', websocket: true, deployTargets: ['docker', 'compose', 'kubernetes'],
      entities: [{ name: 'product', fields: [{ name: 'title', type: 'text', required: true }, { name: 'priceCents', type: 'int', required: true }] },
        { name: 'order', fields: [{ name: 'total', type: 'int', required: true }, { name: 'productId', type: 'ref', ref: 'product', required: true }] }] };
    const docs = win.Engine.Docs.generate(spec);
    const byPath = {}; docs.forEach((d) => { byPath[d.path] = d.content; });
    t.ok('docs: emits README + the four docs/*.md', ['/README.md', '/docs/API.md', '/docs/DATABASE.md', '/docs/DEPLOYMENT.md', '/docs/TROUBLESHOOTING.md'].every((p) => byPath[p] && byPath[p].length > 200));
    t.ok('docs: API.md documents every resource route', /\/api\/products/.test(byPath['/docs/API.md']) && /\/api\/orders/.test(byPath['/docs/API.md']));
    t.ok('docs: API.md documents auth + observability + graphql + ws', /\/api\/auth\/login/.test(byPath['/docs/API.md']) && /\/metrics/.test(byPath['/docs/API.md']) && /GraphQL/.test(byPath['/docs/API.md']) && /WebSocket/.test(byPath['/docs/API.md']));
    t.ok('docs: DATABASE.md lists the real tables + a migration', /`products`/.test(byPath['/docs/DATABASE.md']) && /CREATE TABLE/.test(byPath['/docs/DATABASE.md']));
    t.ok('docs: DEPLOYMENT.md has a section per configured target', /Kubernetes/i.test(byPath['/docs/DEPLOYMENT.md']) && /kubectl apply/.test(byPath['/docs/DEPLOYMENT.md']) && /DATABASE_URL/.test(byPath['/docs/DEPLOYMENT.md']));
    t.ok('docs: TROUBLESHOOTING.md ties symptoms to real behaviour', /EADDRINUSE/.test(byPath['/docs/TROUBLESHOOTING.md']) && /x-trace-id/.test(byPath['/docs/TROUBLESHOOTING.md']) && /429/.test(byPath['/docs/TROUBLESHOOTING.md']));

    // scaffold.generate() now bundles the docs into the repo
    const repo = {}; win.Engine.Scaffold.generate(spec).forEach((f) => { repo[f.path] = f.content; });
    t.ok('docs: scaffold repo includes docs/API.md + docs/TROUBLESHOOTING.md', repo['/docs/API.md'] && repo['/docs/TROUBLESHOOTING.md']);
    t.ok('docs: scaffold README is the factory README', /## Documentation/.test(repo['/README.md']));

    // analyze() writes into FS + folds in evidence
    Object.keys(win.Engine.FS._data).forEach((k) => delete win.Engine.FS._data[k]);
    win.Engine.Scaffold.generate(spec).forEach((f) => win.Engine.FS.write(f.path, f.content));
    win.Engine.Sovereign.write('definition-of-done.json', { pass: false, criteria: { implementationExists: true, testsSucceed: false }, failing: ['testsSucceed'] });
    win.Engine.Sovereign.write('perf-findings.json', { present: true, p50: 3, p95: 20, p99: 44, errors: 0, leak: false });
    const res = win.Engine.Docs.analyze();
    t.ok('docs: analyze() rewrites the doc set', res.wrote.includes('/docs/API.md') && res.enrichedWithEvidence === true);
    t.ok('docs: README gains a Verification status section from evidence', /Verification status/.test(win.Engine.FS.read('/README.md')) && /testsSucceed/.test(win.Engine.FS.read('/README.md')));
    t.ok('docs: documentation-index.json recorded', win.Engine.Docs.load() && win.Engine.Docs.load().present === true);
  }

  /* ---------- 18. e2e / install / upgrade test generation (§19) — Engine.TestGen ---------- */
  {
    const win = loadEngines(['engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.scaffold.js', 'engine.testgen.js']);
    const spec = { name: 'journeyapp', auth: true,
      entities: [{ name: 'project', fields: [{ name: 'name', type: 'text', required: true, max: 120 }, { name: 'archived', type: 'bool', default: false }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] },
        { name: 'task', fields: [{ name: 'title', type: 'text', required: true }, { name: 'projectId', type: 'ref', ref: 'project', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }] };
    const repo = {}; win.Engine.Scaffold.generate(spec).forEach((f) => { repo[f.path] = f.content; win.Engine.FS.write(f.path, f.content); });
    const gen = win.Engine.TestGen.generate({});
    const genMap = {}; gen.forEach((f) => { genMap[f.path] = f.content; });
    t.ok('testgen: emits e2e + install + upgrade suites', genMap['/test/e2e.test.js'] && genMap['/test/install.test.js'] && genMap['/test/upgrade.test.js']);
    t.ok('testgen: e2e picks the ref-free root resource (project, not task)', /\/api\/projects/.test(genMap['/test/e2e.test.js']) && !/\/api\/tasks'/.test(genMap['/test/e2e.test.js']));
    t.ok('testgen: e2e drives the full CRUD journey', /register -> token/.test(genMap['/test/e2e.test.js']) && /create -> 201/.test(genMap['/test/e2e.test.js']) && /the row is gone/.test(genMap['/test/e2e.test.js']));
    t.ok('testgen: install checks a clean checkout boots + is healthy + deps are zero', /a clean checkout migrates, boots and is healthy/.test(genMap['/test/install.test.js']) && /dependency-free install/.test(genMap['/test/install.test.js']));
    t.ok('testgen: upgrade proves pre-upgrade data survives a re-migration', /survives a re-migration/.test(genMap['/test/upgrade.test.js']) && /the pre-upgrade row is still served/.test(genMap['/test/upgrade.test.js']));
    t.ok('testgen: plan gaps clear once generated', win.Engine.TestGen.plan().gaps.every((g) => !/end-to-end|clean-install|upgrade/.test(g)));

    // RUN the generated suites against a real generated server
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-e2e-'));
    try {
      Object.assign(repo, genMap);
      Object.keys(repo).forEach((p) => { const abs = path.join(dir, p.replace(/^\//, '')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, repo[p]); });
      cp.execFileSync('node', ['scripts/migrate.js'], { cwd: dir, stdio: 'pipe', timeout: 30000 });
      const r = cp.spawnSync('node', ['--test', 'test/e2e.test.js', 'test/install.test.js', 'test/upgrade.test.js'], { cwd: dir, encoding: 'utf8', timeout: 90000 });
      const out = (r.stdout || '') + (r.stderr || '');
      const pass = Number((out.match(/(?:ℹ |# )?pass (\d+)/) || [])[1] || 0);
      const fail = Number((out.match(/(?:ℹ |# )?fail (\d+)/) || [])[1] || 0);
      t.equal('testgen: the generated e2e/install/upgrade suites pass against a real server', r.status, 0);
      t.ok('testgen: real assertions ran (pass > 5, fail 0)', pass > 5 && fail === 0);
      if (r.status !== 0) console.log(out.slice(-3000));
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
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
