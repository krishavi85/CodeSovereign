'use strict';
/* Prompt → IDE: files, code, live UI, computer use. */
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
      body: { appendChild() {}, remove() {} },
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    Event: function Event() {},
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    S: { plat: { web: true }, agentBuilt: false, agentRuns: [], agentChat: [], screen: 'welcome' }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.llm.js');
  return { win, store };
}

module.exports = async function (t) {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  const llmSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');
  const engSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.js'), 'utf8');

  t.ok('blank project template exists so prompts are not Pulse', /'blank': function\(\)\{ return \[\]; \}/.test(engSrc));
  t.ok('Generate App opens the IDE', /function beginIdeBuild[\s\S]{0,400}S\.screen = 'ide'/.test(appSrc));
  t.ok('each write opens that file in the editor', /function watchBuildStep[\s\S]{0,500}S\.ideFile = path/.test(appSrc));
  t.ok('index writes launch Computer Use', /Computer\.launch\('preview'\)/.test(appSrc));
  t.ok('IDE shows COMPUTER IN USE while the agent runs', /COMPUTER IN USE/.test(appSrc));
  t.ok('run stays on the IDE after files are written', /S\.screen = 'ide'/.test(appSrc) && /keep prompting in the IDE/.test(appSrc));
  t.ok('new generate wipes leftover Pulse', /leftoverStarterHtml/.test(appSrc) && /wipeLeftoverStarter/.test(llmSrc));
  t.ok('down model still writes a first app from the prompt', /writing files from your prompt/.test(llmSrc));
  t.ok('Welcome copy still says keep prompting', /Keep prompting after the first run/.test(appSrc));
  t.ok('Welcome copy says watch files, code, and the live UI', /watch files, code, and the live UI/.test(appSrc));

  const { win } = load();
  const LLM = win.Engine.LLM;
  t.ok('Pulse leftover is detected', LLM.isPulseStarter('<div class="brand">◆ Pulse</div>'));
  t.ok('Harbor Board is not Pulse', !LLM.isPulseStarter('<title>Harbor Board</title>'));

  win.Engine.FS.write('/index.html', '<title>SaaS Dashboard</title><div class="brand">◆ Pulse</div>');
  win.Engine.FS.write('/styles/main.css', 'body{}');
  t.ok('wipeLeftoverStarter removes Pulse files', LLM.wipeLeftoverStarter() === true);
  t.ok('Pulse index is gone after wipe', !win.Engine.FS.exists('/index.html'));

  LLM.setConfig({
    providerId: 'lmstudio',
    enabled: true,
    model: 'local-model',
    baseUrl: 'http://127.0.0.1:1234'
  });
  win.S = { agentBuilt: false, agentRuns: [], agentChat: [] };
  win.fetch = async function () { throw new Error('ECONNREFUSED'); };
  const steps = await win.Engine.Agent.run('create a kanban board called Harbor Board');
  t.ok('down model still emits write steps', steps.some(function (s) { return s.kind === 'write' && s.path; }));
  const html = win.Engine.FS.read('/index.html') || '';
  t.ok('down model created a real index.html', html.length > 80);
  t.ok('down model did not leave Pulse as the product', !/◆ Pulse/.test(html));
  t.ok('kanban/board intent is in the built app or title', /harbor|kanban|board|column/i.test(html));
};
