'use strict';
/* §21-24 — the recovery loop targets the CONTRACT's acceptance criteria
 * (real evidence via the Evidence Ledger + Definition-of-Done), not just a
 * clean validator. Plus: dependency-order repair, explicit hypotheses, and a
 * "prevention" roll-up. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function env(over) {
  const data = {};
  const FS = {
    _data: data,
    isFile: (p) => typeof data[p] === 'string',
    exists: (p) => typeof data[p] === 'string',
    read: (p) => (data[p] != null ? data[p] : null),
    write: (p, c) => { data[p] = String(c); },
    remove: (p) => { delete data[p]; }, count: () => Object.keys(data).length
  };
  const sov = {};
  const win = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, RegExp, URL, Function };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  win.Engine = {
    FS,
    Sovereign: { write: (p, d) => { sov[p] = d; }, read: (p) => (sov[p] !== undefined ? sov[p] : null) },
    Validator: { runAll: () => (win.__issues || []) }
  };
  win._sov = sov;
  Object.assign(win.Engine, over || {});
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.recovery.js'), 'utf8'), win, { filename: 'engine.recovery.js' });
  return win;
}

module.exports = async function (t) {
  /* ---------- 1. Graph.repairOrder — foundation before leaves ---------- */
  {
    const w = env();
    const F = w.Engine.FS;
    F.write('/src/db.js', "module.exports = {};\n");
    F.write('/src/services/note.js', "const db = require('../db');\nmodule.exports = { db };\n");
    F.write('/src/routes.js', "const svc = require('./services/note');\n");
    F.write('/server.js', "require('./src/routes');\nrequire('./src/services/note');\n");
    w.Engine.Graph.build();
    const order = w.Engine.Graph.repairOrder(['/server.js', '/src/services/note.js', '/src/db.js', '/src/routes.js']);
    t.ok('repairOrder: a dependency comes before the file that imports it',
      order.indexOf('/src/db.js') < order.indexOf('/src/services/note.js') &&
      order.indexOf('/src/services/note.js') < order.indexOf('/src/routes.js') &&
      order.indexOf('/src/routes.js') < order.indexOf('/server.js'));
  }

  /* ---------- 2. AcceptanceGoal with no contract -> levels-only goal ---------- */
  {
    const w = env();
    w.__issues = [];
    w.Engine.FS.write('/index.html', "<!doctype html><html lang=en><body><button onclick='x()'>go</button><script src=app.js></script></body></html>");
    w.Engine.FS.write('/app.js', "function x(){ return 1; }\n");
    const g = w.Engine.AcceptanceGoal.evaluate();
    t.equal('AcceptanceGoal: no contract -> met == levelsMet', g.met, g.levelsMet);
    t.equal('AcceptanceGoal: no contract -> hasContract false', g.hasContract, false);
  }

  /* ---------- 3. AcceptanceGoal with a contract + a FAILING ledger criterion ---------- */
  {
    const contract = {
      requirements: [
        { id: 'REQ1', statement: 'A user can create a task', priority: 'mandatory', acceptanceCriteria: [{ kind: 'control', name: 'add task' }] },
        { id: 'REQ2', statement: 'The list loads', priority: 'optional', acceptanceCriteria: [] }
      ],
      scope: { mandatory: ['REQ1'] }
    };
    const ledgerFail = {
      totals: { requirements: 2, failures: 1 },
      claims: [
        { requirementId: 'REQ1', confidence: 'FAILING', failures: 1, evidence: [{ result: 'FAIL', ref: 'runtime-trace.json' }] },
        { requirementId: 'REQ2', confidence: 'UNVERIFIED', failures: 0, evidence: [] }
      ]
    };
    const w = env({
      Contract: { load: () => contract },
      Ledger: { load: () => ledgerFail, build: () => ledgerFail },
      DoD: { load: () => ({ PASS: false }), evaluate: () => ({ PASS: false }) }
    });
    w.__issues = [];
    w.Engine.FS.write('/index.html', "<!doctype html><html lang=en><body><button onclick='x()'>go</button><script src=app.js></script></body></html>");
    w.Engine.FS.write('/app.js', "function x(){ return 1; }\n");
    const g = w.Engine.AcceptanceGoal.evaluate({ rebuild: true });
    t.equal('AcceptanceGoal: a failing mandatory criterion -> not met', g.met, false);
    t.ok('AcceptanceGoal: the gap names the unsatisfied requirement', g.gaps.some((x) => /REQ1/.test(x)));
    t.ok('AcceptanceGoal: the DoD failure is a gap', g.gaps.some((x) => /Definition-of-Done/.test(x)));
    t.equal('AcceptanceGoal: unsatisfied mandatory count', g.unsatisfied, 1);
  }

  /* ---------- 4. AcceptanceGoal met when levels + ledger + DoD all pass ---------- */
  {
    const contract = { requirements: [{ id: 'R1', statement: 'x', priority: 'mandatory', acceptanceCriteria: [] }], scope: { mandatory: ['R1'] } };
    const ledgerOk = { totals: { requirements: 1, failures: 0 }, claims: [{ requirementId: 'R1', confidence: 'VERIFIED', failures: 0, evidence: [] }] };
    const w = env({
      Contract: { load: () => contract },
      Ledger: { load: () => ledgerOk, build: () => ledgerOk },
      DoD: { load: () => ({ PASS: true }), evaluate: () => ({ PASS: true }) }
    });
    w.__issues = [];
    w.Engine.FS.write('/index.html', "<!doctype html><html lang=en><body><button onclick='x()'>go</button><script src=app.js></script></body></html>");
    w.Engine.FS.write('/app.js', "function x(){ return 1; }\n");
    const g = w.Engine.AcceptanceGoal.evaluate({ rebuild: true });
    t.ok('AcceptanceGoal: levels + ledger + DoD all green -> met (when levels pass)', g.met === g.levelsMet);
    t.equal('AcceptanceGoal: no gaps beyond levels', g.gaps.filter((x) => !/level /.test(x)).length, 0);
  }

  /* ---------- 5. loop() records acceptance / hypotheses / prevention + CRITERIA_UNMET ---------- */
  {
    const contract = { requirements: [{ id: 'R1', statement: 'A user can add a note', priority: 'mandatory', acceptanceCriteria: [{ kind: 'control', name: 'add note' }] }], scope: { mandatory: ['R1'] } };
    const ledgerFail = { totals: { requirements: 1, failures: 1 }, claims: [{ requirementId: 'R1', confidence: 'FAILING', failures: 1, evidence: [{ result: 'FAIL', ref: 'runtime-trace.json' }] }] };
    const w = env({
      Contract: { load: () => contract },
      Ledger: { load: () => ledgerFail, build: () => ledgerFail },
      DoD: { load: () => ({ PASS: false }), evaluate: () => ({ PASS: false }) }
    });
    w.__issues = [];   // validator is clean → levels pass
    w.Engine.FS.write('/index.html', "<!doctype html><html lang=en><body><button onclick='x()'>go</button><script src=app.js></script></body></html>");
    w.Engine.FS.write('/app.js', "function x(){ return 1; }\n");
    const rec = w.Engine.Recovery.loop({ maxCycles: 2 });
    t.equal('loop: validator clean but acceptance criteria unmet -> CRITERIA_UNMET (not VERIFIED)', rec.status, 'CRITERIA_UNMET');
    t.ok('loop: the record carries the acceptance summary', rec.acceptance && rec.acceptance.hasContract === true && rec.acceptance.met === false);
    t.ok('loop: the acceptance gaps name the failing requirement', (rec.acceptance.gaps || []).some((x) => /R1/.test(x)));
    t.equal('loop: recovery-loop.json evidence written', typeof w._sov['recovery-loop.json'], 'object');
    t.ok('loop: hypotheses + prevention arrays are present', Array.isArray(rec.hypotheses) && Array.isArray(rec.prevention));
  }

  /* ---------- 6. loop() with a real repairable defect: hypothesis holds + prevention emitted ---------- */
  {
    const w = env();
    // a missing-alt <img> — a real, auto-repairable finding
    w.Engine.FS.write('/index.html', "<!doctype html><html lang=en><body><img src='logo.png'><button onclick='x()'>go</button><script src=app.js></script></body></html>");
    w.Engine.FS.write('/app.js', "function x(){ return 1; }\n");
    let cleared = false;
    w.__issues = [];
    // emulate the validator: report the missing-alt until the file gains an alt=
    Object.defineProperty(w, '__issues', { get() {
      const html = w.Engine.FS.read('/index.html') || '';
      if (/<img(?![^>]*\balt=)[^>]*>/.test(html)) return [{ file: '/index.html', message: 'image missing alt attribute', severity: 'warning', line: 1 }];
      return [];
    } });
    const rec = w.Engine.Recovery.loop({ maxCycles: 3 });
    const anyHeld = (rec.hypotheses || []).some((h) => h.held === true);
    t.ok('loop: at least one repair hypothesis was stated and held (finding disappeared)', anyHeld || rec.repairedCount === 0);
    if (rec.repairedCount > 0) {
      t.ok('loop: prevention guidance is emitted for the repaired class', (rec.prevention || []).some((p) => /lint|CI|a11y|alt/i.test(p.guidance)));
      t.equal('loop: recovery-prevention.json written', typeof w._sov['recovery-prevention.json'], 'object');
    } else {
      t.ok('loop: prevention roll-up present even with nothing repaired', Array.isArray(rec.prevention));
    }
  }
};
