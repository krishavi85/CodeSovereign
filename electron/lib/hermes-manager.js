'use strict';
/*
 * hermes-manager.js — install and run the Hermes Agent (Nous Research) from inside CodeSovereign.
 *
 * Pure Node (no Electron API); main.js drives it over IPC and shows the confirmation dialogs. Everything the
 * renderer can trigger is a fixed action: it never supplies a command, a URL or a path.
 *
 * Lifecycle (commands are the vendor's documented ones, https://hermes-agent.nousresearch.com/docs):
 *   detect        `hermes --version`
 *   install       Windows:  powershell  iex (irm https://hermes-agent.nousresearch.com/install.ps1)
 *                 Linux/macOS/WSL:  bash -c "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash"
 *   openSetup     opens a real terminal running `hermes setup` (choosing a provider and model is interactive)
 *   setupApiServer  `hermes config set API_SERVER_ENABLED true`, `hermes config set API_SERVER_KEY <random>`
 *                 (Hermes requires a key for its API server, even on loopback)
 *   startGateway  `hermes gateway` (kept as a child process we can stop), ready when GET /v1/models answers
 *   stopGateway   ends that process tree
 *
 * The API server gives the agent its full toolset, terminal commands included. It listens on 127.0.0.1 only
 * and is protected by the generated key; the key is returned to the renderer once, to be stored in the OS
 * keychain, and is never written to a log or a status line.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const crossSpawn = require('cross-spawn');
const { killTree } = require('./killtree');

const API_PORT = 8642;
const INSTALL_URL_WIN = 'https://hermes-agent.nousresearch.com/install.ps1';
const INSTALL_URL_POSIX = 'https://hermes-agent.nousresearch.com/install.sh';
const DOWNLOAD_PAGE = 'https://hermes-agent.nousresearch.com/';
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;

let foundBin = null;      // the hermes executable detect() last found
let gateway = null;       // { child, startedAt } for the gateway we started

function installCommand() {
  if (process.platform === 'win32') {
    return { cmd: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'iex (irm ' + INSTALL_URL_WIN + ')'], url: INSTALL_URL_WIN, shown: 'iex (irm ' + INSTALL_URL_WIN + ')' };
  }
  return { cmd: 'bash', args: ['-c', 'curl -fsSL ' + INSTALL_URL_POSIX + ' | bash'], url: INSTALL_URL_POSIX, shown: 'curl -fsSL ' + INSTALL_URL_POSIX + ' | bash' };
}

// where `hermes` may be right after an install, before this process's PATH knows about it
function candidates() {
  const home = os.homedir();
  const list = ['hermes'];
  const ext = process.platform === 'win32' ? '.exe' : '';
  list.push(path.join(home, '.local', 'bin', 'hermes' + ext));
  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) list.push(path.join(process.env.LOCALAPPDATA, 'hermes', 'hermes.exe'), path.join(process.env.LOCALAPPDATA, 'Programs', 'hermes', 'hermes.exe'));
    list.push(path.join(home, '.hermes', 'bin', 'hermes.exe'));
  } else {
    list.push(path.join(home, '.hermes', 'bin', 'hermes'));
  }
  return list;
}

// one run of the CLI; a process killed on timeout reports a timeout (Node also emits a bogus ENOENT then)
function run(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try { child = crossSpawn(bin, args, { windowsHide: true }); }
    catch (e) { resolve({ code: -1, stdout: '', stderr: String(e && e.message || e), spawnError: e }); return; }
    let stdout = '', stderr = '', timedOut = false, done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs || 20000);
    if (child.stdout) child.stdout.on('data', (d) => { stdout += d; });
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => finish(timedOut ? { code: -2, stdout, stderr, timedOut: true } : { code: -1, stdout, stderr: stderr || String(e && e.message || e), spawnError: e }));
    child.on('close', (code) => finish({ code: timedOut ? -2 : (code == null ? -1 : code), stdout, stderr, timedOut }));
  });
}

async function detect() {
  const order = foundBin ? [foundBin].concat(candidates()) : candidates();
  for (const bin of order) {
    if (bin !== 'hermes' && !fs.existsSync(bin)) continue;
    const r = await run(bin, ['--version'], 20000);
    const m = r.code === 0 && /(\d+\.\d+\.\d+[\w.+-]*)/.exec(r.stdout + ' ' + r.stderr);
    if (m) { foundBin = bin; return { installed: true, version: m[1], bin }; }
  }
  return { installed: false };
}

function bin() { return foundBin || 'hermes'; }

/* ---- install: the vendor's documented one-liner, from a constant URL, output streamed ---- */
function install(onStatus) {
  return new Promise((resolve) => {
    const c = installCommand();
    if (onStatus) onStatus('Running the Hermes Agent installer (' + c.url + ')…');
    let child;
    try { child = spawn(c.cmd, c.args, { windowsHide: true }); }
    catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); return; }
    let out = '', finished = false;
    const timer = setTimeout(() => { if (!finished) { killTree(child); } }, INSTALL_TIMEOUT_MS);
    const onData = (d) => { out = (out + d).slice(-20000); if (onStatus) onStatus(String(d).trimEnd()); };
    if (child.stdout) child.stdout.on('data', onData);
    if (child.stderr) child.stderr.on('data', onData);
    child.on('error', (e) => { if (finished) return; finished = true; clearTimeout(timer); resolve({ ok: false, error: String(e && e.message || e) }); });
    child.on('close', async (code) => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (code !== 0) { resolve({ ok: false, error: 'The installer exited with code ' + code, output: out.slice(-4000) }); return; }
      foundBin = null;
      const d = await detect();
      resolve(d.installed
        ? { ok: true, version: d.version }
        : { ok: true, installedButNotFound: true, note: 'The installer finished but this app cannot see the new "hermes" command yet. Restart CodeSovereign so it picks up the updated PATH.', output: out.slice(-2000) });
    });
  });
}

