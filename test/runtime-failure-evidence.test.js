'use strict';
/* Live 2026-10-02 (Qwen build): the generated server served its page, then
 * crashed on the first API call (ReferenceError: req is not defined at
 * server.js:241). The crawl failed, no runtime trace was written, and the
 * repair model was told the app "could not be loaded at all — `npm start`
 * may crash on startup". The observer now keeps the server's output, a failed
 * observation is saved with its reason, and the evidence shows both.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CRASH = [
  'Server running on http://localhost:3000',
  'C:\\proj\\server.js:241',
  "    if (req.method === 'GET') {",
  '    ^',
  '',
  'ReferenceError: req is not defined',
  '    at HttpServer.handleApiTodos (C:\\proj\\server.js:241:5)',
  '',
  'Node.js v24.21.0'
].join('\n');

function baseWin() {
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    document: { createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener: () => {} }
  };
  win.window = win;
  return win;
}

function loadObserver(crawlResult, alreadyRunning) {
  const win = baseWin();
  let subscriber = null;
  let started = !!alreadyRunning;
  const crawlModes = [];
  win.desktop = {
    isDesktop: true,
    observer: {
      load: async () => (started ? { ok: true, title: 'Todo' } : { ok: false, error: 'ERR_CONNECTION_REFUSED' }),
      crawl: async (o) => { crawlModes.push(o && o.mode); return crawlResult; },
      stop: () => {}
    },
    proc: {
      onData: (cb) => { subscriber = cb; return () => {}; },
      // Output arrives BEFORE spawnAllowed resolves with the id.
      spawnAllowed: async () => {
        started = true;
        subscriber({ id: 'p1', stream: 'stdout', data: CRASH.split('\n').slice(0, 1).join('\n') + '\n' });
        subscriber({ id: 'p1', stream: 'stderr', data: CRASH.split('\n').slice(1).join('\n') + '\n' });
        subscriber({ id: 'other', stream: 'stdout', data: 'unrelated process output\n' });
        subscriber({ id: 'p1', stream: 'exit', code: 1 });
        return { ok: true, id: 'p1' };
      },
      kill: () => {}
    }
  };
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
  win.Engine.FS.__hasWorkspace = () => true;
  win.Engine.FS.clear();
  win.Engine.FS.write('/package.json', JSON.stringify({ scripts: { start: 'node server.js' } }));
  win.Engine.FS.write('/index.html', '<title>Todo</title>');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'desktop', 'desktop-observe.js'), 'utf8'), ctx, { filename: 'desktop-observe.js' });
  win.__crawlModes = crawlModes;
  return win;
}

function loadLLM(sov) {
  const win = baseWin();
  win.Event = function Event() {};
  win.fetch = async () => { throw new Error('network blocked'); };
  const ctx = vm.createContext(win);
  const run = (name) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8'), ctx, { filename: name });
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.llm.js');
  win.Engine.Sovereign = { read: (p) => (p in sov ? JSON.stringify(sov[p]) : null) };
  win.Engine.DoD = { load: () => ({ criteria: {} }) };
  return win;
}

module.exports = async function (t) {
  {
    const win = loadObserver({ ok: false, error: 'navigation failed: net::ERR_CONNECTION_RESET' });
    const r = await win.CSObserve.run({});
    t.ok('a failed observation reports the real reason', r.ok === false && /ERR_CONNECTION_RESET/.test(r.reason));
    t.ok('...and the server output, including output sent before the process id was known', /ReferenceError: req is not defined/.test(r.serverLog) && /Server running/.test(r.serverLog));
    t.ok('...and when the server exited', /exited with code 1/.test(r.serverLog));
    t.ok('output of other processes is not mixed in', !/unrelated process output/.test(r.serverLog));
  }
  {
    const win = loadObserver({ ok: true, at: 1, url: 'http://localhost:3000', controlsFound: 2, controlsExercised: 2, trace: [] });
    const r = await win.CSObserve.run({ visual: false });
    t.ok('a successful observation of a server we started carries its output too', r.ok && /ReferenceError/.test(r.trace.serverLog || ''));
    t.equal('the app it started itself is crawled in verify mode (creating forms get submitted)', win.__crawlModes[0], 'verify');
  }
  {
    const win = loadObserver({ ok: true, at: 1, url: 'http://localhost:3000', controlsFound: 1, controlsExercised: 0, trace: [] }, true);
    const r = await win.CSObserve.run({ visual: false });
    t.ok('a server that was already running is crawled read-only (observe)', r.ok && r.trace.serverStartedByUs === false && win.__crawlModes[0] === 'observe');
  }

  const ROUND = 1000;
  {
    const win = loadLLM({ 'runtime-failure.json': { at: ROUND + 5, reason: 'navigation failed', serverLog: CRASH } });
    const ev = win.Engine.LLM._integrationEvidence(ROUND);
    t.ok('evidence names why the observation failed', /could not finish observing the app.*navigation failed/.test(ev));
    t.ok('evidence includes the crash line and file position the model must fix', /ReferenceError: req is not defined/.test(ev) && /server\.js:241/.test(ev));
    t.ok('evidence no longer claims the app may crash on startup', !/may crash on startup/.test(ev));
    t.ok('stack frames are trimmed from the server output', !/^\s+at HttpServer/m.test(ev));
  }
  {
    // A failure newer than the last good trace wins: the trace is from before the crash.
    const win = loadLLM({
      'runtime-trace.json': { at: ROUND + 1, url: 'http://localhost:3000', controlsFound: 3, controlsExercised: 3, trace: [] },
      'runtime-failure.json': { at: ROUND + 9, reason: 'Dev server did not come up at http://localhost:3000 within 30s', serverLog: '' }
    });
    const ev = win.Engine.LLM._integrationEvidence(ROUND);
    t.ok('a newer failure is reported over an older trace', /did not come up/.test(ev) && !/found 3 interactive controls/.test(ev));
    t.ok('a silent server is called out', /server printed nothing/.test(ev));
  }
  {
    const win = loadLLM({
      'runtime-trace.json': { at: ROUND + 9, url: 'http://localhost:3000', controlsFound: 3, controlsExercised: 3, trace: [], serverLog: CRASH },
      'runtime-failure.json': { at: ROUND + 1, reason: 'old failure', serverLog: '' }
    });
    const ev = win.Engine.LLM._integrationEvidence(ROUND);
    t.ok('a newer trace wins over an older failure', /found 3 interactive controls/.test(ev) && !/old failure/.test(ev));
    t.ok('server errors printed during a successful crawl are shown', /server printed errors while the page was being used[\s\S]*ReferenceError/.test(ev));
  }
  {
    const win = loadLLM({ 'runtime-trace.json': { at: ROUND + 9, controlsFound: 3, controlsExercised: 3, trace: [], serverLog: 'Server running\nGET /api/errors 200\nErrors: 0\n' } });
    const ev = win.Engine.LLM._integrationEvidence(ROUND);
    t.ok('ordinary log lines that mention "error" are not reported as server errors', !/server printed errors/.test(ev));
  }
  {
    const win = loadLLM({ 'runtime-failure.json': { at: ROUND - 50, reason: 'stale', serverLog: CRASH } });
    const ev = win.Engine.LLM._integrationEvidence(ROUND);
    t.ok('a failure from an earlier round is ignored (generic message)', /could not be loaded/.test(ev) && !/stale/.test(ev));
  }
};
