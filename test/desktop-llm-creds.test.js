'use strict';
/* Desktop keychain wrap: empty Save/Test before hydration must not wipe secrets. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const store = {};
  const credStore = {};
  const setCalls = [];
  let resolveToken;
  const tokenP = new Promise((resolve) => { resolveToken = resolve; });

  const llmStore = {
    getConfig: function () {
      try { return JSON.parse(store['cs.llm.v1'] || '{}'); } catch (_) { return {}; }
    },
    setConfig: function (patch) {
      const cur = llmStore.getConfig();
      const next = Object.assign({}, cur, patch || {});
      store['cs.llm.v1'] = JSON.stringify(next);
      return next;
    }
  };

  const win = {
    console,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    document: {
      readyState: 'complete',
      addEventListener() {},
      getElementById: () => null,
      createElement: () => ({
        style: {},
        appendChild() {},
        querySelector() { return { onclick: null }; }
      }),
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
        __hasWorkspace: () => false,
        _data: {},
        isFile: () => false,
        read: () => '',
        write() {},
        __loadFromDisk() {},
        __flush: () => Promise.resolve()
      },
      LLM: llmStore
    },
    desktop: {
      isDesktop: true,
      creds: {
        get: (k) => {
          if (k === 'llm.localToken') return tokenP;
          return Promise.resolve({ value: credStore[k] || '' });
        },
        set: (k, v) => {
          setCalls.push({ k: k, v: v });
          credStore[k] = v;
          return Promise.resolve({ ok: true });
        }
      },
      info: () => Promise.resolve({ app: 'test' }),
      app: {
        onMenu() {},
        recents: () => Promise.resolve([]),
        setTitle() {},
        clearRecents: () => Promise.resolve()
      },
      workspace: {
        open: () => Promise.resolve({ ok: false }),
        pickAndOpen: () => Promise.resolve(null),
        pickParentDir: () => Promise.resolve(null),
        createProject: () => Promise.resolve({ ok: false }),
        exportZip: () => Promise.resolve({ ok: false }),
        reveal() {}
      },
      snapshots: {
        create: () => Promise.resolve({ ok: false }),
        list: () => Promise.resolve([]),
        restore: () => Promise.resolve({ ok: false })
      },
      dialog: { message() {} }
    },
    toast() {},
    renderAll() {},
    S: { screen: 'settings' }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'dist', 'desktop', 'desktop-app.js'), 'utf8'),
    win,
    { filename: 'desktop-app.js' }
  );

  win.Engine.LLM.setConfig({ providerId: 'lmstudio', localToken: '', enabled: true });
  t.ok(
    'empty localToken before hydrate does not delete the keychain secret',
    !setCalls.some((c) => c.k === 'llm.localToken')
  );

  resolveToken({ value: 'lms-kept' });
  await tokenP;
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  t.equal('hydrated getConfig exposes the keychain token', win.Engine.LLM.getConfig().localToken, 'lms-kept');
  t.ok('hydrate did not store plaintext localToken', String(store['cs.llm.v1'] || '').indexOf('lms-kept') < 0);

  win.Engine.LLM.setConfig({ localToken: '' });
  t.ok(
    'empty localToken after hydrate is an intentional clear',
    setCalls.some((c) => c.k === 'llm.localToken' && c.v === '')
  );
};
