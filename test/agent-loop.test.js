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

  t.ok('assertSafeCommand is exported', typeof Loop.assertSafeCommand === 'function');
  t.ok('planCommand is exported', typeof Loop.planCommand === 'function');

  const npmPlan = Loop.planCommand('npm test');
  t.ok('npm test maps to the test job', npmPlan.ok && npmPlan.job === 'test');
  const runTestPlan = Loop.planCommand('npm run test');
  t.ok('npm run test maps to the test job', runTestPlan.ok && runTestPlan.job === 'test');
  const installPlan = Loop.planCommand('npm install');
  t.ok('npm install maps to the install job', installPlan.ok && installPlan.job === 'install');
  const buildPlan = Loop.planCommand('npm run build');
  t.ok('npm run build maps to the build job', buildPlan.ok && buildPlan.job === 'build');

  let threw = false;
  try { Loop.assertSafeCommand('node -e process.exit(0)'); } catch (e) { threw = /blocked|allowlist/i.test(String(e.message || e)); }
  t.ok('assertSafeCommand rejects node -e', threw);

  const ran = [];
  win.CSExec = {
    available: () => true,
    run: async (cmd, args) => { ran.push({ fn: 'run', cmd: cmd, args: args || [] }); return { code: 0, output: 'ran' }; },
    install: async () => { ran.push({ fn: 'install' }); return { code: 0, output: 'installed' }; },
    test: async () => { ran.push({ fn: 'test' }); return { code: 0, output: 'tested' }; },
    build: async () => { ran.push({ fn: 'build' }); return { code: 0, output: 'built' }; },
    lint: async () => { ran.push({ fn: 'lint' }); return { code: 0, output: 'linted' }; },
    typecheck: async () => { ran.push({ fn: 'typecheck' }); return { code: 0, output: 'typed' }; }
  };

  async function blockedCmd(cmd, label) {
    const before = ran.length;
    const r = await Loop.exec('run_command', { cmd: cmd });
    t.ok(label + ' is blocked', r.ok === false);
    t.ok(label + ' never reaches CSExec.run', ran.length === before && ran.every(function (x) { return x.fn !== 'run'; }));
  }
  await blockedCmd('node -e process.exit(0)', 'node -e');
  await blockedCmd('node --eval process.exit(0)', 'node --eval');
  await blockedCmd('python -c print(1)', 'python -c');
  await blockedCmd('python3 -c print(1)', 'python3 -c');
  await blockedCmd('git clone /tmp/evil', 'git clone absolute');
  await blockedCmd('git clone https://example.com/r.git', 'git clone url');
  await blockedCmd('npm test; node -e 1', 'shell chaining');
  await blockedCmd('npm run ../../evil', 'path-escape script');
  await blockedCmd('npx eslint /tmp', 'npx absolute path');

  ran.length = 0;
  const npmTest = await Loop.exec('run_command', { cmd: 'npm test' });
  t.ok('npm test is allowed', npmTest.ok === true && npmTest.job === 'test');
  t.ok('npm test routes to CSExec.test', ran.length === 1 && ran[0].fn === 'test');
  t.ok('allowed jobs never use generic CSExec.run', ran.every(function (x) { return x.fn !== 'run'; }));

  ran.length = 0;
  const npmInstall = await Loop.exec('run_command', { cmd: 'npm install' });
  t.ok('npm install routes to CSExec.install', npmInstall.ok && ran.length === 1 && ran[0].fn === 'install');

  delete win.CSExec;
  const browserNpmTest = await Loop.exec('run_command', { cmd: 'npm run test' });
  t.ok('npm run test without desktop uses in-browser validators', browserNpmTest.ok === true && browserNpmTest.job === 'test');

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
  win.S.agentBuilt = true;
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

  const leftover = win.Engine.FS.read('/index.html') || '';
  t.ok('workspace still has a seeded index before generate', leftover.length > 0);
  win.S = { agentQuestions: [], agentChat: [], agentRuns: [], agentBuilt: false };
  let genCalls = 0;
  let genBodies = [];
  win.fetch = async function (url, opts) {
    if (!/chat\/completions/.test(String(url))) {
      return { ok: false, status: 404, text: async () => '' };
    }
    genCalls++;
    try { genBodies.push(JSON.parse(opts.body)); } catch (_) { genBodies.push(null); }
    if (genCalls === 1) {
      return chatReply({ think: 'looks done', tool: 'done', args: { summary: 'already have a dashboard' } });
    }
    return chatReply({
      summary: 'Harbor Board kanban',
      files: [
        {
          path: '/index.html',
          content: '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Harbor Board</title><link rel="stylesheet" href="/styles/app.css"/></head><body><div class="app-shell"><aside class="sidebar"><div class="brand">Harbor Board</div><nav><button>Board</button></nav></aside><main><header class="app-nav">Kanban</header><section class="board">Columns</section></main></div><script src="/scripts/app.js"></script></body></html><!-- layout ' + 'n'.repeat(2000) + ' -->'
        },
        { path: '/styles/app.css', content: ':root{--bg:#0b1020;--accent:#7c6ff5}body{margin:0;background:linear-gradient(180deg,#0b1020,#151a2e)}.app-shell{display:grid;grid-template-columns:240px 1fr}.sidebar{background:#12182b}' + 'c'.repeat(1800) },
        { path: '/scripts/app.js', content: 'localStorage.setItem("harbor","1");document.querySelector(".board").textContent="Ready";' },
        { path: '/README.md', content: '# Harbor Board\nKanban for the prompt.' }
      ]
    });
  };
  const genSteps = await win.Engine.Agent.run('create a kanban board called Harbor Board');
  t.ok('generate run talks to the LLM more than once when done has no writes', genCalls >= 2);
  t.ok('generate ignores done until files are written', genSteps.some(function (s) {
    return s.kind === 'observe' && /done ignored/i.test(s.text || '');
  }));
  t.ok('generate first user message includes MUST BUILD', /MUST BUILD THIS NEW APP/.test(((genBodies[0] && genBodies[0].messages) || []).map(function (m) { return m.content; }).join('\n')));
  t.ok('generate writes the requested app instead of keeping the leftover dashboard', /Harbor Board/.test(win.Engine.FS.read('/index.html') || ''));
  t.ok('generate records write steps for the UI', genSteps.some(function (s) { return s.kind === 'write' && s.path === '/index.html'; }));
  t.ok('generate finishes after writing files', genSteps.some(function (s) { return s.kind === 'done'; }));
};
