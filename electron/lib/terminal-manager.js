'use strict';
/*
 * terminal-manager.js — a real, integrated terminal engine for the desktop
 * app: spawns actual shells (PowerShell 7, Windows PowerShell, CMD, Git
 * Bash, WSL) as pseudo-terminals via node-pty, so tools that care about a
 * real TTY (progress bars, prompts, ANSI color, PSReadLine, interactive
 * installers) behave the same as they would in a real terminal window.
 *
 * Pure Node (no Electron API) — driven entirely over IPC from main.js. The
 * renderer never spawns a process itself; this module only ever runs the
 * shell the user explicitly picked, with the cwd/env the caller passed in.
 * There is no command allowlist/sandbox here by design — once a real shell
 * is open, it *is* a real shell, same as opening Windows Terminal; the
 * security boundary is the IPC surface (create/write/resize/kill only),
 * not what gets typed into it.
 */
const { execFile } = require('child_process');
const os = require('os');
let pty = null;
try { pty = require('node-pty'); } catch (_) { pty = null; }

function which(cmd, timeoutMs) {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    execFile(finder, [cmd], { timeout: timeoutMs || 4000, windowsHide: true }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const first = String(stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      resolve(first || null);
    });
  });
}

function exists(p) {
  try { return require('fs').existsSync(p); } catch (_) { return false; }
}

async function wslDistros() {
  return new Promise((resolve) => {
    execFile('wsl.exe', ['-l', '-q'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err) { resolve([]); return; }
      // wsl.exe emits UTF-16LE to a piped stdout; Buffer->utf8 mangles it
      // with stray spaces/nulls, but distro names still survive a strip.
      const names = String(stdout || '')
        .replace(/\u0000/g, '')
        .split(/\r?\n/)
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      resolve(names);
    });
  });
}

/* ---- detect the shells actually available on this machine ---- */
async function detectShells() {
  const found = [];
  if (process.platform === 'win32') {
    // Windows PowerShell — built into every Windows install, always offered.
    found.push({ id: 'powershell', label: 'Windows PowerShell', shellPath: 'powershell.exe', args: ['-NoLogo'] });

    const pwsh = await which('pwsh.exe') || await which('pwsh');
    if (pwsh) found.push({ id: 'pwsh', label: 'PowerShell 7', shellPath: pwsh, args: ['-NoLogo'] });

    found.push({ id: 'cmd', label: 'Command Prompt', shellPath: 'cmd.exe', args: [] });

    const gitBashCandidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
    ];
    const gitBash = gitBashCandidates.find(exists);
    if (gitBash) found.push({ id: 'gitbash', label: 'Git Bash', shellPath: gitBash, args: ['--login', '-i'] });

    const hasWsl = await which('wsl.exe');
    if (hasWsl) {
      const distros = await wslDistros();
      if (distros.length) found.push({ id: 'wsl', label: 'WSL (' + distros[0] + ')', shellPath: 'wsl.exe', args: [] });
    }
  } else {
    const shellEnv = process.env.SHELL;
    if (shellEnv && exists(shellEnv)) found.push({ id: 'login', label: shellEnv.split('/').pop(), shellPath: shellEnv, args: ['-l'] });
    const bash = await which('bash');
    if (bash && !found.some((s) => s.shellPath === bash)) found.push({ id: 'bash', label: 'bash', shellPath: bash, args: ['-l'] });
    const zsh = await which('zsh');
    if (zsh && !found.some((s) => s.shellPath === zsh)) found.push({ id: 'zsh', label: 'zsh', shellPath: zsh, args: ['-l'] });
  }
  return found;
}

let defaultShellsCache = null;
async function defaultShell() {
  if (!defaultShellsCache) defaultShellsCache = await detectShells();
  return defaultShellsCache[0] || null;
}

/* ---- PTY lifecycle ---- */
const terminals = new Map(); // id -> { pty, onData, onExit }

function ptyAvailable() { return !!pty; }

async function create(id, opts, onData, onExit) {
  if (!pty) return { ok: false, error: 'node-pty is not available in this build' };
  opts = opts || {};

  let shell = null;
  if (opts.shellId) {
    const shells = defaultShellsCache || (defaultShellsCache = await detectShells());
    shell = shells.find((s) => s.id === opts.shellId) || null;
  }
  if (!shell) shell = await defaultShell();
  if (!shell) return { ok: false, error: 'no shell found on this machine' };

  let term;
  try {
    term = pty.spawn(shell.shellPath, shell.args, {
      name: 'xterm-256color',
      cols: opts.cols || 100,
      rows: opts.rows || 30,
      cwd: opts.cwd || os.homedir(),
      env: process.env
    });
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }

  terminals.set(id, term);
  term.onData((data) => { try { onData(data); } catch (_) {} });
  term.onExit(({ exitCode, signal }) => {
    terminals.delete(id);
    try { onExit({ exitCode: exitCode == null ? null : exitCode, signal: signal == null ? null : signal }); } catch (_) {}
  });

  return { ok: true, id, shellId: shell.id, shellLabel: shell.label, pid: term.pid, cwd: opts.cwd || os.homedir() };
}

function write(id, data) {
  const t = terminals.get(id);
  if (t) t.write(data);
}

function resize(id, cols, rows) {
  const t = terminals.get(id);
  if (t && cols > 0 && rows > 0) { try { t.resize(cols, rows); } catch (_) {} }
}

function kill(id) {
  const t = terminals.get(id);
  if (t) { try { t.kill(); } catch (_) {} terminals.delete(id); }
  return { ok: true };
}

function killAll() {
  for (const id of Array.from(terminals.keys())) kill(id);
}

module.exports = { ptyAvailable, detectShells, create, write, resize, kill, killAll };
