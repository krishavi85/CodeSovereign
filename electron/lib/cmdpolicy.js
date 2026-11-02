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

// Programs a package runner can be asked to start that this policy also judges
const INNER = new Set(['node', 'deno', 'bun', 'python', 'python3', 'py', 'pip', 'pip3', 'npm', 'pnpm', 'yarn', 'npx', 'pnpx', 'bunx', 'git', 'go', 'cargo']);

// Interpreters and shells nobody needs to start through a package runner or package manager: refused outright.
const INTERP_BLOCK = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ash', 'csh', 'tcsh', 'ksh', 'cmd', 'powershell', 'pwsh', 'perl', 'ruby', 'php', 'lua',
  'tsx', 'ts-node', 'ts-node-esm', 'babel-node', 'esno', 'osascript', 'wscript', 'cscript', 'mshta', 'rundll32', 'regsvr32', 'curl', 'wget']);
// `python -m <module>`: only modules a project workflow uses. -m runs any importable module (timeit, code, runpy, http.server...).
const PY_MODULES = new Set(['pytest', 'unittest', 'py_compile', 'compileall', 'mypy', 'ruff', 'black', 'flake8', 'pyflakes', 'isort', 'pylint', 'coverage', 'pip', 'venv']);
// every spelling of the Python interpreter: python, python3, python3.11, python3.13t, pythonw, py / pyw (the Windows launchers), pypy
const isPython = (n) => /^(pyw?|pythonw?|pypy)([0-9]+(\.[0-9]+)*[a-z]*)?$/.test(n);   // py, pyw, python, pythonw, python3.13t, pypy3 ...

