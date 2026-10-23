'use strict';
/* §51 Engine.Quality — configurable code-quality governance (opt-in gate).
 * §54 Engine.Audit  — evidence-backed per-dimension completion %.
 * Both run FOR REAL against a generated project's evidence store. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function env() {
  const data = {}, sov = {};
  const FS = {
    _data: data,
    isFile: (p) => typeof data[p] === 'string',
    exists: (p) => typeof data[p] === 'string',
    read: (p) => (data[p] != null ? data[p] : null),
    write: (p, c) => { data[p] = String(c); }, remove: (p) => { delete data[p]; }, count: () => Object.keys(data).length
  };
  const win = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, RegExp, URL, Function };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  win.Engine = {
    FS,
    Sovereign: { write: (p, d) => { sov[p] = d; }, read: (p) => (sov[p] !== undefined ? sov[p] : null) },
    Validator: { runAll: () => [] }
  };
  win._sov = sov;
  vm.createContext(win);
  // recovery gives us GraphValidate (used by Quality for circular/dead code)
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.recovery.js'), 'utf8'), win, { filename: 'engine.recovery.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.quality.js'), 'utf8'), win, { filename: 'engine.quality.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.audit.js'), 'utf8'), win, { filename: 'engine.audit.js' });
  return win;
}

module.exports = async function (t) {
  /* ---------- §51 Quality ---------- */
  {
    const w = env();
    const F = w.Engine.FS;
    // a clean small module + one that blows the budget
    F.write('/src/ok.js', "'use strict';\nfunction add(a, b) { return a + b; }\nmodule.exports = { add };\n");
    const huge = "function monster(a, b, c, d, e, f, g) {\n" +
      Array.from({ length: 90 }, (_, i) => "  if (a > " + i + ") { b += " + i + "; } else if (c < " + i + ") { d -= " + i + "; }").join('\n') +
      "\n  return a && b && c || d;\n}\nmodule.exports = { monster };\n";
    F.write('/src/monster.js', huge);

    const r = w.Engine.Quality.scan();
    t.ok('quality: the oversized/over-complex/too-many-params function is flagged',
      r.findings.some((x) => x.rule === 'function-too-long' && x.fn === 'monster') &&
      r.findings.some((x) => x.rule === 'complexity' && x.fn === 'monster') &&
      r.findings.some((x) => x.rule === 'too-many-params' && x.fn === 'monster'));
    t.ok('quality: the clean module produces no findings', !r.findings.some((x) => x.file === '/src/ok.js'));
    t.equal('quality: evidence file written', typeof w._sov['quality-findings.json'], 'object');
    t.equal('quality: informational by default (gate off)', w.Engine.Quality.gateActive(), false);

    // a console.log + a bare TODO
    F.write('/src/noisy.js', "function x() {\n  console.log('debug');\n  // TODO: fix later\n  return 1;\n}\n");
    const r2 = w.Engine.Quality.scan();
    t.ok('quality: console.log flagged', r2.findings.some((x) => x.rule === 'no-console' && x.file === '/src/noisy.js'));
    t.ok('quality: bare TODO flagged', r2.findings.some((x) => x.rule === 'no-todo' && x.file === '/src/noisy.js'));

    // turning the gate on via policy
    w.Engine.Sovereign.write('quality-policy.json', { gate: true, maxFunctionLines: 40 });
    t.equal('quality: policy "gate": true activates the gate', w.Engine.Quality.gateActive(), true);
    const r3 = w.Engine.Quality.scan();
    t.equal('quality: with the gate on, the over-budget scan fails', r3.pass, false);

    // console.warn / console.error are always allowed
    F.write('/src/logger.js', "function log(e) { console.error(e); console.warn(e); }\n");
    const r4 = w.Engine.Quality.scan();
    t.ok('quality: console.warn / console.error are not flagged', !r4.findings.some((x) => x.file === '/src/logger.js' && x.rule === 'no-console'));
  }

  /* ---------- §54 Audit ---------- */
  {
    const w = env();
    // seed a realistic evidence store
    w.Engine.Sovereign.write('evidence-ledger.json', { totals: { requirements: 10, verified: 8, partial: 1, unverified: 1, failures: 1 } });
    w.Engine.Sovereign.write('execution-evidence.json', { gates: { buildPasses: true, testsPass: true }, test: { pass: 42, fail: 0 } });
    w.Engine.Sovereign.write('runtime-trace.json', { trace: [{ status: 'REAL' }, { status: 'REAL' }, { status: 'MOCK' }, { status: 'REAL' }] });
    w.Engine.Sovereign.write('security-findings.json', { score: 92 });
    w.Engine.Sovereign.write('a11y-findings.json', { score: 78 });
    w.Engine.Sovereign.write('quality-findings.json', { pass: true, findings: [] });
    w.Engine.FS.write('/README.md', '# app\n');
    w.Engine.FS.write('/docs/DECISIONS.md', '# ADRs\n');
    w.Engine.FS.write('/delivery/manifest.json', JSON.stringify({ files: [{ path: 'a' }, { path: 'b' }] }));
    w.Engine.Sovereign.write('delivery/manifest.json', { files: [{ path: 'a' }, { path: 'b' }] });

    const a = w.Engine.Audit.run();
    t.ok('audit: an overall % is produced from the evidence', typeof a.overall === 'number' && a.overall > 0 && a.overall <= 100);
    t.ok('audit: every dimension has a basis string', a.dimensions.every((d) => typeof d.basis === 'string' && d.basis.length > 3));
    const req = a.dimensions.find((d) => d.name === 'Requirements');
    t.ok('audit: Requirements % reflects the ledger (8 verified + 0.5*1 of 10 = 85%)', req.measured && req.pct === 85);
    const rt = a.dimensions.find((d) => d.name === 'Runtime');
    t.ok('audit: Runtime % nets out fakes ((3 REAL - 1 MOCK)/4 = 50%)', rt.measured && rt.pct === 50);
    const sec = a.dimensions.find((d) => d.name === 'Security');
    t.equal('audit: Security % is the scan score', sec.pct, 92);
    t.equal('audit: evidence file + markdown written', typeof w._sov['completion-audit.json'], 'object');
    t.match('audit: the markdown is a table', w._sov['completion-audit.md'], /\| Dimension \| % \|/);

    // a dimension with no evidence is "unmeasured", never silently 100%
    const w2 = env();
    w2.Engine.Sovereign.write('evidence-ledger.json', { totals: { requirements: 2, verified: 2 } });
    const a2 = w2.Engine.Audit.run();
    t.ok('audit: dimensions with no evidence are reported unmeasured', a2.unmeasured.length >= 3 && a2.unmeasured.indexOf('Runtime') >= 0);
    t.ok('audit: overall is scaled by evidence coverage', a2.evidenceCoverage < 100);
  }
};
