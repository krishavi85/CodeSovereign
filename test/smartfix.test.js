'use strict';
/* Mock detector, V3 fault injection, unresolved inspector, preview snapshots. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const store = {};
  const win = {
    console,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    addEventListener: () => {},
    document: {
      createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }),
      body: { appendChild() {} },
      readyState: 'complete',
      addEventListener: () => {}
    },
    Event: function Event() {},
    DOMParser: class {
      parseFromString() {
        return { querySelector: () => ({ textContent: 'Hello', click() {}, value: '', dispatchEvent() {} }) };
      }
    },
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine-extras.js');
  run('engine.recovery.js');
  run('engine.recovery.v4.js');
  run('engine.mockscan.js');
  run('engine.llm.js');
  return { win, store };
}

module.exports = async function (t) {
  const { win } = load();
  const E = win.Engine;
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  const llmSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');

  t.ok('Preview.inspect is exported', typeof E.Preview.inspect === 'function');
  t.ok('Preview.capture is exported', typeof E.Preview.capture === 'function');
  t.ok('LLM.smartLoop is exported', typeof E.LLM.smartLoop === 'function');
  t.ok('agent refine prompt includes live preview snapshot', /Live preview snapshot of the built app/.test(llmSrc));
  t.ok('agent loop records a screenshot step', /kind:\s*"screenshot"/.test(llmSrc));
  t.ok('Recovery UI no longer triages canned P1 rows', !/message:\s*"DB connection refused"/.test(appSrc));

  E.FS.write('/index.html', '<!doctype html><html><head><title>Notes</title></head><body><h1>Notes</h1><img src="cover.png"><button>Save</button></body></html>');
  const vis = E.Preview.inspect();
  t.ok('preview inspect flags missing alt', vis.missingAltCount >= 1);
  t.ok('preview inspect sees the title', vis.title === 'Notes');
  const cap = E.Preview.capture();
  t.ok('capture stores an svg data URL', /^data:image\/svg\+xml/.test(cap.dataUrl || ''));
  t.ok('formatCapture mentions visible UI problems', /missing alt/i.test(E.LLM.formatCapture(cap)));

  const UI = E.UnresolvedInspector;
  ['db.connect', 'rt.timeout', 'sec.secret', 'html.alt'].forEach((id) => {
    const r = UI.inspect({ message: id, faultClass: id });
    t.ok(id + ' can auto-fix', r.canAutoFix === true);
    t.ok(id + ' workaround is real', r.workaround && r.workaround !== 'no auto-workaround available');
  });

  E.FS.write('/scripts/leak.js', 'const secret = "hunter2hunter2";\nconst timeout = 5000;\nnew Pool({});\n// TODO: wire API\n');
  const before = UI.collect();
  t.ok('collector finds planted secret/timeout/db/todo/alt', before.length >= 4);
  const fixed = UI.autoFixAll();
  t.ok('autoFixAll patches files', fixed.patched.length >= 1);
  const leak = E.FS.read('/scripts/leak.js') || '';
  t.ok('secret literal removed', !/hunter2hunter2/.test(leak));
  t.ok('timeout increased', /30000/.test(leak));
  t.ok('db retry helper added', /withDbRetry/.test(leak));
  t.ok('html alt patched', /alt=/i.test(E.FS.read('/index.html') || ''));

  E.FS.write('/scripts/mocky.js', 'export const B = () => <button onClick={() => {}}>Save</button>;\nconst sampleData = [{ id: 1 }];\n// TODO: connect real persistence\nconst adminToken = "hardcoded-admin-token";\n');
  const mocksBefore = E.MockDetect.run();
  t.ok('mock detector sees placeholders', mocksBefore.length >= 2);
  const mockFix = E.MockDetect.fix();
  t.ok('mock detector patches at least one file', mockFix.patched.length >= 1);
  const mocky = E.FS.read('/scripts/mocky.js') || '';
  t.ok('TODO marker stripped or rewritten', !/\bTODO\b/.test(mocky));
  t.ok('hardcoded token moved to env', /process\.env/.test(mocky) || !/hardcoded-admin-token/.test(mocky));

  Object.keys(E.FS._data).forEach((p) => { if (E.FS.isFile(p)) E.FS.remove(p); });
  E.FS.write('/index.html', '<!doctype html><html lang="en"><body></body></html>');
  E.FS.write('/scripts/app.js', 'export const n = 1;\n');
  E.FS.write('/styles/main.css', 'body{color:#fff}');
  const bench = E.FaultInjector.runBenchmark();
  t.ok('benchmark injected all classes', bench.injected === Object.keys(E.FaultInjector.FAULTS).length);
  t.equal('benchmark detected all injected faults', bench.detected, bench.injected);
  t.equal('benchmark repaired all injected faults', bench.repaired, bench.injected);
  t.ok('workspace restored after benchmark', /lang="en"/.test(E.FS.read('/index.html') || ''));
  t.ok('lastBenchmark stored', !!(E.FaultInjector.lastBenchmark() && E.FaultInjector.lastBenchmark().injected));

  const loop = await E.LLM.smartLoop({ kind: 'unresolved', llm: false });
  t.ok('smartLoop records inspect/plan/patch/screenshot/score', ['inspect', 'plan', 'patch', 'screenshot', 'score'].every((k) => (loop.steps || []).some((s) => s.kind === k)));
  t.ok('smartLoop skipped LLM when disabled', loop.llm && loop.llm.skipped);
};
