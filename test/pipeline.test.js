'use strict';
/* engine.contract + engine.ledger + engine.dod — the P0 pipeline, in a window shim.
   Proves the DoD gate is computed from evidence: it must REFUSE while a MOCK
   control exists and FLIP once the control is observed REAL. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const dist = path.join(__dirname, '..', 'dist');
  const load = (name) => fs.readFileSync(path.join(dist, name), 'utf8');

  // ---- shims ----
  const files = { '/package.json': JSON.stringify({ name: 'demo', scripts: { test: 'x', build: 'x', lint: 'x' } }),
                  '/public/app.js': 'console.log(1)' };
  const FS = {
    _data: Object.keys(files).reduce((m, k) => (m[k] = { type: 'file', content: files[k] }, m), {}),
    read: (p) => (files[p] == null ? null : files[p]),
    isFile: (p) => p in files,
    exists: (p) => p in files,
    write: (p, c) => { files[p] = String(c); FS._data[p] = { type: 'file', content: String(c) }; }
  };
  const sov = {};
  const Sovereign = {
    read: (p) => { const raw = sov[p]; if (raw == null) return null; return /\.json$/.test(p) ? JSON.parse(raw) : raw; },
    write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); },
    list: () => Object.keys(sov)
  };
  const seed = (p, obj) => { sov[p] = JSON.stringify(obj); };

  seed('execution-evidence.json', { gates: { testsPass: true, buildPasses: true, lintClean: true } });
  seed('connection-health.json', { broken: [] });
  seed('pipeline-inventory.json', { count: 1, jobs: ['npm test', 'npm run build'] });
  seed('simulation-report.json', { signals: [] });
  seed('decision-state.json', { projectType: 'vanilla-web' });
  const invMock = { interactions: [
    { id: 'INT-1', name: 'Export CSV', control: 'button', status: 'MOCK' },
    { id: 'INT-2', name: 'Refresh', control: 'button', status: 'REAL' }
  ] };
  seed('interaction-inventory.json', invMock);
  seed('runtime-trace.json', { trace: [
    { control: { name: 'Export CSV' }, status: 'MOCK' },
    { control: { name: 'Refresh' }, status: 'REAL' }
  ] });

  const win = {};
  win.window = win; win.console = console;
  win.Engine = { FS, Sovereign, Proj: { current: () => ({ name: 'demo' }) } };
  vm.createContext(win);
  for (const f of ['engine.contract.js', 'engine.ledger.js', 'engine.dod.js']) {
    vm.runInContext(load(f), win, { filename: f });
  }

  t.ok('Engine.Contract present', !!win.Engine.Contract);
  t.ok('Engine.Ledger present', !!win.Engine.Ledger);
  t.ok('Engine.DoD present', !!win.Engine.DoD);

  // ---- derive contract ----
  const contract = await win.Engine.Contract.derive({ useLLM: false });
  t.ok('contract has requirements', contract.requirements.length >= 4);
  const exportReq = contract.requirements.find((r) => /export csv/i.test(r.statement));
  t.ok('contract tracks the Export CSV control', !!exportReq &&
    exportReq.acceptanceCriteria.some((c) => c.kind === 'control'));
  t.ok('contract has a no-mock requirement', contract.requirements.some((r) =>
    r.acceptanceCriteria.some((c) => c.kind === 'no-mock')));
  t.ok('contract has machine-checkable criteria', contract.totals.withMachineCriteria >= 4);

  // ---- ledger + DoD while the MOCK exists ----
  const l1 = win.Engine.Ledger.build(contract);
  const exportClaim1 = l1.claims.find((c) => c.requirementId === exportReq.id);
  t.ok('Export CSV claim is not VERIFIED while MOCK', exportClaim1.confidence !== 'VERIFIED');
  t.ok('ledger counts assertions', l1.totals.assertions > 0);

  const dod1 = win.Engine.DoD.evaluate();
  t.ok('DoD: noFakeImplementation FAILS with a MOCK control', dod1.criteria.noFakeImplementation === false);
  t.ok('DoD: acceptanceCriteriaPass FAILS with an unverified requirement', dod1.criteria.acceptanceCriteriaPass === false);
  t.ok('DoD: overall gate is NOT DONE', dod1.PASS === false);
  t.ok('DoD: build + tests still recognised as passing', dod1.criteria.buildSucceeds === true && dod1.criteria.testsSucceed === true);

  // ---- the fix lands: Export CSV is now observed REAL ----
  seed('interaction-inventory.json', { interactions: [
    { id: 'INT-1', name: 'Export CSV', control: 'button', status: 'REAL' },
    { id: 'INT-2', name: 'Refresh', control: 'button', status: 'REAL' }
  ] });
  seed('runtime-trace.json', { trace: [
    { control: { name: 'Export CSV' }, status: 'REAL' },
    { control: { name: 'Refresh' }, status: 'REAL' }
  ] });

  const l2 = win.Engine.Ledger.build(win.Engine.Contract.load());
  const exportClaim2 = l2.claims.find((c) => c.requirementId === exportReq.id);
  t.ok('Export CSV claim flips to VERIFIED', exportClaim2.confidence === 'VERIFIED');

  const dod2 = win.Engine.DoD.evaluate();
  t.ok('DoD: noFakeImplementation now PASSES', dod2.criteria.noFakeImplementation === true);
  t.ok('DoD: acceptanceCriteriaPass now PASSES', dod2.criteria.acceptanceCriteriaPass === true);
  t.ok('DoD: overall gate is now DONE', dod2.PASS === true);

  const cert = win.Engine.DoD.certificate();
  t.ok('certificate says SOVEREIGN VERIFIED', /SOVEREIGN VERIFIED/.test(cert));
  t.ok('certificate reports a non-zero assertion count', /Evidence assertions:\D*([1-9]\d*)/.test(cert));
  t.ok('release-certificate.md was written', typeof sov['release-certificate.md'] === 'string');
};
