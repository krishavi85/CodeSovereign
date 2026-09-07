'use strict';
/*
 * main.js — CodeSovereign desktop shell.
 *
 * Security posture:
 *   - contextIsolation: true, nodeIntegration: false, sandbox: true
 *   - the renderer only ever talks to the OS through the typed `window.desktop`
 *     bridge defined in preload.js; every path is validated against the open
 *     workspace in main.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fsp = require('fs/promises');

const workspace = require('./lib/workspace');
const proc = require('./lib/proc');
const git = require('./lib/git');
const creds = require('./lib/creds');
const zip = require('./lib/zip');
const snapshots = require('./lib/snapshots');
const store = require('./lib/store');
const { applyMenu } = require('./menu');

const DEV = process.argv.includes('--dev');
const SMOKE = process.argv.includes('--smoke');
const RENDERER = path.join(__dirname, '..', 'dist', 'index.html');

// The headless boot check runs on CI runners with no GPU / no desktop session.
if (SMOKE) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('in-process-gpu');
}

let win = null;
let snapshotTimer = null;
const approvedParents = new Set(); // dirs the user picked via "choose where to create"

/* ------------------------------------------------------------------ window */

function createWindow() {
  const bounds = store.get('windowBounds') || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#070a11',
    title: 'CodeSovereign',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webviewTag: false
    }
  });

  win.loadFile(RENDERER);

  const rendererErrors = [];
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) rendererErrors.push(`${message}  (${source}:${line})`);
    if (DEV || SMOKE) console.log(`[renderer] ${message}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer] failed to load ${url}: ${desc} (${code})`);
  });
  win.webContents.on('preload-error', (_e, p, err) => console.error(`[preload] ${p}: ${err}`));

  win.once('ready-to-show', () => {
    if (!SMOKE) win.show();
    if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  });

  if (SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise(r => setTimeout(r, 1500));
      let probe = {};
      try {
        probe = await win.webContents.executeJavaScript(
          'JSON.stringify({ desktop: !!window.desktop, engine: !!(window.Engine && window.Engine.FS), ' +
          'renderAll: typeof window.renderAll, patched: !!(window.Engine && window.Engine.FS && window.Engine.FS.__hasWorkspace), ' +
          'screen: window.S && window.S.screen })'
        );
      } catch (e) { probe = 'probe failed: ' + e.message; }
      console.log('[smoke] renderer probe: ' + probe);
      console.log('[smoke] renderer errors (' + rendererErrors.length + '): ' + JSON.stringify(rendererErrors.slice(0, 10)));

      // credential round-trip (main-process safeStorage)
      try {
        await creds.set('smoke.key', 's3cr3t-' + Date.now());
        const back = await creds.get('smoke.key');
        await creds.del('smoke.key');
        const gone = await creds.get('smoke.key');
        console.log('[smoke] creds roundtrip: ' + JSON.stringify({
          encrypted: creds.available(),
          readsBack: /^s3cr3t-/.test(back || ''),
          deletes: gone === null
        }));
      } catch (e) { console.log('[smoke] creds roundtrip failed: ' + e.message); }

      const bad = rendererErrors.length > 0 ? 1 : 0;
      if (bad) console.log('[smoke] FAIL: renderer produced errors');
      setTimeout(() => app.exit(bad), 200);
    });
  }

  win.on('close', () => {
    if (win && !win.isDestroyed()) {
      const b = win.getBounds();
      store.set('windowBounds', b);
    }
  });
  win.on('closed', () => { win = null; });

  // External links open in the real browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // The renderer may only ever be the app's own index.html. Anything else that
  // tries to become a top-level navigation is bounced (https -> system browser,
  // stray file:// -> blocked so it can't be pointed at arbitrary local files).
  const rendererUrl = require('url').pathToFileURL(RENDERER).href;
  win.webContents.on('will-navigate', (e, url) => {
    if (url === rendererUrl) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  win.webContents.on('render-process-gone', async (_e, details) => {
    if (SMOKE) return;
    const r = await dialog.showMessageBox(win, {
      type: 'error',
      title: 'CodeSovereign stopped responding',
      message: 'The window crashed (' + details.reason + ').',
      detail: 'Your work is snapshotted automatically. Reload the window?',
      buttons: ['Reload', 'Quit'],
      defaultId: 0
    });
    if (r.response === 0 && win) win.reload(); else app.quit();
  });
}

/* -------------------------------------------------------------- ipc: send */

function sendMenu(action, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('menu:action', { action, payload });
}
function procEvent(evt) {
  if (win && !win.isDestroyed()) win.webContents.send('proc:data', evt);
}

/* ------------------------------------------------------------ ipc: handlers */

function ok(data) { return { ok: true, ...data }; }
function fail(e) { return { ok: false, error: String(e && e.message || e) }; }

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    credsEncrypted: creds.available()
  }));

  ipcMain.handle('app:recents', () => store.get('recents') || []);
  ipcMain.handle('app:clearRecents', () => { store.set('recents', []); rebuildMenu(); return ok(); });
  ipcMain.handle('app:setTitle', (_e, t) => {
    if (win) win.setTitle(typeof t === 'string' && t ? 'CodeSovereign — ' + t.slice(0, 120) : 'CodeSovereign');
  });

  /* ---- workspace ---- */
  ipcMain.handle('ws:current', () => {
    const root = workspace.getRoot();
    return root ? { root, name: workspace.name() } : null;
  });

  ipcMain.handle('ws:pickAndOpen', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Open project folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return openWorkspace(r.filePaths[0]);
  });

  // A renderer may only re-open a folder the user has already picked through a
  // dialog (i.e. one that is in the recents list). It can never hand main an
  // arbitrary path to expose as the workspace.
  ipcMain.handle('ws:open', async (_e, dir) => {
    if (!dir || typeof dir !== 'string') return null;
    const target = path.resolve(dir);
    const known = (store.get('recents') || []).some(r => path.resolve(r.path) === target);
    if (!known) return fail('Folder is not in recent projects — use Open Folder to pick it');
    return openWorkspace(target);
  });

  ipcMain.handle('ws:pickParentDir', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose where to create the project',
      defaultPath: workspace.defaultProjectsDir(),
      properties: ['openDirectory', 'createDirectory']
    });
    if (r.canceled || !r.filePaths[0]) return null;
    approvedParents.add(path.resolve(r.filePaths[0]));
    return r.filePaths[0];
  });

  ipcMain.handle('ws:createProject', async (_e, { parentDir, folderName, files }) => {
    try {
      // parentDir must be null (-> default projects dir) or a dir the user just
      // picked in the "choose where to create" dialog this session.
      let parent = null;
      if (parentDir != null) {
        parent = path.resolve(String(parentDir));
        if (!approvedParents.has(parent)) return fail('Parent folder was not chosen through the dialog');
      }
      if (!Array.isArray(files) || files.some(f => typeof f.path !== 'string')) return fail('Invalid file list');
      const res = await workspace.createProject({ parentDir: parent, folderName, files });
      afterOpen(res.root, res.name);
      return ok(res);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('ws:readTree', async () => {
    try { return ok(await workspace.readTree()); } catch (e) { return fail(e); }
  });

  ipcMain.handle('ws:reveal', async (_e, rel) => {
    const root = workspace.getRoot();
    if (!root) return fail('No workspace');
    try {
      const target = rel ? workspace.resolveInside(rel) : root;
      shell.showItemInFolder(target);
      return ok();
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('ws:exportZip', async () => {
    const root = workspace.getRoot();
    if (!root) return fail('No workspace');
    const r = await dialog.showSaveDialog(win, {
      title: 'Export project as ZIP',
      defaultPath: path.join(app.getPath('downloads'), workspace.name() + '.zip'),
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
    });
    if (r.canceled || !r.filePath) return null;
    try {
      const tree = await workspace.readTree();
      const entries = [];
      for (const f of tree.files) {
        const name = f.path.replace(/^\//, '');
        if (f.binary || f.content == null) {
          const abs = workspace.resolveInside(f.path);
          entries.push({ name, data: await fsp.readFile(abs) });
        } else {
          entries.push({ name, data: f.content });
        }
      }
      await fsp.writeFile(r.filePath, zip.build(entries));
      return ok({ path: r.filePath, fileCount: entries.length });
    } catch (e) { return fail(e); }
  });

  /* ---- fs ---- (every path is validated against the workspace root in workspace.js) */
  const asPath = (p) => { if (typeof p !== 'string') throw new Error('path must be a string'); return p; };
  ipcMain.handle('fs:read', async (_e, p) => {
    try { return ok({ content: await workspace.readFile(asPath(p)) }); } catch (e) { return fail(e); }
  });
  ipcMain.handle('fs:write', async (_e, p, content) => {
    try { return await workspace.writeFile(asPath(p), typeof content === 'string' ? content : ''); } catch (e) { return fail(e); }
  });
  ipcMain.handle('fs:remove', async (_e, p) => {
    try { return await workspace.removePath(asPath(p)); } catch (e) { return fail(e); }
  });
  ipcMain.handle('fs:mkdir', async (_e, p) => {
    try { return await workspace.mkdirPath(asPath(p)); } catch (e) { return fail(e); }
  });
  ipcMain.handle('fs:rename', async (_e, from, to) => {
    try { return await workspace.renamePath(asPath(from), asPath(to)); } catch (e) { return fail(e); }
  });

  /* ---- processes ----
     No arbitrary programmatic spawn is exposed. The renderer gets:
       proc:shell  -> the OS shell only (the user then types into it)
       proc:run    -> an allowlisted set of project tools, workspace-scoped     */
  ipcMain.handle('proc:shell', (_e, cwd) => {
    try { return ok(proc.spawnShell(procEvent, typeof cwd === 'string' ? cwd : '.')); } catch (e) { return fail(e); }
  });
  ipcMain.handle('proc:write', (_e, id, data) => {
    if (typeof id === 'string' && typeof data === 'string') proc.write(id, data.slice(0, 100000));
  });
  ipcMain.handle('proc:kill', (_e, id) => { if (typeof id === 'string') proc.kill(id); });
  ipcMain.handle('proc:run', async (_e, opts) => {
    try {
      const o = opts || {};
      if (typeof o.cmd !== 'string' || !Array.isArray(o.args)) return fail('cmd/args required');
      return ok(await proc.runManaged({ cmd: o.cmd, args: o.args.map(String), cwd: typeof o.cwd === 'string' ? o.cwd : '.' }));
    } catch (e) { return fail(e); }
  });

  /* ---- git ---- */
  ipcMain.handle('git:available', () => git.available());
  ipcMain.handle('git:exec', async (_e, args) => {
    try { return ok(await git.exec(args)); } catch (e) { return fail(e); }
  });
  ipcMain.handle('git:status', async () => {
    try { return ok(await git.status()); } catch (e) { return fail(e); }
  });

  /* ---- credentials ---- */
  ipcMain.handle('creds:available', () => creds.available());
  ipcMain.handle('creds:get', async (_e, key) => ({ ok: true, value: await creds.get(key) }));
  ipcMain.handle('creds:set', async (_e, key, value) => { try { return await creds.set(key, value); } catch (e) { return fail(e); } });
  ipcMain.handle('creds:delete', async (_e, key) => { try { return await creds.del(key); } catch (e) { return fail(e); } });
  ipcMain.handle('creds:keys', async () => ({ ok: true, keys: await creds.keys() }));

  /* ---- dialogs ---- */
  ipcMain.handle('dialog:message', async (_e, opts) => {
    const r = await dialog.showMessageBox(win, {
      type: opts.type || 'info',
      title: opts.title || 'CodeSovereign',
      message: opts.message || '',
      detail: opts.detail || '',
      buttons: opts.buttons || ['OK'],
      defaultId: opts.defaultId || 0,
      cancelId: opts.cancelId
    });
    return { response: r.response, checkboxChecked: r.checkboxChecked };
  });
  ipcMain.handle('dialog:error', (_e, title, content) => { dialog.showErrorBox(title || 'Error', String(content || '')); });

  /* ---- snapshots ---- */
  ipcMain.handle('snap:list', () => snapshots.list());
  ipcMain.handle('snap:create', (_e, reason) => snapshots.create(reason));
  ipcMain.handle('snap:restore', (_e, id) => snapshots.restore(id));
}

/* ------------------------------------------------------------ workspace open */

async function openWorkspace(dir) {
  try {
    const res = await workspace.open(dir);
    afterOpen(res.root, res.name);
    return ok(res);
  } catch (e) {
    store.removeRecent(path.resolve(dir));
    return fail(e);
  }
}

function afterOpen(root, name) {
  store.addRecent({ path: root, name, at: Date.now() });
  rebuildMenu();
  if (win) win.setTitle('CodeSovereign — ' + name);
  // first snapshot of the freshly opened project
  snapshots.create('opened').catch(() => {});
  startSnapshotTimer();
}

function rebuildMenu() { applyMenu(sendMenu); }

function startSnapshotTimer() {
  if (snapshotTimer) clearInterval(snapshotTimer);
  snapshotTimer = setInterval(() => {
    if (workspace.getRoot()) snapshots.create('auto').catch(() => {});
  }, 5 * 60 * 1000);
}

/* -------------------------------------------------------------- app startup */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    // Deny every permission request — this is a local tool, not a web page.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    registerIpc();
    rebuildMenu();
    createWindow();

    if (SMOKE) {
      setTimeout(() => { console.log('[smoke] window created OK'); app.exit(0); }, 7000);
    }

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { proc.killAll(); });
}
