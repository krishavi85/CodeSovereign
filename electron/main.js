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
const observer = require('./lib/observer');
const trust = require('./lib/trust');
const git = require('./lib/git');
const creds = require('./lib/creds');
const zip = require('./lib/zip');
const snapshots = require('./lib/snapshots');
const store = require('./lib/store');
const { applyMenu } = require('./menu');

const DEV = process.argv.includes('--dev');
const SMOKE = process.argv.includes('--smoke');
const SMOKE_OBSERVER = process.argv.includes('--smoke-observer');
const ACCEPTANCE = process.argv.includes('--acceptance');
const RENDERER = path.join(__dirname, '..', 'dist', 'index.html');

// The headless checks run on CI runners with no GPU / no desktop session.
if (SMOKE || SMOKE_OBSERVER || ACCEPTANCE) {
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
  win.webContents.on('console-message', (...a) => {
    // Electron >= 37 passes a single event object; older passes (e, level, msg, line, source).
    let level, message, line, source;
    if (a[0] && typeof a[0] === 'object' && 'message' in a[0]) {
      ({ level, message, lineNumber: line, sourceId: source } = a[0]);
    } else {
      [, level, message, line, source] = a;
    }
    const isError = level === 'error' || level === 3;
    if (isError) rendererErrors.push(`${message}  (${source}:${line})`);
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
  // Normally there is exactly one window; during the --acceptance run the harness
  // owns its own window instead of `win`, so broadcast to whatever is open.
  if (win && !win.isDestroyed()) { win.webContents.send('proc:data', evt); return; }
  BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.webContents.send('proc:data', evt); });
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

  ipcMain.handle('ws:exportZip', async (_e, opts) => {
    const root = workspace.getRoot();
    if (!root) return fail('No workspace');
    const includeSovereign = !!(opts && opts.includeSovereign);
    const r = await dialog.showSaveDialog(win, {
      title: 'Export project as ZIP',
      defaultPath: path.join(app.getPath('downloads'), workspace.name() + '.zip'),
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
    });
    if (r.canceled || !r.filePath) return null;
    try {
      const tree = await workspace.readTree();
      const entries = [];
      let excluded = 0;
      for (const f of tree.files) {
        if (!includeSovereign && f.path.indexOf('/.sovereign/') === 0) { excluded++; continue; }
        const name = f.path.replace(/^\//, '');
        if (f.binary || f.content == null) {
          const abs = workspace.resolveInside(f.path);
          entries.push({ name, data: await fsp.readFile(abs) });
        } else {
          entries.push({ name, data: f.content });
        }
      }
      await fsp.writeFile(r.filePath, zip.build(entries));
      return ok({ path: r.filePath, fileCount: entries.length, sovereignExcluded: excluded });
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
     No ARBITRARY programmatic spawn is exposed. The renderer gets:
       proc:shell         -> the OS shell only (the user then types into it)
       proc:run           -> an allowlisted project tool, one-shot, workspace-scoped
       proc:spawnAllowed  -> same allowlist, but streamed for long jobs (install/build)
     Nothing runs in a workspace the user has not explicitly trusted. */

  // Ask once per workspace; the exact command + cwd is shown before anything runs.
  async function ensureTrusted(cmdLabel) {
    const root = workspace.getRoot();
    if (!root) throw new Error('No project folder is open');
    if (trust.isTrusted(root)) return root;
    const r = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Run project commands?',
      message: 'CodeSovereign wants to run a command from this project.',
      detail:
        'Folder:  ' + root + '\n' +
        'Command: ' + cmdLabel + '\n\n' +
        "A project's package.json scripts run with your account's permissions. " +
        'Only trust folders whose code you have reviewed.',
      buttons: ['Trust this folder & run', 'Cancel'],
      defaultId: 1, cancelId: 1, noLink: true
    });
    if (r.response !== 0) { const e = new Error('Command declined — folder not trusted'); e.code = 'EUNTRUSTED'; throw e; }
    trust.grant(root);
    rebuildMenu();
    return root;
  }

  ipcMain.handle('proc:shell', async (_e, cwd) => {
    try {
      await ensureTrusted('interactive shell');
      const r = proc.spawnShell(procEvent, typeof cwd === 'string' ? cwd : '.');
      trust.audit({ kind: 'shell', cwd: workspace.getRoot(), pid: r.pid });
      return ok(r);
    } catch (e) { return fail(e); }
  });
  ipcMain.handle('proc:spawnAllowed', async (_e, opts) => {
    try {
      const o = opts || {};
      if (typeof o.cmd !== 'string' || !Array.isArray(o.args)) return fail('cmd/args required');
      const label = o.cmd + ' ' + o.args.map(String).join(' ');
      await ensureTrusted(label);
      const r = proc.spawnAllowed({ cmd: o.cmd, args: o.args.map(String), cwd: typeof o.cwd === 'string' ? o.cwd : '.', timeoutMs: o.timeoutMs }, procEvent);
      trust.audit({ kind: 'spawn', cmd: label, cwd: workspace.getRoot(), pid: r.pid });
      return ok(r);
    } catch (e) { return fail(e); }
  });
  ipcMain.handle('proc:write', (_e, id, data) => {
    if (typeof id === 'string' && typeof data === 'string') proc.write(id, data.slice(0, 100000));
  });
  ipcMain.handle('proc:kill', (_e, id) => { if (typeof id === 'string') proc.kill(id); });
  ipcMain.handle('proc:killAll', () => { proc.killAll(); return ok(); });
  ipcMain.handle('proc:running', () => proc.running());
  ipcMain.handle('proc:run', async (_e, opts) => {
    try {
      const o = opts || {};
      if (typeof o.cmd !== 'string' || !Array.isArray(o.args)) return fail('cmd/args required');
      const label = o.cmd + ' ' + o.args.map(String).join(' ');
      await ensureTrusted(label);
      const res = await proc.runManaged({ cmd: o.cmd, args: o.args.map(String), cwd: typeof o.cwd === 'string' ? o.cwd : '.', timeoutMs: o.timeoutMs });
      trust.audit({ kind: 'run', cmd: label, cwd: workspace.getRoot(), code: res.code });
      return ok(res);
    } catch (e) { return fail(e); }
  });

  /* ---- workspace trust ---- */
  ipcMain.handle('trust:status', () => {
    const root = workspace.getRoot();
    return { root, trusted: root ? trust.isTrusted(root) : false };
  });
  ipcMain.handle('trust:grant', () => { const r = workspace.getRoot(); if (r) { trust.grant(r); rebuildMenu(); } return ok({ trusted: true }); });
  ipcMain.handle('trust:revoke', () => { const r = workspace.getRoot(); if (r) { trust.revoke(r); rebuildMenu(); } return ok({ trusted: false }); });
  ipcMain.handle('trust:audit', (_e, limit) => trust.readAudit(typeof limit === 'number' ? limit : 200));

  /* ---- runtime observer (hidden BrowserWindow, localhost/workspace only) ---- */
  ipcMain.handle('obs:load', async (_e, target) => {
    try { return ok(await observer.load(String(target || ''))); } catch (e) { return fail(e); }
  });
  ipcMain.handle('obs:read', async () => {
    try { return ok(await observer.read()); } catch (e) { return fail(e); }
  });
  ipcMain.handle('obs:crawl', async (_e, opts) => {
    try {
      const o = opts || {};
      if (o.mode === 'interactive') {
        const r = await dialog.showMessageBox(win, {
          type: 'warning', noLink: true,
          title: 'Interactive observation',
          message: 'Run the observer in INTERACTIVE mode?',
          detail: 'It will click controls that look like they submit forms, send messages, or change data. Only do this against a disposable dev environment with test data.',
          buttons: ['Run interactive', 'Cancel'], defaultId: 1, cancelId: 1
        });
        if (r.response !== 0) return fail('interactive observation declined');
      }
      return ok(await observer.crawl({ max: o.max, mode: o.mode === 'interactive' ? 'interactive' : 'observe' }));
    } catch (e) { return fail(e); }
  });
  ipcMain.handle('obs:screenshot', async () => {
    try { return ok({ dataUrl: await observer.screenshot() }); } catch (e) { return fail(e); }
  });
  ipcMain.handle('obs:stop', () => { observer.stop(); return ok(); });

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

    if (SMOKE_OBSERVER) { runObserverSmoke(); return; }
    if (ACCEPTANCE) { require('./acceptance').run(); return; }

    createWindow();

    if (SMOKE) {
      setTimeout(() => { console.log('[smoke] window created OK'); app.exit(0); }, 7000);
    }

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { proc.killAll(); observer.stop(); });
}

/* -------- observer integration check: serve a fixture page, crawl it -------- */
async function runObserverSmoke() {
  const http = require('http');
  const os = require('os');
  const fsp = require('fs/promises');
  const PAGE = `<!doctype html><html><body>
    <button id="real" onclick="fetch('/api').then(()=>{document.body.appendChild(document.createElement('p'))})">Load data</button>
    <a id="dead" href="#">Nowhere</a>
    <button id="boom" onclick="throw new Error('kaboom')">Break</button>
    <button id="danger" onclick="window.__deleted=true">Delete account</button>
    <img id="ext" src="https://evil.example.com/tracker.gif">
  </body></html>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/api') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":1}'); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = 'http://localhost:' + port + '/';

  // observer's file:// policy needs a workspace root; give it a temp one
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'cs-obs-'));
  workspace.setRoot(tmp);

  let exit = 0;
  try {
    // URL policy
    let blocked = false;
    try { observer.assertAllowedUrl('https://evil.example.com/'); } catch { blocked = true; }
    console.log('[obs-smoke] external URL blocked:', blocked);
    if (!blocked) exit = 1;

    const loaded = await observer.load(base);
    console.log('[obs-smoke] loaded:', JSON.stringify(loaded));

    const trace = await observer.crawl({ max: 10, mode: 'observe' });
    const byId = {};
    (trace.trace || []).forEach((t) => { byId[t.control.name.toLowerCase()] = t.status; });
    console.log('[obs-smoke] byStatus:', JSON.stringify(trace.byStatus));
    console.log('[obs-smoke] per-control:', JSON.stringify(byId));
    console.log('[obs-smoke] console errors captured:', (trace.consoleErrors || []).length);
    console.log('[obs-smoke] network calls seen:', (trace.network || []).length);
    console.log('[obs-smoke] blocked requests:', JSON.stringify((trace.blockedRequests || []).map((b) => b.kind)));
    console.log('[obs-smoke] actionLog kinds:', JSON.stringify((trace.actionLog || []).map((a) => a.kind)));

    const pass =
      byId['load data'] === 'REAL' &&
      byId['nowhere'] === 'MOCK' &&
      byId['break'] === 'BROKEN' &&
      byId['delete account'] === 'SKIPPED' &&              // destructive control not activated
      (trace.network || []).some((n) => /\/api$/.test(n.url)) &&
      (trace.blockedRequests || []).some((b) => b.kind === 'blocked-request');  // the external <img> was blocked
    console.log('[obs-smoke] ' + (pass ? 'PASS' : 'FAIL'));
    if (!pass) exit = 1;
  } catch (e) {
    console.error('[obs-smoke] error:', e && e.stack || e);
    exit = 1;
  } finally {
    observer.stop();
    server.close();
    try { await fsp.rm(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    app.exit(exit);
  }
}
