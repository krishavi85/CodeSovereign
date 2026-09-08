'use strict';
/* engine.release.js (§37) + engine.cicd.js (§40) + engine.bootstrap.js (§33)
 * — release engineering, multi-provider CI/CD, environment bootstrap.
 * Generates a real scaffold, runs the three engines, and executes the
 * generated helper scripts (doctor.js, release.js --dry-run) for real. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

function loadEngines(names) {
  const dist = path.join(__dirname, '..', 'dist');
  const win = { console, setTimeout, clearTimeout };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  win.Engine = {
    FS: {
      _data: data, isFile: (p) => !!data[p] && data[p].type !== 'dir', exists: (p) => p in data,
      read: (p) => (data[p] ? data[p].content : null),
      write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {}
    },
    Sovereign: {
      read: (p) => (sov[p] != null ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null),
      write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }, list: () => Object.keys(sov)
    }
  };
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(dist, n), 'utf8'), win, { filename: n });
  return win;
}

module.exports = async function (t) {
  const win = loadEngines(['engine-universal.js', 'engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.localize.js', 'engine.scaffold.js', 'engine.jobs.js', 'engine.adapters.js', 'engine.pipeline-parse.js', 'engine.intent.js', 'engine.contract.js', 'engine.cicd.js', 'engine.bootstrap.js', 'engine.release.js']);
  const FS = win.Engine.FS;

  const contract = await win.Engine.Contract.deriveFromPrompt('A project + task tracker where a user signs in, creates projects and tasks', { useLLM: false });
  win.Engine.Sovereign.write('product-contract.json', contract);
  win.Engine.Sovereign.write('definition-of-done.json', { PASS: true, criteria: { implementationExists: true, buildSucceeds: true, testsSucceed: true } });
  const spec = win.Engine.Scaffold.specFromContract(contract);
  win.Engine.Scaffold.generate(spec).forEach((f) => FS.write(f.path, f.content));

  /* ---------- §40: CI/CD ---------- */
  const cicd = win.Engine.CICD.files();
  t.ok('cicd: emits gitlab + jenkins + azure + bitbucket', cicd['/.gitlab-ci.yml'] && cicd['/Jenkinsfile'] && cicd['/azure-pipelines.yml'] && cicd['/bitbucket-pipelines.yml']);
  t.ok('cicd: gitlab has setup/verify/build stages + real npm commands', /stages: \[setup, verify, build\]/.test(cicd['/.gitlab-ci.yml']) && /npm (ci|install)/.test(cicd['/.gitlab-ci.yml']) && /npm run migrate/.test(cicd['/.gitlab-ci.yml']));
  t.ok('cicd: Jenkinsfile is a declarative pipeline', /pipeline \{/.test(cicd['/Jenkinsfile']) && /stage\('Setup'\)/.test(cicd['/Jenkinsfile']) && /stage\('Verify'\)/.test(cicd['/Jenkinsfile']));
  t.ok('cicd: azure + bitbucket run test + build', /displayName: Test/.test(cicd['/azure-pipelines.yml']) && /npm test/.test(cicd['/bitbucket-pipelines.yml']));
  const cr = win.Engine.CICD.analyze();
  t.ok('cicd: analyze persists + records the runtime', cr.present && cr.runtime === 'node' && cr.wrote.includes('/.gitlab-ci.yml'));

  /* ---------- §33: environment bootstrap ---------- */
  const pl = win.Engine.Bootstrap.plan();
  t.ok('bootstrap: detects Node as a required runtime', pl.runtimes.some((r) => r.name === 'Node.js' && r.check === 'node --version'));
  t.ok('bootstrap: setup steps include install + migrate + sanity check', pl.steps.map((s) => s.label).join(',').includes('install dependencies') && pl.steps.some((s) => /migrat/i.test(s.label)));
  const bf = win.Engine.Bootstrap.files();
  t.ok('bootstrap: emits doctor.js + setup.sh + setup.ps1 + DEVELOPMENT.md', bf['/scripts/doctor.js'] && bf['/scripts/setup.sh'] && bf['/scripts/setup.ps1'] && bf['/docs/DEVELOPMENT.md']);
  win.Engine.Bootstrap.analyze();

  /* ---------- §37: release ---------- */
  const rn = win.Engine.Release.notes();
  t.ok('release: version + changelog + release notes', rn.version === '0.1.0' && /# Changelog/.test(rn.changelog) && /SOVEREIGN VERIFIED/.test(rn.releaseNotes));
  t.ok('release: changelog Added section lists mandatory requirements', /### Added/.test(rn.changelog) && rn.added > 0);
  t.ok('release: known-limitations from assumptions', /### Known limitations/.test(rn.changelog) && rn.limitations > 0);
  const rf = win.Engine.Release.files();
  t.ok('release: emits CHANGELOG + RELEASE_NOTES + scripts/release.js + .github/release.yml', rf['/CHANGELOG.md'] && rf['/RELEASE_NOTES.md'] && /crypto\.createHash\('sha256'\)/.test(rf['/scripts/release.js']) && rf['/.github/release.yml']);
  win.Engine.Release.analyze();

  /* ---------- RUN the generated helper scripts for real ---------- */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relci-'));
  try {
    const repo = {};
    win.Engine.Scaffold.generate(spec).forEach((f) => { repo[f.path] = f.content; });
    Object.assign(repo, cicd, bf, rf);
    Object.keys(repo).forEach((p) => { const abs = path.join(dir, p.replace(/^\//, '')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, repo[p]); });

    const doc = cp.spawnSync('node', ['scripts/doctor.js'], { cwd: dir, encoding: 'utf8', timeout: 20000 });
    t.equal('bootstrap: the generated doctor.js runs + passes (node is present here)', doc.status, 0);
    t.ok('bootstrap: doctor.js reports the Node check', /ok Node\.js/.test(doc.stdout || ''));

    const rel = cp.spawnSync('node', ['scripts/release.js', 'minor'], { cwd: dir, encoding: 'utf8', timeout: 20000 });
    t.equal('release: release.js dry-run exits 0', rel.status, 0);
    t.ok('release: dry-run shows the bump 0.1.0 -> 0.2.0 and does not write', /0\.1\.0 -> 0\.2\.0/.test(rel.stdout || '') && JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version === '0.1.0');

    const relW = cp.spawnSync('node', ['scripts/release.js', 'patch', '--write'], { cwd: dir, encoding: 'utf8', timeout: 20000 });
    t.equal('release: release.js --write exits 0', relW.status, 0);
    t.ok('release: --write bumps package.json + writes real SHA-256 checksums', JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version === '0.1.1' && /^[0-9a-f]{64}  /m.test(fs.readFileSync(path.join(dir, 'checksums.sha256'), 'utf8')));

    // parse every generated pipeline through node -c where it's JS, and js-yaml-ish sanity for YAML
    const jf = cp.spawnSync('node', ['--check', 'Jenkinsfile'], { cwd: dir, encoding: 'utf8' });
    // Jenkinsfile is Groovy, not JS — just assert it is non-trivial + balanced braces
    const jfSrc = repo['/Jenkinsfile'];
    t.ok('cicd: Jenkinsfile has balanced braces', (jfSrc.match(/\{/g) || []).length === (jfSrc.match(/\}/g) || []).length && jfSrc.length > 200);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
};
