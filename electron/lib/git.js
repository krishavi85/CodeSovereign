'use strict';
/*
 * git.js — thin wrapper around the system `git`, scoped to the open workspace.
 */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const workspace = require('./workspace');
const trust = require('./trust');
const { sanitizedEnv } = require('./proc');
const cmdpolicy = require('./cmdpolicy');

// A folder that already contains a .git directory can ship a hostile .git/config or hooks. Git runs programs
// named there: core.fsmonitor on every `git status` (the Git panel runs it on each refresh), hooks on commit /
// checkout / merge, external diff drivers on `git diff`. Opening a folder must not run its code, so:
//  - core.fsmonitor is forced off (a speed feature, never needed here)
//  - repository hooks run only once the user has trusted the folder (the same prompt that guards commands)
//  - diff / show / log never call an external diff or textconv program
//  - the environment is the sanitized one: no tokens for a hook or filter to read
// These go in through GIT_CONFIG_COUNT / KEY / VALUE (highest-precedence config), not `-c`.
// The empty hooks directory is created fresh for this process with mkdtemp (unpredictable name, mode 0700 on POSIX),
// never at a fixed path: a fixed shared-temp path could be pre-created by another user or process with hooks in it.
let noHooksDir = null;
function emptyHooksDir() {
  if (!noHooksDir) {
    noHooksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-no-hooks-'));
    try { fs.chmodSync(noHooksDir, 0o700); } catch (_) {}
    process.once('exit', () => { try { fs.rmSync(noHooksDir, { recursive: true, force: true }); } catch (_) {} });
  }
  return noHooksDir;
}
function gitEnv(root) {
  const cfg = [['core.fsmonitor', 'false']];
  if (!trust.isTrusted(root)) { cfg.push(['core.hooksPath', emptyHooksDir()]); cfg.push(['http.sslVerify', 'true']); }   // certificate checking cannot be switched off by the folder
  const env = Object.assign({}, sanitizedEnv(), { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: String(cfg.length) });
  if (process.env.SSH_AUTH_SOCK) env.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;      // ssh-agent for push/fetch over ssh
  for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) if (process.env[k]) env[k] = process.env[k];   // identity only
  cfg.forEach((kv, i) => { env['GIT_CONFIG_KEY_' + i] = kv[0]; env['GIT_CONFIG_VALUE_' + i] = kv[1]; });
  return env;
}

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

