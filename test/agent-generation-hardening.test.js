'use strict';
/* Three real bugs found live in this session, all in the connected-LLM
 * generation path (engine.llm.js's patchAgent() + engine.loop.js's
 * write_file tool):
 *
 *  1. The desktop HTTP proxy defaulted every LLM completion call to a 45s
 *     timeout (electron/lib/aihost.js). Confirmed live against a real local
 *     model: a legitimate, still-in-progress completion got killed mid-
 *     request ("client closing the connection" in the model server's own
 *     log at exactly 45.0s). Fixed by having chat()/complete() request a
 *     much longer timeout instead of relying on the proxy's default.
 *
 *  2. write_file/create_file returned {ok:false} with no reason when the
 *     args didn't match the expected shape. A small model that malformed
 *     its tool-call args got no feedback to self-correct from, and (before
 *     the stuck-loop guard existed) just retried the same broken call for
 *     the rest of the safety cap. Fixed by reporting exactly what was
 *     wrong with each skipped file.
 *
 *  3. (Covered live, not unit-tested here — deep inside a large closured
 *     IIFE): patchAgent()'s round loop now aborts after 6 consecutive
 *     failed tool calls with an honest error instead of grinding through
 *     the full 48-round safety cap. Verified end to end against a real
 *     stuck model: it correctly stopped at round 8 instead of hanging.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(extraWin) {
  const distDir = path.join(__dirname, '..', 'dist');
  const store = {};
  const win = Object.assign({
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
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout, clearTimeout, setInterval, clearInterval,
    S: { agentQuestions: [], agentChat: [], agentRuns: [] }
  }, extraWin || {});
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.llm.js');
  run('engine.loop.js');
  return { win, store, ctx };
}

module.exports = async function (t) {
  /* ---- Bug 2: write_file must explain a failed call ---- */
  {
    const { win } = load();
    const Loop = win.Engine.Loop;

    const noPath = await Loop.exec('write_file', { content: 'hello' });
    t.equal('write_file with no path is not ok', noPath.ok, false);
    t.ok('...and says why', /missing path/.test(noPath.error || ''));

    const badContent = await Loop.exec('write_file', { path: '/x.js', content: { not: 'a string' } });
    t.equal('write_file with non-string content is not ok', badContent.ok, false);
    t.ok('...and says content must be a string', /content must be a plain string/.test(badContent.error || ''));

    const empty = await Loop.exec('write_file', { files: [] });
    t.equal('write_file with an empty files array is not ok', empty.ok, false);
    t.ok('...and gives a usable hint', /path, content/.test(empty.error || ''));

    const good = await Loop.exec('write_file', { path: '/ok.js', content: 'export const x = 1;\n' });
    t.equal('a well-formed write_file still succeeds', good.ok, true);
    t.ok('...and reports the written path', good.written.indexOf('/ok.js') >= 0);
  }

  /* ---- Bug 1: the LLM completion path must request a real timeout,
     not silently rely on the desktop proxy's short default ---- */
  {
    const requests = [];
    const { win } = load({
      desktop: {
        isDesktop: true,
        ai: {
          request: (opts) => {
            requests.push(opts);
            return Promise.resolve({
              ok: true, status: 200,
              body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] })
            });
          }
        }
      }
    });
    win.Engine.LLM.setConfig({ providerId: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.1:8b', apiKey: 'ollama', enabled: true });
    await win.Engine.LLM.chat('hello');
    t.equal('one request went out for chat()', requests.length, 1);
    t.ok('chat() requests a timeout well past the proxy default of 45s', requests[0].timeoutMs >= 120000);

    await win.Engine.LLM.complete('hello', null);
    t.equal('one more request went out for complete()', requests.length, 2);
    t.ok('complete() also requests a long timeout', requests[1].timeoutMs >= 120000);
  }

  /* ---- error text a real user sees must be actionable, not raw
     network jargon — found live: "Failed to fetch" reached the UI
     verbatim with no next step ---- */
  {
    const { win } = load();
    win.Engine.Proj.create('test', 'saas-dashboard');
    win.Engine.LLM.setConfig({
      enabled: true, providerId: 'ollama', model: 'llama3.1:8b',
      baseUrl: 'http://127.0.0.1:11434', apiKey: 'ollama'
    });
    win.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const steps = await win.Engine.Agent.run('build a counter app');
    const errText = steps.filter((s) => s.kind === 'error').map((s) => s.text).join(' | ');
    t.ok('a raw fetch failure produces at least one error step', steps.some((s) => s.kind === 'error'));
    t.ok('the raw "Failed to fetch" string is not shown verbatim to the user', errText.indexOf('Failed to fetch') === -1);
    t.ok('the message explains what to check instead', /couldn.t reach|running|busy/i.test(errText));
    t.ok('the message names where it tried to connect', errText.indexOf('127.0.0.1:11434') >= 0);
  }

  /* ---- wall-clock time budget: a follow-up edit's prompt is much bigger
     (up to ~6 full files of context) than a fresh generation's, and on
     modest hardware prompt processing alone can run for minutes per
     round. Round-count alone doesn't bound wall time, so a run that keeps
     "succeeding" at the network level but never writes anything must
     still give up within a few minutes, not the full 48-round cap. ---- */
  {
    const { win, ctx } = load();
    win.Engine.Proj.create('test', 'saas-dashboard');
    win.Engine.LLM.setConfig({
      enabled: true, providerId: 'ollama', model: 'llama3.1:8b',
      baseUrl: 'http://127.0.0.1:11434', apiKey: 'ollama'
    });
    // Every round "succeeds" at the network level and is a recognized
    // tool call (think - a real, always-ok, side-effect-free tool), but
    // never once writes a file — nothing but wasted rounds.
    win.fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ think: 'still thinking', tool: 'think', args: {} }) } }] })
    });
    // Fast-forward the clock 90s on every read so the budget trips after
    // a handful of rounds instead of requiring a real 6-minute wait. Must
    // be injected from inside the vm context - Date there is not the same
    // binding as the outer Node process's Date.
    vm.runInContext(
      'var __realNow = Date.now(); var __fakeNow = __realNow; Date.now = function () { __fakeNow += 90000; return __fakeNow; };',
      ctx
    );
    const steps = await win.Engine.Agent.run('build a counter app');
    const errText = steps.filter((s) => s.kind === 'error').map((s) => s.text).join(' | ');
    t.ok('a run that never writes anything stops with an honest error', steps.some((s) => s.kind === 'error'));
    t.ok('...specifically citing the time budget, not a round-count cap', /Stopped after \d+s with nothing written/.test(errText));
    t.ok('...names where it was trying to reach', errText.indexOf('127.0.0.1:11434') >= 0);
    t.ok('it did not burn through the full 48-round safety cap first', steps.filter((s) => s.kind === 'plan').length < 20);
  }
};
