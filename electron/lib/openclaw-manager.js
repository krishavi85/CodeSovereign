'use strict';
/*
 * openclaw-manager.js — main-process lifecycle manager for OpenClaw (a local
 * agent gateway, MIT). Pure Node (no Electron API), driven entirely over
 * IPC from main.js — the renderer never shells out itself.
 *
 * Lifecycle (verified live against openclaw 2026.7.1-2 on Windows, a
 * Scheduled Task-backed Gateway service):
 *
 *   detect -> installed? --no-> install (npm install -g openclaw)
 *          --yes-> status --> needs onboarding? --yes-> openOnboarding()
 *                          --no--> gateway installed? --no-> gatewayInstall()
 *                                                     --yes-> gatewayStart()
 *                                  -> gatewayStatus() -> probe(127.0.0.1:18789) -> ready
 *
 * Prefers the `openclaw` binary directly (on PATH after `npm install -g
 * openclaw`, or the official platform installer) over `npx openclaw ...` on
 * every call — npx re-resolves/downloads on every invocation, which is both
 * slower and noisier than calling an already-installed CLI.
 *
 * `gateway status|install|start|stop|restart|probe` all support `--json`,
 * verified live. Two things learned from real output that the JSON parsing
 * below accounts for:
 *   - these commands can exit non-zero (e.g. `status` when the gateway is
 *     down) while still printing valid, authoritative JSON on stdout — the
 *     exit code is not itself a failure signal, the JSON is.
 *   - immediately after `start`, the OS service can report
 *     service.runtime.status === "running" (the process was launched) for a
 *     few seconds before the WebSocket port is actually bound — `rpc.ok`
 *     (or port.status === "busy") is the true "ready" signal, not the
 *     service runtime status alone.
 *
 * A fresh install has no config: `openclaw onboard` (alias `setup`) is the
 * first-run wizard; `openclaw configure` edits an *existing* config and is
 * not the right first call. Onboarding is interactive, so it can't be
 * driven headlessly over IPC — openOnboarding() opens a real terminal
 * window running it, same as a user would from a shell.
 */
const http = require('http');
const { execFile, spawn } = require('child_process');

const GATEWAY_PORT = 18789;
const BIN = 'openclaw';

function run(args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(BIN, args, { timeout: timeoutMs || 20000, windowsHide: true, shell: process.platform === 'win32', maxBuffer: 1 << 20 },
      (err, stdout, stderr) => {
        resolve({ err: err || null, stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
  });
}

function runJSON(args, timeoutMs) {
  return run(args, timeoutMs).then((r) => {
    // Several of these commands exit non-zero on a "bad" but valid state
    // (gateway down, not reachable, etc.) — the JSON on stdout still holds
    // the real answer, so try to parse it before treating this as a failure.
    try { return { ok: true, json: JSON.parse(r.stdout) }; }
    catch (_) {
      return { ok: false, error: (r.stderr || (r.err && r.err.message) || 'openclaw produced no JSON output').trim() };
    }
  });
}

/* ---- detect: is the `openclaw` CLI on PATH? ---- */
async function detect() {
  const r = await run(['--version'], 15000);
  const m = /(\d+\.\d+\.\d+(?:-\d+)?)/.exec(r.stdout);
  return m ? { installed: true, version: m[1] } : { installed: false };
}

/* ---- install: npm install -g openclaw. The official Windows installer
   also installs the CLI, but this app never downloads/runs installers on
   the user's behalf — npm global install is the scriptable, officially
   supported alternative. ---- */
function install(onStatus) {
  return new Promise((resolve) => {
    if (onStatus) onStatus('installing OpenClaw globally via npm…');
    let child;
    try {
      child = spawn('npm', ['install', '-g', 'openclaw'], { windowsHide: true, shell: process.platform === 'win32' });
    } catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); return; }
    let out = '';
    const onData = (d) => { out += d; if (onStatus) onStatus(String(d).trimEnd()); };
    if (child.stdout) child.stdout.on('data', onData);
    if (child.stderr) child.stderr.on('data', onData);
    child.on('error', (e) => resolve({ ok: false, error: String(e && e.message || e) }));
    child.on('exit', async (code) => {
      if (code !== 0) { resolve({ ok: false, error: 'npm install -g openclaw exited ' + code, output: out }); return; }
      const d = await detect();
      resolve(d.installed
        ? { ok: true, version: d.version }
        : { ok: false, error: 'npm reported success but `openclaw` is still not on PATH — you may need to restart the app', output: out });
    });
  });
}

