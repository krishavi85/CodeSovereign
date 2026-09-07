'use strict';
/* engine.mockscan.js — full simulation-signal scanner + intent inference. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.mockscan.js'), 'utf8');

  const files = {
    '/src/Button.jsx': 'export const B = () => <button onClick={() => {}}>Save</button>;',
    '/src/api.js': [
      'export async function load() { setTimeout(() => { return { ok: true }; }, 500); }',
      'const sampleData = [{ id: 1 }, { id: 2 }];',
      '// TODO: connect real persistence',
      'const adminToken = "hardcoded-admin-token";'
    ].join('\n'),
    '/src/Repo.js': 'class UserRepository { findAll() { return []; } }',
    '/src/clean.js': 'export function add(a, b) { return a + b; }',
    '/README.md': 'setTimeout(() => {}, 500) // should be ignored, not a code file for some rules'
  };
  const FS = {
    _data: Object.keys(files).reduce((m, k) => (m[k] = { type: 'file', content: files[k] }, m), {}),
    read: (p) => (files[p] == null ? null : files[p]),
    isFile: (p) => p in files
  };
  const win = { console };
  win.window = win;
  win.Engine = { FS };
  const ctx = vm.createContext(win);
  vm.runInContext(src, ctx, { filename: 'engine.mockscan.js' });

  const MS = win.Engine.MockScan;
  t.ok('Engine.MockScan exposed', MS && typeof MS.run === 'function');

  const r = MS.run();
  const kinds = new Set(r.signals.map((s) => s.kind));
  t.ok('finds empty-handler', kinds.has('empty-handler'));
  t.ok('finds fake-async', kinds.has('fake-async'));
  t.ok('finds mock-data', kinds.has('mock-data'));
  t.ok('finds todo-marker', kinds.has('todo-marker'));
  t.ok('finds hardcoded-auth', kinds.has('hardcoded-auth'));
  t.ok('finds stub-service', kinds.has('stub-service'));
  t.ok('clean file yields no signals', !r.signals.some((s) => s.file === '/src/clean.js'));
  t.ok('every signal has file+line+why', r.signals.every((s) => s.file && s.line > 0 && s.why));

  // intent inference
  t.equal('search -> filter intent', MS.inferIntent({ name: 'Search customers' }).confidence, 'high');
  t.ok('delete -> guarded delete', /confirmation/i.test(MS.inferIntent({ name: 'Delete account' }).expected));
  t.equal('unknown label -> low confidence', MS.inferIntent({ name: 'Frobnicate' }).confidence, 'low');
  t.equal('no label -> low confidence', MS.inferIntent({}).confidence, 'low');

  // status classification
  t.equal('observed BROKEN -> BROKEN', MS.classify({}, { observed: 'BROKEN' }), 'BROKEN');
  t.equal('observed REAL + no error handling -> PARTIAL', MS.classify({}, { observed: 'REAL', source: 'doThing()' }), 'PARTIAL');
  t.equal('observed REAL + try/catch -> REAL', MS.classify({}, { observed: 'REAL', source: 'try { await x() } catch(e){}' }), 'REAL');
  t.equal('observed MOCK -> MOCK', MS.classify({}, { observed: 'MOCK' }), 'MOCK');
  t.equal('hidden -> UNREACHABLE', MS.classify({}, { observed: 'HIDDEN' }), 'UNREACHABLE');
  t.equal('unobserved dead link -> MOCK', MS.classify({ status: 'MOCK', note: 'dead link (#)' }, {}), 'MOCK');
  t.equal('unobserved with handler -> PARTIAL', MS.classify({ hasHandler: true }, {}), 'PARTIAL');
  t.equal('unobserved nothing -> UNKNOWN', MS.classify({}, {}), 'UNKNOWN');
};
