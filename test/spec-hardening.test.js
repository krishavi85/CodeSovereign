'use strict';
/* §3 per-requirement verification record · §5+§8 feasibility · §6 project-docs.
 * Runs the real engines against a generated project's evidence store. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');

function env(over) {
  const data = {}, sov = {};
  const FS = {
    _data: data,
    isFile: (p) => typeof data[p] === 'string',
    exists: (p) => typeof data[p] === 'string',
    read: (p) => (data[p] != null ? data[p] : null),
    write: (p, c) => { data[p] = String(c); }, remove: (p) => { delete data[p]; }, count: () => Object.keys(data).length
  };
  const win = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, RegExp, URL, Function, Promise };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  // mirrors the real Engine.Sovereign: *.json round-trips as a parsed object
  win.Engine = { FS, Sovereign: {
    write: (p, d) => { sov[p] = (/\.json$/.test(p) && typeof d === 'string') ? JSON.parse(d) : d; },
    read: (p) => (sov[p] !== undefined ? sov[p] : null)
  } };
  win._sov = sov;
  Object.assign(win.Engine, over || {});
  vm.createContext(win);
  for (const n of ['engine.requirements.js', 'engine.feasibility.js', 'engine.docs.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), win, { filename: n });
  }
  return win;
}

const CONTRACT = {
  product: { name: 'taskflow', objective: 'a task tracker with accounts', prompt: 'a task tracker with accounts' },
  verdict: 'buildable', target: 'web',
  supportedStack: { frontend: 'vanilla', backend: 'node', database: 'postgres', api: 'rest', auth: true, rbac: true, jobs: true, deploy: true, architecture: 'monolith', deployTargets: ['docker', 'compose'] },
  authMethods: { password: true, mfa: false, oauth: true, passkeys: false },
  scope: { mandatory: ['R1', 'R2', 'R4'], optional: ['R3'] },
  entities: [{ name: 'project', fields: [{ name: 'title' }] }, { name: 'task', fields: [{ name: 'title' }, { name: 'done' }] }],
  apiRequirements: [{ method: 'GET', path: '/api/tasks', auth: true, requirementId: 'R4' }],
  journeys: [], assumptions: [{ about: 'storage', decision: 'Postgres', rationale: 'named in the prompt' }],
  security: [{ statement: 'Passwords are stored only as a slow salted hash.' }],
  acceptanceCriteria: [{ id: 'AC-1', requirementId: 'R1', then: 'tests pass' }],
  blockingQuestions: [],
  requirements: [
    { id: 'R1', statement: 'The tests pass', category: 'quality', priority: 'mandatory', acceptanceCriteria: [{ kind: 'execution', gate: 'testsPass' }] },
    { id: 'R2', statement: 'A real database schema exists', category: 'data', priority: 'mandatory', acceptanceCriteria: [{ kind: 'file', path: '/db/migrations/001_init.sql' }] },
    { id: 'R3', statement: 'Lint is clean', category: 'quality', priority: 'optional', source: 'llm', acceptanceCriteria: [{ kind: 'execution', gate: 'lintClean' }] },
    { id: 'R4', statement: 'Users manage tasks via REST', category: 'functional', priority: 'mandatory', acceptanceCriteria: [{ kind: 'file', path: '/src/services/task.js' }] }
  ],
  deployment: { targets: ['docker', 'compose'] }
};

module.exports = async function (t) {
  /* ---------- §3 per-requirement verification record ---------- */
  {
    const w = env({ Contract: { load: () => CONTRACT } });
    // a ledger where R1 verified, R2 partial, R4 failing, R3 unverified
    w.Engine.Sovereign.write('evidence-ledger.json', {
      totals: { requirements: 4, verified: 1, partial: 1, failures: 1 },
      claims: [
        { requirementId: 'R1', confidence: 'VERIFIED', failures: 0, assertions: 1, evidence: [{ kind: 'execution', ref: 'execution-evidence.json#gates.testsPass', result: 'PASS' }] },
        { requirementId: 'R2', confidence: 'PARTIAL', failures: 0, assertions: 2, evidence: [{ kind: 'file', ref: '/db/migrations/001_init.sql', result: 'PASS' }] },
        { requirementId: 'R3', confidence: 'UNVERIFIED', failures: 0, assertions: 0, evidence: [] },
        { requirementId: 'R4', confidence: 'FAILING', failures: 1, assertions: 1, evidence: [{ kind: 'file', ref: '/src/services/task.js', result: 'FAIL' }] }
      ]
    });
    w.Engine.Sovereign.write('requirements.json', { mandatoryChecklist: [
      { requirement: 'audit log', status: 'not-found', source: 'domain-pack' },
      { requirement: 'password reset', status: 'not-found', source: 'domain-pack' }
    ] });

    const rec = w.Engine.Requirements.verificationRecord();
    t.equal('§3: every contract requirement gets a record', rec.requirements.length, 4);
    const byId = {}; rec.requirements.forEach((r) => { byId[r.id] = r; });
    t.equal('§3: R1 verified from the ledger', byId.R1.status, 'verified');
    t.equal('§3: R2 partial', byId.R2.status, 'partial');
    t.equal('§3: R4 (mandatory, failing) -> failing', byId.R4.status, 'failing');
    t.equal('§3: R3 (optional, no criteria fired) -> unverified', byId.R3.status, 'unverified');
    t.equal('§3: origin — requested vs implied', byId.R3.origin, 'implied');
    t.equal('§3: R1 origin requested', byId.R1.origin, 'requested');
    t.ok('§3: evidence refs are carried per requirement', byId.R1.evidenceRefs.indexOf('execution-evidence.json#gates.testsPass') >= 0);
    t.ok('§3: missing = domain-implied items not in the contract', rec.missing.some((m) => /audit log/.test(m.requirement)));
    t.ok('§3: totals + coverage', rec.totals.total === 4 && rec.totals.verified === 1 && rec.totals.coverage === Math.round((1 + 0.5) / 4 * 100));
    t.ok('§3: a coverage history point is appended', Array.isArray(rec.history) && rec.history.length === 1);
    t.equal('§3: evidence file written', typeof w._sov['requirements-verification.json'], 'object');
    // a second run extends the history and does not duplicate
    const rec2 = w.Engine.Requirements.verificationRecord();
    t.equal('§3: history grows across runs', rec2.history.length, 2);
  }

  /* ---------- §5 + §8 feasibility ---------- */
  {
    // no desktop probe -> host reported "unknown", never silently OK
    const w = env({ Contract: { load: () => CONTRACT }, Requirements: { contradictions: () => [] } });
    const f = await w.Engine.Feasibility.analyze();
    t.equal('§8: without a probe the host is "unknown" (not silently ready)', f.host.ready, 'unknown');
    t.ok('§8: the checks name the tools the postgres+docker+node stack needs', f.host.checks.some((c) => c.tool === 'psql') && f.host.checks.some((c) => c.tool === 'node'));
    t.ok('§5: an effort tier + band is estimated from the contract shape', ['small', 'standard', 'large', 'complex'].indexOf(f.effort.tier) >= 0 && /day|week|month/.test(f.effort.effortBand));
    t.ok('§5: a hosting-cost band is estimated', ['free', 'low', 'medium'].indexOf(f.hostingCost.band) >= 0 && /\$/.test(f.hostingCost.monthly));
    t.equal('§5/§8: evidence file written', typeof w._sov['feasibility.json'], 'object');

    // with a probe that reports a missing tool
    const w2 = env({
      Contract: { load: () => CONTRACT }, Requirements: { contradictions: () => [] }
    });
    w2.desktop = { isDesktop: true };
    w2.CSAdapters = { probe: () => Promise.resolve({ host: { node: true, npm: true, git: true, docker: false, python: false, psql: false } }) };
    const f2 = await w2.Engine.Feasibility.analyze();
    t.equal('§8: a probed host with no psql AND no docker -> missing-tools', f2.host.ready, 'missing-tools');
    const w3 = env({ Contract: { load: () => CONTRACT }, Requirements: { contradictions: () => [] } });
    w3.desktop = { isDesktop: true };
    w3.CSAdapters = { probe: () => Promise.resolve({ host: { node: true, npm: true, git: true, docker: true, python: true, psql: false } }) };
    const f3 = await w3.Engine.Feasibility.analyze();
    t.equal('§8: docker present covers the Postgres need -> ready', f3.host.ready, 'ready');
  }

  /* ---------- §12 deep wiring trace on a real generated app ---------- */
  {
    const win = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout };
    win.window = win;
    win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    win.Engine = {};
    vm.createContext(win);
    // engine.js brings its own Engine.FS (cs.fs.v1); everything after uses it
    for (const n of ['engine-universal.js', 'engine.js', 'engine.schema.js', 'engine.contract.js', 'engine.auth.js', 'engine.backend.js', 'engine.jobs.js', 'engine.frontends.js', 'engine.localize.js', 'engine.testgen.js', 'engine.deploy.js', 'engine.scaffold.js', 'engine.wiring.js']) {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), win, { filename: n });
    }
    const F = win.Engine.FS;
    const sov = {};
    win.Engine.Sovereign = { read: (p) => (sov[p] ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null), write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); } };
    const contract = await win.Engine.Contract.deriveFromPrompt('A tracker where a user signs in, creates projects and tasks and deletes them, REST API, tests', { useLLM: false });
    const spec = win.Engine.Scaffold.specFromContract(contract);
    win.Engine.Scaffold.generate(spec).forEach((f) => F.write(f.path, typeof f.content === 'string' ? f.content : String(f.content)));

    const tr = win.Engine.Wiring.trace();
    t.ok('§12: a chain is traced per real entity', tr.present && tr.entities.length >= 1);
    const one = tr.entities[0];
    t.deepEqual('§12: the chain covers UI → fetch → route → service → db-op → table',
      one.chain.map((c) => c.link), ['ui-control', 'fetch', 'route', 'service', 'db-op', 'table']);
    t.ok('§12: the generated app is fully wired end to end', tr.totals.fullyWired === tr.totals.entities && tr.totals.brokenChains === 0);
    t.equal('§12: evidence file written', typeof win.Engine.Sovereign.read('wiring-trace.json'), 'object');

    // break the service layer -> the trace pinpoints the missing link
    const svcKey = Object.keys(F._data || {}).find((k) => k.indexOf('/src/services/' + one.entity + '.js') >= 0);
    if (svcKey) delete F._data[svcKey];
    const broken = win.Engine.Wiring.trace();
    const be = broken.entities.find((e) => e.entity === one.entity);
    t.ok('§12: deleting the service module -> the trace flags the exact broken link',
      !be.complete && be.breaks.some((b) => /service.*missing|no service layer/i.test(b)));
  }

  /* ---------- §27 model conversion recipe ---------- */
  {
    const win = { console: { info() {}, log() {} }, setTimeout, clearTimeout };
    win.window = win; win.Engine = {};
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.modelmanager.js'), 'utf8'), win, { filename: 'engine.modelmanager.js' });
    const p = win.Engine.ModelManager.convertPlan({ hfRepo: 'mistralai/Mistral-7B-Instruct-v0.3', paramsB: 7, quant: 'q4_K_M', contextTokens: 8192 });
    t.ok('§27: a runnable HF→GGUF + quantize recipe is emitted', p.files.some((f) => f.path === '/scripts/model-convert.sh' && /convert_hf_to_gguf\.py/.test(f.content) && /llama-quantize/.test(f.content)));
    t.ok('§27: the recipe checks host memory against a real estimate', /EST_GB=/.test(p.files[0].content) && p.estimate.totalGB > 4 && p.estimate.totalGB < 10);
    t.ok('§27: the toolchain gate is stated honestly', p.needs.some((n) => /llama\.cpp/.test(n)) && /needs the toolchain/i.test(p.note));
  }

  /* ---------- §6 project-docs from the contract ---------- */
  {
    const w = env({ Contract: { load: () => CONTRACT } });
    const docs = w.Engine.Docs.projectSpec();
    const paths = docs.map((d) => d.path);
    t.ok('§6: the contract materialises as /project-docs/*.md',
      paths.indexOf('/project-docs/product-spec.md') >= 0 && paths.indexOf('/project-docs/requirements.md') >= 0 &&
      paths.indexOf('/project-docs/architecture.md') >= 0 && paths.indexOf('/project-docs/api.md') >= 0);
    const reqDoc = docs.find((d) => d.path === '/project-docs/requirements.md').content;
    t.ok('§6: requirements.md separates requested from implied', /## Requested/.test(reqDoc) && /## Implied/.test(reqDoc) && /R3.*implied/.test(reqDoc));
    const archDoc = docs.find((d) => d.path === '/project-docs/architecture.md').content;
    t.ok('§6: architecture.md carries the stack + the layering rules', /Background jobs: durable queue/.test(archDoc) && /never imports server code/.test(archDoc));
  }
};
