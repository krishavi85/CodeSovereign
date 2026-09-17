'use strict';
/* engine.schema + engine.auth + engine.backend + engine.scaffold —
   GENERATE a real full-stack app, write it to disk, and actually run its
   migrate / lint / test. This proves repo-scale generation produces
   working software, not just files. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

module.exports = async function (t) {
  const dist = path.join(__dirname, '..', 'dist');
  const load = (n) => fs.readFileSync(path.join(dist, n), 'utf8');

  const win = { console };
  win.window = win;
  win.Engine = { FS: { read: () => null } };
  vm.createContext(win);
  for (const f of ['engine.schema.js', 'engine.auth.js', 'engine.jobs.js', 'engine.backend.js', 'engine.scaffold.js']) {
    vm.runInContext(load(f), win, { filename: f });
  }
  const Sc = win.Engine.Scaffold;
  t.ok('Engine.Schema/Auth/Backend/Scaffold loaded',
    !!(win.Engine.Schema && win.Engine.Auth && win.Engine.Backend && Sc));

  // ---- migrations look like real SQL ----
  const spec = Sc.normalize(Sc.DEMO_SPEC);
  const mig = win.Engine.Schema.migrationsSQL(spec)['db/migrations/001_init.sql'];
  t.ok('migration has CREATE TABLE for every entity',
    spec.entities.every((e) => mig.includes('CREATE TABLE IF NOT EXISTS ' + e.table)));
  t.ok('migration emits FOREIGN KEY + ON DELETE', /FOREIGN KEY .* REFERENCES .* ON DELETE (CASCADE|SET NULL)/.test(mig));
  t.ok('migration emits a UNIQUE INDEX', /CREATE UNIQUE INDEX/.test(mig));

  // ---- generate the whole repo ----
  const files = Sc.generate(Sc.DEMO_SPEC);
  t.ok('generated a repo-scale file set (>= 15 files)', files.length >= 15, files.length + ' files');
  const paths = files.map((f) => f.path);
  ['/server.js', '/src/db.js', '/src/schema.js', '/src/auth.js', '/package.json',
   '/db/migrations/001_init.sql', '/public/index.html', '/public/app.js', '/test/db.test.js',
   '/test/auth.test.js', '/test/api.test.js', '/scripts/migrate.js', '/Dockerfile',
   '/.github/workflows/ci.yml'].forEach((p) => t.ok('generated ' + p, paths.includes(p)));

  // every generated .js file must parse
  let parsed = 0;
  for (const f of files) {
    if (!f.path.endsWith('.js')) continue;
    try { new vm.Script(f.content, { filename: f.path }); parsed++; }
    catch (e) { t.ok('parse ' + f.path + ' -> ' + e.message, false); }
  }
  t.ok('every generated .js parses (' + parsed + ')', parsed >= 8);

  // ---- write to disk and RUN it ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-scaffold-'));
  try {
    for (const f of files) {
      const abs = path.join(dir, f.path.slice(1));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.content);
    }
    const run = (args) => execFileSync('node', args, { cwd: dir, stdio: 'pipe', timeout: 60000 }).toString();

    const m = run(['scripts/migrate.js']);
    t.ok('generated app: npm run migrate succeeds', /migrated:/.test(m), m.trim());

    const l = run(['scripts/lint.js']);
    t.ok('generated app: npm run lint is clean', /lint clean/.test(l), l.trim());

    let testOut = '', testExit = 0;
    try { testOut = run(['--test']); }   // bare — auto-discovers *.test.js (matches package.json)
    catch (e) { testOut = (e.stdout || '').toString() + (e.stderr || '').toString(); testExit = e.status || 1; }
    const passN = (testOut.match(/(?:^|\s)pass (\d+)/m) || [])[1];
    const failN = (testOut.match(/(?:^|\s)fail (\d+)/m) || [])[1];
    t.ok('generated app: node --test — all tests pass',
      testExit === 0 && Number(passN) >= 3 && Number(failN) === 0,
      'exit=' + testExit + ' pass=' + passN + ' fail=' + failN);

    const b = run(['scripts/build.js']);
    t.ok('generated app: npm run build succeeds', /built \d+ files/.test(b), b.trim());
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }

  // ---- no-auth variant also runs ----
  const noAuth = Sc.generate({ name: 'notes', auth: false, entities: [
    { name: 'note', fields: [{ name: 'body', type: 'longtext', required: true, max: 4000 }] }
  ] });
  t.ok('no-auth spec still generates a server + db + test', noAuth.some((f) => f.path === '/server.js') && noAuth.some((f) => f.path === '/src/auth.js') === false);

  // ---- async infra variant (jobs + worker + SSE) generates and RUNS ----
  const jobsFiles = Sc.generate({ name: 'jobsapp', auth: true, jobs: true, entities: [
    { name: 'doc', fields: [{ name: 'title', type: 'text', required: true }, { name: 'ownerId', type: 'ref', ref: 'user', required: true }] }
  ] });
  const jp = jobsFiles.map((f) => f.path);
  ['/src/queue.js', '/src/worker.js', '/src/events.js', '/src/jobs/welcome.js', '/test/worker.test.js'].forEach((p) =>
    t.ok('jobs variant generates ' + p, jp.includes(p)));
  t.ok('jobs variant: server wires SSE events + job enqueue', (() => {
    const srv = jobsFiles.find((f) => f.path === '/server.js').content;
    return /events\.subscribe\(res\)/.test(srv) && /queue\.enqueue\(/.test(srv);
  })());
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-jobs-'));
    try {
      for (const f of jobsFiles) { const abs = path.join(dir, f.path.slice(1)); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, f.content); }
      let out = '';
      try { out = execFileSync('node', ['--test'], { cwd: dir, stdio: 'pipe', timeout: 60000 }).toString(); }
      catch (e) { out = (e.stdout || '').toString() + (e.stderr || '').toString(); }
      const p = (out.match(/(?:^|\s)pass (\d+)/m) || [])[1], fl = (out.match(/(?:^|\s)fail (\d+)/m) || [])[1];
      t.ok('jobs variant: generated app tests pass (incl. queue/worker)', Number(p) >= 4 && Number(fl) === 0, 'pass=' + p + ' fail=' + fl);
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  }

  // ---- node-pg stack variant generates a pg adapter + shim + optionalDependency ----
  const pgFiles = Sc.generate(Object.assign({}, Sc.DEMO_SPEC, { stack: 'node-pg' }));
  const pgp = pgFiles.map((f) => f.path);
  t.ok('node-pg: emits db.js shim + db.json.js + db.pg.js',
    pgp.includes('/src/db.js') && pgp.includes('/src/db.json.js') && pgp.includes('/src/db.pg.js'));
  t.ok('node-pg: db.js picks pg when DATABASE_URL is set',
    /DATABASE_URL \? require\('\.\/db\.pg'\)/.test(pgFiles.find((f) => f.path === '/src/db.js').content));
  t.ok('node-pg: package.json lists pg as an optionalDependency',
    /"optionalDependencies"[\s\S]*"pg"/.test(pgFiles.find((f) => f.path === '/package.json').content));
  for (const f of pgFiles) if (f.path.endsWith('.js')) { try { new vm.Script(f.content, { filename: f.path }); } catch (e) { t.ok('node-pg parse ' + f.path + ' -> ' + e.message, false); } }
};
