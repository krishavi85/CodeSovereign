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

let win = null;
let snapshotTimer = null;

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
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
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
  ipcMain.handle('app:setTitle', (_e, t) => { if (win) win.setTitle(t ? 'CodeSovereign — ' + t : 'CodeSovereign'); });
  ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });

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

  ipcMain.handle('ws:open', async (_e, dir) => {
    if (!dir) return null;
    return openWorkspace(dir);
  });

  ipcMain.handle('ws:pickParentDir', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose where to create the project',
      defaultPath: workspace.defaultProjectsDir(),
      properties: ['openDirectory', 'createDirectory']
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('ws:createProject', async (_e, { parentDir, folderName, files }) => {
    try {
      const res = await workspace.createProject({ parentDir, folderName, files });
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

  /* ---- fs ---- */
  ipcMain.handle('fs:read', async (_e, p) => {
    try { return ok({ content: await workspace.readFile(p) }); } catch (e) { return fail(e); }
  });
  ipcMain.handle('fs:write', async (_e, p, content) => {
    try { return await workspace.writeFile(p, content); } catch (e) { return fail(e); }
  });
  ipcMain.handle('fs:remove', async (_e, p) => {
    try { return await workspace.removePath(p); } catch (e) { return fail(e); }
  });
  ipcMain.handle('fs:mkdir', async (_e, p) => {
    try { return await workspace.mkdirPath(p); } catch (e) { return fail(e); }
  });
  ipcMain.handle('fs:rename', async (_e, from, to) => {
    try { return await workspace.renamePath(from, to); } catch (e) { return fail(e); }
  });

  /* ---- processes ---- */
  ipcMain.handle('proc:spawn', (_e, opts) => {
    try { return ok(proc.spawnManaged(opts, procEvent)); } catch (e) { return fail(e); }
  });
  ipcMain.handle('proc:shell', (_e, cwd) => {
    try { return ok(proc.spawnShell(procEvent, cwd)); } catch (e) { return fail(e); }
  });
  ipcMain.handle('proc:write', (_e, id, data) => { proc.write(id, data); });
  ipcMain.handle('proc:kill', (_e, id) => { proc.kill(id); });
  ipcMain.handle('proc:run', async (_e, opts) => {
    try { return ok(await proc.runManaged(opts)); } catch (e) { return fail(e); }
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
