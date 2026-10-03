'use strict';
/* §44 production diagnosis (version/commit/DB correlation) + §39 GitHub
 * delivery workflow. Generates an app, boots it, and exercises the real
 * endpoints + scripts. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

function loadEngines(names) {
  const win = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  win.Engine = {
    FS: { _data: data, isFile: (p) => !!data[p], exists: (p) => p in data, read: (p) => (data[p] ? data[p].content : null),
      write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {}, count: () => 0, __flush: () => Promise.resolve() },
    Sovereign: { read: (p) => (sov[p] ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null), write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); } }
  };
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), win, { filename: n });
  return win;
}

module.exports = async function (t) {
  const win = loadEngines([
    'engine-universal.js', 'engine.js', 'engine.schema.js', 'engine.contract.js',
    'engine.auth.js', 'engine.backend.js', 'engine.jobs.js', 'engine.frontends.js',
    'engine.localize.js', 'engine.testgen.js', 'engine.deploy.js', 'engine.pipeline-parse.js', 'engine.scaffold.js'
  ]);
  const contract = await win.Engine.Contract.deriveFromPrompt('A task tracker where a user signs in, creates projects and tasks and deletes them, REST API, tests', { useLLM: false });
  const spec = win.Engine.Scaffold.specFromContract(contract);
  const files = win.Engine.Scaffold.generate(spec);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proddiag-'));
  try {
    for (const f of files) {
      const abs = path.join(root, f.path.replace(/^\//, ''));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, typeof f.content === 'string' ? f.content : String(f.content));
    }

    /* ---- §39: the delivery workflow is generated + well-formed ---- */
    const rel = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    t.ok('§39: a release workflow fires on a version tag', /on:\s*\n\s*push:\s*\n\s*tags:\s*\["v\*"\]/.test(rel));
    t.ok('§39: it verifies (test + build) before it delivers', /npm test/.test(rel) && /needs:\s*\[verify\]/.test(rel));
    t.ok('§39: it attaches the delivery archive + SBOM + provenance + checksums + the certificate',
      /delivery\/.*\.zip/.test(rel) && /SBOM\.spdx\.json/.test(rel) && /provenance\.json/.test(rel) && /checksums\.sha256/.test(rel) && /release-certificate\.md/.test(rel));
    t.ok('§39: only the final release step is credential-gated (Actions GITHUB_TOKEN)', /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(rel));
    t.ok('§39: contents:write permission is declared', /permissions:\s*\n\s*contents:\s*write/.test(rel));
    var yamlDoc = null;
    try { yamlDoc = require('js-yaml').load(rel, { json: true }); } catch (e) { yamlDoc = { __err: e.message }; }
    t.ok('§39: the release workflow is valid YAML with jobs verify + deliver and a tag trigger',
      yamlDoc && !yamlDoc.__err && yamlDoc.jobs && yamlDoc.jobs.verify && yamlDoc.jobs.deliver &&
      yamlDoc.jobs.deliver.needs && yamlDoc.jobs.deliver.needs.indexOf('verify') >= 0 &&
      yamlDoc.permissions && yamlDoc.permissions.contents === 'write' &&
      (yamlDoc.on && yamlDoc.on.push && Array.isArray(yamlDoc.on.push.tags)));

    /* ---- §44: scripts/version.js stamps a version.json ---- */
    cp.execFileSync('node', ['scripts/version.js'], { cwd: root, stdio: 'pipe', timeout: 15000 });
    const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
    t.ok('§44: version.json has version + commit + builtAt + node', version.version && version.commit && version.builtAt && version.node);

    /* ---- §44: db.state() reports the schema state ---- */
    if (fs.existsSync(path.join(root, 'scripts', 'migrate.js'))) {
      try { cp.execFileSync('node', ['scripts/migrate.js'], { cwd: root, stdio: 'pipe', timeout: 15000 }); } catch (_) {}
    }
    const drv = `
      process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'proddiag-run-' + process.pid);
      process.env.LOG = '';
      const test = require('node:test'); const assert = require('node:assert');
      const db = require('./src/db'); const { server } = require('./server');
      test('production diagnosis endpoints', async () => {
        await db.reset(); await db.migrate();
        assert.ok(typeof db.state === 'function', 'db exposes state()');
        const st = db.state();
        assert.ok(st.engine && st.tables && st.tablesApplied, 'db.state() reports engine + tables + applied');
        await new Promise((r) => server.listen(0, r));
        try {
          const B = 'http://localhost:' + server.address().port;
          const v = await fetch(B + '/debug/version').then((r) => r.json());
          assert.equal(typeof v.version, 'string');
          assert.ok(v.commit && v.commit !== '', 'commit reported');
          assert.ok(v.uptime_s >= 0 && v.pid > 0, 'uptime + pid reported');
          assert.ok(v.db && v.db.engine, 'DB schema state correlated into /debug/version');
          // make a request, then confirm the access log carries the trace id + commit
          const r1 = await fetch(B + '/healthz');
          const traceId = r1.headers.get('x-trace-id');
          assert.ok(traceId, 'x-trace-id header present');
          await new Promise((r) => setTimeout(r, 150));
          const log = require('fs').readFileSync(require('path').join(__dirname, 'logs', 'access.log'), 'utf8').trim().split('\\n').map(JSON.parse);
          const hit = log.find((l) => l.traceId === traceId);
          assert.ok(hit, 'the request is in the access log by trace id');
          assert.ok(hit.commit && hit.version, 'the access-log line carries commit + version');
          const tr = await fetch(B + '/debug/traces').then((r) => r.json());
          assert.ok(tr.version && tr.commit, '/debug/traces reports the running version + commit');
          console.log('PRODDIAG_OK');
        } finally { await new Promise((r) => server.close(r)); }
      });
    `;
    fs.writeFileSync(path.join(root, 'proddiag-driver.test.js'), drv);
    const r = cp.spawnSync('node', ['--test', 'proddiag-driver.test.js'], { cwd: root, encoding: 'utf8', timeout: 40000 });
    const out = (r.stdout || '') + (r.stderr || '');
    t.ok('§44: /debug/version + trace-id access log + /debug/traces correlate version / commit / DB (real, running app)',
      /PRODDIAG_OK/.test(out) && r.status === 0);
    if (!/PRODDIAG_OK/.test(out)) process.stdout.write(out.split('\n').filter((l) => /not ok|Error|assert|fail/i.test(l)).slice(0, 20).join('\n') + '\n');

    /* ---- §44: scripts/diagnose.js correlates a window ---- */
    const dg = cp.spawnSync('node', ['scripts/diagnose.js', '--last', '5'], { cwd: root, encoding: 'utf8', timeout: 15000 });
    const report = JSON.parse(dg.stdout || '{}');
    t.ok('§44: scripts/diagnose.js emits a correlated report (version + requests + crashes + db)',
      report.version && Array.isArray(report.requests) && Array.isArray(report.crashes) && report.db);
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
};