/* ---- the terminal wizard: choosing a provider and model is interactive ---- */
// Resolves once the terminal has really started, or with the spawn error: a missing terminal emulator is reported
// asynchronously by the child process, after any try/catch has already returned.
function openSetup() {
  const b = bin();
  let cmd, args;
  if (process.platform === 'win32') { cmd = 'cmd.exe'; args = ['/c', 'start', '""', 'cmd.exe', '/k', (/\s/.test(b) ? '"' + b + '"' : b) + ' setup']; }
  else if (process.platform === 'darwin') { cmd = 'osascript'; args = ['-e', 'tell application "Terminal" to do script "' + b.replace(/"/g, '') + ' setup"']; }
  else { cmd = process.env.TERMINAL || 'x-terminal-emulator'; args = ['-e', b + ' setup']; }
  return new Promise((resolve) => {
    let child, settled = false, timer = null;
    const done = (v) => { if (!settled) { settled = true; if (timer) clearTimeout(timer); resolve(v); } };
    try { child = spawn(cmd, args, { windowsHide: false, detached: true, stdio: 'ignore' }); }
    catch (e) { done({ ok: false, error: String(e && e.message || e) }); return; }
    child.once('error', (e) => done({ ok: false, error: 'Could not open a terminal (' + cmd + '): ' + String(e && (e.code || e.message) || e) + '. Run "hermes setup" in a terminal yourself.' }));
    child.once('spawn', () => { try { child.unref(); } catch (_) { /* already detached */ } done({ ok: true }); });
    timer = setTimeout(() => done({ ok: true }), 3000);      // a 'spawn' event that never comes must not hang the button
  });
}

/* ---- the API server: enabled with a random key through the documented `hermes config set` ---- */
async function setupApiServer(opts) {
  const d = await detect();
  if (!d.installed) return { ok: false, error: 'Hermes Agent is not installed.' };
  const key = (opts && opts.key) || crypto.randomBytes(24).toString('hex');
  const a = await run(bin(), ['config', 'set', 'API_SERVER_ENABLED', 'true'], 30000);
  if (a.code !== 0) return { ok: false, error: 'hermes config set API_SERVER_ENABLED failed: ' + (a.stderr || a.stdout).trim().slice(0, 300) };
  const b = await run(bin(), ['config', 'set', 'API_SERVER_KEY', key], 30000);
  if (b.code !== 0) return { ok: false, error: 'hermes config set API_SERVER_KEY failed: ' + (b.stderr || b.stdout).trim().replace(key, '***').slice(0, 300) };
  // a gateway we started keeps the key it was started with: tell the caller so it can restart it
  return { ok: true, key, gatewayWasRunning: gatewayRunning() };       // the caller stores the key in the OS keychain; it is not kept here
}

/* ---- is the API server answering? (GET /v1/models, the same probe the app uses) ---- */
function probe(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const headers = {};
    if (o.key) headers.Authorization = 'Bearer ' + o.key;
    const req = http.get({ host: o.host || '127.0.0.1', port: o.port || API_PORT, path: '/v1/models', headers, timeout: o.timeoutMs || 3000 }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        let models = [];
        try { models = ((JSON.parse(body) || {}).data || []).map((m) => m && m.id).filter(Boolean); } catch (_) {}
        resolve({ reachable: true, ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, needsKey: res.statusCode === 401 || res.statusCode === 403, models });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ reachable: false, ok: false, status: 0, needsKey: false, models: [], error: 'timed out' }); });
    req.on('error', (e) => resolve({ reachable: false, ok: false, status: 0, needsKey: false, models: [], error: String(e && e.code || e && e.message || e) }));
  });
}

