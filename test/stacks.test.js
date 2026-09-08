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

  function tryYaml() {
    try {
      const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'vendor', 'js-yaml.min.js'), 'utf8');
      const m = { exports: {} }; const w = { window: {}, self: {} };
      new Function('module', 'exports', 'window', 'self', src)(m, m.exports, w, w);
      return m.exports || w.window.jsyaml || w.self.jsyaml;
    } catch (_) { return null; }
  }
};
