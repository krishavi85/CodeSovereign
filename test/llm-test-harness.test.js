'use strict';
/* harnessServerTests (dist/engine.llm.js): generated HTTP tests that import
 * the app but never start it, then fetch a hard-coded http://localhost:3000,
 * get a harness that starts the app on a free port and redirects those
 * requests to it. Live run 2026-09-29: 0/4 tests passed with ECONNREFUSED,
 * then EADDRINUSE when the runtime check already had the app on :3000.
 * These tests execute the harnessed file for real with `node --test`. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

function loadLLM() {
  const store = {};
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener() {} },
    fetch: async () => { throw new Error('blocked'); }, setTimeout, clearTimeout, setInterval, clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const n of ['vendor/acorn.js', 'engine.js', 'engine.llm.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), ctx, { filename: n });
  return win.Engine.LLM;
}

// A plain http server module shaped like the generated one (exports the
// server, listens only when run directly).
const SERVER = "const http = require('http');\n" +
  "const server = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ path: req.url })); });\n" +
  "if (require.main === module) server.listen(3000);\nmodule.exports = server;\n";
// The exact mistake the model made: import, never start, fetch :3000.
const TEST = "const test = require('node:test'); const assert = require('node:assert'); const app = require('../server');\n" +
  "const BASE = 'http://localhost:3000';\n" +
  "test('GET /todos', async () => { const r = await fetch('http://localhost:3000/todos'); assert.equal((await r.json()).path, '/todos'); });\n" +
  "test('constant URL', async () => { const r = await fetch(BASE + '/x?y=1'); assert.equal((await r.json()).path, '/x?y=1'); });\n" +
  "test('template URL', async () => { const id = 7; const r = await fetch(`http://127.0.0.1:3000/todos/${id}`); assert.equal((await r.json()).path, '/todos/7'); });\n";

// Async on purpose: the :3000 "blocker" server lives in THIS process, and a
// spawnSync would freeze its event loop — the child's fetch to it then hangs
// until the timeout and the run reports nothing (0 pass / 0 fail).
function runNodeTest(dir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test'], { cwd: dir });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { try { child.kill(); } catch (_) {} }, 60000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, pass: Number((/ℹ pass (\d+)/.exec(out) || [])[1] || 0), fail: Number((/ℹ fail (\d+)/.exec(out) || [])[1] || 0), out });
    });
  });
}

module.exports = async function (t) {
  const LLM = loadLLM();
  const H = LLM._harnessServerTests;
  t.ok('harnessServerTests is exposed', typeof H === 'function');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-harness-'));
  // Occupy :3000 the way the runtime check did, to prove there is no clash.
  const http = require('http');
  const blocker = http.createServer((q, s) => s.end('blocker')).listen(3000);
  await new Promise((r) => blocker.once('listening', r).once('error', r));
  try {
    fs.mkdirSync(path.join(dir, 'test'));
    fs.writeFileSync(path.join(dir, 'server.js'), SERVER);
    fs.writeFileSync(path.join(dir, 'test', 'todo.test.js'), TEST);
    const before = await runNodeTest(dir);
    t.ok('without the harness the model\'s test fails (' + before.pass + ' pass / ' + before.fail + ' fail)', before.fail > 0);

    const out = H({ path: '/test/todo.test.js', content: TEST });
    t.ok('the harness is prepended', /Added by CodeSovereign/.test(out.content) && out.content.endsWith(TEST));
    fs.writeFileSync(path.join(dir, 'test', 'todo.test.js'), out.content);
    const after = await runNodeTest(dir);
    t.ok('with the harness all 3 tests pass — literal, constant and template URLs, with :3000 already taken (' + after.pass + ' pass / ' + after.fail + ' fail)', after.pass === 3 && after.fail === 0 && after.code === 0);

    // Left alone: non-test files, tests that start a server themselves,
    // tests that never call localhost, and tests mixing two ports.
    t.ok('non-test file untouched', H({ path: '/server.js', content: SERVER }).content === SERVER);
    const self = "const app = require('../server'); const s = app.listen(0); fetch('http://localhost:3000/a');";
    t.ok('a test that already calls .listen() is untouched', H({ path: '/test/a.test.js', content: self }).content === self);
    const noHttp = "const test = require('node:test'); test('x', () => {});";
    t.ok('a test with no localhost URL is untouched', H({ path: '/test/b.test.js', content: noHttp }).content === noHttp);
    const twoPorts = "fetch('http://localhost:3000/a'); fetch('http://localhost:4000/b');";
    t.ok('a test using two different ports is untouched', H({ path: '/test/c.test.js', content: twoPorts }).content === twoPorts);
    t.ok('an already-harnessed file is not harnessed twice', H(out).content === out.content);
  } finally {
    blocker.close();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
};
