'use strict';
/* §59 — Engine.Graph.blastRadius(): a user-facing change-impact report.
 * Builds a small realistic project graph and asserts the report classifies
 * the ripple correctly (files / tests / migrations / routes + rebuild/redeploy/risk). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function env() {
  const data = {};
  const FS = {
    _data: data,
    isFile: (p) => !!data[p], exists: (p) => !!data[p],
    read: (p) => (data[p] != null ? data[p] : null),
    write: (p, c) => { data[p] = String(c); },
    remove: (p) => { delete data[p]; }, count: () => Object.keys(data).length
  };
  const sov = {};
  const win = {
    console: { info() {}, warn() {}, error() {}, log() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, RegExp, URL,
  };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  win.Engine = { FS, Sovereign: { write: (p, d) => { sov[p] = d; }, read: (p) => sov[p] || null } };
  win._sov = sov;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.recovery.js'), 'utf8'), win, { filename: 'engine.recovery.js' });
  return win;
}

module.exports = async function (t) {
  const win = env();
  const G = win.Engine.Graph;
  t.ok('Engine.Graph.blastRadius is exposed', G && typeof G.blastRadius === 'function');

  const F = win.Engine.FS;
  F.write('/src/db.js', "module.exports = { get(){}, list(){}, create(){} };\n");
  F.write('/src/services/note.js', "const db = require('../db');\nmodule.exports = { list(){ return db.list('note'); } };\n");
  F.write('/src/routes/note.js', "const svc = require('../services/note');\napp.get('/api/notes', (req,res)=>res.json(svc.list()));\napp.post('/api/notes', (req,res)=>{});\n");
  F.write('/server.js', "const noteRoutes = require('./src/routes/note');\nrequire('./src/services/note');\n");
  F.write('/test/note.test.js', "const svc = require('../src/services/note');\ntest('note', () => {});\n");
  F.write('/test/server.test.js', "require('../server');\ntest('boot', () => {});\n");
  F.write('/db/migrations/001_init.sql', "CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT);\n");
  F.write('/package.json', '{"name":"x","scripts":{"test":"node --test"}}');
  F.write('/Dockerfile', "FROM node:20\n");
  F.write('/docs/API.md', "# API\n");

  G.build();

  // 1. changing a leaf service ripples up to its route, the server, and both tests
  const r = G.blastRadius('/src/services/note.js');
  t.ok('blastRadius: transitively reaches the route + server that use the service',
    r.affected.indexOf('/src/routes/note.js') >= 0 && r.affected.indexOf('/server.js') >= 0);
  t.ok('blastRadius: the impacted test files are separated out',
    r.buckets.tests.indexOf('/test/note.test.js') >= 0 && r.buckets.tests.indexOf('/test/server.test.js') >= 0 && r.buckets.tests.length === 2);
  t.ok('blastRadius: source files exclude tests/config/docs',
    r.buckets.sourceFiles.every((p) => !/\.test\.|\/test\/|package\.json|\.md$/.test(p)));
  t.ok('blastRadius: routes served by an affected file are listed',
    r.routesTouched.indexOf('GET /api/notes') >= 0 && r.routesTouched.indexOf('POST /api/notes') >= 0);
  t.ok('blastRadius: a plain-English summary is produced', /touches \d+ files? \(\d+ tests?/.test(r.summary));
  t.equal('blastRadius: writes the evidence artifact', typeof win._sov['blast-radius.json'], 'object');

  // 2. a schema change forces a migration + raises the risk
  const rm = G.blastRadius('/db/migrations/001_init.sql');
  t.ok('blastRadius: a .sql change is flagged as needing a migration', rm.needsMigration === true);
  t.ok('blastRadius: a migration change is at least medium risk', rm.risk === 'high' || rm.risk === 'medium');
  t.match('blastRadius: the summary calls out the migration', rm.summary, /migration must run/i);

  // 3. a package.json / Dockerfile change forces a rebuild + redeploy
  const rc = G.blastRadius(['/package.json', '/Dockerfile']);
  t.ok('blastRadius: a package.json / Dockerfile change needs a rebuild + redeploy', rc.needsRebuild === true && rc.needsRedeploy === true);

  // 4. a docs-only change is low risk and touches nothing downstream
  const rd = G.blastRadius('/docs/API.md');
  t.ok('blastRadius: a docs-only change is low risk with no rebuild', rd.risk === 'low' && rd.needsRebuild === false && rd.needsMigration === false);
};
