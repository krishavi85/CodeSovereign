'use strict';
/* engine.security + engine.deploy + engine.testgen + engine.autonomy + engine.agents —
   the "software factory" layer: generate a repo, then prove the scanner, the
   deployment IaC generator, the testing factory, the autonomy gate and the
   specialist-agent roster all operate on it. Runs in a window shim. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const dist = path.join(__dirname, '..', 'dist');
  const load = (n) => fs.readFileSync(path.join(dist, n), 'utf8');

  // ---- FS + Sovereign shims ----
  const data = {};                       // path -> { type:'file', content }
  const sov = {};
  const FS = {
    _data: data,
    isFile: (p) => !!data[p] && data[p].type === 'file',
    exists: (p) => p in data,
    read: (p) => (data[p] ? data[p].content : null),
    write: (p, c) => { data[p] = { type: 'file', content: String(c) }; },
    count: () => Object.keys(data).length,
    __flush: () => Promise.resolve()
  };
  const Sovereign = {
    read: (p) => { const r = sov[p]; return r == null ? null : (/\.json$/.test(p) ? JSON.parse(r) : r); },
    write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }
  };

  const win = { console };
  win.window = win;
  win.localStorage = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })();
  win.Engine = { FS, Sovereign };
  vm.createContext(win);
  for (const f of ['engine.schema.js', 'engine.auth.js', 'engine.jobs.js', 'engine.backend.js', 'engine.scaffold.js',
                   'engine.security.js', 'engine.testgen.js', 'engine.deploy.js', 'engine.autonomy.js', 'engine.agents.js']) {
    vm.runInContext(load(f), win, { filename: f });
  }
  const E = win.Engine;
  t.ok('all factory engines loaded',
    !!(E.Security && E.TestGen && E.Deploy && E.Autonomy && E.Agents));

  // ---- generate a real repo into the FS shim ----
  const files = E.Scaffold.generate({
    name: 'shop', auth: true, jobs: true, entities: [
      { name: 'product', fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'ownerId', type: 'ref', ref: 'user', required: true }
      ] }
    ]
  });
  files.forEach((f) => FS.write(f.path, f.content));
  t.ok('repo written into FS (' + FS.count() + ' files)', FS.count() >= 15);

  // ================= Engine.Security =================
  const clean = E.Security.scan();
  t.ok('security scan returns a score + findings array',
    typeof clean.score === 'number' && Array.isArray(clean.findings));
  t.ok('generated app scores well (>= 70)', clean.score >= 70, 'score=' + clean.score);
  t.ok('security-findings.json + security-report.md written',
    !!sov['security-findings.json'] && !!sov['security-report.md']);

  // plant vulnerabilities and confirm they are caught
  FS.write('/src/bad.js', [
    "const q = 'SELECT * FROM users WHERE id = ' + req.query.id;",
    "db.query(q);",
    "el.innerHTML = req.body.name;",
    "const KEY = 'sk-ant-api03-0123456789abcdefghij0123456789abcdefghij';",
    "require('child_process').exec('ls ' + req.query.dir);"
  ].join('\n'));
  const dirty = E.Security.scan();
  const rules = dirty.findings.map((f) => f.rule);
  ['sql-injection', 'xss-innerhtml', 'hardcoded-secret', 'command-injection'].forEach((r) =>
    t.ok('security catches ' + r, rules.includes(r)));
  t.ok('planted vulns drop the score below the clean run', dirty.score < clean.score,
    dirty.score + ' < ' + clean.score);
  t.ok('high-severity findings are counted', (dirty.bySeverity.high || 0) >= 3);
  delete data['/src/bad.js'];

  // ================= Engine.Deploy =================
  t.ok('Deploy exposes >= 5 targets', Object.keys(E.Deploy.TARGETS).length >= 5);
  const pf = E.Deploy.preflight();
  t.ok('preflight returns a checklist', Array.isArray(pf.checks) && pf.checks.length >= 6);
  t.ok('preflight sees the start command', pf.checks.find((c) => /start command/.test(c.name)).ok);

  const composePlan = E.Deploy.plan('compose');
  t.ok('compose plan lists generated artefacts + a cost', /free/.test(composePlan.cost) && composePlan.generates.length >= 2);
  t.equal('unknown target is reported, not thrown', !!E.Deploy.plan('nope').error, true);

  const applied = E.Deploy.apply('compose', {});
  t.ok('apply writes the compose file + deploy script + .dockerignore',
    applied.wrote.includes('/docker-compose.prod.yml') && applied.wrote.includes('/.dockerignore') && applied.wrote.some((p) => /deploy\/compose\.sh$/.test(p)));
  t.ok('apply does not clobber the scaffold Dockerfile unless forced',
    !applied.wrote.includes('/Dockerfile') && E.Deploy.apply('compose', { force: true }).wrote.includes('/Dockerfile'));
  t.ok('compose file wires a Postgres service', /postgres:16/.test(FS.read('/docker-compose.prod.yml')));
  t.ok('deployment.json recorded in .sovereign', !!sov['deployment.json']);
  // every deploy target's artefacts are producible
  Object.keys(E.Deploy.TARGETS).forEach((tg) => {
    const a = E.Deploy.artifacts(tg, {});
    t.ok('deploy target "' + tg + '" produces artefacts', a.length >= 1 && a.every((f) => typeof f.content === 'string'));
  });

  // ================= Engine.TestGen =================
  const plan = E.TestGen.plan();
  t.ok('testgen detects endpoints from the schema/routes', plan.endpoints.length >= 1);
  const gen = E.TestGen.generate({});
  const gp = gen.map((f) => f.path);
  t.ok('testgen writes a chaos suite', gp.includes('/test/chaos.test.js'));
  t.ok('testgen writes an API suite for detected endpoints', gp.includes('/test/generated-api.test.js'));
  const chaos = FS.read('/test/chaos.test.js');
  t.ok('chaos suite is valid JS', (() => { try { new vm.Script(chaos); return true; } catch (_) { return false; } })());
  t.ok('chaos suite exercises malformed body + wrong method + bad token',
    /not json/.test(chaos) && /wrong method/.test(chaos) && /bogus token|deadbeef/.test(chaos));
  for (const f of gen) t.ok('generated test parses: ' + f.path,
    (() => { try { new vm.Script(f.content); return true; } catch (e) { return false; } })());
  t.ok('testgen.json recorded', !!sov['testgen.json']);

  // ================= Engine.Autonomy =================
  t.deepEqual('five graduated levels', E.Autonomy.LEVELS,
    ['assist', 'build', 'engineer', 'autopilot', 'ultra']);
  t.equal('default level is engineer', E.Autonomy.get(), 'engineer');
  t.ok('assist allows observe but not generate/command/deploy', (() => {
    E.Autonomy.set('assist');
    return E.Autonomy.allows('observe') && !E.Autonomy.allows('generate') &&
           !E.Autonomy.allows('command') && !E.Autonomy.allows('deploy');
  })());
  t.ok('engineer allows repair but not deploy/release', (() => {
    E.Autonomy.set('engineer');
    return E.Autonomy.allows('repair') && !E.Autonomy.allows('deploy') && !E.Autonomy.allows('release');
  })());
  t.ok('ultra allows everything incl. deploy + release', (() => {
    E.Autonomy.set('ultra');
    return ['generate', 'command', 'repair', 'observe', 'deploy', 'release', 'network'].every((a) => E.Autonomy.allows(a));
  })());
  t.deepEqual('gate() blocks a disallowed action', (() => {
    E.Autonomy.set('assist');
    return E.Autonomy.gate('deploy', () => 'ran');
  })(), { blocked: 'deploy', level: 'assist' });
  t.equal('gate() runs an allowed action', E.Autonomy.gate('observe', () => 'ran'), 'ran');
  E.Autonomy.set('ultra');   // so the agent pipeline below is unblocked

  // ================= Engine.Agents =================
  t.ok('roster has >= 8 specialist agents', E.Agents.ROSTER.length >= 8);
  ['product', 'architect', 'scaffold', 'security', 'verify', 'deploy', 'release'].forEach((id) =>
    t.ok('agent "' + id + '" is on the roster', !!E.Agents.get(id)));

  const sec = await E.Agents.run('security');
  t.ok('security agent runs the scanner and reports a score',
    sec && sec.report && typeof sec.report.score === 'number');

  E.Autonomy.set('assist');
  const blocked = await E.Agents.run('deploy');
  t.equal('deploy agent is blocked at assist level', blocked.blocked, 'deploy');
  E.Autonomy.set('ultra');

  const dep = await E.Agents.run('deploy', { deployTarget: 'compose' });
  t.ok('deploy agent produces IaC when allowed', dep && Array.isArray(dep.files) && dep.files.length >= 2);

  // arbitration: blueprint hierarchy product > architecture > security > performance > ui
  const res = E.Agents.arbitrate([
    { about: 'inline styles vs CSP', between: ['ui', 'security'] },
    { about: 'extra field vs contract', between: ['architecture', 'product'] }
  ]);
  t.equal('arbitration: security beats ui', res[0].winner, 'security');
  t.equal('arbitration: product beats architecture', res[1].winner, 'product');
};