// Settings in a repository's OWN config (and anything it includes) that name a program git will run: clean / smudge /
// process filters, merge drivers, diff drivers, ssh / proxy / askpass / editor / pager commands, credential helpers,
// remote upload-pack, and includes that can pull any of those in. fsmonitor and hooksPath are overridden separately.
const RUNS_PROGRAMS = [
  /^filter\..+\.(clean|smudge|process)$/i, /^merge\..+\.driver$/i, /^diff\..+\.(command|textconv)$/i, /^diff\.external$/i,
  /^core\.(sshcommand|gitproxy|askpass|editor|pager)$/i, /^gpg(\..+)?\.program$/i, /^credential(\..+)?\.helper$/i,
  /^sequence\.editor$/i, /^pager\..+/i, /^remote\..+\.(uploadpack|receivepack|vcs)$/i, /^protocol\.ext\.allow$/i,
  /^uploadpack\.packobjectshook$/i, /^include(if)?\..+/i,
  // not programs, but they point git (or its network traffic) somewhere the user did not choose: a work tree or git
  // dir outside the project, certificate checking / CA / proxy / headers / cookies on https, rewritten remote URLs
  /^core\.(worktree|gitdir|alternaterefscommand)$/i,
  /^http(\..+)?\.(sslverify|sslcainfo|sslcapath|sslcert|sslkey|proxy|proxyauthmethod|extraheader|cookiefile|savecookies|sslcertpasswordprotected)$/i,
  /^https?\.proxy$/i, /^url\..+\.(insteadof|pushinsteadof)$/i
];
// Layout that sends git to another repository on disk: a .git that is a symlink or a gitfile pointing outside the folder,
// .git/commondir (shared worktree data), objects/info/alternates (borrowed objects). The config of the target looks
// ordinary, so the config scan alone cannot see this.
function layoutIssues(root) {
  const g = path.join(root, '.git');
  let st;
  try { st = fs.lstatSync(g); } catch (_) { return []; }
  const issues = [];
  // containment is judged on REAL paths: a symlink or junction inside the folder can lead anywhere
  let realRoot;
  try { realRoot = fs.realpathSync(root); } catch (_) { return ['.git (folder cannot be resolved)']; }
  const realInside = (p) => {
    try { const r = path.relative(realRoot, fs.realpathSync(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); } catch (_) { return false; }
  };
  let gitDir = g;
  if (st.isSymbolicLink()) issues.push('.git (symbolic link)');
  else if (st.isFile()) {
    let txt = '';
    try { txt = fs.readFileSync(g, 'utf8'); } catch (_) {}
    const m = /^gitdir:\s*(.+)$/m.exec(txt);
    gitDir = m ? path.resolve(root, m[1].trim()) : null;
    if (!gitDir || !realInside(gitDir)) { issues.push('.git (points outside the folder)'); gitDir = null; }
  } else if (!realInside(g)) issues.push('.git (resolves outside the folder)');
  if (gitDir && !issues.length) {
    for (const rel of ['commondir', 'objects/info/alternates', 'objects/info/http-alternates']) {
      try { fs.lstatSync(path.join(gitDir, rel)); issues.push('.git/' + rel); } catch (_) {}
    }
    // the parts git reads and writes must be real entries inside the git directory, not links to somewhere else
    for (const rel of ['objects', 'refs', 'HEAD', 'config', 'index', 'info', 'hooks', 'packed-refs', 'logs', 'worktrees', 'modules']) {
      try { if (fs.lstatSync(path.join(gitDir, rel)).isSymbolicLink()) issues.push('.git/' + rel + ' (symbolic link)'); } catch (_) {}
    }
  }
  return issues;
}
const scanCache = new Map(); // root -> { at, keys }
function dangerousLocalKeys(root) {
  const hit = scanCache.get(root);
  if (hit && Date.now() - hit.at < 3000) return Promise.resolve(hit.keys);
  return new Promise((resolve) => {
    // --show-scope separates the repository's own settings from the user's global ones (e.g. git-lfs filters)
    execFile('git', ['config', '--list', '--show-scope', '--name-only'], { cwd: root, windowsHide: true, env: gitEnv(root), maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      // fail closed: if the repository's config cannot be listed (git too old for --show-scope, output over the
      // buffer because a hostile config pads itself, a broken include, a killed process) we cannot say it is safe
      if (err || typeof stdout !== 'string') {
        resolve(['(the repository configuration could not be checked' + (err && err.code ? ': ' + err.code : '') + ')']);
        return;                                  // a failed scan is never cached
      }
      const keys = [];
      for (const line of stdout.split(/\r?\n/)) {
        const m = /^(local|worktree)\s+(\S.*)$/.exec(line);
        if (m && RUNS_PROGRAMS.some((re) => re.test(m[2].trim()))) keys.push(m[2].trim());
      }
      scanCache.set(root, { at: Date.now(), keys });
      resolve(keys);
    });
  });
}

async function exec(args) {
  const root = workspace.getRoot();
  if (!root) return { code: -1, stdout: '', stderr: 'No workspace is open' };
  const bad = validateArgs(args) || cmdpolicy.hardRefusal('git', args);
  if (bad) return { code: -1, stdout: '', stderr: bad };
  if (!trust.isTrusted(root)) {
    const keys = layoutIssues(root).concat(await dangerousLocalKeys(root));
    if (keys.length) {
      return { code: -1, stdout: '', stderr: 'This repository\'s own configuration or layout can run programs or point Git outside this folder (' + keys.slice(0, 3).join(', ') + '). Trust the folder to use Git here.', needsTrust: true, keys };
    }
  }
  return new Promise((resolve) => {
    let argv = args;
    const si = args.findIndex((a) => !a.startsWith('-'));
    if (si >= 0 && ['diff', 'show', 'log'].includes(args[si])) argv = args.slice(0, si + 1).concat(['--no-ext-diff', '--no-textconv'], args.slice(si + 1));
    const child = spawn('git', argv, { cwd: root, windowsHide: true, env: gitEnv(root) });
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
  if (inside.needsTrust) return { repo: false, needsTrust: true, keys: inside.keys };
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') return { repo: false };

  // symbolic-ref names the branch even before the first commit (rev-parse
  // --abbrev-ref fails there, so a fresh `git init` showed "HEAD"); it only
  // fails on a detached HEAD, where rev-parse gives the right answer.
  const sym = await exec(['symbolic-ref', '--short', 'HEAD']);
  let branch = sym.code === 0 ? sym.stdout.trim() : '';
  if (!branch) {
    const branchRes = await exec(['rev-parse', '--abbrev-ref', 'HEAD']);
    branch = branchRes.stdout.trim() || 'HEAD';
  }

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

module.exports = { available, exec, status, validateArgs, ALLOWED_SUBCMDS, gitEnv };
