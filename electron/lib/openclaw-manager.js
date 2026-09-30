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
const { spawn } = require('child_process');
const crossSpawn = require('cross-spawn');
const { killTree } = require('./killtree');

const GATEWAY_PORT = 18789;
const BIN = 'openclaw';

// Same { err, stdout, stderr } contract as before, via runSafe() (cross-spawn)
// instead of execFile + shell: true: resolving the openclaw.cmd shim that way
// concatenated args into an unescaped cmd.exe line, which Node 24 flags as
// DEP0190 — this is the call that printed it at every app startup.
function run(args, timeoutMs) {
  return runSafe(args, timeoutMs);
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

// Every openclaw invocation goes through here. Node refuses to spawn the
// npm-generated openclaw.cmd shim directly, and the old workaround —
// shell: true — naively joins args into one UNESCAPED cmd.exe line.
// Confirmed live: a --message containing spaces broke the CLI's own arg
// parsing ("no command \"with\""), and shell metacharacters in a prompt
// would have been a command-injection vector. cross-spawn resolves the .cmd
// shim AND escapes each argument, with no shell involved.
function runSafe(args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = crossSpawn(BIN, args, { windowsHide: true });
    } catch (e) { resolve({ err: e, stdout: '', stderr: String(e && e.message || e) }); return; }
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs || 20000);
    if (child.stdout) child.stdout.on('data', (d) => { stdout += d; });
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ err: e, stdout, stderr }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const err = timedOut ? new Error('timed out') : (code !== 0 ? new Error('exit ' + code) : null);
      resolve({ err, stdout, stderr, timedOut });
    });
  });
}

