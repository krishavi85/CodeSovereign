'use strict';
/* Phase C of the Generate-App unification: the offline path (engine.js's
 * base Agent.run()) has always derived a structured Contract (entities,
 * requirements, acceptance criteria) from the prompt before building, but
 * the connected-LLM round loop (engine.llm.js's patchAgent()) planned from
 * free prompt text alone — it never called Engine.Contract at all. Both
 * paths now derive/consult the SAME Contract/AppSpec: the offline path
 * unchanged, and the round loop now derives it too and folds a
 * PRODUCT CONTRACT block (entities + requirements) into the prompt sent to
 * the model, via formatContract() (dist/engine.llm.js).
 */
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
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout, clearTimeout, setInterval, clearInterval,
    S: { agentQuestions: [], agentChat: [], agentRuns: [] }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.contract.js');
  run('engine.llm.js');
  run('engine.loop.js');
  return win;
}

function chatReply(obj) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }]
    })
  };
}

module.exports = async function (t) {
  const win = load();
  t.ok('Engine.Contract loaded alongside the LLM path', !!(win.Engine.Contract && win.Engine.Contract.deriveFromPrompt));

  win.Engine.Proj.create('contract-shared', 'saas-dashboard');
  win.Engine.LLM.setConfig({
    enabled: true,
    providerId: 'lmstudio',
    model: 'test-model',
    baseUrl: 'http://127.0.0.1:1234',
    localToken: 'lms-token'
  });

  let capturedUserPrompt = null;
  win.fetch = async function (url, init) {
    if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
    const body = JSON.parse((init && init.body) || '{}');
    const userMsg = (body.messages || []).find((m) => m.role === 'user');
    capturedUserPrompt = (userMsg && userMsg.content) || '';
    return chatReply({ summary: 'built it', files: [{ path: '/index.html', content: '<!doctype html><html><body>ok</body></html>' }] });
  };

  const prompt = 'Build a project management tool with tasks, projects, and comments, with user accounts and admin roles';
  const steps = await win.Engine.Agent.run(prompt);

  t.ok('agent run completes and writes files', steps.some((s) => s.kind === 'write' || s.kind === 'done'));
  t.ok('a contract step is emitted, naming detected entities', steps.some((s) => s.kind === 'contract' && /project|task|comment/.test(s.text)));
  t.ok('the model prompt includes a PRODUCT CONTRACT block', /PRODUCT CONTRACT/.test(capturedUserPrompt || ''));
  t.ok('the model prompt lists the derived entities', /project/.test(capturedUserPrompt) && /task/.test(capturedUserPrompt) && /comment/.test(capturedUserPrompt));
  t.ok('the model prompt lists derived requirement statements, not just free prompt text', /Requirements:/.test(capturedUserPrompt));

  // The upfront "thinking" step must prefer real per-app signal (domain/
  // functional/interaction requirements) over the generic quality-gate
  // boilerplate every contract carries (tests pass, build succeeds, lint
  // clean) — showing "the project's automated tests pass" as "thinking"
  // would be technically real but useless, not genuine insight.
  const thinkStep = steps.find((s) => s.kind === 'thinking');
  t.ok('an upfront thinking step is emitted for this fresh build', !!thinkStep);
  t.ok('the thinking step does not lead with generic quality-gate boilerplate', !/automated tests pass|builds a production artifact|passes lint/i.test(thinkStep.text));

  // A follow-up edit (isFollowUp() true: a prior turn on this project) should
  // NOT get a freshly re-derived contract block folded in —
  // buildFollowUpPrompt already frames edits around the existing app;
  // re-deriving structure from a short edit instruction would add noise,
  // not signal. isFollowUp() keys off S.agentRuns/S.agentBuilt, not merely
  // the presence of files, so seed that the same way the real UI would
  // after a completed prior run.
  win.Engine.FS.write('/index.html', '<!doctype html><html><body>existing app</body></html>');
  win.Engine.FS.write('/styles/main.css', 'body{color:red}');
  win.Engine.FS.write('/scripts/app.js', 'console.log(1);');
  win.S.agentBuilt = true;
  win.S.agentRuns = [prompt];
  capturedUserPrompt = null;
  await win.Engine.Agent.run('add a dark mode toggle');
  t.ok('a follow-up edit prompt does not carry a re-derived PRODUCT CONTRACT block', !/PRODUCT CONTRACT/.test(capturedUserPrompt || ''));
};
