'use strict';
/* Desktop boot-time race: the last project is reopened asynchronously
 * (app:recents -> ws:open -> applyTree). If genApp()/runAgent() fire before
 * that settles, Engine.Proj.current() sees no project, a scratch project
 * gets created via Engine.Proj.create() -> FS.clear(), the Agent writes real
 * files into memory-only FS, and then the in-flight reopen finishes and
 * FS.__loadFromDisk() wholesale-replaces FS._data with the old folder's
 * contents — silently discarding the agent's work with no error. Fixed by
 * deferring genApp/runAgent until the initial project load settles. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const genAppCalls = [];
  const runAgentCalls = [];

  let resolveRecents;
  const recentsP = new Promise((resolve) => { resolveRecents = resolve; });
  let resolveOpen;
  const openP = new Promise((resolve) => { resolveOpen = resolve; });

  const fsData = {};

  const win = {
    console,
    document: {
      readyState: 'complete',
      addEventListener() {},
      getElementById: () => null,
      createElement: () => ({ style: {}, appendChild() {}, querySelector: () => ({ onclick: null }) }),
      body: { appendChild() {} }
    },
    addEventListener() {},
    Engine: {
      Proj: {
        current: function () { return null; },
        list: function () { return []; },
        switchTo: function () {},
        remove: function () {}
      },
      FS: {
        _data: fsData,
        __hasWorkspace: () => false,
        isFile: (p) => !!fsData[p],
        read: (p) => (fsData[p] && fsData[p].content) || '',
        write() {},
        __loadFromDisk(files) {
          Object.keys(fsData).forEach((k) => delete fsData[k]);
          (files || []).forEach((f) => { fsData[f.path] = { content: f.content || '' }; });
        },
        __flush: () => Promise.resolve()
      },
      LLM: { getConfig: () => ({}), setConfig: () => {} }
    },
    desktop: {
      isDesktop: true,
      creds: { get: () => Promise.resolve({ value: '' }), set: () => Promise.resolve({ ok: true }) },
      info: () => Promise.resolve({ app: 'test' }),
      app: {
        onMenu() {},
        recents: () => recentsP,
        setTitle() {},
        clearRecents: () => Promise.resolve()
      },
      workspace: {
        open: () => openP,
        pickAndOpen: () => Promise.resolve(null),
        pickParentDir: () => Promise.resolve(null),
        createProject: () => Promise.resolve({ ok: false }),
        exportZip: () => Promise.resolve({ ok: false }),
        reveal() {}
      },
      dialog: { message() {} }
    },
    toast() {},
    renderAll() {},
    syncBuildFromFS() {},
    csRefreshTrust: null,
    S: { screen: 'welcome' },
    genApp: function () { genAppCalls.push(1); },
    runAgent: function () { runAgentCalls.push(1); }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'dist', 'desktop', 'desktop-app.js'), 'utf8'),
    win,
    { filename: 'desktop-app.js' }
  );

  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
  await flush();

  t.ok('boot() starts in the booting state', win.CSDesktop.booting === true);

  win.window.genApp();
  win.window.runAgent();
  t.ok('genApp() is deferred while still booting', genAppCalls.length === 0);
  t.ok('runAgent() is deferred while still booting', runAgentCalls.length === 0);
  t.equal('exactly the two deferred calls are queued', win.CSDesktop.pendingBoot.length, 2);
  t.ok(
    'FS is untouched while the guard holds the calls back (no spurious Proj.create/FS.clear)',
    Object.keys(fsData).length === 0
  );

  // Simulate the last project's disk read resolving with real content.
  resolveRecents([{ path: '/proj', name: 'proj', at: 1 }]);
  await flush();
  resolveOpen({ ok: true, root: '/proj', name: 'proj', files: [{ path: '/real.txt', content: 'from disk' }] });
  await flush();

  t.ok('boot() has settled', win.CSDesktop.booting === false);
  t.ok('the real project loaded (FS reflects disk content)', win.Engine.FS.isFile('/real.txt'));
  t.equal('genApp() runs once boot settles', genAppCalls.length, 1);
  t.equal('runAgent() runs once boot settles', runAgentCalls.length, 1);
  t.equal('the deferred queue is drained', win.CSDesktop.pendingBoot.length, 0);
};
