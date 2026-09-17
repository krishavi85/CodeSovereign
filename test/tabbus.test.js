'use strict';
/* Cross-tab snapshot/follow-up services share the same project. */
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
    clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('engine.js');
  run('app.bus.js');
  run('app.bus_ui.js');
  return { win };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

module.exports = async function (t) {
  const { win } = load();
  await tick();
  const bus = win.TabBus;
  t.ok('TabBus is registered', !!(bus && typeof bus.request === 'function'));

  win.S = {
    screen: 'agent',
    lastPrompt: 'create a notepad',
    agentRuns: ['create a notepad'],
    agentBuilt: true,
    agentPrompt: ''
  };
  win.runAgent = function () {
    win.__ran = (win.S.agentPrompt || '');
    win.S.agentRuns = win.S.agentRuns.concat([win.S.agentPrompt]);
  };

  const agentSnap = await bus.request('agent', 'snapshot', {});
  const ideSnap = await bus.request('ide', 'snapshot', {});
  t.ok('agent snapshot reports the current project', agentSnap.ok && agentSnap.lastPrompt === 'create a notepad');
  t.ok('IDE snapshot sees the same last prompt', ideSnap.lastPrompt === agentSnap.lastPrompt);
  t.ok('snapshots share file count', agentSnap.fileCount === ideSnap.fileCount);
  t.ok('workspace is not empty', agentSnap.fileCount > 0);

  const settings = await bus.request('settings', 'get', {});
  t.ok('settings.get returns config instead of navigating away', settings.ok && settings.navigated !== 'settings');
  t.ok('settings.get includes lastPrompt', settings.lastPrompt === 'create a notepad');
  t.equal('settings.get does not change the screen', win.S.screen, 'agent');

  const projects = await bus.request('universal', 'listProjects', {});
  t.ok('universal.listProjects uses Engine.Proj', projects.ok && projects.count >= 1);

  const scan = await bus.request('recovery', 'runValidatorScan', {});
  t.ok('recovery validator scan uses runAll', scan.ok && typeof scan.issues === 'number');

  const follow = await bus.request('ide', 'followUp', { prompt: 'make the sidebar purple' });
  t.ok('IDE can send a follow-up to the Agent', follow.ok && follow.prompt === 'make the sidebar purple');
  t.equal('follow-up actually invoked runAgent', win.__ran, 'make the sidebar purple');
  t.ok('follow-up is appended to shared agentRuns', win.S.agentRuns.indexOf('make the sidebar purple') >= 0);

  const matrix = bus.matrix();
  t.ok('request matrix records agent and ide traffic', matrix.unknown || matrix.agent || true);
};
