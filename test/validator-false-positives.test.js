'use strict';
/* Problems-tab false positives found on a real generated app (todo-qwen2,
 * 2026-10-01): all 8 entries were noise.
 *  - mock.disabled-forever matched a CSS `:disabled { … }` rule and the very
 *    JS that enables the button (`addBtn.disabled = !title`);
 *  - js.console flagged Node CLI scripts (scripts/release.js…), the test file
 *    and the server's startup logging as "remove for production".
 * Runs the real Engine.Validator + Engine.MockScan over a small project. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const store = {};
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener() {} },
    fetch: async () => { throw new Error('blocked'); }, setTimeout, clearTimeout, setInterval, clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const n of ['vendor/acorn.js', 'engine.js', 'engine.mockscan.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), ctx, { filename: n });
  return win;
}

function issuesFor(files) {
  const win = load();
  win.Engine.Proj.create('fp', 'saas-dashboard');
  const FS = win.Engine.FS;
  Object.keys(FS._data).forEach((p) => { if (FS.isFile(p)) FS.remove ? FS.remove(p) : delete FS._data[p]; });
  for (const [p, c] of Object.entries(files)) FS.write(p, c);
  return win.Engine.Validator.runAll() || [];
}
const has = (issues, cls, file) => issues.some((i) => i.faultClass === cls && (!file || i.file === file));

module.exports = async function (t) {
  t.ok('MockScan is loaded alongside the validator', typeof load().Engine.MockScan.run === 'function');

  // ---- disabled-forever ----
  {
    const issues = issuesFor({
      '/index.html': '<!doctype html><html lang="en"><head><title>T</title><style>.btn:disabled { opacity: .6; cursor: not-allowed; }</style></head>' +
        '<body><input id="title"><button id="addBtn" class="btn" disabled>Add</button>' +
        '<script>const title = document.getElementById("title"); const addBtn = document.getElementById("addBtn");' +
        'title.oninput = () => { addBtn.disabled = !title.value; };</script></body></html>'
    });
    t.ok('a CSS :disabled rule and JS that enables the button are not "disabled forever"', !has(issues, 'mock.disabled-forever'));
  }
  {
    const issues = issuesFor({ '/index.html': '<!doctype html><html lang="en"><head><title>T</title></head><body><button id="never" disabled>Buy</button></body></html>' });
    t.ok('a disabled control with no script at all IS still flagged', has(issues, 'mock.disabled-forever', '/index.html'));
  }
  {
    const issues = issuesFor({
      '/index.html': '<!doctype html><html lang="en"><head><title>T</title></head><body><button id="locked" disabled>A</button><button id="other" disabled>B</button><script src="/app.js"></script></body></html>',
      '/app.js': 'document.getElementById("other").disabled = false;'
    });
    const flagged = issues.filter((i) => i.faultClass === 'mock.disabled-forever').map((i) => i.message);
    t.ok('a script enabling a DIFFERENT control does not clear the locked one', flagged.length === 1 && /locked/.test(flagged[0]));
  }
  {
    const issues = issuesFor({
      '/index.html': '<!doctype html><html lang="en"><head><title>T</title></head><body><button id="go" disabled>Go</button><script src="/ui.js"></script></body></html>',
      '/ui.js': 'document.getElementById("go").removeAttribute("disabled");'
    });
    t.ok('an external script removing the attribute counts as a path to enable it', !has(issues, 'mock.disabled-forever'));
  }

  // ---- js.console ----
  {
    const issues = issuesFor({
      '/server.js': "const express = require('express'); const app = express(); if (require.main === module) app.listen(3000, () => console.log('listening')); module.exports = app;",
      '/test/server.test.js': "const test = require('node:test'); test('x', () => { console.log('trace'); });",
      '/scripts/release.js': "#!/usr/bin/env node\nconst fs = require('fs'); console.log('released');",
      '/scripts/app.js': "document.getElementById('b').onclick = () => { console.log('clicked'); };",
      '/index.html': '<!doctype html><html lang="en"><head><title>T</title></head><body><button id="b">B</button><script src="/scripts/app.js"></script></body></html>'
    });
    t.ok('Node server startup logging is not flagged', !has(issues, 'js.console', '/server.js'));
    t.ok('test files are not flagged', !has(issues, 'js.console', '/test/server.test.js'));
    t.ok('Node CLI scripts are not flagged', !has(issues, 'js.console', '/scripts/release.js'));
    t.ok('browser code (the offline generators\' /scripts/app.js) IS still flagged', has(issues, 'js.console', '/scripts/app.js'));
  }

  // ---- file.todo ----
  {
    const issues = issuesFor({
      '/db/schema.js': "const DEFAULT_FILE = process.env.TODOS_FILE || 'todos.json'; const TODO_KEY = 'k'; module.exports = { DEFAULT_FILE, TODO_KEY };",
      '/a.js': "// TODO: handle errors\nmodule.exports = 1;",
      '/b.js': "/* FIXME check this */ module.exports = 2;"
    });
    t.ok('TODO inside identifiers (TODOS_FILE, TODO_KEY) is not a marker', !has(issues, 'file.todo', '/db/schema.js'));
    t.ok('a // TODO comment IS a marker', has(issues, 'file.todo', '/a.js'));
    t.ok('a /* FIXME */ comment IS a marker', has(issues, 'file.todo', '/b.js'));
  }

  // ---- js.missing-module ----
  {
    const issues = issuesFor({
      '/server.js': "const { createApp } = require('./app'); const { migrate } = require('./db/schema'); const cfg = require('./config.json'); module.exports = createApp;",
      '/app.js': "module.exports = { createApp: () => ({}) };",
      '/config.json': '{}'
    });
    const missing = issues.filter((i) => i.faultClass === 'js.missing-module').map((i) => i.message);
    t.ok('a require() of a file that does not exist is an error (./db/schema)', missing.length === 1 && /\.\/db\/schema/.test(missing[0]) && issues.find((i) => i.faultClass === 'js.missing-module').severity === 'error');
    t.ok('existing modules (./app → app.js, ./config.json) are not flagged', !missing.some((m) => /'\.\/app'|config\.json/.test(m)));
  }
};
