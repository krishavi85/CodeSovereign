'use strict';
/* File > Export Project as ZIP feedback (dist/desktop/desktop-app.js).
 * A failed export used to show nothing at all, and a project over the
 * 8000-file readTree cap was exported partially while the toast claimed
 * success. Drives the real menu handler in a VM with a fake desktop bridge. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const toasts = [];
  let menuCb = null;
  let nextExport = null;

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
      Proj: { current: () => null, list: () => [], switchTo() {}, remove() {} },
      FS: { _data: {}, __hasWorkspace: () => false, isFile: () => false, read: () => '', write() {}, __loadFromDisk() {}, __flush: () => Promise.resolve() },
      LLM: { getConfig: () => ({}), setConfig: () => {} },
      Validator: { runAll: () => win.__issues }
    },
    desktop: {
      isDesktop: true,
      creds: { get: () => Promise.resolve({ value: '' }), set: () => Promise.resolve({ ok: true }) },
      info: () => Promise.resolve({ app: 'test' }),
      app: { onMenu(cb) { menuCb = cb; }, recents: () => Promise.resolve([]), setTitle() {}, clearRecents: () => Promise.resolve() },
      workspace: {
        open: () => Promise.resolve({ ok: false }),
        pickAndOpen: () => Promise.resolve(null),
        pickParentDir: () => Promise.resolve(null),
        createProject: () => Promise.resolve({ ok: false }),
        exportZip: () => nextExport(),
        exportDelivery: () => nextExport(),
        reveal() {}
      },
      dialog: { message() {} }
    },
    toast(m, c) { toasts.push({ m: String(m), c }); },
    renderAll() {},
    syncBuildFromFS() {},
    csRefreshTrust: null,
    S: { screen: 'welcome' },
    genApp() {},
    runAgent() {}
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'desktop', 'desktop-app.js'), 'utf8'), win, { filename: 'desktop-app.js' });
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
  await flush();
  t.ok('the menu handler is registered', typeof menuCb === 'function');

  async function exportWith(result) {
    toasts.length = 0;
    nextExport = typeof result === 'function' ? result : () => Promise.resolve(result);
    menuCb({ action: 'export-zip' });
    await flush();
    return toasts.slice();
  }

  let ts = await exportWith({ ok: true, path: 'C:/x/p.zip', fileCount: 12, truncated: false });
  t.ok('a full export reports success with the file count', ts.length === 1 && /Exported 12 files/.test(ts[0].m) && ts[0].c === '#34d399');

  ts = await exportWith({ ok: true, path: 'C:/x/p.zip', fileCount: 8000, truncated: true });
  t.ok('a truncated export warns it is incomplete (not green success)', ts.length === 1 && /only the first 8000/.test(ts[0].m) && ts[0].c !== '#34d399');

  ts = await exportWith({ ok: false, error: 'EACCES: permission denied' });
  t.ok('a failed export tells the user why', ts.length === 1 && /Export failed: EACCES/.test(ts[0].m));

  ts = await exportWith(null);
  t.equal('cancelling the save dialog stays silent', ts.length, 0);

  ts = await exportWith(() => Promise.reject(new Error('IPC gone')));
  t.ok('a rejected IPC call is reported, not swallowed', ts.length === 1 && /Export failed: IPC gone/.test(ts[0].m));
  // Project > Validate Workspace used to jump to a 'recovery' screen that no
  // longer exists (renderAll fell back to Welcome) and call a function that
  // never existed — i.e. it did nothing.
  async function validateWith(issues) {
    toasts.length = 0; win.__issues = issues; win.S.screen = 'welcome'; win.S.idePanel = 'workflow';
    menuCb({ action: 'validate' });
    await flush();
    return toasts.slice();
  }
  ts = await validateWith([]);
  t.ok('validate opens the IDE Problems panel', win.S.screen === 'ide' && win.S.idePanel === 'problems');
  t.ok('a clean workspace reports that validation passed', ts.length === 1 && /no problems/.test(ts[0].m));
  ts = await validateWith([{ severity: 'error' }, { severity: 'warning' }]);
  t.ok('issues are counted, errors called out', ts.length === 1 && /2 issues \(1 error\)/.test(ts[0].m) && ts[0].c === '#ef4444');
  win.Engine.Validator.runAll = () => { throw new Error('boom'); };
  ts = await validateWith([]);
  t.ok('a validator crash is reported, not swallowed', ts.length === 1 && /Validation failed: boom/.test(ts[0].m));
  // File > Export Delivery Archive (the IPC was unreachable before).
  async function deliveryWith(result) {
    toasts.length = 0;
    nextExport = typeof result === 'function' ? result : () => Promise.resolve(result);
    menuCb({ action: 'export-delivery' });
    await flush();
    return toasts.slice();
  }
  ts = await deliveryWith({ ok: true, path: 'C:/x/d.zip', fileCount: 7, bundled: '/delivery/' });
  t.ok('delivery export reports the archive', ts.length === 1 && /Delivery archive: 7 files/.test(ts[0].m) && ts[0].c === '#34d399');
  ts = await deliveryWith({ ok: true, path: 'C:/x/d.zip', fileCount: 3, bundled: '/.sovereign/' });
  t.ok('delivery export says when only evidence was bundled', ts.length === 1 && /evidence only/.test(ts[0].m));
  ts = await deliveryWith({ ok: false, error: 'Nothing to deliver — run an analysis first' });
  t.ok('delivery export failure is shown', ts.length === 1 && /Delivery export failed: Nothing to deliver/.test(ts[0].m));
  ts = await deliveryWith(null);
  t.equal('delivery export cancel stays silent', ts.length, 0);
};