/* ---- fast, dependency-free reachability probe (the flowchart's final
   "Probe 127.0.0.1:18789" step) — no CLI spawn, safe to poll often. ---- */
function probe() {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: GATEWAY_PORT, path: '/', method: 'GET', timeout: 1500 }, (res) => {
      res.resume();
      resolve({ ready: res.statusCode > 0, statusCode: res.statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ready: false }); });
    req.on('error', () => resolve({ ready: false }));
    req.end();
  });
}

/* ---- combined status: detect + config/onboarding + gateway service +
   readiness, in one call — everything the UI card needs to render its
   state without the renderer chaining multiple IPC round-trips. ---- */
async function getStatus() {
  const d = await detect();
  if (!d.installed) return { installed: false, phase: 'not-installed' };

  const r = await runJSON(['gateway', 'status', '--json', '--timeout', '5000'], 15000);
  if (!r.ok) return { installed: true, version: d.version, phase: 'unknown', error: r.error };

  const j = r.json;
  const configExists = !!(j.config && j.config.cli && j.config.cli.exists && j.config.cli.valid);
  const serviceInstalled = !!(j.service && j.service.loaded);
  const serviceStatus = (j.service && j.service.runtime && j.service.runtime.status) || 'unknown';
  const ready = !!(j.rpc && j.rpc.ok) || !!(j.port && j.port.status === 'busy');

  let phase;
  if (!configExists) phase = 'needs-onboarding';
  else if (!serviceInstalled) phase = 'gateway-not-installed';
  else if (ready) phase = 'running';
  else if (serviceStatus === 'running') phase = 'starting'; // launched, port not bound yet
  else phase = 'stopped';

  return {
    installed: true, version: d.version, phase: phase,
    needsOnboarding: !configExists,
    configPath: j.config && j.config.cli && j.config.cli.path,
    gateway: {
      installed: serviceInstalled,
      serviceStatus: serviceStatus,
      ready: ready,
      port: (j.gateway && j.gateway.port) || GATEWAY_PORT,
      dashboardUrl: (j.gateway && j.gateway.controlUiLinks && j.gateway.controlUiLinks.httpUrl) || ('http://127.0.0.1:' + GATEWAY_PORT + '/')
    }
  };
}

/* ---- gateway service lifecycle ---- */
function gatewayInstall() { return runJSON(['gateway', 'install', '--json'], 30000); }
function gatewayStart() { return runJSON(['gateway', 'start', '--json'], 30000); }
function gatewayStop() { return runJSON(['gateway', 'stop', '--json'], 20000); }
function gatewayRestart() { return runJSON(['gateway', 'restart', '--json'], 30000); }

/* ---- open the interactive first-run wizard in a real terminal window.
   Onboarding picks providers/credentials interactively — it cannot be
   driven headlessly over IPC, so this opens a visible terminal the same
   way a user running `openclaw onboard` from a shell would get one. ---- */
function openOnboarding() {
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', 'openclaw onboard'], { windowsHide: false, detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('osascript', ['-e', 'tell application "Terminal" to do script "openclaw onboard"'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const term = process.env.TERMINAL || 'x-terminal-emulator';
      spawn(term, ['-e', 'openclaw onboard'], { detached: true, stdio: 'ignore' }).unref();
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

module.exports = {
  GATEWAY_PORT, detect, install, getStatus, probe,
  gatewayInstall, gatewayStart, gatewayStop, gatewayRestart, openOnboarding
};
