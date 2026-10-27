'use strict';
/* One-click Hermes Agent install and run (electron/lib/hermes-manager.js).
 * child_process / cross-spawn are replaced with scripted fakes and the API server is a real local HTTP server
 * answering the way the documented one does (GET /v1/models). This proves our side of the lifecycle; it is NOT a
 * run against a real Hermes Agent install (none is available on the development machine). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const EE = require('events');
const Module = require('module');

function makeChild(script) {
  const c = new EE();
  c.stdout = new EE(); c.stderr = new EE(); c.pid = undefined; c.exitCode = null; c.killed = false;
  c.unref = () => {};
  c.kill = () => { c.killed = true; c.exitCode = 1; setImmediate(() => c.emit('close', 1)); return true; };
  setImmediate(() => script(c));
  return c;
}

function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

module.exports = async function (t) {
  const calls = { cs: [], sp: [] };
  let csBehaviour = () => ({ code: 0, stdout: '' });
  let spBehaviour = () => ({ code: 0, out: '' });

  const fakeCS = (bin, args) => {
    calls.cs.push({ bin, args });
    const b = csBehaviour(bin, args) || {};
    return makeChild((c) => {
      if (b.hang) return;
      if (b.enoent) { const e = new Error('spawn ' + bin + ' ENOENT'); e.code = 'ENOENT'; c.emit('error', e); return; }
      if (b.stdout) c.stdout.emit('data', b.stdout);
      if (b.stderr) c.stderr.emit('data', b.stderr);
      c.emit('close', b.code == null ? 0 : b.code);
    });
  };
  const fakeChildProcess = Object.assign({}, require('child_process'), {
    spawn: (cmd, args) => {
      calls.sp.push({ cmd, args });
      const b = spBehaviour(cmd, args) || {};
      return makeChild((c) => {
        if (b.spawnError) { const e = new Error('spawn ' + cmd + ' ENOENT'); e.code = 'ENOENT'; c.emit('error', e); return; }
        c.emit('spawn');
        if (b.out) c.stdout.emit('data', b.out);
        if (!b.stayOpen) c.emit('close', b.code == null ? 0 : b.code);
      });
    }
  });

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-hermes-home-'));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA };
  process.env.HOME = home; process.env.USERPROFILE = home; process.env.LOCALAPPDATA = path.join(home, 'Local');
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === 'cross-spawn') return fakeCS;
    if (request === 'child_process') return fakeChildProcess;
    return origLoad.apply(this, arguments);
  };
  const mgrPath = path.resolve(__dirname, '..', 'electron', 'lib', 'hermes-manager.js');
  delete require.cache[mgrPath];
  const mgr = require(mgrPath);
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const setPlatform = (p) => Object.defineProperty(process, 'platform', { value: p, configurable: true });

  try {
    /* ---- the install command is the vendor's documented one, from a constant URL ---- */
    setPlatform('win32');
    let c = mgr.installCommand();
    t.ok('Windows: powershell runs the documented iex (irm install.ps1)', c.cmd === 'powershell.exe' && c.args[c.args.length - 1] === 'iex (irm https://hermes-agent.nousresearch.com/install.ps1)' && c.args.includes('-NoProfile'));
    setPlatform('linux');
    c = mgr.installCommand();
    t.ok('Linux/macOS: bash runs the documented curl | bash from the vendor URL', c.cmd === 'bash' && c.args[1] === 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash');
    t.ok('both are https URLs on the vendor domain', /^https:\/\/hermes-agent\.nousresearch\.com\//.test(mgr.installCommand().url) && mgr.DOWNLOAD_PAGE === 'https://hermes-agent.nousresearch.com/');
    Object.defineProperty(process, 'platform', platform);

    /* ---- detect ---- */
    mgr._reset();
    csBehaviour = (bin, args) => (args[0] === '--version' ? { code: 0, stdout: 'Hermes Agent 0.9.1\n' } : { code: 0 });
    let d = await mgr.detect();
    t.ok('detect finds hermes on PATH and reads the version', d.installed === true && d.version === '0.9.1' && d.bin === 'hermes');

    mgr._reset();
    csBehaviour = () => ({ enoent: true });
    d = await mgr.detect();
    t.ok('nothing installed: detect says so', d.installed === false);

    mgr._reset();
    const localBin = path.join(home, '.local', 'bin', process.platform === 'win32' ? 'hermes.exe' : 'hermes');
    fs.mkdirSync(path.dirname(localBin), { recursive: true }); fs.writeFileSync(localBin, '');
    csBehaviour = (bin) => (bin === 'hermes' ? { enoent: true } : { code: 0, stdout: 'hermes 1.2.3' });
    d = await mgr.detect();
    t.ok('right after an install, when PATH does not know hermes yet, the usual install folder is checked', d.installed === true && d.version === '1.2.3' && d.bin === localBin);

    /* ---- install ---- */
    mgr._reset(); calls.sp.length = 0;
    csBehaviour = (bin, args) => ({ code: 0, stdout: 'hermes 0.9.1' });
    spBehaviour = () => ({ out: 'downloading…\ninstalled\n', code: 0 });
    const lines = [];
    let r = await mgr.install((s) => lines.push(s));
    t.ok('a successful install is detected afterwards and reported with the version', r.ok === true && r.version === '0.9.1' && calls.sp.length === 1);
    t.ok('the installer output is streamed to the caller', lines.some((l) => /installed/.test(l)));

    mgr._reset();
    spBehaviour = () => ({ out: 'boom', code: 2 });
    r = await mgr.install(() => {});
    t.ok('a failing installer is reported with its exit code', r.ok === false && /exited with code 2/.test(r.error));

    mgr._reset();
    spBehaviour = () => ({ out: 'ok', code: 0 });
    csBehaviour = () => ({ enoent: true });
    r = await mgr.install(() => {});
    t.ok('installed but not yet visible to this app: it says to restart (not a false failure)', r.ok === true && r.installedButNotFound === true && /Restart CodeSovereign/.test(r.note));

    /* ---- the setup terminal: a missing terminal emulator is an asynchronous spawn error ---- */
    mgr._reset(); setPlatform('linux');
    process.env.TERMINAL = 'definitely-not-a-terminal';
    spBehaviour = () => ({ spawnError: true });
    r = await mgr.openSetup();
    t.ok('a terminal that cannot start is reported as a recoverable error naming what to do, not an unhandled exception', r.ok === false && /Could not open a terminal/.test(r.error) && /hermes setup/.test(r.error));
    spBehaviour = () => ({ stayOpen: true });
    r = await mgr.openSetup();
    t.ok('and when it starts the button reports success only after the process really spawned', r.ok === true);
    delete process.env.TERMINAL; Object.defineProperty(process, 'platform', platform);

    /* ---- API server setup ---- */
    mgr._reset(); calls.cs.length = 0;
    csBehaviour = (bin, args) => (args[0] === '--version' ? { code: 0, stdout: 'hermes 0.9.1' } : { code: 0 });
    r = await mgr.setupApiServer();
    const sets = calls.cs.filter((x) => x.args[0] === 'config');
    t.ok('the documented config commands are run, enabling the server and setting a key', r.ok === true && sets.length === 2 && sets[0].args.join(' ') === 'config set API_SERVER_ENABLED true' && sets[1].args.slice(0, 3).join(' ') === 'config set API_SERVER_KEY');
    t.ok('the key is random (48 hex chars), differs between calls, and is what was handed to Hermes', /^[0-9a-f]{48}$/.test(r.key) && sets[1].args[3] === r.key && (await mgr.setupApiServer()).key !== r.key);
    mgr._reset();
    csBehaviour = (bin, args) => (args[0] === '--version' ? { code: 0, stdout: 'hermes 0.9.1' } : (args[2] === 'API_SERVER_KEY' ? { code: 1, stderr: 'cannot write ' + args[3] } : { code: 0 }));
    r = await mgr.setupApiServer({ key: 'supersecretkey123456' });
    t.ok('a failed step is an error, and the key is not echoed in it', r.ok === false && !/supersecretkey123456/.test(r.error));
    mgr._reset(); csBehaviour = () => ({ enoent: true });
    r = await mgr.setupApiServer();
    t.ok('without Hermes installed it refuses', r.ok === false && /not installed/.test(r.error));

    /* ---- the probe, against a real local server ---- */
    const api = await listen((req, res) => {
      if (req.url === '/v1/models' && req.headers.authorization === 'Bearer goodkey') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ object: 'list', data: [{ id: 'hermes-agent' }] })); }
      else if (req.url === '/v1/models') { res.writeHead(401); res.end('{"error":"unauthorized"}'); }
      else { res.writeHead(404); res.end(); }
    });
    let pr = await mgr.probe({ port: api.port, key: 'goodkey' });
    t.ok('probe: key accepted -> ok with the model list', pr.reachable && pr.ok && pr.models.join() === 'hermes-agent' && pr.needsKey === false);
    pr = await mgr.probe({ port: api.port, key: 'wrong' });
    t.ok('probe: wrong or missing key -> running, needs the key', pr.reachable && !pr.ok && pr.needsKey === true && pr.status === 401);
    const closedPort = await new Promise((resolve) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    pr = await mgr.probe({ port: closedPort });
    t.ok('probe: nothing listening -> not reachable', pr.reachable === false);

    /* ---- the gateway process ---- */
    calls.cs.length = 0;
    const status = [];
    // a gateway that stays alive: use a custom fake for it
    const fakeGateway = (bin, args) => {
      calls.cs.push({ bin, args });
      if (args[0] === '--version') return makeChild((c) => { c.stdout.emit('data', 'hermes 0.9.1'); c.emit('close', 0); });
      return makeChild((c) => { c.stdout.emit('data', 'Bearer goodkey and API_SERVER_KEY goodkey\n[API Server] listening\n'); });
    };
    // swap the fake for this section
    Module._load = function (request) { if (request === 'cross-spawn') return fakeGateway; if (request === 'child_process') return fakeChildProcess; return origLoad.apply(this, arguments); };
    delete require.cache[mgrPath];
    const mgr2 = require(mgrPath);
    const start = await mgr2.startGateway((s) => status.push(s), { key: 'goodkey', port: api.port, waitMs: 8000 });
    t.ok('startGateway: runs `hermes gateway` and is ready once the API answers', start.ok === true && start.ready === true && calls.cs.some((x) => x.args[0] === 'gateway') && mgr2.gatewayRunning() === true);
    t.ok('the key never appears in the status lines handed to the UI', status.length >= 1 && !status.some((l) => /goodkey/.test(l)) && status.some((l) => /\*\*\*/.test(l)));
    const again = await mgr2.startGateway(() => {}, { key: 'goodkey', port: api.port, waitMs: 5000 });
    t.ok('starting twice does not start a second process', again.ok === true && calls.cs.filter((x) => x.args[0] === 'gateway').length === 1);
    const stopped = await mgr2.stopGateway();
    t.ok('stopGateway ends it', stopped.ok === true && stopped.wasRunning === true && mgr2.gatewayRunning() === false);
    t.ok('stopping again is harmless', (await mgr2.stopGateway()).wasRunning === false);

    // a gateway that dies at once: a clear error, not a 60 s wait
    Module._load = function (request) {
      if (request === 'cross-spawn') return (bin, args) => (args[0] === '--version' ? makeChild((c) => { c.stdout.emit('data', 'hermes 0.9.1'); c.emit('close', 0); }) : makeChild((c) => { c.exitCode = 1; c.emit('close', 1); }));
      if (request === 'child_process') return fakeChildProcess; return origLoad.apply(this, arguments);
    };
    delete require.cache[mgrPath];
    const mgr3 = require(mgrPath);
    const t0 = Date.now();
    const dead = await mgr3.startGateway(() => {}, { port: closedPort, waitMs: 20000 });
    t.ok('a gateway that exits at once is reported with what to run next, without waiting out the timeout', dead.ok === false && /hermes doctor/.test(dead.error) && Date.now() - t0 < 8000);
    api.srv.close();

    /* ---- the Electron side: fixed actions, a native confirmation for every step that installs or starts something ---- */
    const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
    const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');
    const handler = (name) => { const i = main.indexOf("ipcMain.handle('" + name + "'"); return i < 0 ? '' : main.slice(i, main.indexOf('ipcMain.handle(', i + 10)); };
    t.ok('every channel is registered and exposed', ['hermes:status', 'hermes:install', 'hermes:openSetup', 'hermes:setupApiServer', 'hermes:startGateway', 'hermes:stopGateway', 'hermes:openDownloadPage'].every((ch) => handler(ch) && preload.indexOf("'" + ch + "'") >= 0));
    t.ok('install asks first, shows the exact command and URL, and offers "open the download page instead"', /showMessageBox/.test(handler('hermes:install')) && /c\.shown/.test(handler('hermes:install')) && /Open the download page instead/.test(handler('hermes:install')) && /response !== 0\) return \{ ok: false, error: 'declined' \}/.test(handler('hermes:install')));
    t.ok('enabling the API server asks first and says it gives the agent terminal access', /showMessageBox/.test(handler('hermes:setupApiServer')) && /terminal commands/.test(handler('hermes:setupApiServer')));
    t.ok('starting the gateway asks first', /showMessageBox/.test(handler('hermes:startGateway')));
    t.ok('no handler takes a command, URL or path from the renderer (the only argument is the API key, validated)', !/hermes:(install|openSetup|setupApiServer|stopGateway|openDownloadPage)'\s*,\s*async\s*\(_e,\s*\w/.test(main) && /hermesKey\(/.test(handler('hermes:status')) && /hermesKey\(/.test(handler('hermes:startGateway')));
    t.ok('the gateway is stopped when the app quits', /before-quit[^\n]*hermesManager\.stopGateway/.test(main));
  } finally {
    Module._load = origLoad;
    Object.defineProperty(process, 'platform', platform);
    for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; }
    delete require.cache[mgrPath];
  }
};
