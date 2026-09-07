'use strict';
/*
 * proc.js — real child-process execution, scoped to the open workspace.
 *
 * spawn()  starts a long-lived process and streams stdout/stderr back to the
 *          renderer over the "proc:data" channel.
 * run()    is a one-shot: resolves with { code, stdout, stderr }.
 */
const { spawn } = require('child_process');
const path = require('path');
const workspace = require('./workspace');

const procs = new Map(); // id -> { child, cwd, killed }
let seq = 0;

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;   // 10 min hard cap
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;    // 5 MB captured per stream, then truncated

function cwdFor(cwd) {
  const root = workspace.getRoot();
  if (!root) throw new Error('Open a project folder before running commands');
  if (!cwd || cwd === '.' || cwd === '/') return root;
  return workspace.resolveInside(cwd); // enforces containment
}

// Build a minimal environment: never leak the user's shell env (which may carry
// NPM_TOKEN, GITHUB_TOKEN, AWS_*, api keys) into an untrusted project's scripts.
const ENV_ALLOW = new Set([
  'PATH', 'Path', 'PATHEXT', 'HOME', 'USERPROFILE', 'HOMEPATH', 'HOMEDRIVE',
  'SystemRoot', 'SystemDrive', 'windir', 'ComSpec', 'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TZ', 'OS', 'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'ALLUSERSPROFILE',
  'PUBLIC', 'SHELL', 'USER', 'LOGNAME', 'DISPLAY', 'XDG_RUNTIME_DIR'
]);
const ENV_SENSITIVE = /(TOKEN|SECRET|_KEY$|APIKEY|API_KEY|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|SESSION|COOKIE|AUTH)/i;

function sanitizedEnv(extra) {
  const out = {};
  for (const k of Object.keys(process.env)) {
    if (ENV_SENSITIVE.test(k)) continue;
    if (ENV_ALLOW.has(k) || /^npm_config_/i.test(k)) out[k] = process.env[k];
  }
  out.CI = '';                       // don't let scripts think they're in CI
  out.NODE_OPTIONS = '';             // strip any inherited --require injection
  out.npm_config_yes = 'true';
  return Object.assign(out, extra || {});
}

function capped(current, chunk) {
  if (current.length >= MAX_OUTPUT_BYTES) return current;
  const next = current + chunk;
  return next.length > MAX_OUTPUT_BYTES ? next.slice(0, MAX_OUTPUT_BYTES) + '\n…[output truncated]…\n' : next;
}

/**
 * A conservative allowlist. The renderer's "run a command" surface is meant for
 * project tooling, not a general shell. Anything else must go through the
 * interactive terminal (spawnShell), which the user drives directly.
 */
const ALLOWED = new Set([
  'npm', 'npx', 'pnpm', 'yarn', 'bun', 'node', 'deno',
  'git', 'python', 'python3', 'pip', 'pip3',
  'tsc', 'eslint', 'prettier', 'vite', 'webpack', 'rollup', 'esbuild',
  'jest', 'vitest', 'playwright', 'mocha', 'cargo', 'go', 'make'
]);

function baseCmd(cmd) {
  return path.basename(String(cmd || '')).replace(/\.(cmd|exe|bat|ps1)$/i, '').toLowerCase();
}

// On Windows these are .cmd/.ps1 shims and can only be launched through a shell.
// Real executables (node, git, python, ...) are spawned directly so their args
// are passed safely as an array.
const WIN_SHIMS = new Set([
  'npm', 'npx', 'pnpm', 'yarn', 'bun', 'tsc', 'eslint', 'prettier',
  'vite', 'webpack', 'rollup', 'esbuild', 'jest', 'vitest', 'playwright', 'mocha'
]);
function needsShell(cmd) {
  return process.platform === 'win32' && WIN_SHIMS.has(baseCmd(cmd));
}

