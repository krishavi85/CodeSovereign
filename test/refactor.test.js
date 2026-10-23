'use strict';
/* engine.refactor.js (§60) + engine.upgrade.js (§62) — AST-safe rename,
 * conservative refusal, TS readiness, rules-driven dependency upgrades. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeWin(files) {
  const win = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {} };
  win.window = win;
  win.addEventListener = () => {};
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  Object.keys(files || {}).forEach((p) => { data[p] = { type: 'file', content: String(files[p]) }; });
  win.Engine = {
    FS: {
      _data: data, isFile: (p) => !!data[p] && data[p].type === 'file', exists: (p) => p in data,
      read: (p) => (data[p] ? data[p].content : null),
      write: (p, c) => { data[p] = { type: 'file', content: String(c) }; },
      remove: (p) => { Object.keys(data).forEach((k) => { if (k === p || k.startsWith(p + '/')) delete data[k]; }); }
    },
    Sovereign: {
      read: (p) => (sov[p] != null ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null),
      write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }, list: () => Object.keys(sov)
    }
  };
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'vendor', 'acorn.js'), 'utf8'), win, { filename: 'acorn.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.refactor.js'), 'utf8'), win, { filename: 'engine.refactor.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.upgrade.js'), 'utf8'), win, { filename: 'engine.upgrade.js' });
  return win;
}

module.exports = async function (t) {
  /* ---------- §60: renameSymbol — the happy path ---------- */
  {
    const win = makeWin({
      '/src/util.js': "const timeoutMs = 5000;\nfunction wait() { return timeoutMs * 2; }\nmodule.exports = { wait, timeoutMs };\n"
    });
    t.ok('refactor: acorn is available in the context', !!win.acorn && typeof win.acorn.parse === 'function');
    const r = win.Engine.Refactor.renameSymbol({ file: '/src/util.js', from: 'timeoutMs', to: 'timeoutMillis' });
    t.ok('rename: reports a change', r.changed === true && r.edits >= 3);
    const out = win.Engine.FS.read('/src/util.js');
    t.ok('rename: the declaration + every reference is renamed', /const timeoutMillis = 5000/.test(out) && /return timeoutMillis \* 2/.test(out));
    t.ok('rename: object shorthand becomes explicit to keep the export name', /timeoutMs: timeoutMillis/.test(out));
    t.ok('rename: result still parses', !!win.acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'module' }));
  }

  /* ---------- §60: renameSymbol refuses when it is not provably safe ---------- */
  {
    const win = makeWin({
      '/src/shadow.js': "const x = 1;\nfunction f() { const x = 2; return x; }\nmodule.exports = { f, x };\n"
    });
    const r = win.Engine.Refactor.renameSymbol({ file: '/src/shadow.js', from: 'x', to: 'y', apply: false });
    t.equal('rename: refuses a shadowed symbol', r.changed, false);
    t.equal('rename: reason is machine-readable', r.reason, 'SHADOWED_OR_MULTIPLE_DECLARATIONS');
    t.equal('rename: refuses a name that is not present', win.Engine.Refactor.renameSymbol({ file: '/src/shadow.js', from: 'nope', to: 'q', apply: false }).reason, 'SYMBOL_NOT_FOUND');
    t.equal('rename: refuses an invalid target identifier', win.Engine.Refactor.renameSymbol({ file: '/src/shadow.js', from: 'x', to: '1bad', apply: false }).reason, 'INVALID_TARGET_NAME');
  }

  /* ---------- §60: renameExport rewrites importers (ESM) ---------- */
  {
    const win = makeWin({
      '/src/math.js': "export function addNums(a, b) { return a + b; }\n",
      '/src/app.js': "import { addNums } from './math.js';\nconsole.log(addNums(1, 2));\n",
      '/src/other.js': "import { addNums as plus } from './math';\nexport const z = plus(3, 4);\n"
    });
    const r = win.Engine.Refactor.renameExport({ from: 'addNums', to: 'sum' });
    t.ok('renameExport: succeeds across files', r.changed === true && r.files.length === 3);
    t.ok('renameExport: definition renamed', /export function sum\(/.test(win.Engine.FS.read('/src/math.js')));
    t.ok('renameExport: plain importer keeps working via an alias', /import \{ sum as addNums \} from '\.\/math\.js'/.test(win.Engine.FS.read('/src/app.js')));
    t.ok('renameExport: aliased importer is rewritten in place', /import \{ sum as plus \} from '\.\/math'/.test(win.Engine.FS.read('/src/other.js')));
  }

  /* ---------- §60: TS readiness ---------- */
  {
    const win = makeWin({
      '/server.js': "const http = require('http');\nmodule.exports = { x: 1 };\n",
      '/src/api.js': "import x from './x.js';\nexport const y = x;\n",
      '/src/weird.js': "with (Math) { console.log(PI); }\n"
    });
    const ts = win.Engine.Refactor.tsReadiness();
    t.ok('tsReadiness: counts CJS + ESM files', ts.files === 3 && ts.cjs >= 1 && ts.esm >= 1);
    t.ok('tsReadiness: flags a with() blocker + is not ready', ts.blockers.some((b) => /with/.test(b.why)) && ts.ready === false);
    t.ok('tsReadiness: has a staged plan', ts.stagedPlan.length === 4);
    const wrote = win.Engine.Refactor.scaffoldTs();
    t.ok('scaffoldTs: writes tsconfig.json + a migration checklist', wrote.includes('/tsconfig.json') && /allowJs/.test(win.Engine.FS.read('/tsconfig.json')) && /- \[ \]/.test(win.Engine.FS.read('/docs/TS_MIGRATION.md')));
  }

  /* ---------- §62: upgrade plan + apply ---------- */
  {
    const win = makeWin({
      '/package.json': JSON.stringify({ name: 'x', dependencies: { express: '^4.18.2', 'node-fetch': '^2.6.0', chalk: '^4.1.2', lodash: '^4.17.21' } }, null, 2),
      '/server.js': "const express = require('express');\nconst fetch = require('node-fetch');\nconst app = express();\napp.del('/x', (req, res) => res.end(req.param('id')));\n"
    });
    const p = win.Engine.Upgrade.plan();
    t.ok('upgrade: plan finds express@4->5, node-fetch@2->3, chalk@4->5', p.upgrades.length === 3 && p.upgrades.some((u) => u.name === 'express' && u.targetMajor === 5));
    t.ok('upgrade: lodash (no rule, no advisory) is left alone', !p.upgrades.some((u) => u.name === 'lodash'));
    t.ok('upgrade: risk ordering — low/security before medium/high', p.upgrades[0].risk === 'low' || p.upgrades[0].risk === 'security');

    const ap = win.Engine.Upgrade.apply('express', { dryRun: true });
    t.ok('upgrade(dry-run): would bump package.json + codemod server.js', ap.applied === false && ap.dryRun === true && ap.fileEdits.some((e) => e.path === '/package.json') && ap.fileEdits.some((e) => e.path === '/server.js'));
    t.equal('upgrade(dry-run): does not touch the files', win.Engine.FS.read('/package.json').includes('"express": "^4.18.2"'), true);

    const done = win.Engine.Upgrade.apply('express');
    t.ok('upgrade: bumps express to ^5.0.0', /"express": "\^5\.0\.0"/.test(win.Engine.FS.read('/package.json')));
    t.ok('upgrade: codemod fixes app.del -> app.delete', /app\.delete\('\/x'/.test(win.Engine.FS.read('/server.js')) && !/app\.del\(/.test(win.Engine.FS.read('/server.js')));

    win.Engine.Upgrade.analyze();
    const rep = JSON.parse(win.Engine.Sovereign.read('upgrade-plan.json') ? JSON.stringify(win.Engine.Sovereign.read('upgrade-plan.json')) : '{}');
    t.ok('upgrade: analyze() persists the plan', rep && Array.isArray(rep.upgrades));
  }
};