function runJSONSafe(args, timeoutMs) {
  return runSafe(args, timeoutMs).then((r) => {
    try { return { ok: true, json: JSON.parse(r.stdout) }; }
    catch (_) {
      return { ok: false, timedOut: !!r.timedOut, error: (r.stderr || (r.err && r.err.message) || 'openclaw produced no JSON output').trim() };
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
      child = crossSpawn('npm', ['install', '-g', 'openclaw'], { windowsHide: true });
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
// `port` only exists so the test suite can probe a free port — on any machine
// that really runs OpenClaw, GATEWAY_PORT is (correctly) occupied.
function probe(port) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: port || GATEWAY_PORT, path: '/', method: 'GET', timeout: 1500 }, (res) => {
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
  // Windows Scheduled Task state; 'Disabled' means `gateway start` will refuse until it is re-registered.
  const serviceDisabled = /^disabled$/i.test(String((j.service && j.service.runtime && j.service.runtime.state) || ''));
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
      disabled: serviceDisabled,
      ready: ready,
      port: (j.gateway && j.gateway.port) || GATEWAY_PORT,
      dashboardUrl: (j.gateway && j.gateway.controlUiLinks && j.gateway.controlUiLinks.httpUrl) || ('http://127.0.0.1:' + GATEWAY_PORT + '/')
    }
  };
}

/* ---- gateway service lifecycle ----
   These print valid JSON even when the action itself failed
   ({"action":"start","ok":false,"error":"..."}), so a parsed reply is not a
   success — the renderer checks `r.ok`, and used to report "gateway started"
   for a start that never happened. */
function lifecycle(args, timeoutMs) {
  return runJSON(args, timeoutMs).then((r) => {
    if (r.ok && r.json && r.json.ok === false) {
      return { ok: false, error: String(r.json.error || ('openclaw ' + args.slice(0, 2).join(' ') + ' failed')), hints: r.json.hints || [], json: r.json };
    }
    return r;
  });
}

// Windows: `gateway start` runs the "OpenClaw Gateway" Scheduled Task and
// refuses outright when that task is Disabled — which is how a failed
// OpenClaw self-update left it on a real install ("could not run because it
// is disabled"). Plain `gateway install` answers "already-installed" and
// changes nothing; `install --force` re-registers the task enabled (verified
// live, 2026-09-27). `start` afterwards is idempotent ("already-running").
const TASK_DISABLED_RE = /\bdisabled\b/i;
async function withDisabledTaskRepair(first) {
  const r = await first();
  if (r.ok || !TASK_DISABLED_RE.test(r.error || '')) return r;
  const re = await lifecycle(['gateway', 'install', '--force', '--json'], 60000);
  if (!re.ok) return { ok: false, error: 'The Gateway service is disabled and re-registering it failed: ' + re.error };
  const again = await lifecycle(['gateway', 'start', '--json'], 120000);
  return again.ok ? Object.assign({}, again, { repaired: 'reenabled-disabled-task' }) : again;
}

// `gateway start` waits 90s for /healthz + /readyz and then reports failure,
// but on a loaded machine the Gateway binds shortly after — seen twice live on
// 2026-09-27 (ready ~5s and ~20s after the "timed out" reply). Check the port
// ourselves before telling the user it failed.
const START_TIMEOUT_RE = /timed out[^]*(healthz|readyz)/i;
async function confirmLateStart(r, waitMs, port) {
  if (r.ok || !START_TIMEOUT_RE.test(r.error || '')) return r;
  const deadline = Date.now() + (waitMs == null ? 60000 : waitMs);
  for (;;) {
    if ((await probe(port)).ready) return { ok: true, lateReady: true, note: 'Gateway became ready after the CLI stopped waiting' };
    if (Date.now() >= deadline) return r;
    await new Promise((res) => setTimeout(res, 3000));
  }
}

function gatewayInstall() { return lifecycle(['gateway', 'install', '--json'], 30000); }
// 120s: the CLI's own readiness wait is 90s — the old 30s limit killed it first.
function gatewayStart(opts) {
  opts = opts || {};
  return withDisabledTaskRepair(() => lifecycle(['gateway', 'start', '--json'], 120000)).then((r) => confirmLateStart(r, opts.lateReadyWaitMs, opts.probePort));
}
function gatewayStop() { return lifecycle(['gateway', 'stop', '--json'], 20000); }
function gatewayRestart(opts) {
  opts = opts || {};
  return withDisabledTaskRepair(() => lifecycle(['gateway', 'restart', '--json'], 120000)).then((r) => confirmLateStart(r, opts.lateReadyWaitMs, opts.probePort));
}

/* ---- run one agent turn through the Gateway (`openclaw agent --json`) ----
   The officially-supported single-shot path — confirmed via `openclaw agent
   --help` — instead of hand-rolling the WebSocket Gateway protocol (which
   needs the @openclaw/gateway-client package plus a device-pairing auth
   flow). Same execFile/runJSON convention as every other command here. */
function runAgentTurn(opts) {
  opts = opts || {};
  const args = ['agent', '--json'];
  if (opts.agentId) args.push('--agent', opts.agentId);
  if (opts.sessionKey) args.push('--session-key', opts.sessionKey);
  if (opts.model) args.push('--model', opts.model);
  // BUG FOUND LIVE: opts.timeoutSec used to feed only our own kill-timer
  // below, never the CLI's own --timeout flag — so the CLI always fell
  // back to its 600s config default regardless of what was requested here,
  // confirmed by two live runs both stopping at ~600s even when this was
  // called with timeoutSec: 900. Forwarding it explicitly now.
  const timeoutSec = opts.timeoutSec || 600;
  args.push('--timeout', String(timeoutSec));
  args.push('--message', String(opts.message || ''));
  // Headroom over the CLI's own --timeout so our own timeout never races
  // the CLI's internal one (it would report a less useful error).
  const timeoutMs = Math.max(30000, timeoutSec * 1000 + 15000);
  // NOTE: killing this CLI process does NOT stop the Gateway's run — Ollama's
  // request log showed it continuing (and re-requesting the model) for ~12
  // minutes after our limit fired. `gateway call chat.abort` looked like the
  // fix, but with a run actually active the Gateway rejects it
  // ("INVALID_REQUEST: unauthorized" — one connection can't abort another's
  // run), so there is currently no way to cancel it from here.
  return runJSONSafe(args, timeoutMs);
}

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
  gatewayInstall, gatewayStart, gatewayStop, gatewayRestart, openOnboarding,
  runAgentTurn
};
