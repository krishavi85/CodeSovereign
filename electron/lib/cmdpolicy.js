'use strict';
/*
 * cmdpolicy.js — the hard refusals for commands that arrive over IPC, enforced in the main process.
 *
 * The renderer (the native agent's classifier) already judges a command by its arguments; but the renderer
 * is the less trusted side, and proc.js only checked the executable name. This is the floor that holds even
 * if the renderer is wrong or compromised: arguments that turn an allowlisted tool into arbitrary code
 * execution, change global configuration, or reach for credentials. It refuses only things no project
 * workflow needs; the ask / allow decisions stay in the renderer's policy.
 *
 * Options are judged only where they belong to the tool: flags before the script / subcommand
 * (`node -e x` is code execution, `node app.js -e x` passes -e to the app; `git -c k=v log` runs
 * configuration, `git log -c` is a diff option).
 *
 * hardRefusal(cmd, args) -> null (no objection) | 'reason'
 */
const path = require('path');

function baseCmd(cmd) {
  return path.basename(String(cmd || '')).replace(/\.(cmd|exe|bat|ps1)$/i, '').toLowerCase();
}

function hardRefusal(cmd, args) {
  const base = baseCmd(cmd);
  const a = Array.isArray(args) ? args : [];
  for (const x of a) {
    if (typeof x !== 'string') return 'arguments must be strings';
    if (/[\u0000-\u001f]/.test(x)) return 'control characters in an argument';
  }
  const firstPos = a.findIndex((x) => !/^-/.test(x));              // the script / subcommand
  const head = firstPos < 0 ? a : a.slice(0, firstPos);            // options that belong to the tool itself
  const sub = firstPos < 0 ? undefined : a[firstPos];
  const dd = a.indexOf('--');
  const beforeDD = dd < 0 ? a : a.slice(0, dd);                    // after "--" everything belongs to the script
  const hasIn = (list, ...names) => names.some((n) => list.includes(n));
  const prefixIn = (list, ...ps) => list.some((x) => ps.some((p) => x.indexOf(p) === 0));

  if (base === 'node' || base === 'deno' || base === 'bun') {
    if (hasIn(head, '-e', '--eval', '-p', '--print', '-r', '--require', '--import', '--loader', '--experimental-loader', '-i', '--interactive') ||
        prefixIn(head, '--eval=', '--print=', '--require=', '--import=', '--loader=', '--experimental-loader=', '--inspect', '--debug'))
      return base + ' with inline code, a preload or an inspector is not allowed';
    if (base === 'deno' && sub === 'eval') return 'deno eval is not allowed';
  }
  if (base === 'python' || base === 'python3') {
    const mIdx = a.indexOf('-m');
    const pyHead = mIdx >= 0 && (firstPos < 0 || mIdx < firstPos) ? a.slice(0, mIdx) : head;
    if (hasIn(pyHead, '-i') || pyHead.some((x) => x === '-c' || (/^-[A-Za-z]*c/.test(x) && !/^--/.test(x))))
      return 'python with inline code is not allowed';
  }
  if (base === 'npm' || base === 'pnpm' || base === 'yarn' || base === 'bun') {
    if (hasIn(beforeDD, '-g', '--global', '--location=global') || prefixIn(beforeDD, '--registry', '--userconfig', '--globalconfig', '--prefix', '--script-shell', '--shell'))
      return 'changing global installs or package-manager configuration is not allowed';
    if (sub && ['publish', 'unpublish', 'deprecate', 'login', 'adduser', 'logout', 'token', 'config', 'set', 'owner', 'access', 'team', 'org', 'profile', 'whoami', 'set-script', 'link', 'unlink'].includes(sub))
      return base + ' "' + sub + '" is not allowed (it publishes, changes accounts or changes configuration)';
  }
  if (base === 'git') {
    // before the subcommand, -c / --exec-path / --git-dir / --work-tree / -C change what git runs or where;
    // core.fsmonitor, core.sshCommand, core.pager and protocol.ext.allow turn them into code execution
    if (hasIn(head, '-c', '-C') || prefixIn(head, '--exec-path', '--git-dir', '--work-tree', '--config-env', '--namespace', '-c', '-C'))
      return 'git configuration and path overrides are not allowed';
    if (a.some((x) => /^ext::/i.test(x) || /^--(upload-pack|receive-pack|exec)(=|$)/.test(x))) return 'git transport helpers are not allowed';
    if (sub && ['credential', 'config'].includes(sub)) return 'git "' + sub + '" is not allowed';
  }
  if (base === 'cargo' && sub && ['publish', 'login', 'owner', 'yank', 'logout'].includes(sub)) return 'cargo "' + sub + '" is not allowed';
  if ((base === 'pip' || base === 'pip3') && (prefixIn(beforeDD, '--index-url', '--extra-index-url', '--trusted-host', '--config-settings') || hasIn(beforeDD, '-i', '--break-system-packages')))
    return 'pip index / system overrides are not allowed';
  return null;
}

module.exports = { hardRefusal, baseCmd };