function hardRefusal(cmd, args, depth) {
  depth = depth || 0;
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
  // short options can be clustered: "node -pe code" is -p and -e. Any single-dash cluster that contains an
  // eval / print / require / interactive letter counts as that option.
  // long options are matched the way the tools parse them: nopt (npm) and argparse (pip) accept any unambiguous
  // abbreviation ("--cal" is "--call", "--index" is "--index-url"). Refuse a token that is a prefix of a listed name.
  const abbrev = (x, names) => { const m = /^--([A-Za-z][A-Za-z-]*)(=|$)/.exec(String(x)); return !!m && m[1].length >= 2 && names.some((n) => n.indexOf(m[1].toLowerCase()) === 0); };
  const evalCluster = (list) => list.some((x) => /^-[A-Za-z]+$/.test(x) && /[eprI]/i.test(x));

  // --node-options hands flags (--require, --import, --experimental-loader, --inspect) to every Node process the tool
  // starts, which is code execution without a project file. No tool the agent runs needs it, whichever tool it is given to.
  if (beforeDD.some((x) => abbrev(x, ['node-options']))) return '--node-options injects code into Node processes and is not allowed';
  if (base === 'node' || base === 'deno' || base === 'bun') {
    if (hasIn(head, '-e', '--eval', '-p', '--print', '-r', '--require', '--import', '--loader', '--experimental-loader', '-i', '--interactive') || evalCluster(head) ||
        prefixIn(head, '--eval=', '--print=', '--require=', '--import=', '--loader=', '--experimental-loader=', '--inspect', '--debug'))
      return base + ' with inline code, a preload or an inspector is not allowed';
    if (base === 'deno' && sub === 'eval') return 'deno eval is not allowed';
  }
  if (isPython(base)) {
    const mIdx = a.indexOf('-m');
    const pyHead = mIdx >= 0 && (firstPos < 0 || mIdx < firstPos) ? a.slice(0, mIdx) : head;
    if (hasIn(pyHead, '-i') || pyHead.some((x) => x === '-c' || (/^-[A-Za-z]*c/.test(x) && !/^--/.test(x))))
      return 'python with inline code is not allowed';
    // -m <module>, also attached (-mtimeit) or clustered (-Im timeit)
    for (let i = 0; i < a.length && (firstPos < 0 || i <= firstPos); i++) {
      let mod = null;
      if (a[i] === '-m') mod = a[i + 1];
      else if (/^-[A-Za-z]*m.+/.test(a[i]) && !/^--/.test(a[i])) mod = a[i].replace(/^-[A-Za-z]*?m/, '');
      else if (/^-[A-Za-z]*m$/.test(a[i]) && !/^--/.test(a[i])) mod = a[i + 1];
      if (mod != null) {
        const top = String(mod).split('.')[0];
        if (!PY_MODULES.has(top)) return 'python -m ' + String(mod).slice(0, 30) + ' is not allowed (only test, lint, build-check and pip modules)';
        break;
      }
    }
  }
  // package runners: npx / pnpx / bunx and `npm|pnpm|yarn|bun exec|x|dlx`. -c / --call run a shell string, and the
  // registry / config flags point the download at an attacker's index.
  const isPm = base === 'npm' || base === 'pnpm' || base === 'yarn' || base === 'bun';
  const isRunner = base === 'npx' || base === 'pnpx' || base === 'bunx' || (isPm && ['exec', 'x', 'dlx'].includes(sub));
  // short options cluster and take attached values (-yc, -ccalc): any single-dash token containing c may be -c
  // a runner starts another program: judge that program and its arguments too (npx -- node -e x, npm exec node --eval=x,
  // npx -p pkg node -pe x). Any token that names a judged program counts, whatever options come before it.
  // `yarn node -e x`, `pnpm node -e x`: a package manager's first word can be a binary to run
  if (isPm && sub && depth < 3) {
    const sb = baseCmd(sub);
    if (INTERP_BLOCK.has(sb)) return base + ' would start ' + sb + ', which is not allowed';
    if (INNER.has(sb) || isPython(sb)) {
      const inner = hardRefusal(sub, a.slice(firstPos + 1), depth + 1);
      if (inner) return base + ' would start ' + sb + ': ' + inner;
    }
  }
  if (isRunner) {
    for (const x of a) if (typeof x === 'string' && !x.startsWith('-') && INTERP_BLOCK.has(baseCmd(x))) return base + ' would start ' + baseCmd(x) + ', which is not allowed';
  }
  if (isRunner && depth < 3) {
    for (let i = 0; i < a.length; i++) {
      if (typeof a[i] === 'string' && !a[i].startsWith('-') && (INNER.has(baseCmd(a[i])) || isPython(baseCmd(a[i])))) {
        const inner = hardRefusal(a[i], a.slice(i + 1), depth + 1);
        if (inner) return base + ' would start ' + baseCmd(a[i]) + ': ' + inner;
      }
    }
  }
  if (isRunner && (beforeDD.some((x) => /^-[^-]/.test(x) && x.indexOf('c') >= 0) || beforeDD.some((x) => abbrev(x, ['call', 'shell-mode', 'registry', 'userconfig', 'globalconfig', 'prefix', 'script-shell', 'shell']))))
    return base + ' with a shell command or registry / configuration overrides is not allowed';
  if (isPm) {
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
    // `git clone -c k=v` / `--config` write settings (core.fsmonitor, core.sshCommand) into the new repository;
    // --template copies hooks; --separate-git-dir puts the git directory anywhere
    if (beforeDD.some((x) => (sub === 'clone' && x === '-c') || /^--config(=|$)/.test(x) || /^--template(=|$)/.test(x) || /^--separate-git-dir(=|$)/.test(x) || abbrev(x, ['config', 'template', 'separate-git-dir'])))
      return 'git --config / --template / --separate-git-dir are not allowed';
    // clone / init create a repository where the argument says, relative to the workspace: not outside it
    if (sub === 'clone' || sub === 'init') {
      const isUrl = (x) => /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(x) || /^[\w.-]+@[\w.-]+:/.test(x);
      for (const x of a.slice(firstPos + 1)) {
        if (x.startsWith('-') || isUrl(x)) continue;
        if (/^([A-Za-z]:|[\\/])/.test(x) || /(^|[\\/])\.\.([\\/]|$)/.test(x) || x.startsWith('~'))
          return 'git ' + sub + ' destinations and sources outside the project are not allowed';
      }
    }
    if (sub && ['credential', 'config'].includes(sub)) return 'git "' + sub + '" is not allowed';
  }
  // go runs a program named by -exec / -toolexec (go test -exec <prog>): arbitrary code through an allowlisted tool
  if (base === 'go' && beforeDD.some((x) => /^--?(exec|toolexec)(=|$)/.test(x))) return 'go -exec / -toolexec runs an arbitrary program and is not allowed';
  // go -C <dir> changes the directory; -modfile / -overlay / -workfile read other build definitions
  if (base === 'go' && beforeDD.some((x) => /^--?(C|modfile|overlay|workfile|pkgdir)(=|$)/.test(x))) return 'go -C / -modfile / -overlay overrides are not allowed';
  // make -C dir / -f file point at any path; --eval runs makefile text; SHELL= names the program that runs recipes
  if (base === 'make' && (beforeDD.some((x) => (/^-[A-Za-z]*[CfIW]/.test(x) && !/^--/.test(x)) || /^--(directory|file|makefile|eval|include-dir|what-if|new-file)(=|$)/.test(x) || abbrev(x, ['directory', 'file', 'makefile', 'eval', 'include-dir'])) || a.some((x) => /^(\.SHELLFLAGS|SHELL|MAKE|MAKEFLAGS|MAKEFILES)=/i.test(x))))
    return 'make -C / -f / --eval and SHELL overrides are not allowed';
  // cargo --config can name a rustc wrapper or runner; -Z enables unstable behaviour
  if (base === 'cargo' && (beforeDD.some((x) => /^--config(=|$)/.test(x)) || beforeDD.some((x) => /^-Z/.test(x)))) return 'cargo --config / -Z overrides are not allowed';
  if (base === 'cargo' && sub && ['publish', 'login', 'owner', 'yank', 'logout'].includes(sub)) return 'cargo "' + sub + '" is not allowed';
  // pip, and the same pip run as `python -m pip`
  const mPip = isPython(base) ? a.indexOf('-m') : -1;
  const pipArgs = (base === 'pip' || base === 'pip3') ? beforeDD : (mPip >= 0 && a[mPip + 1] === 'pip' ? a.slice(mPip + 2, dd < 0 ? undefined : dd) : null);
  // -i / -f take attached values too (-ihttp://evil/simple)
  if (pipArgs && (pipArgs.some((x) => /^-[^-]/.test(x) && /[if]/.test(x)) || pipArgs.some((x) => abbrev(x, ['index-url', 'extra-index-url', 'trusted-host', 'config-settings', 'find-links', 'proxy', 'break-system-packages']))))
    return 'pip index / system overrides are not allowed';
  return null;
}

module.exports = { hardRefusal, baseCmd };
