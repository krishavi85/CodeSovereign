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

const procs = new Map(); // id -> { child, cwd }
let seq = 0;

function cwdFor(cwd) {
  const root = workspace.getRoot();
  if (!root) throw new Error('Open a project folder before running commands');
  if (!cwd || cwd === '.' || cwd === '/') return root;
  return workspace.resolveInside(cwd); // enforces containment
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

function spawnManaged({ cmd, args = [], cwd, shell }, onEvent) {
  const workdir = cwdFor(cwd);
  const useShell = shell != null ? shell : needsShell(cmd);
  const child = spawn(cmd, args, {
    cwd: workdir,
    shell: useShell,
    env: { ...process.env, FORCE_COLOR: '1' },
    windowsHide: true
  });
  const id = 'p' + (++seq);
  procs.set(id, { child, cwd: workdir });

  child.stdout.on('data', d => onEvent({ id, stream: 'stdout', data: d.toString() }));
  child.stderr.on('data', d => onEvent({ id, stream: 'stderr', data: d.toString() }));
  child.on('error', e => onEvent({ id, stream: 'error', data: String(e && e.message || e) }));
  child.on('close', code => {
    procs.delete(id);
    onEvent({ id, stream: 'exit', code: code == null ? -1 : code });
  });
  return { id, pid: child.pid };
}

// Like spawnManaged, but restricted to the same allowlist as runManaged. Streams
// output so the renderer can show a live log for long jobs (npm install, build).
function spawnAllowed({ cmd, args = [], cwd }, onEvent) {
  const base = baseCmd(cmd);
  if (!ALLOWED.has(base)) {
    const err = new Error(`Command "${base}" is not on the allowlist`);
    err.code = 'ENOTALLOWED';
    throw err;
  }
  return spawnManaged({ cmd, args, cwd }, onEvent);
}

function runManaged({ cmd, args = [], cwd }) {
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
      env: { ...process.env, FORCE_COLOR: '0' },
      windowsHide: true
    });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', e => { err += String(e && e.message || e); });
    child.on('close', code => resolve({ code: code == null ? -1 : code, stdout: out, stderr: err }));
  });
}

function spawnShell(onEvent, cwd) {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? (process.env.COMSPEC || 'cmd.exe')
    : (process.env.SHELL || '/bin/bash');
  const args = isWin ? [] : ['-i'];
  return spawnManaged({ cmd, args, cwd, shell: false }, onEvent);
}

function write(id, data) {
  const rec = procs.get(id);
  if (rec && rec.child.stdin.writable) rec.child.stdin.write(data);
}

function kill(id) {
  const rec = procs.get(id);
  if (!rec) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(rec.child.pid), '/f', '/t']);
    else rec.child.kill('SIGTERM');
  } catch { /* ignore */ }
  procs.delete(id);
}

function killAll() {
  for (const id of Array.from(procs.keys())) kill(id);
}

module.exports = { spawnManaged, spawnAllowed, runManaged, spawnShell, write, kill, killAll, ALLOWED };
