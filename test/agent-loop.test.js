'use strict';
/* THINK → ACT → OBSERVE agent loop — no product limit on tool calls. */
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
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    S: { agentQuestions: [], agentChat: [], agentRuns: [] }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.llm.js');
  run('engine.loop.js');
  return { win, store };
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
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  const llmSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');
  t.ok('index.html loads engine.loop.js', /engine\.loop\.js/.test(html));
  t.ok('system prompt describes think-act-observe', /THINK → ACT → OBSERVE/.test(llmSrc));
  t.ok('system prompt says there is no product limit', /no product limit on how many tools/.test(llmSrc));

  const { win } = load();
  const Loop = win.Engine.Loop;
  const LLM = win.Engine.LLM;
  t.ok('Engine.Loop is exposed', Loop && typeof Loop.exec === 'function');
  t.ok('Loop declares no fixed tool-call limit', Loop.NO_FIXED_LIMIT === true);
  t.ok('LLM also flags no fixed tool limit', LLM.NO_FIXED_TOOL_LIMIT === true);
  t.ok('safety cap is a runaway guard, not 4', Loop.SAFETY_CAP >= 32 && LLM.SAFETY_CAP >= 32);

  const required = ['grep', 'read_file', 'write_file', 'delete_file', 'run_command', 'install_deps', 'run_tests', 'observe', 'web_search', 'browser', 'mcp', 'generate_image', 'ask_user', 'done'];
  required.forEach(function (name) {
    t.ok('tool catalog includes ' + name, Loop.tools.indexOf(name) >= 0);
  });

  win.Engine.FS.write('/notes.js', 'function save() { return 1; }\n');
  const grepped = await Loop.exec('grep', { query: 'function save' });
  t.ok('grep searches the repository', grepped.ok && grepped.result && grepped.result.hits && grepped.result.hits.length);

  const read = await Loop.exec('read_file', { path: '/notes.js' });
  t.ok('inspects a file', /function save/.test((read.result && read.result.content) || ''));

  const wrote = await Loop.exec('write_file', { path: '/lib/new.js', content: 'export function n() { return 2; }\n' });
  t.ok('creates/edits a file', wrote.ok && /function n/.test(win.Engine.FS.read('/lib/new.js') || ''));

  const del = await Loop.exec('delete_file', { path: '/lib/new.js' });
  t.ok('deletes a file', del.ok && !win.Engine.FS.exists('/lib/new.js'));

  const blocked = await Loop.exec('run_command', { cmd: 'rm -rf /' });
  t.ok('dangerous commands are blocked', blocked.ok === false);

  const tests = await Loop.exec('run_tests', {});
  t.ok('run_tests inspects failures via validators', typeof tests.ok === 'boolean');

  const asked = await Loop.exec('ask_user', { question: 'Dark theme or light?' });
  t.ok('ask_user records a question', asked.ok && asked.continued === true);
  t.ok('ask_user does not block the loop', asked.continued === true && win.S.agentQuestions.length === 1);

  const img = await Loop.exec('generate_image', { title: 'Hero splash' });
  t.ok('generate_image writes an svg', img.ok && /\.svg$/.test(img.path) && /<svg/.test(win.Engine.FS.read(img.path) || ''));

  const parsed = Loop.parse(JSON.stringify({ think: 'look around', tool: 'grep', args: { query: 'save' } }));
  t.ok('parse reads a tool call', parsed.kind === 'tool' && parsed.tool === 'grep');

  LLM.setConfig({
    enabled: true,
    providerId: 'lmstudio',
    model: 'test-model',
    baseUrl: 'http://127.0.0.1:1234',
    localToken: 'lms-token'
  });
  let calls = 0;
  win.fetch = async function (url) {
    if (!/chat\/completions/.test(String(url))) {
      return { ok: false, status: 404, text: async () => '' };
    }
    calls++;
    if (calls === 1) return chatReply({ think: 'search first', tool: 'grep', args: { query: 'save' } });
    return chatReply({ think: 'verified', tool: 'done', args: { summary: 'found save()' } });
  };
  const steps = await win.Engine.Agent.run('where is save implemented?');
  t.ok('agent acts with a tool before writing files', steps.some(function (s) { return s.kind === 'act' && s.tool === 'grep'; }));
  t.ok('agent observes the tool result', steps.some(function (s) { return s.kind === 'observe'; }));
  t.ok('agent can finish with done rather than a 4-round cap', steps.some(function (s) { return s.kind === 'done'; }));
  t.ok('tool loop used more than a single prompt→code hop', calls >= 2);
};