function spawnManaged({ cmd, args = [], cwd, shell, rawEnv, timeoutMs }, onEvent) {
  const workdir = cwdFor(cwd);
  const useShell = shell != null ? shell : needsShell(cmd);
  const child = spawn(cmd, args, {
    cwd: workdir,
    shell: useShell,
    env: rawEnv ? { ...process.env, FORCE_COLOR: '1' } : sanitizedEnv({ FORCE_COLOR: '1' }),
    windowsHide: true,
    detached: process.platform !== 'win32' // own process group -> tree kill on unix
  });
  const id = 'p' + (++seq);
  const rec = { child, cwd: workdir, killed: false, bytes: 0 };
  procs.set(id, rec);

  const cap = timeoutMs || DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    onEvent({ id, stream: 'error', data: `\n[timed out after ${Math.round(cap / 1000)}s — terminating]\n` });
    killTree(rec);
  }, cap);

  function feed(stream, buf) {
    rec.bytes += buf.length;
    onEvent({ id, stream, data: buf.toString() });
    if (rec.bytes > MAX_OUTPUT_BYTES && !rec.killed) {
      onEvent({ id, stream: 'error', data: '\n[output limit reached — terminating]\n' });
      killTree(rec);
    }
  }
  child.stdout.on('data', d => feed('stdout', d));
  child.stderr.on('data', d => feed('stderr', d));
  child.on('error', e => onEvent({ id, stream: 'error', data: String(e && e.message || e) }));
  child.on('close', code => {
    clearTimeout(timer);
    procs.delete(id);
    onEvent({ id, stream: 'exit', code: rec.killed ? -2 : (code == null ? -1 : code) });
  });
  return { id, pid: child.pid };
}

// Like spawnManaged, but restricted to the same allowlist as runManaged. Streams
// output so the renderer can show a live log for long jobs (npm install, build).
function spawnAllowed({ cmd, args = [], cwd, timeoutMs }, onEvent) {
  const base = baseCmd(cmd);
  if (!ALLOWED.has(base)) {
    const err = new Error(`Command "${base}" is not on the allowlist`);
    err.code = 'ENOTALLOWED';
    throw err;
  }
  return spawnManaged({ cmd, args, cwd, timeoutMs }, onEvent);
}

function runManaged({ cmd, args = [], cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const base = baseCmd(cmd);
    if (!ALLOWED.has(base)) {
      resolve({ code: -1, stdout: '', stderr: `Command "${base}" is not on the allowlist. Use the terminal for arbitrary commands.` });
      return;
    }
    let workdir;
    try { workdir = cwdFor(cwd); } catch (e) { resolve({ code: -1, stdout: '', stderr: String(e.message) }); return; }
    const child = spawn(cmd, args, {
      cwd: workdir,
      shell: needsShell(cmd),
      env: sanitizedEnv({ FORCE_COLOR: '0' }),
      windowsHide: true,
      detached: process.platform !== 'win32'
    });
    const rec = { child, cwd: workdir, killed: false };
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(rec); }, timeoutMs || DEFAULT_TIMEOUT_MS);
    child.stdout.on('data', d => { out = capped(out, d.toString()); });
    child.stderr.on('data', d => { err = capped(err, d.toString()); });
    child.on('error', e => { err += String(e && e.message || e); });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -2 : (code == null ? -1 : code), stdout: out, stderr: err + (timedOut ? '\n[timed out]' : '') });
    });
  });
}

function spawnShell(onEvent, cwd) {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? (process.env.COMSPEC || 'cmd.exe')
    : (process.env.SHELL || '/bin/bash');
  const args = isWin ? [] : ['-i'];
  // the interactive terminal the user drives directly keeps the real env
  return spawnManaged({ cmd, args, cwd, shell: false, rawEnv: true, timeoutMs: 8 * 60 * 60 * 1000 }, onEvent);
}

function write(id, data) {
  const rec = procs.get(id);
  if (rec && rec.child.stdin.writable) rec.child.stdin.write(data);
}

// Kill the whole process tree — npm spawns node which spawns the real tool.
function killTree(rec) {
  if (!rec || rec.killed) return;
  rec.killed = true;
  const pid = rec.child.pid;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true });
    } else {
      try { process.kill(-pid, 'SIGTERM'); } catch { /* group may be gone */ }
      setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* ignore */ } }, 3000);
    }
  } catch { /* ignore */ }
}

function kill(id) {
  const rec = procs.get(id);
  if (!rec) return;
  killTree(rec);
  procs.delete(id);
}

function killAll() {
  for (const id of Array.from(procs.keys())) kill(id);
}

function running() {
  return Array.from(procs.entries()).map(([id, r]) => ({ id, cwd: r.cwd, pid: r.child.pid }));
}

module.exports = { spawnManaged, spawnAllowed, runManaged, spawnShell, write, kill, killAll, running, sanitizedEnv, ALLOWED };