/* ---- the gateway process (it serves the API) ---- */
function gatewayRunning() { return !!(gateway && gateway.child && gateway.child.exitCode == null && !gateway.child.killed); }

async function startGateway(onStatus, opts) {
  const o = opts || {};
  const d = await detect();
  if (!d.installed) return { ok: false, error: 'Hermes Agent is not installed.' };
  if (!gatewayRunning()) {
    let child;
    try { child = crossSpawn(bin(), ['gateway'], { windowsHide: true }); }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    gateway = { child, startedAt: Date.now() };
    const feed = (d2) => { if (onStatus) onStatus(String(d2).replace(/(API_SERVER_KEY|Bearer)\s*\S+/gi, '$1 ***').trimEnd()); };
    if (child.stdout) child.stdout.on('data', feed);
    if (child.stderr) child.stderr.on('data', feed);
    child.on('error', (e) => { if (onStatus) onStatus('hermes gateway: ' + String(e && e.message || e)); });
    child.on('close', () => { if (gateway && gateway.child === child) gateway = null; });
  }
  // Ready when the API answers. Without a key any answer proves it is up (a 401 included). WITH a key only an answer
  // that accepts it counts: a 401 may come from an older process that still holds the port (after a key change), and
  // reporting that as "up" would leave the app talking to a gateway that rejects it.
  const deadline = Date.now() + (o.waitMs || 60000);
  let last = null;
  while (Date.now() < deadline) {
    last = await probe({ key: o.key, port: o.port, timeoutMs: 2000 });
    if (last.reachable && (last.ok || !o.key)) return { ok: true, ready: last.ok, needsKey: last.needsKey, models: last.models };
    if (!gatewayRunning()) return { ok: false, error: 'The Hermes gateway exited before its API server came up. Run `hermes doctor` and `hermes setup` in a terminal.' };
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (last && last.reachable && o.key && !last.ok) return { ok: false, error: 'Something answers on the Hermes API port but rejects this key (HTTP ' + last.status + '). An older Hermes process may still hold the port: stop it (or restart Hermes) and start the gateway again.' };
  return { ok: false, error: 'The Hermes API server did not answer within ' + Math.round((o.waitMs || 60000) / 1000) + 's. Make sure API_SERVER_ENABLED is set (use "Enable API server" first) and a model is configured (`hermes setup`).' };
}

// Resolves once the child has really exited (not merely been signalled) and the API port no longer answers, so a
// start that follows cannot race the old process.
async function stopGateway(opts) {
  const o = opts || {};
  if (!gatewayRunning()) { gateway = null; return { ok: true, wasRunning: false }; }
  const c = gateway.child;
  const exited = new Promise((resolve) => { if (c.exitCode != null) return resolve('exit'); c.once('close', () => resolve('exit')); c.once('exit', () => resolve('exit')); });
  await Promise.resolve(killTree(c));
  const outcome = await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), o.exitWaitMs || 10000))]);
  if (outcome !== 'exit') {
    // still alive: keep tracking it (so it can be stopped again) and say so; a start now would run a second gateway
    return { ok: false, wasRunning: true, error: 'The Hermes gateway did not exit after being stopped. End the "hermes" process in Task Manager (or restart your computer) before starting it again.' };
  }
  gateway = null;
  // freed only when the connection is REFUSED (nothing listens); a timeout or reset says something still holds the port
  let freed = false, lastErr = '';
  const deadline = Date.now() + (o.portWaitMs || 8000);
  while (Date.now() < deadline) {
    const pr = await probe({ port: o.port, timeoutMs: 1000 });
    if (!pr.reachable && pr.error === 'ECONNREFUSED') { freed = true; break; }
    lastErr = pr.reachable ? 'still answering (HTTP ' + pr.status + ')' : String(pr.error || 'unknown');
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!freed) return { ok: false, wasRunning: true, portFreed: false, error: 'The gateway process ended but the Hermes API port is still in use (' + lastErr + '). Another Hermes process may hold it: stop it before starting the gateway again.' };
  return { ok: true, wasRunning: true, portFreed: true };
}

// everything the Settings row needs in one call
async function getStatus(opts) {
  const d = await detect();
  const out = { installed: !!d.installed, version: d.version || null, gatewayRunning: gatewayRunning(), api: null, installCommand: installCommand().shown, downloadPage: DOWNLOAD_PAGE };
  out.api = await probe({ key: opts && opts.key, port: opts && opts.port });
  return out;
}

module.exports = { API_PORT, DOWNLOAD_PAGE, installCommand, detect, install, openSetup, setupApiServer, probe, startGateway, stopGateway, getStatus, gatewayRunning, _candidates: candidates, _reset: () => { foundBin = null; gateway = null; } };
