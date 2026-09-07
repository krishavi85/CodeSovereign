'use strict';
/* engine.sovereign.js — diagram + fingerprint helpers, run in a window shim. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.sovereign.js'), 'utf8');

  const files = {
    '/package.json': JSON.stringify({ dependencies: { stripe: '^14', '@supabase/supabase-js': '^2', react: '^18' } }),
    '/src/server.js': 'fetch("https://api.github.com/x"); fetch("http://localhost:3000/y");',
    '/src/ui.js': 'export const X = 1;'
  };
  const FS = {
    _data: Object.keys(files).reduce((m, k) => (m[k] = { type: 'file', content: files[k] }, m), {}),
    read: (p) => (files[p] == null ? null : files[p]),
    isFile: (p) => p in files,
    exists: (p) => p in files,
    write: () => {},
    count: () => Object.keys(files).length,
    totalSize: () => 0
  };

  const win = {};
  win.window = win;
  win.console = console;
  win.Engine = {
    FS,
    Proj: { current: () => ({ name: 'Demo App' }) },
    Validator: { runAll: () => [] }
  };
  win.Graph = {
    build: () => ({ fileCount: 2 }),
    files: ['/src/server.js', '/src/ui.js'],
    imports: { '/src/server.js': ['/src/ui.js'], '/src/ui.js': [] },
    exports: { '/src/server.js': [], '/src/ui.js': ['X'] },
    routes: [{ file: '/src/server.js', method: 'GET', path: '/users' }],
    services: [{ file: '/src/server.js', name: 'UserService' }],
    database: [{ file: '/src/server.js', table: 'users' }],
    references: {}
  };
  const ctx = vm.createContext(win);
  vm.runInContext(src, ctx, { filename: 'engine.sovereign.js' });

  const S = win.Engine.Sovereign;
  t.ok('Engine.Sovereign exposed', S && typeof S.analyze === 'function');

  // externals from deps + non-localhost URLs
  const ext = S.detectExternals();
  t.ok('detects Stripe from deps', ext.includes('Stripe (payments)'));
  t.ok('detects Supabase from deps', ext.includes('Supabase'));
  t.ok('detects api.github.com from source', ext.includes('api.github.com'));
  t.ok('ignores localhost URLs', !ext.some((e) => /localhost/.test(e)));

  // fingerprint is stable + order-independent
  const a = S.graphFingerprint([{ from: 'a', to: 'b', status: 'CONNECTED' }, { from: 'b', to: 'c', status: 'BROKEN' }]);
  const b = S.graphFingerprint([{ from: 'b', to: 'c', status: 'BROKEN' }, { from: 'a', to: 'b', status: 'CONNECTED' }]);
  t.equal('fingerprint is order-independent', a, b);
  const c = S.graphFingerprint([{ from: 'a', to: 'b', status: 'CONNECTED' }]);
  t.ok('fingerprint changes with the graph', a !== c);

  // component diagram = valid-looking mermaid with layer subgraphs
  const comp = S.componentInventory();
  const mmd = S.DIAGRAMS.component({ edges: [{ from: '/src/server.js', to: '/src/ui.js', status: 'CONNECTED' }] }, comp);
  t.ok('component diagram starts with graph', /^graph (LR|TD)/.test(mmd));
  t.ok('component diagram has a subgraph', /subgraph/.test(mmd) && /\bend\b/.test(mmd));
  t.ok('component diagram has the edge', /n_[^\s]+ --> n_/.test(mmd));

  const df = S.DIAGRAMS.dataflow({});
  t.ok('dataflow diagram references the route + service', /GET \/users/.test(df) && /UserService/.test(df));

  const sc = S.DIAGRAMS.systemContext();
  t.ok('system-context has user + app + an external', /user\(\[User\]\)/.test(sc) && /Demo App/.test(sc) && /Stripe/.test(sc));
};
