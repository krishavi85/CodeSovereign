'use strict';
/* engine.decisions.js (§57-58) — the ADR / decision ledger. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeWin() {
  const win = { console, setTimeout, clearTimeout };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  win.Engine = {
    FS: {
      _data: data, isFile: (p) => !!data[p], exists: (p) => p in data,
      read: (p) => (data[p] ? data[p].content : null),
      write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {}
    },
    Sovereign: {
      read: (p) => (sov[p] != null ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null),
      write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }, list: () => Object.keys(sov)
    },
    Contract: { load: () => (sov['product-contract.json'] ? JSON.parse(sov['product-contract.json']) : null) }
  };
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.decisions.js'), 'utf8'), win, { filename: 'engine.decisions.js' });
  return win;
}

module.exports = async function (t) {
  const win = makeWin();
  const S = win.Engine.Sovereign;

  S.write('product-contract.json', {
    name: 'tracker', type: 'web-app', target: 'web',
    assumptions: [
      { id: 'ASM-1', about: 'storage engine', decision: 'schema-enforced JSON store', rationale: 'nothing named' },
      { id: 'ASM-2', about: 'session model', decision: 'opaque server-side session tokens', rationale: 'no IdP named' }
    ]
  });
  S.write('ultramode-run.json', {
    runId: 'r1', state: 'PARTIAL', result: 'PARTIAL',
    degraded: { reasons: ['observation'] },
    clarification: {
      unsafe: [{ request: 'a hidden keylogger', reason: 'covert surveillance must not be built' }],
      unsupported: [{ request: 'a native Photoshop plugin', reason: 'outside the supported generation stack' }]
    },
    artifacts: { steps: [
      { kind: 'repair', at: 1, passes: 1 },
      { kind: 'repair', at: 2, rolledBack: true, note: 'repair made the evidence worse — rolled back to pre-repair-1' }
    ] }
  });
  S.write('definition-of-done.json', { PASS: false, criteria: { implementationExists: true, buildSucceeds: false }, failing: ['buildSucceeds'] });
  S.write('upgrade-plan.json', { upgrades: [{ name: 'express', targetMajor: 5, type: 'major', risk: 'medium', notes: 'app.del removed' }] });

  const adrs = win.Engine.Decisions.harvest();
  const cats = adrs.map((a) => a.category);
  t.ok('decisions: harvests assumptions as ADRs', adrs.filter((a) => a.category === 'Assumption').length === 2);
  t.ok('decisions: a refused unsafe request is a Rejected Security ADR', adrs.some((a) => a.category === 'Security' && a.status === 'rejected' && /keylogger/i.test(a.title)));
  t.ok('decisions: an out-of-scope request is a Rejected Scope ADR', adrs.some((a) => a.category === 'Scope' && a.status === 'rejected'));
  t.ok('decisions: a rolled-back repair is a Rejected approach (this is what §57 wanted captured)', adrs.some((a) => a.category === 'Repair' && a.status === 'rejected' && /rolled back/i.test(a.decision)));
  t.ok('decisions: environment-limited verification is recorded', adrs.some((a) => a.category === 'Verification' && /observation/.test(a.context)));
  t.ok('decisions: a deferred major upgrade is a Proposed ADR', adrs.some((a) => a.category === 'Dependencies' && a.status === 'proposed' && /express/.test(a.title)));
  t.ok('decisions: the release decision is recorded (NOT VERIFIED here)', adrs.some((a) => a.category === 'Release' && /PARTIAL|NOT VERIFIED/.test(a.title)));

  const log1 = win.Engine.Decisions.analyze();
  t.ok('decisions: analyze assigns stable ADR-NNN ids + persists', /^ADR-\d{3}$/.test(log1.decisions[0].id) && win.Engine.Decisions.load().count === log1.count);
  t.ok('decisions: DECISIONS.md-style report written', /# Decision log/.test(S.read('decision-report.md')) && /## ADR-001/.test(S.read('decision-report.md')));

  // ids are stable across a re-run
  const firstIds = log1.decisions.map((d) => d.id + ':' + win.Engine.Decisions._keyOf(d));
  const log2 = win.Engine.Decisions.analyze();
  const secondIds = log2.decisions.map((d) => d.id + ':' + win.Engine.Decisions._keyOf(d));
  t.deepEqual('decisions: ADR ids are stable across regeneration', secondIds, firstIds);

  // a manual ADR survives regeneration
  const m = win.Engine.Decisions.record({ title: 'Use Postgres in production', context: 'JSON store is dev-only', decision: 'Set DATABASE_URL in prod', category: 'Architecture' });
  t.ok('decisions: record() appends a manual ADR with the next number', /^ADR-\d{3}$/.test(m.id) && m.source === 'manual');
  win.Engine.Decisions.analyze();
  t.ok('decisions: the manual ADR is preserved after a harvest re-run', win.Engine.Decisions.load().decisions.some((d) => d.id === m.id && d.source === 'manual'));

  // no run/contract -> empty but valid
  const win2 = makeWin();
  const empty = win2.Engine.Decisions.analyze();
  t.ok('decisions: no evidence -> a valid empty log', empty.count === 0 && Array.isArray(empty.decisions));
};
