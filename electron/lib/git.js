'use strict';
/*
 * git.js — thin wrapper around the system `git`, scoped to the open workspace.
 */
const { spawn, execFile } = require('child_process');
const workspace = require('./workspace');

function available() {
  return new Promise((resolve) => {
    execFile('git', ['--version'], { windowsHide: true }, (err, stdout) => {
      resolve(!err && /git version/i.test(stdout || ''));
    });
  });
}

// git subcommands the app is allowed to run. Notably absent: anything that can
// execute a configured command (there is no `-c` / config path below either).
const ALLOWED_SUBCMDS = new Set([
  'status', 'add', 'rm', 'mv', 'commit', 'restore', 'reset', 'checkout', 'switch',
  'branch', 'tag', 'log', 'show', 'diff', 'blame', 'stash',
  'rev-parse', 'rev-list', 'symbolic-ref', 'describe', 'ls-files', 'ls-tree', 'cat-file',
  'init', 'clone', 'remote', 'fetch', 'pull', 'push', 'merge', 'rebase', 'cherry-pick',
  'config', 'clean', 'shortlog', 'for-each-ref'
]);
// Global flags that can redirect git to run code or escape the workspace.
const FORBIDDEN_FLAG = /^(-c$|--exec-path|--upload-pack|--receive-pack|-C$|--git-dir|--work-tree|--namespace|-P$|--no-pager$|--config-env)/;

function validateArgs(args) {
  if (!Array.isArray(args) || !args.length || args.some(a => typeof a !== 'string')) {
    return 'Invalid git arguments';
  }
  // no global flags before the subcommand
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    if (FORBIDDEN_FLAG.test(args[i])) return 'Disallowed git flag: ' + args[i];
    i++;
  }
  const sub = args[i];
  if (!ALLOWED_SUBCMDS.has(sub)) return 'git ' + (sub || '') + ' is not permitted';
  // no config injection anywhere (`-c core.pager=…`, `-c core.sshCommand=…`, etc.)
  if (args.some(a => a === '-c' || a === '--config-env' || /^--config-env=/.test(a))) return 'git -c is not permitted';
  // config subcommand: read-only or setting an alias is still risky -> block alias.* and core.*Command
  if (sub === 'config' && args.some(a => /^(alias\.|core\..*command|core\.pager|core\.editor|core\.sshcommand|core\.fsmonitor)/i.test(a))) {
    return 'Setting that git config key is not permitted';
  }
  return null;
}

function exec(args) {
  return new Promise((resolve) => {
    const root = workspace.getRoot();
    if (!root) { resolve({ code: -1, stdout: '', stderr: 'No workspace is open' }); return; }
    const bad = validateArgs(args);
    if (bad) { resolve({ code: -1, stdout: '', stderr: bad }); return; }
    const child = spawn('git', args, {
      cwd: root, windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' }
    });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', e => { err += String(e && e.message || e); });
    child.on('close', code => resolve({ code: code == null ? -1 : code, stdout: out, stderr: err }));
  });
}

async function status() {
  const root = workspace.getRoot();
  if (!root) return { repo: false };
  const inside = await exec(['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') return { repo: false };

  const branchRes = await exec(['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchRes.stdout.trim() || 'HEAD';

  let ahead = 0, behind = 0;
  const counts = await exec(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
  if (counts.code === 0) {
    const m = counts.stdout.trim().split(/\s+/);
    behind = parseInt(m[0], 10) || 0;
    ahead = parseInt(m[1], 10) || 0;
  }

  const porcelain = await exec(['status', '--porcelain=v1']);
  const files = porcelain.stdout.split('\n').filter(Boolean).map(line => ({
    x: line[0], y: line[1], path: line.slice(3)
  }));

  return { repo: true, branch, ahead, behind, files };
}

module.exports = { available, exec, status, validateArgs, ALLOWED_SUBCMDS };
