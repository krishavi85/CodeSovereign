/* =====================================================================
 * engine.nagent.js  —  Engine.NativeAgent
 *
 * CodeSovereign's own autonomous coding agent runtime. DOM-free: everything
 * the host provides arrives through an `env` object, so the same runtime
 * drives the IDE chat panel, the tests and the real-model eval harness.
 *
 *   NativeAgent.MODES                  ask | plan | edit | agent | auto
 *   NativeAgent.decide(mode, perm, ctx)            permission policy
 *   NativeAgent.classifyCommand(cmd, args)         argument-level command policy
 *   NativeAgent.validateArgs(schema, args)         tool-argument validation
 *   NativeAgent.createRegistry(opts)               tools + workspace + budgets
 *   NativeAgent.createRun(opts) / loadRun(store)   persisted state machine
 *   NativeAgent.runTask(opts)                      plan -> execute -> verify -> repair
 *   NativeAgent.parseTestOutput / parseStackFrames / parsePatch / applyPatchText
 *
 * Built on window.CSChatAgent (the Phase 3 toolbox + loop): read tools, the
 * proposal overlay, text-form tool-call recovery and the turn loop are reused,
 * not duplicated. Permissions go through the host's Engine.Autonomy (as env
 * canWrite / canCommand / canNetwork) and edits through the editor review.
 *
 * env (all optional except list/read):
 *   list():[paths]  read(path)  write(path,content)  remove(path)  isDirty(path)
 *   exec(spec, {signal,timeoutMs}) -> {code,output,ms,timedOut,skipped}
 *       spec: {kind:'job',job} | {kind:'cmd',cmd,args} | {kind:'script',script}
 *   startServer({cmd,args}) -> {id, stop(), logs()} | Promise
 *   getProblems()  diffStats(a,b)  snapshot(reason)  store {get,set}  root
 *   canWrite() canCommand() canNetwork() jobsAvailable()
 * ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  var MODES = ['ask', 'plan', 'edit', 'agent', 'auto'];
  var STATES = ['IDLE', 'PLANNING', 'WAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'REPAIRING', 'COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED'];
  var TRANSITIONS = {
    IDLE: ['PLANNING', 'CANCELLED'],
    PLANNING: ['WAITING_APPROVAL', 'EXECUTING', 'COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED'],
    WAITING_APPROVAL: ['PLANNING', 'EXECUTING', 'VERIFYING', 'REPAIRING', 'BLOCKED', 'CANCELLED'],
    EXECUTING: ['VERIFYING', 'WAITING_APPROVAL', 'COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED'],
    VERIFYING: ['COMPLETED', 'REPAIRING', 'WAITING_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELLED'],
    REPAIRING: ['VERIFYING', 'WAITING_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELLED'],
    COMPLETED: [], FAILED: [], CANCELLED: [],
    BLOCKED: ['EXECUTING', 'REPAIRING', 'PLANNING', 'CANCELLED']     // BLOCKED is resumable
  };
  var LIVE = ['PLANNING', 'WAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'REPAIRING'];
  var RUN_KEY = 'cs.nagent.run.v1';

  var SKIP = /(^|\/)(node_modules|\.git)(\/|$)/;
  var TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;

  function normPath(p) {
    p = String(p == null ? '' : p).trim().replace(/\\/g, '/').replace(/^\.\//, '');
    return p ? (p.charAt(0) === '/' ? p : '/' + p) : '';
  }
  function badPath(p) {
    if (!p) return 'a file path is required';
    if (/(^|\/)\.\.(\/|$)/.test(p)) return 'paths may not contain ".."';
    if (/^\/[A-Za-z]:/.test(p) || /^\/\//.test(p)) return 'only project-relative paths are allowed';
    if (p.slice(-1) === '/') return 'that is a folder, not a file';
    if (SKIP.test(p)) return p + ' is in a folder tools may not touch (node_modules / .git)';
    return null;
  }
  function lineCount(s) { return s === '' ? 0 : String(s).split('\n').length; }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '\n… (' + (s.length - n) + ' more characters)' : s; }
  function tail(s, n) { s = String(s == null ? '' : s); return s.length > n ? '… (earlier output omitted)\n' + s.slice(-n) : s; }
  function fail(text, status) { return { ok: false, status: status || 'error', text: text, summary: String(text).split('\n')[0].slice(0, 160) }; }
  function ok(text, summary, extra) { return Object.assign({ ok: true, status: 'done', text: text, summary: summary || String(text).split('\n')[0].slice(0, 160) }, extra || {}); }
  function hash(str) { var h = 5381; str = String(str); for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }

  /* ---------------------------------------------------------- arguments */

  // Validates (and gently coerces) tool arguments against a JSON-schema subset.
  // Recovered text-form tool calls go through exactly the same check.
  function validateArgs(schema, args) {
    if (args == null || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'arguments must be a JSON object' };
    var props = (schema && schema.properties) || {}, req = (schema && schema.required) || [], out = {};
    for (var i = 0; i < req.length; i++) {
      if (args[req[i]] === undefined || args[req[i]] === null) return { ok: false, error: 'missing required argument "' + req[i] + '"' };
    }
    var keys = Object.keys(args);
    for (var k = 0; k < keys.length; k++) {
      var name = keys[k], p = props[name], v = args[name];
      if (!p) continue;                                  // unknown extras are dropped, not fatal
      if (v === null || v === undefined) continue;
      switch (p.type) {
        case 'string':
          if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
          if (typeof v !== 'string') return { ok: false, error: 'argument "' + name + '" must be a string' };
          break;
        case 'integer':
          if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = parseInt(v, 10);
          if (typeof v !== 'number' || Math.floor(v) !== v) return { ok: false, error: 'argument "' + name + '" must be an integer' };
          break;
        case 'boolean':
          if (v === 'true') v = true; else if (v === 'false') v = false;
          if (typeof v !== 'boolean') return { ok: false, error: 'argument "' + name + '" must be true or false' };
          break;
        case 'array':
          if (!Array.isArray(v)) return { ok: false, error: 'argument "' + name + '" must be an array' };
          break;
        case 'object':
          if (typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'argument "' + name + '" must be an object' };
          break;
      }
      if (p.enum && p.enum.indexOf(v) < 0) return { ok: false, error: 'argument "' + name + '" must be one of: ' + p.enum.join(', ') };
      out[name] = v;
    }
    return { ok: true, args: out };
  }

  /* --------------------------------------------------------- permissions */

  // Permission classes: read | control | edit | exec | network | destructive | system
  // -> { action: 'allow' | 'ask' | 'deny' | 'propose' | 'apply', reason? }
  // ctx: { autonomy: { allows(action) }, planApproved }
  function decide(mode, perm, ctx) {
    ctx = ctx || {};
    var allows = function (a) { return !ctx.autonomy || ctx.autonomy.allows(a); };
    if (perm === 'read' || perm === 'control') return { action: 'allow' };
    if (mode === 'ask' || mode === 'plan') return { action: 'deny', reason: 'The ' + mode + ' mode is read-only: it can look at the project but not change it or run anything.' };
    if (perm === 'system') return { action: 'deny', reason: 'System-level changes are outside what the agent is allowed to do.' };
    if (perm === 'edit') {
      if (!allows('write')) return { action: 'deny', reason: 'Writing is turned off at the current autonomy level, so no change can be made or proposed.' };
      return { action: mode === 'edit' ? 'propose' : 'apply' };
    }
    if (perm === 'exec') {
      if (!allows('command')) return { action: 'deny', reason: 'Running commands is turned off at the current autonomy level.' };
      if (mode === 'auto' || (mode === 'agent' && ctx.planApproved)) return { action: 'allow' };
      return { action: 'ask' };
    }
    if (perm === 'network') {
      if (!allows('command') || !allows('network')) return { action: 'deny', reason: 'Network access is turned off at the current autonomy level.' };
      return { action: 'ask' };
    }
    if (perm === 'destructive') {
      if (!allows('write')) return { action: 'deny', reason: 'Changes are turned off at the current autonomy level.' };
      return { action: 'ask' };
    }
    return { action: 'deny', reason: 'Unknown permission class "' + perm + '".' };
  }

  /* ----------------------------------------------------- command policy */

  var JOB_PERM = { test: 'exec', build: 'exec', lint: 'exec', typecheck: 'exec', install: 'network' };
  var SCRIPT_RE = /^[A-Za-z0-9][\w:.-]*$/;

  function baseName(cmd) { return String(cmd || '').replace(/\\/g, '/').split('/').pop().replace(/\.(cmd|exe|bat|ps1)$/i, '').toLowerCase(); }

  // A path-like argument that leaves the project (or is absolute / ~).
  function escapesProject(a) {
    if (/^-/.test(a) && a.indexOf('=') < 0) return false;
    var v = a.indexOf('=') > 0 && /^-/.test(a) ? a.slice(a.indexOf('=') + 1) : a;
    if (/(^|[\\/])\.\.([\\/]|$)/.test(v)) return true;
    if (/^([A-Za-z]:[\\/]|[\\/]{1,2}[^\\/])/.test(v) && /[\\/]/.test(v) && v.length > 1) return true;
    if (/^~/.test(v)) return true;
    return false;
  }

  // The executable allowlist in the Electron main process only checks the
  // program name. This decides what a *given* argument list means: the class
  // (read / exec / network / destructive / system) or an outright refusal.
  // -> { perm, label, deny?, reasons[] }
  function classifyCommand(cmd, args) {
    var base = baseName(cmd), reasons = [];
    args = Array.isArray(args) ? args.slice() : [];
    var label = (base + ' ' + args.join(' ')).trim();
    var res = function (perm, why) { if (why) reasons.push(why); return { perm: perm, label: label, reasons: reasons }; };
    var refuse = function (why) { return { perm: 'system', label: label, deny: why, reasons: [why] }; };

    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (typeof a !== 'string') return refuse('arguments must be strings');
      if (/[\u0000-\u001f]/.test(a)) return refuse('control characters in an argument');
      if (/(&&|\|\||[|;&<>`]|\$\()/.test(a)) return refuse('shell operators are not allowed in arguments (' + a.slice(0, 20) + ')');
      if (/%[A-Za-z_]+%|\$\{?[A-Za-z_]/.test(a)) return refuse('environment-variable expansion is not allowed in arguments');
      if (escapesProject(a)) return refuse('"' + a.slice(0, 40) + '" points outside the project');
    }
    var sub = args.filter(function (x) { return !/^-/.test(x); })[0];
    var has = function () { for (var j = 0; j < arguments.length; j++) if (args.indexOf(arguments[j]) >= 0) return true; return false; };
    var hasPrefix = function (p) { return args.some(function (x) { return x.indexOf(p) === 0; }); };

    if (base === 'node') {
      if (has('-e', '--eval', '-p', '--print', '-r', '--require', '--import', '--loader', '--experimental-loader', '-i', '--interactive') || hasPrefix('--inspect') || hasPrefix('--eval=') || hasPrefix('--require=') || hasPrefix('--import='))
        return refuse('node with inline code, preloads or an inspector is not allowed — write a file and run it');
      if (has('--version', '-v') && args.length === 1) return res('read');
      if (args[0] === '--test' || has('--test')) return res('exec', 'runs the project\'s tests');
      var file = args.filter(function (x) { return !/^-/.test(x); })[0];
      if (file && /\.(c|m)?js$/i.test(file)) return res('exec', 'runs a project script');
      return refuse('node may only run a project .js/.mjs/.cjs file or --test');
    }
    if (base === 'npm' || base === 'pnpm' || base === 'yarn' || base === 'bun') {
      if (has('-g', '--global', '--location=global') || hasPrefix('--registry') || hasPrefix('--userconfig') || hasPrefix('--prefix') || hasPrefix('--globalconfig'))
        return refuse('changing global installs or package-manager configuration is not allowed');
      if (!sub) return refuse('a subcommand is required');
      if (sub === 'test' || sub === 't' || sub === 'tst') return res('exec', 'runs the project\'s test script');
      if (sub === 'start' || sub === 'stop' || sub === 'restart') return res('exec', 'starts or stops the project');
      if (sub === 'run' || sub === 'run-script') {
        var script = args.filter(function (x) { return !/^-/.test(x); })[1];
        if (!script || !SCRIPT_RE.test(script)) return refuse('run needs a script name');
        return res('exec', 'runs the project script "' + script + '"');
      }
      if (['install', 'i', 'add', 'ci', 'update', 'up', 'upgrade', 'dedupe', 'rebuild'].indexOf(sub) >= 0) return res('network', 'installs or updates packages (network)');
      if (['exec', 'x', 'dlx', 'create', 'init'].indexOf(sub) >= 0) return res('network', 'downloads and runs a package (network, arbitrary code)');
      if (['view', 'info', 'outdated', 'audit', 'search', 'fund'].indexOf(sub) >= 0) return res('network', 'queries the registry (network)');
      if (['ls', 'list', 'root', 'prefix', 'bin', 'explain', 'why'].indexOf(sub) >= 0 || (sub === 'pkg' && args.indexOf('get') >= 0)) return res('read');
      if (['uninstall', 'remove', 'rm', 'r', 'un', 'unlink'].indexOf(sub) >= 0) return res('destructive', 'removes packages');
      return refuse('npm "' + sub + '" is not an allowed subcommand (publish, login, config and similar are blocked)');
    }
    if (base === 'npx') return res('network', 'downloads and runs a package (network, arbitrary code)');
    if (base === 'git') {
      if (!sub) return refuse('a git subcommand is required');
      if (has('-c', '--exec-path') || hasPrefix('--git-dir') || hasPrefix('--work-tree') || hasPrefix('-C')) return refuse('git configuration / path overrides are not allowed');
      if (['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'blame', 'shortlog', 'describe', 'grep', 'cat-file'].indexOf(sub) >= 0) return res('read');
      if (sub === 'branch') return has('-d', '-D', '-m', '-M', '--delete', '--move', '-f', '--force') ? res('destructive', 'deletes or moves a branch') : res('read');
      if (sub === 'stash') return args.indexOf('drop') >= 0 || args.indexOf('clear') >= 0 ? res('destructive', 'drops stashes') : res('exec');
      if (['add', 'commit', 'switch', 'tag', 'init'].indexOf(sub) >= 0) {
        if ((sub === 'tag') && has('-d', '--delete')) return res('destructive', 'deletes a tag');
        return res('exec', 'records project history locally');
      }
      if (sub === 'checkout') return has('-b', '-B') ? res('exec') : res('destructive', 'checkout can overwrite working-tree files');
      if (['fetch', 'pull', 'clone', 'remote', 'submodule', 'ls-remote'].indexOf(sub) >= 0) return res('network', 'talks to a remote');
      if (['push', 'reset', 'clean', 'restore', 'rebase', 'merge', 'rm', 'mv', 'revert', 'cherry-pick', 'gc', 'filter-branch', 'update-ref'].indexOf(sub) >= 0) return res('destructive', 'can rewrite or discard work, or publish it');
      return refuse('git "' + sub + '" is not an allowed subcommand');
    }
    if (base === 'python' || base === 'python3') {
      if (has('-c', '-i')) return refuse('python with inline code is not allowed — write a file and run it');
      var mi = args.indexOf('-m');
      if (mi >= 0) {
        var mod = args[mi + 1];
        if (['pytest', 'unittest', 'py_compile', 'compileall', 'mypy', 'ruff', 'black', 'flake8'].indexOf(mod) >= 0) return res('exec');
        if (mod === 'pip') return args.indexOf('install') >= 0 || args.indexOf('download') >= 0 ? res('network', 'installs packages (network)') : args.indexOf('uninstall') >= 0 ? res('destructive') : res('read');
        if (mod === 'venv') return res('exec');
        return refuse('python -m "' + mod + '" is not an allowed module');
      }
      var py = args.filter(function (x) { return !/^-/.test(x); })[0];
      return py && /\.py$/i.test(py) ? res('exec', 'runs a project script') : refuse('python may only run a project .py file');
    }
    if (base === 'pip' || base === 'pip3') {
      if (sub === 'install' || sub === 'download') return res('network', 'installs packages (network)');
      if (sub === 'uninstall') return res('destructive');
      return ['list', 'show', 'freeze', 'check'].indexOf(sub) >= 0 ? res('read') : refuse('pip "' + sub + '" is not allowed');
    }
    if (['tsc', 'eslint', 'prettier', 'jest', 'vitest', 'mocha', 'vite', 'webpack', 'rollup', 'esbuild'].indexOf(base) >= 0) {
      if (base === 'vite' && (!sub || sub === 'dev' || sub === 'serve' || sub === 'preview')) return refuse('this starts a long-running server — use start_dev_server');
      if (has('--watch', '-w', '--watchAll', '--serve')) return refuse('watch / serve modes never exit — use start_dev_server');
      return res('exec', 'runs project tooling');
    }
    if (base === 'cargo') {
      if (['build', 'test', 'check', 'clippy', 'fmt', 'doc', 'bench', 'tree', 'metadata'].indexOf(sub) >= 0) return res('exec');
      if (['install', 'add', 'update', 'fetch', 'search', 'vendor'].indexOf(sub) >= 0) return res('network', 'fetches crates (network)');
      if (['clean', 'remove', 'uninstall'].indexOf(sub) >= 0) return res('destructive');
      return refuse('cargo "' + sub + '" is not allowed (publish, login and similar are blocked)');
    }
    if (base === 'go') {
      if (['build', 'test', 'vet', 'fmt', 'list', 'env', 'version'].indexOf(sub) >= 0) return res(sub === 'env' || sub === 'version' || sub === 'list' ? 'read' : 'exec');
      if (['get', 'install', 'mod', 'work'].indexOf(sub) >= 0) return res('network', 'may fetch modules (network)');
      if (sub === 'clean') return res('destructive');
      return refuse('go "' + sub + '" is not allowed');
    }
    if (base === 'make') return sub && SCRIPT_RE.test(sub) ? res('exec', 'runs a Makefile target') : refuse('make needs a plain target name');
    if (base === 'deno') {
      if (has('-A', '--allow-all') || hasPrefix('--allow-run') || hasPrefix('--allow-ffi')) return refuse('deno with broad permissions is not allowed');
      return ['test', 'check', 'lint', 'fmt', 'info'].indexOf(sub) >= 0 ? res('exec') : refuse('deno "' + sub + '" is not allowed');
    }
    return refuse('"' + base + '" is not an executable the agent may run');
  }

  function longRunning(cmd, args) {
    var b = baseName(cmd), sub = (args || []).filter(function (x) { return !/^-/.test(x); });
    if (/^(npm|pnpm|yarn|bun)$/.test(b)) return /^(start|dev|serve|watch)$/.test(sub[0] === 'run' || sub[0] === 'run-script' ? sub[1] : sub[0]);
    return false;
  }

  // The lines of `text` closest to `needle` (by shared words), for an error
  // message that helps a model that mis-copied the text it wanted to replace.
  function nearestLines(text, needle) {
    var words = function (l) { return String(l).toLowerCase().match(/[a-z0-9_$]+/g) || []; };
    var want = {}, nw = 0;
    String(needle).split('\n').forEach(function (l) { words(l).forEach(function (w) { if (!want[w]) { want[w] = true; nw++; } }); });
    if (!nw) return '';
    var lines = String(text).split('\n'), best = -1, bestScore = 0;
    lines.forEach(function (l, i) {
      var seen = {}, hit = 0;
      words(l).forEach(function (w) { if (want[w] && !seen[w]) { seen[w] = true; hit++; } });
      var score = hit / Math.max(nw, 1);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best < 0 || bestScore < 0.34) return '';
    var a = Math.max(0, best - 1), b = Math.min(lines.length, best + 2);
    return lines.slice(a, b).map(function (l, i) { return (a + i + 1) + '| ' + l; }).join('\n');
  }

  /* ------------------------------------------------------------- patches */

  function cleanPatchPath(s) {
    s = String(s).trim().replace(/\t.*$/, '').replace(/^"(.*)"$/, '$1');
    if (s === '/dev/null') return null;
    return normPath(s.replace(/^[ab]\//, ''));
  }

  // Unified diff -> [{ oldPath, newPath, hunks:[{ oldStart, lines:[{t,s}] }] }].
  // Hunk line counts are NOT trusted (models get them wrong); hunks are located
  // by their context instead.
  function parsePatch(text) {
    var lines = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
    var files = [], cur = null, hunk = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^--- /.test(l) && /^\+\+\+ /.test(lines[i + 1] || '')) {
        cur = { oldPath: cleanPatchPath(l.slice(4)), newPath: cleanPatchPath(lines[i + 1].slice(4)), hunks: [] };
        files.push(cur); hunk = null; i++; continue;
      }
      var h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
      if (h && cur) { hunk = { oldStart: parseInt(h[1], 10), lines: [] }; cur.hunks.push(hunk); continue; }
      if (!hunk) continue;
      if (/^diff --git /.test(l)) { hunk = null; continue; }
      if (l.charAt(0) === '\\') continue;                       // "\ No newline at end of file"
      var c = l.charAt(0);
      if (c === '+' || c === '-' || c === ' ') hunk.lines.push({ t: c, s: l.slice(1) });
      else if (l === '') hunk.lines.push({ t: ' ', s: '' });      // a blank context line some tools strip
    }
    // blank lines at the very end of a hunk are just the end of the patch text
    files.forEach(function (f) {
      f.hunks.forEach(function (h) { while (h.lines.length && h.lines[h.lines.length - 1].t === ' ' && h.lines[h.lines.length - 1].s === '') h.lines.pop(); });
    });
    return files;
  }

  function findBlock(hay, needle, from, loose) {
    if (!needle.length) return from;
    var eq = loose ? function (a, b) { return a.replace(/\s+$/, '') === b.replace(/\s+$/, ''); } : function (a, b) { return a === b; };
    var best = -1;
    for (var s = 0; s + needle.length <= hay.length; s++) {
      var okm = true;
      for (var j = 0; j < needle.length; j++) if (!eq(hay[s + j], needle[j])) { okm = false; break; }
      if (okm && (best < 0 || Math.abs(s - from) < Math.abs(best - from))) best = s;
    }
    return best;
  }

  // Applies parsed hunks to text. -> { ok, text, errors[] }
  function applyHunks(content, hunks) {
    var hay = String(content).split('\n'), errors = [], drift = 0;
    for (var h = 0; h < hunks.length; h++) {
      var hk = hunks[h];
      var oldLines = hk.lines.filter(function (x) { return x.t !== '+'; }).map(function (x) { return x.s; });
      var newLines = hk.lines.filter(function (x) { return x.t !== '-'; }).map(function (x) { return x.s; });
      var want = Math.max(0, hk.oldStart - 1 + drift);
      var at = findBlock(hay, oldLines, want, false);
      if (at < 0) at = findBlock(hay, oldLines, want, true);
      if (at < 0) { errors.push('hunk ' + (h + 1) + ' does not match the file (looking for: ' + JSON.stringify((oldLines[0] || '').slice(0, 60)) + ')'); continue; }
      hay.splice.apply(hay, [at, oldLines.length].concat(newLines));
      drift += newLines.length - oldLines.length;
    }
    return { ok: !errors.length, text: hay.join('\n'), errors: errors };
  }

  /* --------------------------------------------------------- diagnostics */

  // "at fn (C:\proj\a.js:12:5)", "at /x/a.js:3:1" ... -> [{ fn, file, line, col }] (no node internals)
  function parseStackFrames(text) {
    var frames = [], seen = {}, re = /\bat (?:(.*?) \()?((?:file:\/\/\/)?(?:[A-Za-z]:)?[^():\n]+?):(\d+)(?::(\d+))?\)?/g, m;
    text = String(text == null ? '' : text);
    while ((m = re.exec(text))) {
      var f = m[2].replace(/^file:\/\/\//, '');
      if (/^node:/.test(f) || /node_modules/.test(f) || /^internal\//.test(f)) continue;
      var key = f + ':' + m[3];
      if (seen[key]) continue;
      seen[key] = true;
      frames.push({ fn: m[1] || '', file: f, line: parseInt(m[3], 10), col: m[4] ? parseInt(m[4], 10) : null });
      if (frames.length >= 12) break;
    }
    return frames;
  }

  // An absolute or relative path from a stack -> a project path, or null.
  function toProjectPath(p, root, files) {
    p = String(p).replace(/\\/g, '/');
    var r = root ? String(root).replace(/\\/g, '/').replace(/\/+$/, '') : '';
    if (r && p.toLowerCase().indexOf(r.toLowerCase() + '/') === 0) { var rel = normPath(p.slice(r.length + 1)); return files.indexOf(rel) >= 0 ? rel : rel; }
    var parts = p.split('/'), best = null;
    for (var n = Math.min(parts.length, 6); n >= 1; n--) {
      var suffix = '/' + parts.slice(-n).join('/');
      var hit = files.filter(function (f) { return f === suffix || f.slice(-suffix.length) === suffix; });
      if (hit.length === 1) { best = hit[0]; break; }
      if (hit.length > 1) break;
    }
    return best;
  }

  // node:test output (spec or TAP reporter) -> counts and structured failures.
  function parseTestOutput(output) {
    // the desktop runner keeps the colour codes node:test prints when run through npm
    var out = String(output == null ? '' : output).replace(/\u001b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
    var res = { framework: 'unknown', pass: null, fail: null, total: null, failures: [] };
    if (/(?:ℹ|#) tests \d+|TAP version/.test(out)) res.framework = 'node:test';
    var g = function (re) { var m = re.exec(out); return m ? parseInt(m[1], 10) : null; };
    res.pass = g(/(?:^|\n)(?:ℹ|#) pass (\d+)/); res.fail = g(/(?:^|\n)(?:ℹ|#) fail (\d+)/); res.total = g(/(?:^|\n)(?:ℹ|#) tests (\d+)/);

    var idx = out.indexOf('failing tests:');
    if (idx >= 0) {
      out.slice(idx).split(/\n(?=test at )/).forEach(function (block) {
        var loc = /^test at (.+?):(\d+):(\d+)/.exec(block);
        if (!loc) return;
        var name = (/✖ (.+?)(?: \([\d.]+m?s\))?\s*$/m.exec(block) || [])[1] || '(unnamed)';
        var after = block.split('\n').slice(2), msg = [];
        for (var i = 0; i < after.length; i++) { if (/^\s+at /.test(after[i])) break; msg.push(after[i].replace(/^ {2}/, '')); }
        var message = msg.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        res.failures.push({ name: name, message: clip(message, 700), file: loc[1], line: parseInt(loc[2], 10), frames: parseStackFrames(block.split('\n').slice(2).join('\n')) });
      });
    }
    if (!res.failures.length && /(^|\n)not ok \d+/.test(out)) {
      out.split(/\n(?=# Subtest: )/).forEach(function (blk) {
        var nm = /^not ok \d+ - (.+)$/m.exec(blk);
        if (!nm) return;
        var err = /\n {2}error: \|-?\n((?: {4}.*\n?)*)/.exec(blk), loc = /location: '(.+?)'/.exec(blk);
        var message = err ? err[1].replace(/^ {4}/gm, '').trim() : '';
        var lm = loc ? /^(.*?):(\d+):(\d+)$/.exec(loc[1].replace(/\\\\/g, '\\')) : null;
        res.failures.push({ name: nm[1], message: clip(message, 700), file: lm ? lm[1] : null, line: lm ? parseInt(lm[2], 10) : null, frames: parseStackFrames(blk) });
      });
    }
    if ((res.fail || 0) > 0 && !res.failures.length) res.failures.push({ name: '(unparsed failure)', message: clip(out.slice(-800), 800), file: null, line: null, frames: parseStackFrames(out) });
    // not a test run at all (a build/syntax error etc.): keep the first error line
    if (res.framework === 'unknown') {
      var em = /(?:^|\n)((?:\w*Error)[^\n]*)/.exec(out);
      if (em) res.failures.push({ name: 'error', message: clip(em[1], 400), file: null, line: null, frames: parseStackFrames(out) });
    }
    return res;
  }

  // Files the model's own summary says it changed, that were not changed. Weak
  // models routinely report work they did not do; the harness checks the claim
  // against what actually changed on disk.
  function unbackedClaims(summary, changedPaths, files) {
    var text = String(summary || ''), out = [];
    if (!text) return out;
    (files || []).forEach(function (f) {
      if (changedPaths.indexOf(f) >= 0 || TEST_FILE.test(f)) return;
      var rel = f.slice(1), base = f.slice(f.lastIndexOf('/') + 1);
      var esc = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      var re = new RegExp('\\b(updated|modified|changed|edited|fixed|added|created|wrote|rewrote|replaced|refactored)\\b[^\\n]{0,90}?(?:' + esc(rel) + '|' + esc(base) + ')(?![\\w])', 'i');
      if (re.test(text)) out.push(f);
    });
    return out;
  }

  function failureSignature(failures) {
    return hash((failures || []).map(function (f) { return (f.name || '') + '|' + String(f.message || '').split('\n')[0].slice(0, 120); }).sort().join('\n'));
  }

  /* ---------------------------------------------------- context handling */

  // Keeps a long conversation inside a character budget by shortening the
  // oldest bulky tool results (never dropping messages, which would break the
  // assistant/tool-call pairing).
  function compactConvo(convo, maxChars) {
    maxChars = maxChars || 24000;
    var total = function () { return convo.reduce(function (n, m) { return n + String(m.content || '').length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0); }, 0); };
    var out = convo.slice();
    for (var i = 0; i < out.length - 6 && total() > maxChars; i++) {
      var m = out[i];
      if (m.role === 'tool' && String(m.content).length > 400) out[i] = Object.assign({}, m, { content: String(m.content).slice(0, 260) + '\n… [older tool output shortened to save context]' });
    }
    return out;
  }

  /* ============================================================ registry */

  var PROFILES = {
    ask: ['list_dir', 'read_file', 'grep', 'get_problems'],
    plan: ['list_dir', 'read_file', 'grep', 'get_problems', 'create_plan'],
    edit: ['list_dir', 'read_file', 'grep', 'get_problems', 'write_file', 'edit_file', 'create_file', 'apply_patch', 'run_command'],
    compact: ['list_dir', 'read_file', 'grep', 'edit_file', 'create_file', 'write_file', 'run_tests', 'read_diagnostics', 'update_plan', 'report_result'],
    full: ['list_dir', 'list_files', 'read_file', 'grep', 'get_problems', 'edit_file', 'create_file', 'write_file', 'apply_patch', 'rename_file', 'delete_file',
      'run_tests', 'build_project', 'run_command', 'start_dev_server', 'inspect_process', 'stop_process', 'inspect_logs',
      'read_diagnostics', 'analyze_stack_trace', 'inspect_diff', 'create_plan', 'update_plan', 'report_result', 'request_approval',
      'find_symbol', 'find_references', 'file_dependencies'],
    repair: ['read_file', 'grep', 'list_dir', 'edit_file', 'write_file', 'create_file', 'run_tests', 'read_diagnostics', 'analyze_stack_trace', 'report_result'],
    verify: []
  };

  // opts: { env, mode, planApproved, maxToolCalls, allowTestEdits, protectExisting, timeouts }
  function createRegistry(opts) {
    var env = opts.env, CA = window.CSChatAgent;
    if (!CA) throw new Error('NativeAgent needs app.chat.agent.js (CSChatAgent) loaded first');
    var cfg = { mode: opts.mode || 'edit', planApproved: !!opts.planApproved, profile: opts.profile || 'edit' };
    var base = CA.createToolbox(env);                 // read tools, overlay, text-call helpers
    var proposals = base.proposals;
    var history = [], plan = [], reported = null, lastExec = null, procs = {}, startedFiles = null;
    var budget = { toolCalls: 0, maxToolCalls: opts.maxToolCalls || 80 };
    var autonomy = { allows: function (a) {
      if (a === 'write') return env.canWrite ? !!env.canWrite() : true;
      if (a === 'command') return env.canCommand ? !!env.canCommand() : true;
      if (a === 'network') return env.canNetwork ? !!env.canNetwork() : true;
      if (a === 'repair') return env.canRepair ? !!env.canRepair() : true;
      return true;
    } };
    var self = { onPlan: null };

    /* ---- workspace: journal, checkpoints, overlay-aware reads ---- */
    var ws = (function () {
      var journal = [], marks = [{ id: 'cp0', label: 'start', seq: 0 }], created = {}, baseline = {}, seq = 0;
      if (opts.restoreJournal) {
        try {
          var saved = typeof opts.restoreJournal === 'string' ? JSON.parse(opts.restoreJournal) : opts.restoreJournal;
          if (saved && Array.isArray(saved.journal) && Array.isArray(saved.marks)) {
            journal = saved.journal; marks = saved.marks; created = saved.created || {};
            journal.forEach(function (e) { if (e.seq > seq) seq = e.seq; });
          }
        } catch (_) { /* a damaged journal means a fresh start, never a crash */ }
      }
      function persist() {
        if (!env.store || !env.store.set) return;
        try {
          var json = JSON.stringify({ journal: journal, marks: marks, created: created });
          if (json.length < 1500000) env.store.set('cs.nagent.journal.v1', json);
        } catch (_) { /* recoverability in memory only */ }
      }
      function write(path, content, kind) {
        var before = env.read(path);
        journal.push({ seq: ++seq, path: path, existed: before != null, before: before == null ? '' : String(before), kind: kind || 'write' });
        env.write(path, content); baseline[path] = content; persist();
      }
      function remove(path) {
        var before = env.read(path);
        journal.push({ seq: ++seq, path: path, existed: before != null, before: before == null ? '' : String(before), kind: 'delete' });
        if (env.remove) env.remove(path);
        delete baseline[path]; persist();
      }
      return {
        mark: function (label) { var id = 'cp' + (marks.length); marks.push({ id: id, label: label || id, seq: seq }); persist(); return id; },
        write: write, remove: remove,
        noteRead: function (p, c) { baseline[p] = c; },
        conflict: function (p) { return baseline[p] !== undefined && env.read(p) !== null && String(env.read(p)) !== String(baseline[p]); },
        created: created,
        isAgentCreated: function (p) { return !!created[p]; },
        revertTo: function (id) {
          var m = marks.filter(function (x) { return x.id === id; })[0];
          if (!m) return { ok: false, reverted: [] };
          var undo = journal.filter(function (e) { return e.seq > m.seq; }).reverse(), done = {};
          undo.forEach(function (e) {
            if (e.existed) env.write(e.path, e.before); else if (env.remove) env.remove(e.path);
            delete baseline[e.path]; done[e.path] = true;
          });
          journal = journal.filter(function (e) { return e.seq <= m.seq; });
          marks = marks.filter(function (x) { return x.seq <= m.seq || x.id === id; });
          persist();
          return { ok: true, reverted: Object.keys(done) };
        },
        revertAll: function () { return this.revertTo('cp0'); },
        // net change per file since a checkpoint
        changes: function (sinceId) {
          var m = marks.filter(function (x) { return x.id === (sinceId || 'cp0'); })[0] || marks[0];
          var first = {};
          journal.forEach(function (e) { if (e.seq > m.seq && !(e.path in first)) first[e.path] = e; });
          return Object.keys(first).map(function (p) {
            var e = first[p], now = env.read(p);
            var st = !e.existed ? (now == null ? null : 'added') : (now == null ? 'deleted' : 'modified');
            if (!st) return null;
            if (st === 'modified' && String(now) === e.before) return null;
            var d = env.diffStats ? env.diffStats(e.before, now == null ? '' : String(now)) : { added: lineCount(now || ''), removed: lineCount(e.before) };
            return { path: p, status: st, added: d.added, removed: d.removed };
          }).filter(Boolean);
        },
        journalSize: function () { return journal.length; },
        marks: function () { return marks.slice(); }
      };
    })();

    function current(path) { var pr = proposals.get(path); if (pr) return pr.after; var c = env.read(path); return c == null ? null : String(c); }
    function exists(path) { return current(path) != null; }
    function allPaths() {
      var set = {};
      (env.list() || []).forEach(function (p) { if (!SKIP.test(p)) set[p] = true; });
      proposals.forEach(function (_v, p) { set[p] = true; });
      return Object.keys(set).sort();
    }
    function protectedFile(path) {
      if (opts.allowTestEdits || !opts.protectExisting) return false;
      return TEST_FILE.test(path) && startedFiles && startedFiles[path];
    }

    // The single funnel every file change goes through.
    function stage(path, after, decision, note) {
      var bad = badPath(path); if (bad) return fail(bad);
      if (typeof after !== 'string') return fail('content must be a string');
      if (after.length > 300000) return fail('content is too large (' + after.length + ' characters; the limit is 300000).');
      if (protectedFile(path)) return fail(path + ' is an existing test file and is read-only for this task. Fix the code under test instead of changing the test.', 'blocked');
      var cur = current(path), disk = env.read(path), existed = disk != null;
      if (cur === after) return fail('No change: ' + path + ' already has that content.');
      var st = env.diffStats ? env.diffStats(cur == null ? '' : cur, after) : { added: lineCount(after), removed: lineCount(cur || '') };
      var summary = path + (existed ? '' : ' (new)') + ' +' + st.added + ' −' + st.removed;
      var asProposal = decision === 'propose';
      if (!asProposal && existed && env.isDirty && env.isDirty(path)) asProposal = true;     // never overwrite unsaved editor edits
      if (asProposal) {
        var p = proposals.get(path), before = p ? p.before : (existed ? String(disk) : '');
        proposals.set(path, { path: path, before: before, after: after, isNew: !existed && (!p || p.isNew) });
        return ok('Proposed ' + (existed ? 'change to ' : 'new file ') + path + ' (+' + st.added + ' −' + st.removed + '). It is NOT applied yet: the user will review it and may reject parts. Do not assume it exists on disk.' +
          (decision !== 'propose' ? ' (The file has unsaved edits in the editor, so this was queued for review instead of applied.)' : ''), summary, { staged: 'proposal' });
      }
      if (existed && ws.conflict(path)) return fail(path + ' changed after you read it (someone edited it). Read it again, then redo your change.', 'conflict');
      ws.write(path, after);
      if (!existed) ws.created[path] = true;
      proposals.delete(path);
      return ok('Applied ' + (existed ? 'change to ' : 'new file ') + path + ' (+' + st.added + ' −' + st.removed + ').' + (note ? ' ' + note : ''), summary, { staged: 'applied' });
    }

    /* ---- execution ---- */
    function execute(spec, hooks) {
      var t0 = Date.now();
      if (!env.exec && env.runJob && spec.kind === 'job') {
        return Promise.resolve(env.runJob(spec.job)).then(function (r) {
          r = r || {};
          lastExec = { label: spec.job, spec: spec, code: r.code == null ? -1 : r.code, output: String(r.output || '').slice(-200000), ms: r.ms || (Date.now() - t0), timedOut: !!r.timedOut, skipped: !!r.skipped, at: Date.now() };
          return lastExec;
        });
      }
      if (!env.exec) return Promise.resolve({ code: -1, output: 'This host cannot run commands.', ms: 0, skipped: true, unavailable: true });
      var label = spec.kind === 'job' ? spec.job : spec.kind === 'script' ? 'npm run ' + spec.script : (spec.cmd + ' ' + (spec.args || []).join(' '));
      return Promise.resolve(env.exec(spec, { signal: hooks && hooks.signal, timeoutMs: opts.execTimeoutMs })).then(function (r) {
        r = r || {};
        var out = String(r.output || '');
        lastExec = { label: label, spec: spec, code: r.code == null ? -1 : r.code, output: out.slice(-200000), ms: r.ms || (Date.now() - t0), timedOut: !!r.timedOut, skipped: !!r.skipped, at: Date.now() };
        return lastExec;
      });
    }
    function execResult(e, summaryLabel) {
      if (e.skipped) return ok(summaryLabel + ': skipped — ' + clip(e.output || 'nothing to run', 400), summaryLabel + ' — skipped');
      var parsed = parseTestOutput(e.output);
      var head = summaryLabel + ' finished with exit code ' + e.code + (e.timedOut ? ' (timed out)' : '') + '.';
      var counts = parsed.framework === 'node:test' ? ' ' + parsed.pass + ' passed, ' + parsed.fail + ' failed.' : '';
      var detail = tail(e.output, 6000);
      var body = head + counts + (parsed.failures.length && e.code !== 0 ? '\nFailures:\n' + parsed.failures.slice(0, 5).map(function (f) { return '- ' + f.name + (f.file ? ' (' + String(f.file).split(/[\\/]/).pop() + ':' + f.line + ')' : '') + ': ' + String(f.message).split('\n')[0]; }).join('\n') : '') + '\n' + detail;
      return { ok: e.code === 0, status: e.code === 0 ? 'done' : 'error', text: body, summary: summaryLabel + ' — exit ' + e.code + (parsed.framework === 'node:test' ? ' (' + parsed.pass + ' pass, ' + parsed.fail + ' fail)' : ''), detail: detail };
    }
    function snippetFor(file, line, radius) {
      var c = current(file); if (c == null) return null;
      var ls = c.split('\n'), a = Math.max(0, line - 1 - radius), b = Math.min(ls.length, line + radius);
      return ls.slice(a, b).map(function (t, i) { return (a + i + 1) + '| ' + t; }).join('\n');
    }
    function analyze(text) {
      var files = allPaths(), frames = parseStackFrames(text), seen = {}, out = [];
      frames.forEach(function (f) {
        var pp = toProjectPath(f.file, env.root, files);
        if (!pp || seen[pp + ':' + f.line]) return;
        seen[pp + ':' + f.line] = true;
        out.push({ path: pp, line: f.line, fn: f.fn, snippet: snippetFor(pp, f.line, 4) });
      });
      return out;
    }

    /* ---- tool definitions ---- */
    var T = {};
    function def(name, description, props, required, perm, handler, extra) {
      T[name] = Object.assign({ name: name, description: description, parameters: { type: 'object', properties: props, required: required || [] }, perm: perm, handler: handler }, extra || {});
    }
    var S = function (d) { return { type: 'string', description: d }; };

    // legacy / read tools delegate to the Phase 3 toolbox (same behaviour and text)
    ['list_dir', 'read_file', 'grep', 'get_problems'].forEach(function (n) {
      var b = base.defs.filter(function (d) { return d.name === n; })[0];
      T[n] = { name: n, description: b.description, parameters: b.parameters, perm: 'read', parallel: true,
        handler: function (a) {
          return base.call(n, a, {}).then(function (r) { if (n === 'read_file' && r.ok) { var p = normPath(a.path); var c = env.read(p); if (c != null) ws.noteRead(p, String(c)); } return r; });
        } };
    });

    // repository intelligence (M5): symbols, imports, references; reads through the overlay so it sees the agent's own edits
    var intel = (typeof window !== 'undefined' && window.Engine && window.Engine.RepoIntel) ? window.Engine.RepoIntel.create({ list: function () { return allPaths(); }, read: function (p) { return current(p); } }) : null;
    if (intel) {
      def('find_symbol', 'Find where a function, class, variable or type is defined (partial names work). Shows file, line, declaration and whether it is exported.', { name: S('Symbol name, e.g. slugify.') }, ['name'], 'read', function (a) {
        var r = intel.findSymbol(a.name);
        if (!r.length) return ok('No symbol named "' + a.name + '" in the project index. Try grep for other text.', 'none');
        return ok(r.slice(0, 15).map(function (x) { return x.path + ':' + x.line + '  ' + x.kind + (x.exported ? ' (exported)' : '') + '  ' + x.signature; }).join('\n'), r.length + ' match' + (r.length === 1 ? '' : 'es'));
      }, { parallel: true });
      def('find_references', 'Find where a name is used across the project (not its definition). Use before changing a function\'s signature or behaviour.', { name: S('Identifier, e.g. makeUrl.') }, ['name'], 'read', function (a) {
        var r = intel.references(a.name);
        if (!r.length) return ok('No other uses of "' + a.name + '" found.', 'none');
        return ok(r.map(function (x) { return x.path + ':' + x.line + '  ' + x.text; }).join('\n'), r.length + ' use' + (r.length === 1 ? '' : 's'));
      }, { parallel: true });
      def('file_dependencies', 'Show what a file imports (project files and packages) and which project files import it. Use to find what else a change can affect.', { path: S('File path.') }, ['path'], 'read', function (a) {
        var p = normPath(a.path), d = intel.deps(p);
        if (!current(p) && current(p) !== '') return fail('No such file: ' + p);
        var L = ['Imports: ' + (d.imports.filter(function (i) { return i.path; }).map(function (i) { return i.path + (i.names.length ? ' {' + i.names.join(', ') + '}' : ''); }).join('; ') || '(no project files)')];
        if (d.external.length) L.push('Packages: ' + d.external.join(', '));
        L.push('Imported by: ' + (d.importedBy.join(', ') || '(no project file)'));
        var ex = intel.exportsOf(p); if (ex.length) L.push('Exports: ' + ex.join(', '));
        return ok(L.join('\n'), d.importedBy.length + ' importer' + (d.importedBy.length === 1 ? '' : 's'));
      }, { parallel: true });
    }

    def('list_files', 'List project files recursively, optionally filtered by a glob such as "*.js" or "src/**".', { glob: S('Optional filter.') }, [], 'read', function (a) {
      var re = null;
      if (a.glob) { var g = String(a.glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0001/g, '.*'); re = new RegExp('^' + (a.glob.indexOf('/') < 0 ? '(?:.*/)?' : '/?') + g + '$', 'i'); }
      var ps = allPaths().filter(function (p) { return !re || re.test(p) || re.test(p.slice(1)); });
      return ok(ps.slice(0, 300).join('\n') + (ps.length > 300 ? '\n… ' + (ps.length - 300) + ' more' : '') || '(no files)', ps.length + ' file' + (ps.length === 1 ? '' : 's'));
    }, { parallel: true });

    def('read_diagnostics', 'Show what is currently wrong: the last test/build failures (parsed) plus the project validators\' problems.', {}, [], 'read', function () {
      var parts = [], problems = [];
      try { problems = env.getProblems ? env.getProblems() || [] : []; } catch (_) {}
      if (lastExec && lastExec.code !== 0) {
        var pr = parseTestOutput(lastExec.output);
        parts.push('Last run: ' + lastExec.label + ' → exit ' + lastExec.code + (pr.framework === 'node:test' ? ' (' + pr.pass + ' pass, ' + pr.fail + ' fail)' : ''));
        pr.failures.slice(0, 6).forEach(function (f) {
          var at = analyze((f.frames || []).map(function (x) { return 'at ' + x.file + ':' + x.line; }).join('\n'));
          parts.push('FAIL ' + f.name + '\n  ' + String(f.message).split('\n').slice(0, 6).join('\n  ') + (at.length ? '\n  at ' + at.slice(0, 3).map(function (x) { return x.path + ':' + x.line; }).join(', ') : ''));
        });
        if (!pr.failures.length) parts.push(tail(lastExec.output, 1500));
      } else if (lastExec) parts.push('Last run: ' + lastExec.label + ' → exit ' + lastExec.code + ' (passing)');
      else parts.push('Nothing has been run yet.');
      if (problems.length) parts.push('Validator problems:\n' + problems.slice(0, 20).map(function (p) { return '- ' + (p.severity || 'info') + ' ' + (p.file || '') + ': ' + p.message; }).join('\n'));
      return ok(parts.join('\n\n'), lastExec ? lastExec.label + ' — exit ' + lastExec.code : 'no runs yet');
    });

    def('analyze_stack_trace', 'Map a stack trace to project files and show the source around each frame. With no text, uses the last command output.', { text: S('The stack trace or error output.') }, [], 'read', function (a) {
      var src = a.text || (lastExec ? lastExec.output : '');
      if (!src) return fail('No text given and nothing has been run yet.');
      var at = analyze(src);
      if (!at.length) return ok('No stack frames point into project files.', 'no project frames');
      return ok(at.slice(0, 4).map(function (x) { return x.path + ':' + x.line + (x.fn ? ' in ' + x.fn : '') + '\n' + x.snippet; }).join('\n\n'), at.length + ' project frame' + (at.length === 1 ? '' : 's'));
    }, { parallel: true });

    def('inspect_diff', 'Show what has changed (proposed or applied) as a diff. Give a path for one file.', { path: S('Optional file.') }, [], 'read', function (a) {
      var rows = [];
      proposals.forEach(function (p) { rows.push({ path: p.path, before: p.before, after: p.after, state: 'proposed' }); });
      ws.changes().forEach(function (c) { var j = c; rows.push({ path: j.path, state: j.status, before: null, after: current(j.path), stat: j }); });
      var want = a.path ? normPath(a.path) : null;
      rows = rows.filter(function (r) { return !want || r.path === want; });
      if (!rows.length) return ok('No changes yet.', 'no changes');
      return ok(rows.slice(0, 8).map(function (r) {
        var st = r.stat ? '+' + r.stat.added + ' −' + r.stat.removed : '';
        if (r.before == null) return '# ' + r.path + ' (' + r.state + ') ' + st;
        return '# ' + r.path + ' (' + r.state + ')\n' + simpleDiff(r.before, r.after);
      }).join('\n\n'), rows.length + ' changed file' + (rows.length === 1 ? '' : 's'));
    });

    def('create_plan', 'Record the plan: 3 to 7 short concrete steps (name the files and how you will verify).', { steps: { type: 'array', description: 'Array of step strings.' } }, ['steps'], 'control', function (a) {
      var steps = (a.steps || []).map(function (s) { return typeof s === 'string' ? s : (s && (s.text || s.step || s.title)) || ''; }).filter(Boolean).slice(0, 12);
      if (!steps.length) return fail('steps must be a non-empty array of strings');
      plan = steps.map(function (t, i) { return { id: i + 1, text: String(t).slice(0, 240), status: i === 0 ? 'in_progress' : 'pending' }; });
      if (self.onPlan) self.onPlan(plan);
      return ok('Plan recorded (' + plan.length + ' steps).', plan.length + ' steps');
    });
    def('update_plan', 'Mark a plan step: pending, in_progress, done or blocked.', { step: { type: 'integer', description: 'Step number, from 1.' }, status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'blocked'] }, note: S('Optional note.') }, ['step', 'status'], 'control', function (a) {
      var s = plan.filter(function (x) { return x.id === a.step; })[0];
      if (!s) return fail('There is no step ' + a.step + (plan.length ? ' (the plan has ' + plan.length + ')' : ' — there is no plan yet') + '.');
      s.status = a.status; if (a.note) s.note = String(a.note).slice(0, 200);
      if (self.onPlan) self.onPlan(plan);
      return ok('Step ' + s.id + ' is now ' + s.status + '.', 'step ' + s.id + ' → ' + s.status);
    });
    def('report_result', 'Finish: say what you did and whether you finished or are blocked. The harness verifies your work afterwards.', { summary: S('What you did, briefly.'), status: { type: 'string', enum: ['done', 'blocked'] } }, ['summary'], 'control', function (a) {
      reported = { summary: String(a.summary).slice(0, 1200), status: a.status === 'blocked' ? 'blocked' : 'done' };
      return ok('Result recorded. Stop calling tools now.', reported.status);
    });
    def('request_approval', 'Ask the user to approve something risky before you do it.', { action: S('What you want to do.'), reason: S('Why.') }, ['action'], 'control', function (a, ctx) {
      var ask = ctx.hooks && ctx.hooks.approve ? ctx.hooks.approve({ kind: 'agent', label: String(a.action).slice(0, 200), detail: String(a.reason || '').slice(0, 400) }) : Promise.resolve(false);
      return Promise.resolve(ask).then(function (yes) { return yes ? ok('The user approved: ' + a.action, 'approved') : { ok: false, status: 'denied', text: 'The user declined. Do not do it.', summary: 'declined' }; });
    });

    /* edits */
    var requireCur = function (path) { var c = current(path); return c == null ? null : c; };
    def('create_file', 'Create a new file with the given content (fails if it already exists).', { path: S('File path.'), content: S('Complete file content.') }, ['path', 'content'], 'edit', function (a, ctx) {
      var p = normPath(a.path);
      if (exists(p)) return fail(p + ' already exists. Use edit_file to change it, or write_file to replace all of it.');
      return stage(p, a.content, ctx.decision);
    });
    def('write_file', 'Set the COMPLETE new content of a file (creates it if new). Prefer edit_file for small changes.', { path: S('File path.'), content: S('Complete file content.') }, ['path', 'content'], 'edit', function (a, ctx) {
      return stage(normPath(a.path), a.content, ctx.decision);
    });
    def('edit_file', 'Replace exact text in a file: old_text must appear exactly once (unless replace_all). Copy it from read_file.', { path: S('File path.'), old_text: S('Exact text to replace.'), new_text: S('Replacement text.'), replace_all: { type: 'boolean', description: 'Replace every occurrence.' } }, ['path', 'old_text', 'new_text'], 'edit', function (a, ctx) {
      var p = normPath(a.path), bad = badPath(p); if (bad) return fail(bad);
      var cur = requireCur(p);
      if (cur == null) return fail('File not found: ' + p + '. Use create_file for a new file.');
      if (a.old_text === '') return fail('old_text must not be empty. Use write_file to replace the whole file.');
      var eol = cur.indexOf('\r\n') >= 0, needle = a.old_text, repl = a.new_text;
      if (eol) { needle = needle.replace(/\r?\n/g, '\r\n'); repl = repl.replace(/\r?\n/g, '\r\n'); }
      var count = 0, i = -1; while ((i = cur.indexOf(needle, i + 1)) >= 0) { count++; if (count > 50) break; }
      if (!count) {
        // forgive trailing-whitespace differences line by line (models often add or drop them)
        var hay = cur.split(eol ? '\r\n' : '\n'), nl = needle.split(eol ? '\r\n' : '\n');
        var at = findBlock(hay, nl, 0, true);
        if (at < 0) {
          var near = nearestLines(cur, a.old_text);
          return fail('old_text was not found in ' + p + '. Copy it exactly from read_file (including indentation), or use write_file.' + (near ? '\nThe closest text in the file is:\n' + near : ''));
        }
        if (findBlock(hay.slice(at + 1), nl, 0, true) >= 0 && !a.replace_all) return fail('old_text matches more than one place in ' + p + '. Include more surrounding lines so it is unique.');
        hay.splice.apply(hay, [at, nl.length].concat(repl.split(eol ? '\r\n' : '\n')));
        return stage(p, hay.join(eol ? '\r\n' : '\n'), ctx.decision);
      }
      if (count > 1 && !a.replace_all) return fail('old_text matches ' + count + ' places in ' + p + '. Include more surrounding lines so it is unique, or set replace_all.');
      var next = a.replace_all ? cur.split(needle).join(repl) : cur.replace(needle, function () { return repl; });
      return stage(p, next, ctx.decision);
    });
    def('apply_patch', 'Apply a unified diff (--- / +++ / @@ hunks) to one or more files. Context lines must match.', { patch: S('The unified diff text.') }, ['patch'], 'edit', function (a, ctx) {
      var files = parsePatch(a.patch);
      if (!files.length) return fail('No file sections found. A patch needs "--- path", "+++ path" and "@@" hunks.');
      var results = [], failed = [];
      // all-or-nothing: compute every file first
      var plans = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i], path = f.newPath || f.oldPath;
        if (!path) { failed.push('a file section has no path'); continue; }
        var cur = f.oldPath ? current(f.oldPath) : '';
        if (f.oldPath && cur == null) { failed.push(f.oldPath + ' does not exist'); continue; }
        var r = applyHunks(cur == null ? '' : cur, f.hunks);
        if (!r.ok) { failed.push(path + ': ' + r.errors.join('; ')); continue; }
        plans.push({ path: path, text: r.text, remove: f.newPath == null ? f.oldPath : null });
      }
      if (failed.length) return fail('Patch not applied — ' + failed.join(' | ') + '. Nothing was changed.');
      plans.forEach(function (pl) { results.push(pl.remove ? fail('deleting through a patch is not supported; use delete_file') : stage(pl.path, pl.text, ctx.decision)); });
      var bad = results.filter(function (r) { return !r.ok; });
      if (bad.length) return fail(bad.map(function (r) { return r.text; }).join(' | '));
      return ok(results.map(function (r) { return r.text; }).join('\n'), results.map(function (r) { return r.summary; }).join(', '));
    });
    def('rename_file', 'Rename or move a file.', { from: S('Current path.'), to: S('New path.') }, ['from', 'to'], function (a) { return { perm: 'edit', label: 'Rename ' + normPath(a.from) + ' → ' + normPath(a.to) }; }, function (a, ctx) {
      var from = normPath(a.from), to = normPath(a.to), bad = badPath(from) || badPath(to); if (bad) return fail(bad);
      var cur = current(from);
      if (cur == null) return fail('File not found: ' + from);
      if (exists(to)) return fail(to + ' already exists.');
      if (protectedFile(from)) return fail(from + ' is an existing test file and is read-only for this task.', 'blocked');
      if (env.isDirty && env.isDirty(from)) return fail(from + ' has unsaved edits in the editor; save or discard them first.');
      if (ws.conflict(from)) return fail(from + ' changed after you read it. Read it again.', 'conflict');
      ws.write(to, cur, 'rename-to'); ws.remove(from); ws.created[to] = true;
      return ok('Renamed ' + from + ' → ' + to + '.', from + ' → ' + to);
    });
    def('delete_file', 'Delete a file. Files you did not create need the user\'s approval.', { path: S('File path.') }, ['path'], function (a) {
      var p = normPath(a.path); return { perm: ws.isAgentCreated(p) ? 'edit' : 'destructive', label: 'Delete ' + p };
    }, function (a, ctx) {
      var p = normPath(a.path), bad = badPath(p); if (bad) return fail(bad);
      if (!exists(p)) return fail('File not found: ' + p);
      if (protectedFile(p)) return fail(p + ' is an existing test file and is read-only for this task.', 'blocked');
      if (proposals.has(p) && proposals.get(p).isNew) { proposals.delete(p); return ok('Dropped the proposed new file ' + p + '.', p + ' dropped'); }
      if (env.isDirty && env.isDirty(p)) return fail(p + ' has unsaved edits in the editor; save or discard them first.');
      ws.remove(p);
      return ok('Deleted ' + p + ' (recoverable from the checkpoint).', 'deleted ' + p);
    });

    /* execution tools */
    // Never ask the user to approve something this host cannot do.
    var noJobs = function () { return env.jobsAvailable && !env.jobsAvailable() ? 'Commands run only in the desktop app with a project folder open.' : null; };
    var jobTool = function (job, label) {
      return function (a, ctx) {
        var spec = job === 'test' && a && a.path ? testSpec(a.path) : { kind: 'job', job: job };
        if (spec.error) return Promise.resolve(fail(spec.error));
        if (env.jobsAvailable && !env.jobsAvailable()) return Promise.resolve(fail('Commands run only in the desktop app with a project folder open.', 'blocked'));
        return execute(spec, ctx.hooks).then(function (e) { return execResult(e, label); });
      };
    };
    function testSpec(path) {
      var p = normPath(path), bad = badPath(p);
      if (bad) return { error: bad };
      if (!/\.(c|m)?[jt]s$/i.test(p)) return { error: 'run_tests can target a single .js/.mjs/.cjs test file; omit path to run everything.' };
      return { kind: 'cmd', cmd: 'node', args: ['--test', p.slice(1)] };
    }
    def('run_tests', 'Run the project\'s tests (optionally one test file). Returns pass/fail counts and the failures.', { path: S('Optional single test file.') }, [], 'exec', jobTool('test', 'tests'), { timeoutMs: 600000, requires: noJobs });
    def('build_project', 'Run the project\'s build script.', {}, [], 'exec', jobTool('build', 'build'), { timeoutMs: 600000, requires: noJobs });
    def('run_acceptance_tests', 'Run the project\'s acceptance / end-to-end script, if it has one.', {}, [], 'exec', function (a, ctx) {
      var pkg = null; try { pkg = JSON.parse(env.read('/package.json') || 'null'); } catch (_) {}
      var sc = (pkg && pkg.scripts) || {}, name = ['acceptance', 'test:acceptance', 'e2e', 'test:e2e'].filter(function (n) { return sc[n]; })[0];
      if (!name) return Promise.resolve(fail('The project has no acceptance / e2e script.'));
      return execute({ kind: 'script', script: name }, ctx.hooks).then(function (e) { return execResult(e, name); });
    }, { timeoutMs: 900000, requires: noJobs });
    def('run_command', 'Run a project command. Either {job: test|build|lint|typecheck|install} or {command, args:[...]} (no shell syntax). Each run is checked and may need the user\'s approval.',
      { job: { type: 'string', enum: ['install', 'test', 'build', 'lint', 'typecheck'] }, command: S('Executable, e.g. node.'), args: { type: 'array', description: 'Arguments, one string each.' } }, [],
      function (a) {
        if (a.job) return { perm: JOB_PERM[a.job] || 'exec', label: 'Run the project\'s "' + a.job + '" job' };
        if (!a.command) return { perm: 'read', deny: 'give either job or command' };
        var c = classifyCommand(a.command, a.args || []);
        if (!c.deny && longRunning(a.command, a.args || [])) return { perm: 'exec', deny: 'this starts a long-running server that never exits — use start_dev_server' };
        return { perm: c.perm, label: 'Run: ' + c.label, deny: c.deny, detail: c.reasons.join('; ') };
      },
      function (a, ctx) {
        if (env.jobsAvailable && !env.jobsAvailable()) return Promise.resolve(fail('Commands run only in the desktop app with a project folder open.', 'blocked'));
        var spec = a.job ? { kind: 'job', job: a.job } : { kind: 'cmd', cmd: a.command, args: (a.args || []).map(String) };
        return execute(spec, ctx.hooks).then(function (e) { return execResult(e, a.job || (a.command + ' ' + (a.args || []).join(' ')).trim()); });
      }, { timeoutMs: 900000, requires: noJobs });
    def('start_dev_server', 'Start the project\'s dev server in the background. Returns a process id; read its output with inspect_logs.', { command: S('Executable (default: npm).'), args: { type: 'array', description: 'Arguments (default: ["start"]).' } }, [],
      function (a) {
        var cmd = a.command || 'npm', args = a.args || ['start'], c = classifyCommand(cmd, args);
        return { perm: c.perm === 'read' ? 'exec' : c.perm, label: 'Start: ' + c.label, deny: c.deny && !/long-running|never exit/.test(c.deny) ? c.deny : null };
      },
      function (a) {
        if (!env.startServer) return fail('This host cannot start background processes.', 'blocked');
        return Promise.resolve(env.startServer({ cmd: a.command || 'npm', args: a.args || ['start'] })).then(function (p) {
          if (!p || !p.id) return fail('The server did not start.');
          procs[p.id] = p;
          return ok('Started process ' + p.id + '. Use inspect_logs to read its output and stop_process to stop it.', 'process ' + p.id);
        }, function (e) { return fail('Could not start: ' + ((e && e.message) || e)); });
      });
    def('inspect_process', 'List background processes started by start_dev_server, or show one.', { id: S('Optional process id.') }, [], 'read', function (a) {
      var ids = Object.keys(procs).filter(function (k) { return !a.id || k === String(a.id); });
      if (!ids.length) return ok('No background processes.', 'none');
      return ok(ids.map(function (k) { var p = procs[k]; return k + ': ' + (p.running === undefined ? 'unknown' : (typeof p.running === 'function' ? p.running() : p.running) ? 'running' : 'stopped'); }).join('\n'), ids.length + ' process(es)');
    });
    def('stop_process', 'Stop a background process.', { id: S('Process id.') }, ['id'], 'exec', function (a) {
      var p = procs[a.id]; if (!p) return fail('No process ' + a.id);
      try { p.stop(); } catch (e) { return fail('Could not stop: ' + e.message); }
      delete procs[a.id]; return ok('Stopped process ' + a.id + '.', 'stopped ' + a.id);
    });
    def('inspect_logs', 'Read the last lines of a background process\'s output, or of the last command (id "last").', { id: S('Process id, or "last".'), lines: { type: 'integer', description: 'How many lines (default 40).' } }, [], 'read', function (a) {
      var n = Math.min(200, a.lines || 40), txt;
      if (!a.id || a.id === 'last') { if (!lastExec) return ok('Nothing has been run yet.', 'no runs'); txt = lastExec.output; }
      else { var p = procs[a.id]; if (!p) return fail('No process ' + a.id); txt = typeof p.logs === 'function' ? p.logs() : String(p.logs || ''); }
      return ok(String(txt).split('\n').slice(-n).join('\n') || '(no output)', 'last ' + n + ' lines');
    }, { parallel: true });

    /* ---- the dispatcher ---- */
    function names() { var p = PROFILES[cfg.profile] || PROFILES.edit; return p; }
    function activeDefs() {
      return names().filter(function (n) { return T[n]; }).map(function (n) { return { name: n, description: T[n].description, parameters: T[n].parameters }; });
    }

    // "src/format.js imports slugify from src/text.js, which does not export it": caught the moment it is written
    // related: keep only problems that involve this file (as importer or as target), THEN take the first few, so
    // problems that were already there in other files cannot crowd out the one the edit just caused
    function importNotes(only, related) {
      if (!intel) return [];
      var probs = intel.importProblems(only);
      if (related) probs = probs.filter(function (x) { return x.from === related || x.to === related; });
      return probs.slice(0, 3).map(function (x) {
        return x.from + ' imports "' + x.name + '" from ' + x.to + (x.why === 'declared-not-exported' ? ', which defines it but does NOT export it (add it to the exports there)' : ', which does not provide it');
      });
    }
    function withImportNotes(res, args) {
      try {
        var p = args && args.path ? normPath(args.path) : null;
        var notes = importNotes(null, p);
        if (notes.length) return Object.assign({}, res, { text: String(res.text || '') + '\n\nHeads-up from the project index — this will fail when the code runs:\n- ' + notes.join('\n- ') });
      } catch (_) { /* a hint, never a failure */ }
      return res;
    }

    function call(name, args, hooks) {
      hooks = hooks || {};
      var d = T[name];
      if (!d || names().indexOf(name) < 0) {
        return Promise.resolve(fail('Unknown or unavailable tool "' + name + '". Available: ' + names().join(', ') + '.'));
      }
      // a tool with no required arguments may be called with "", [] or null
      if ((args == null || typeof args !== 'object' || Array.isArray(args)) && !((d.parameters && d.parameters.required) || []).length) args = {};
      var v = validateArgs(d.parameters, args);
      if (!v.ok) return Promise.resolve(fail('Bad arguments for ' + name + ': ' + v.error + '.'));
      args = v.args;
      if (++budget.toolCalls > budget.maxToolCalls) return Promise.resolve(fail('The tool-call budget (' + budget.maxToolCalls + ') is used up. Finish with report_result.', 'blocked'));
      var EDIT_TOOLS = { edit_file: 1, write_file: 1, create_file: 1, apply_patch: 1, rename_file: 1 };
      var t0 = Date.now(), finish = function (res) {
        if (intel && res && res.ok && EDIT_TOOLS[name]) res = withImportNotes(res, args);
        history.push({ at: t0, name: name, status: res.status, ms: Date.now() - t0, summary: res.summary });
        if (history.length > 400) history.shift();
        return res;
      };
      var pr; try { pr = typeof d.perm === 'function' ? d.perm(args) : d.perm; } catch (e) { return Promise.resolve(finish(fail('Tool "' + name + '" crashed: ' + e.message))); }
      var p = typeof pr === 'string' ? { perm: pr } : pr;
      if (p.deny) return Promise.resolve(finish(fail('Not allowed: ' + p.deny + '.', 'blocked')));
      var dec = decide(cfg.mode, p.perm, { autonomy: autonomy, planApproved: cfg.planApproved });
      if (dec.action === 'deny') return Promise.resolve(finish(fail(dec.reason, 'blocked')));
      var unavailable = d.requires ? d.requires(args) : null;
      if (unavailable) return Promise.resolve(finish(fail(unavailable, 'blocked')));
      // Edit mode keeps everything as proposals; a rename/delete can't be one, so it asks instead
      if (dec.action === 'propose' && (name === 'rename_file' || name === 'delete_file')) dec = { action: 'ask' };
      var go = function (decision, approved) {
        var run;
        try { run = Promise.resolve(d.handler(args, { decision: decision, approved: approved, hooks: hooks, signal: hooks.signal })); }
        catch (e) { return Promise.resolve(finish(fail('Tool "' + name + '" crashed: ' + ((e && e.message) || e)))); }
        var tmo = opts.toolTimeoutMs || d.timeoutMs || 60000;
        var timer, timed = new Promise(function (resolve) { timer = setTimeout(function () { resolve(fail('Tool "' + name + '" timed out after ' + Math.round(tmo / 1000) + 's.', 'timeout')); }, tmo); });
        return Promise.race([run, timed]).then(function (res) { clearTimeout(timer); return finish(res); }, function (e) { clearTimeout(timer); return finish(fail('Tool "' + name + '" failed: ' + ((e && e.message) || e))); });
      };
      if (dec.action === 'ask') {
        if (!hooks.approve) return Promise.resolve(finish({ ok: false, status: 'denied', text: 'This needs the user\'s approval and there is no way to ask. Continue without it.', summary: name + ' — needs approval' }));
        return Promise.resolve(hooks.approve({ kind: p.perm, tool: name, label: p.label || ('Run ' + name), detail: p.detail || '', job: args.job })).then(function (yes) {
          if (!yes) return finish({ ok: false, status: 'denied', text: 'The user declined: ' + (p.label || name) + '. Do not retry it; continue without, or explain what you wanted to check.', summary: (p.label || name) + ' — declined' });
          return go('apply', true);
        });
      }
      return go(dec.action, false);
    }

    return {
      defs: Object.keys(T).map(function (n) { return { name: n, description: T[n].description, parameters: T[n].parameters }; }),
      activeDefs: activeDefs,
      parallelSafe: function (n) { return !!(T[n] && T[n].parallel) && names().indexOf(n) >= 0; },
      importNotes: importNotes, call: call, proposals: proposals, ws: ws, history: history, budget: budget,
      get plan() { return plan; }, set plan(v) { plan = v; },
      get reported() { return reported; }, set reported(v) { reported = v; },
      get lastExec() { return lastExec; }, get procs() { return procs; }, get intel() { return intel; },
      setMode: function (m) { cfg.mode = m; }, setProfile: function (p) { cfg.profile = p; }, get mode() { return cfg.mode; }, get profile() { return cfg.profile; },
      setPlanApproved: function (b) { cfg.planApproved = !!b; },
      beginTask: function () { startedFiles = {}; (env.list() || []).forEach(function (p) { startedFiles[p] = true; }); budget.toolCalls = 0; reported = null; },
      onPlan: function (fn) { self.onPlan = fn; },
      execute: execute, execResult: execResult, analyze: analyze, current: current, allPaths: allPaths,
      stopReason: function () { return budget.toolCalls >= budget.maxToolCalls ? 'budget' : null; },
      stopProcesses: function () { Object.keys(procs).forEach(function (k) { try { procs[k].stop(); } catch (_) {} delete procs[k]; }); },
      allowTestEdits: function (b) { opts.allowTestEdits = !!b; }
    };
  }

  // A small readable diff: common head/tail trimmed, the middle shown as -/+ lines.
  function simpleDiff(a, b) {
    var A = String(a == null ? '' : a).split('\n'), B = String(b == null ? '' : b).split('\n'), h = 0;
    while (h < A.length && h < B.length && A[h] === B[h]) h++;
    var ta = A.length, tb = B.length;
    while (ta > h && tb > h && A[ta - 1] === B[tb - 1]) { ta--; tb--; }
    var out = ['@@ line ' + (h + 1) + ' @@'];
    A.slice(h, ta).slice(0, 60).forEach(function (l) { out.push('-' + l); });
    B.slice(h, tb).slice(0, 60).forEach(function (l) { out.push('+' + l); });
    return out.join('\n');
  }

  /* ============================================================ the run */

  function createRun(opts) {
    opts = opts || {};
    var store = opts.store || null;
    var run = {
      id: opts.id || ('run_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      goal: opts.goal || '', mode: opts.mode || 'agent', state: 'IDLE', history: [], plan: [], attempts: [], verification: [],
      result: null, createdAt: Date.now(), updatedAt: Date.now(), violations: 0, resumable: false, note: ''
    };
    function save() {
      run.updatedAt = Date.now();
      if (store && store.set) { try { store.set(RUN_KEY, JSON.stringify(run)); } catch (_) {} }
    }
    function transition(to, reason) {
      if (STATES.indexOf(to) < 0 || (TRANSITIONS[run.state] || []).indexOf(to) < 0) { run.violations++; return false; }
      run.state = to; run.history.push({ state: to, at: Date.now(), reason: reason || '' });
      run.resumable = to === 'BLOCKED';
      save();
      if (typeof opts.onState === 'function') { try { opts.onState(to, run); } catch (_) {} }
      return true;
    }
    return { run: run, transition: transition, save: save, isTerminal: function () { return run.state === 'COMPLETED' || run.state === 'FAILED' || run.state === 'CANCELLED'; } };
  }

  // A run that was live when the page/app went away cannot be trusted to be
  // mid-flight: it comes back BLOCKED ("interrupted") and may be resumed.
  function loadRun(store) {
    var rec = null;
    try { rec = JSON.parse(store.get(RUN_KEY) || 'null'); } catch (_) { rec = null; }
    if (!rec || !rec.state) return null;
    if (LIVE.indexOf(rec.state) >= 0) {
      rec.history = (rec.history || []).concat([{ state: 'BLOCKED', at: Date.now(), reason: 'interrupted while ' + rec.state }]);
      rec.state = 'BLOCKED'; rec.resumable = true; rec.note = 'interrupted';
      try { store.set(RUN_KEY, JSON.stringify(rec)); } catch (_) {}
    }
    return rec;
  }

  /* ------------------------------------------------------------- prompts */

  var BASE_RULES =
    'You are CodeSovereign\'s coding agent working inside the user\'s project, using tools.\n' +
    'Rules: read a file before you change it. Prefer edit_file (exact old_text -> new_text); use create_file for new files and write_file only to replace a whole file. ' +
    'Keep changes minimal and focused. Never weaken, skip or delete existing tests to make them pass: fix the code under test. ' +
    'If a tool returns an error, read it and adjust; do not repeat the same call.';

  // Small local models mis-copy the exact text edit_file needs; on a small
  // project, replacing a whole short file is far more reliable.
  var SMALL_MODEL_RULES =
    '\nFor any file shorter than about 80 lines, use write_file with the COMPLETE new content of the file (keep everything that should stay): ' +
    'it is more reliable than edit_file, which needs an exact text match. Use edit_file only for long files.';

  /* ------------------------------------------------ project memory (M6) */
  // env.memory = { all() -> [{ kind, title, body, meta, at }], remember(kind, title, body, meta) } is supplied by the
  // host (the app wires it to Engine.ProjectBrain). The agent writes only facts it can state from evidence — the
  // user's goal, the files really changed, what the harness verified — never the model's free text, so a memory
  // cannot smuggle instructions into later prompts. Reading is relevance-selected and size-bounded.

  function memWords(s) {
    var RI = typeof window !== 'undefined' && window.Engine && window.Engine.RepoIntel;
    if (RI && RI.words) return RI.words(s);
    return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4; });
  }

  // items: stored memories, newest last. -> the ones worth showing for this goal, best first
  function selectMemories(items, goal, files, max) {
    var gw = memWords(goal), fl = files || [], out = [], latestTests = null;
    (items || []).forEach(function (it, idx) {
      if (!it || !it.meta || !it.meta.agent) return;                      // only memories the native agent wrote
      var hay = memWords(it.title + ' ' + it.body), score = 0;
      gw.forEach(function (w) { if (hay.indexOf(w) >= 0) score += 3; });
      (it.meta.files || []).forEach(function (f) { if (fl.indexOf(f) >= 0) score += 5; });
      if (it.meta.type === 'verify') latestTests = it;                    // the newest "how to verify" fact is always useful
      if (score >= 3) out.push({ it: it, score: score + idx / 1000 });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    var picked = out.slice(0, max || 4).map(function (x) { return x.it; });
    if (latestTests && picked.indexOf(latestTests) < 0) picked.push(latestTests);
    return picked;
  }

  function memoryText(items, maxChars) {
    if (!items.length) return '';
    var lines = ['Project memory (facts recorded by earlier tasks in this project; treat as hints, the code is the truth):'], used = lines[0].length;
    items.forEach(function (it) {
      var m = it.meta || {}, when = it.at ? new Date(it.at).toISOString().slice(0, 10) : '';
      var line = '- ' + (when ? when + ' ' : '') + it.title + ': ' + String(it.body).replace(/\s+/g, ' ').slice(0, 260);
      if (used + line.length > (maxChars || 1100)) return;
      lines.push(line); used += line.length + 1;
    });
    return lines.length > 1 ? lines.join('\n') : '';
  }

  function remember(env, kind, title, body, meta) {
    if (!env || !env.memory) return false;
    try {
      var all = env.memory.all() || [], last = null;
      for (var i = all.length - 1; i >= 0; i--) if (all[i] && all[i].title === title) { last = all[i]; break; }
      if (last && last.body === body) return false;                       // no duplicates of the same fact
      env.memory.remember(kind, title, body, Object.assign({ agent: true }, meta || {}));
      // the brain also lives in a file inside the project: make sure that file reaches the disk
      if (env.flush) { try { Promise.resolve(env.flush()).catch(function () {}); } catch (_) {} }
      return true;
    } catch (_) { return false; }                                         // memory is an aid; it must never break a run
  }

  function rememberOutcome(env, run, status, reason, changes, goal) {
    var files = (changes || []).map(function (c) { return c.path; });
    if (['verified', 'unverified', 'blocked', 'failed'].indexOf(status) < 0) return;
    if (!files.length && status !== 'blocked') return;
    var lastV = (run.verification || [])[run.verification.length - 1];
    var vtxt = lastV ? lastV.steps.map(function (s) { return s.label + (s.pass != null ? ' ' + s.pass + ' pass/' + s.fail + ' fail' : ' exit ' + s.code); }).join(', ') : 'not verified';
    var title = 'Task (' + status + '): ' + clip(String(goal).replace(/\s+/g, ' '), 90);
    var body = (status === 'verified' ? 'Verified by the harness (' + vtxt + ').' : status === 'unverified' ? 'Finished but NOT verified (' + vtxt + ').' : status === 'blocked' ? 'BLOCKED: ' + clip(String(reason || '').replace(/\s+/g, ' '), 200) : 'FAILED.') +
      (files.length ? ' Changed: ' + files.slice(0, 8).join(', ') + '.' : '') + (run.attempts && run.attempts.length ? ' Repair attempts: ' + run.attempts.length + '.' : '');
    remember(env, 'artifacts', title, body, { type: 'task', status: status, files: files.slice(0, 12), at: Date.now() });
    if (status === 'verified' && lastV && lastV.ok === true) {
      remember(env, 'tests', 'How to verify this project', 'The harness verified with: ' + vtxt + '.', { type: 'verify' });
    }
  }

  // goal/focus (optional): when the repository index is available, add the files most relevant to
  // the goal and how they are linked by imports, so a multi-file change is seen as one change
  function projectSummary(env, reg, goal, focus, toolset) {
    var files = reg.allPaths().slice(0, 60), pkg = null;
    try { pkg = JSON.parse(env.read('/package.json') || 'null'); } catch (_) {}
    var lines = ['Project files (' + files.length + (reg.allPaths().length > 60 ? '+' : '') + '):', files.join('\n')];
    if (pkg && pkg.scripts) lines.push('package.json scripts: ' + JSON.stringify(pkg.scripts));
    if (goal && reg.intel) {
      try { var blk = reg.intel.contextBlock(goal, { focus: focus || [], maxChars: toolset === 'compact' ? 2600 : 4000 }); if (blk) lines.push('', blk); } catch (_) { /* the index is an aid, never a blocker */ }
    }
    return lines.join('\n');
  }

  function planText(plan) { return plan.map(function (s) { return s.id + '. [' + s.status + '] ' + s.text; }).join('\n'); }

  // numbered / bulleted lines in a model's prose -> steps
  function stepsFromText(text) {
    var steps = [];
    String(text || '').split('\n').forEach(function (l) {
      var m = /^\s*(?:\d+[.)]|[-*•])\s+(.{6,})$/.exec(l);
      if (m) steps.push(m[1].replace(/\*\*/g, '').trim());
    });
    return steps.slice(0, 8);
  }

  function verificationPlan(env) {
    if (typeof env.verifyPlan === 'function') return env.verifyPlan() || [];
    var pkg = null, plan = [], files = env.list() || [];
    try { pkg = JSON.parse(env.read('/package.json') || 'null'); } catch (_) {}
    var sc = (pkg && pkg.scripts) || {};
    if (sc.test && !/no test specified/i.test(sc.test)) plan.push({ label: 'tests', spec: { kind: 'job', job: 'test' } });
    else if (files.some(function (f) { return TEST_FILE.test(f) && /\.[cm]?js$/.test(f); })) plan.push({ label: 'tests', spec: { kind: 'cmd', cmd: 'node', args: ['--test'] } });
    if (sc.build) plan.push({ label: 'build', spec: { kind: 'job', job: 'build' } });
    return plan;
  }

  /* ------------------------------------------------------------ task run */

  // opts: { goal, mode: plan|agent|auto, env, chatStream, signal, hooks, budgets, chatOptions,
  //         toolset: 'compact'|'full', contextChars, store, resumeFrom }
  // hooks: onState, onPlan, approvePlan(plan,info)->bool, approve(req)->bool, onVerify(v), onAttempt(a),
  //        onTurnStart/onText/onTurnEnd/onToolStart/onToolDone/onNoTools (forwarded to the turn loop)
  function runTask(opts) {
    var env = opts.env, hooks = opts.hooks || {}, mode = opts.mode === 'plan' || opts.mode === 'auto' ? opts.mode : 'agent';
    var B = Object.assign({ maxTurns: 14, maxToolCalls: 80, maxRepairs: 3, maxMs: 30 * 60 * 1000, contextChars: 24000 }, opts.budgets || {});
    var toolset = opts.toolset === 'full' ? 'full' : 'compact';
    var CA = window.CSChatAgent;
    var t0 = Date.now();
    var machine = createRun({ goal: opts.goal, mode: mode, store: env.store, onState: hooks.onState });
    var run = machine.run;
    if (opts.resumeFrom) { run.id = opts.resumeFrom.id; run.plan = opts.resumeFrom.plan || []; run.attempts = opts.resumeFrom.attempts || []; run.verification = opts.resumeFrom.verification || []; run.history = (opts.resumeFrom.history || []).slice(); run.state = 'BLOCKED'; }
    var allowTests = /\b(add|write|create|update|extend)\b[^.]*\btests?\b/i.test(opts.goal || '');
    var resumed = !!opts.resumeFrom;
    var reg = createRegistry({ env: env, mode: mode === 'plan' ? 'plan' : mode, planApproved: mode === 'auto', restoreJournal: resumed && env.store ? env.store.get('cs.nagent.journal.v1') : null, maxToolCalls: B.maxToolCalls, protectExisting: true, allowTestEdits: allowTests, execTimeoutMs: B.execTimeoutMs });
    reg.beginTask();
    reg.onPlan(function (p) { run.plan = p.map(function (s) { return Object.assign({}, s); }); machine.save(); if (hooks.onPlan) hooks.onPlan(run.plan); });
    var cp0 = (function () {
      if (resumed) { var first = reg.ws.marks().filter(function (m) { return m.label === 'task start'; })[0]; if (first) return first.id; }
      return reg.ws.mark('task start');
    })();
    if (env.snapshot) { try { Promise.resolve(env.snapshot('agent task: ' + String(opts.goal).slice(0, 60))).catch(function () {}); } catch (_) {} }

    var aborted = function () { return !!(opts.signal && opts.signal.aborted); };
    var overBudget = function () { return (Date.now() - t0) > B.maxMs ? 'time' : reg.stopReason(); };
    var turnsUsed = 0;

    // approvals pause the run in WAITING_APPROVAL and resume the state it left
    var approve = function (req) {
      if (!hooks.approve) return Promise.resolve(false);
      var back = run.state;
      machine.transition('WAITING_APPROVAL', req.label);
      return Promise.resolve(hooks.approve(req)).then(function (yes) { if (run.state === 'WAITING_APPROVAL') machine.transition(back, yes ? 'approved' : 'declined'); return yes; });
    };

    function loop(profile, system, user, label) {
      reg.setProfile(profile);
      var messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
      return CA.runLoop({
        chatStream: opts.chatStream, messages: messages, toolbox: reg, signal: opts.signal, maxTurns: B.maxTurns,
        approve: approve, chatOptions: opts.chatOptions, compact: function (c) { return compactConvo(c, B.contextChars); },
        shouldStop: function () { return overBudget() || (reg.reported ? 'reported' : null); },
        onTurnStart: function (n) { turnsUsed++; if (hooks.onTurnStart) hooks.onTurnStart(n, label); },
        onText: hooks.onText, onTurnEnd: hooks.onTurnEnd, onToolStart: hooks.onToolStart, onToolDone: hooks.onToolDone, onNoTools: hooks.onNoTools
      });
    }

    function finish(status, text, extra) {
      var changes = reg.ws.changes(cp0);
      var report = buildReport(run, { status: status, summary: text, changes: changes, reg: reg, turns: turnsUsed, ms: Date.now() - t0, budgets: B, claim: lastClaim });
      run.result = { status: status, summary: text }; machine.save();
      if (!opts.noMemory) rememberOutcome(env, run, status, text, changes, opts.goal);
      return { run: run, report: report, registry: reg, changes: changes };
    }
    function stopped(reason) { return reason === 'budget' ? 'the tool-call budget ran out' : reason === 'time' ? 'the time budget ran out' : reason === 'max-turns' ? 'the turn limit was reached' : reason === 'repeat' ? 'the model kept repeating the same call' : reason; }

    /* verify: run each verification step; stop at the first failing one */
    function verify() {
      var steps = verificationPlan(env), results = [];
      if (!steps.length) return Promise.resolve({ ran: false, ok: null, results: [], note: 'The project has no test or build command to run, so the result could not be verified.' });
      var chain = Promise.resolve(true);
      steps.forEach(function (st) {
        chain = chain.then(function (cont) {
          if (!cont || aborted()) return false;
          return reg.execute(st.spec, { signal: opts.signal }).then(function (e) {
            var parsed = parseTestOutput(e.output);
            var good = e.code === 0 && !(parsed.framework === 'node:test' && (parsed.fail || 0) > 0);
            var empty = st.label === 'tests' && parsed.framework === 'node:test' && parsed.total === 0;
            results.push({ label: st.label, cmd: e.label, code: e.code, ms: e.ms, ok: good && !empty, empty: empty, skipped: e.skipped, pass: parsed.pass, fail: parsed.fail, total: parsed.total, failures: parsed.failures, outputTail: tail(e.output, 3000), timedOut: e.timedOut });
            return good;
          });
        });
      });
      return chain.then(function () {
        var failed = results.filter(function (r) { return !r.ok && !r.skipped && !r.empty; });
        var skipped = results.length && results.every(function (r) { return r.skipped || r.empty; });
        var v = { ran: true, ok: failed.length ? false : (skipped ? null : true), results: results, at: Date.now(),
          note: skipped ? 'The verification commands did not run any tests.' : '' };
        run.verification.push({ at: v.at, ok: v.ok, steps: results.map(function (r) { return { label: r.label, cmd: r.cmd, code: r.code, pass: r.pass, fail: r.fail, ms: r.ms }; }) });
        machine.save();
        if (hooks.onVerify) hooks.onVerify(v);
        return v;
      });
    }

    function failCount(v) { var n = 0; v.results.forEach(function (r) { if (!r.ok && !r.skipped) n += Math.max(1, r.fail || 0); }); return n; }
    function allFailures(v) { var out = []; v.results.forEach(function (r) { (r.failures || []).forEach(function (f) { out.push(f); }); if (!r.ok && !(r.failures || []).length) out.push({ name: r.label + ' failed', message: r.outputTail.slice(-600), file: null, line: null, frames: [] }); }); return out; }

    function repairBrief(v, attemptNo) {
      var fs = allFailures(v).slice(0, 5), parts = ['Verification failed (attempt ' + attemptNo + ' of ' + B.maxRepairs + '). ' + failCount(v) + ' failing.'];
      fs.forEach(function (f, i) {
        parts.push('Failure ' + (i + 1) + ': ' + f.name + '\n' + String(f.message).split('\n').slice(0, 8).join('\n'));
        var at = reg.analyze((f.frames || []).map(function (x) { return 'at ' + x.file + ':' + x.line; }).join('\n') + (f.file ? '\nat ' + f.file + ':' + (f.line || 1) : ''));
        at.slice(0, 3).forEach(function (x) { parts.push('Source ' + x.path + ':' + x.line + '\n' + x.snippet); });
      });
      // the code this task has already changed is the prime suspect: show it as it is now
      reg.ws.changes(cp0).filter(function (c) { return c.status !== 'deleted' && !TEST_FILE.test(c.path); }).slice(0, 2).forEach(function (c) {
        parts.push('Current content of ' + c.path + ' (changed by you):\n' + clip(reg.current(c.path) || '', 1800));
      });
      // what else the change can reach: files that import what was changed, and the code the failing tests load
      if (reg.intel) {
        try {
          var chPaths = reg.ws.changes(cp0).map(function (c) { return c.path; });
          var imp = reg.intel.impacted(chPaths).filter(function (x) { return !x.test; }).slice(0, 4);
          if (imp.length) parts.push('Linked files you have NOT changed: ' + imp.map(function (x) { return x.path + ' (imports ' + x.because.join(', ') + ')'; }).join('; ') + '. If your change affects what the first file provides, these may need the matching change.');
          var linked = [];
          fs.forEach(function (f) { if (f.file) { var tp = toProjectPath(f.file, env.root, reg.allPaths()); if (tp) reg.intel.deps(tp).imports.forEach(function (i) { if (i.path && linked.indexOf(i.path) < 0 && !TEST_FILE.test(i.path)) linked.push(i.path); }); } });
          var inotes = reg.importNotes(null);
          if (inotes.length) parts.push('Import problems found by the project index (likely the cause): ' + inotes.join('; ') + '.');
          if (linked.length) parts.push('The failing test loads: ' + linked.slice(0, 5).join(', ') + '. The cause is in one of these or in what they import.');
        } catch (_) { /* hints only */ }
      }
      var done = run.attempts.filter(function (a) { return a.outcome !== 'running'; });
      if (done.length) parts.push('Earlier attempts:\n' + done.map(function (a) { return '- attempt ' + a.n + ' changed ' + (a.changed.join(', ') || 'nothing') + ' → ' + a.outcome; }).join('\n'));
      var claimed = unbackedClaims(lastClaim, reg.ws.changes(cp0).map(function (c) { return c.path; }), reg.allPaths());
      if (claimed.length) parts.push('IMPORTANT: you reported changing ' + claimed.join(', ') + ' but ' + (claimed.length === 1 ? 'it is' : 'they are') + ' UNCHANGED on disk. That is part of why the tests fail — make that change.');
      parts.push('Find the cause in the SOURCE (not the tests), fix it with ' + (toolset === 'compact' ? 'write_file (whole file)' : 'edit_file') + ', then call report_result.');
      return parts.join('\n\n');
    }

    function repairLoop(v) {
      var best = failCount(v), lastSig = failureSignature(allFailures(v)), sameCount = 0, bestVerif = v;
      function attempt(n) {
        if (aborted()) { machine.transition('CANCELLED', 'cancelled'); return Promise.resolve(finish('cancelled', 'Cancelled by the user.')); }
        var why = overBudget(); if (why) { machine.transition('BLOCKED', stopped(why)); return Promise.resolve(finish('blocked', 'Stopped: ' + stopped(why) + '.')); }
        if (n > B.maxRepairs) { machine.transition('BLOCKED', 'repair attempts exhausted'); return Promise.resolve(finish('blocked', 'Tests still fail after ' + B.maxRepairs + ' repair attempts.', { verification: bestVerif })); }
        machine.transition('REPAIRING', 'attempt ' + n);
        var mark = reg.ws.mark('before attempt ' + n);
        if (reg.reported) lastClaim = reg.reported.summary;
        reg.reported = null;
        var rec = { n: n, signature: lastSig, failBefore: best, changed: [], outcome: 'running' };
        run.attempts.push(rec); machine.save();
        if (hooks.onAttempt) hooks.onAttempt(rec);
        var sys = system + '\nYou are repairing a failing project. The plan and goal are context; the failing output is what matters now.';
        var user = goalText() + '\n\n' + repairBrief(v, n);
        return loop('repair', sys, user, 'repair ' + n).then(function (lr) {
          rec.changed = reg.ws.changes(mark).map(function (c) { return c.path; });
          if (lr.reason === 'aborted') { machine.transition('CANCELLED', 'cancelled'); rec.outcome = 'cancelled'; return finish('cancelled', 'Cancelled by the user.'); }
          machine.transition('VERIFYING', 'after repair ' + n);
          return verify().then(function (nv) {
            var fc = nv.ok === false ? failCount(nv) : 0, sig = failureSignature(allFailures(nv));
            if (nv.ok !== false) { rec.outcome = nv.ok ? 'fixed' : 'unverified'; rec.failAfter = 0; machine.save(); return nv; }
            rec.failAfter = fc;
            if (fc > best && rec.changed.length) {
              reg.ws.revertTo(mark); rec.outcome = 'reverted — it made things worse (' + best + ' → ' + fc + ' failing)'; machine.save();
              return verify().then(function (back) { v = back; return nextAttempt(n); });
            }
            rec.outcome = fc < best ? 'improved (' + best + ' → ' + fc + ' failing)' : 'no progress (' + fc + ' failing)';
            if (sig === lastSig && !rec.changed.length) sameCount++; else if (sig === lastSig) sameCount += 0.5; else sameCount = 0;
            if (fc < best) { best = fc; bestVerif = nv; }
            lastSig = sig; v = nv; machine.save();
            if (sameCount >= 2) { rec.outcome += ' — same failure persists'; return Promise.resolve('stuck'); }
            return nextAttempt(n);
          });
        });
      }
      function nextAttempt(n) { return attempt(n + 1); }
      return attempt(1).then(function (r) {
        if (r && r.run) return r;                                    // a finished task report
        if (r === 'stuck') { machine.transition('BLOCKED', 'same failure persists'); return finish('blocked', 'The same failure persists after repeated repairs; stopping instead of looping.', { verification: v }); }
        // r is a passing verification
        return afterVerified(r);
      });
    }

    function afterVerified(v) {
      if (v.ok === null) { machine.transition('COMPLETED', 'unverified'); return finish('unverified', v.note || 'Nothing could be verified.'); }
      machine.transition('COMPLETED', 'verified');
      run.plan.forEach(function (s) { if (s.status !== 'blocked') s.status = 'done'; });
      reg.plan = run.plan; machine.save(); if (hooks.onPlan) hooks.onPlan(run.plan);
      return finish('verified', 'All verification steps passed.');
    }

    /* ---- the machine ---- */
    // the goal plus any context the user attached (@selection, @file, @problems)
    // earlier tasks' recorded facts that matter for this goal (and the files it is likely to touch)
    function memoryBlock() {
      if (!env.memory || opts.noMemory) return '';
      try {
        var files = reg.intel ? reg.intel.rank(opts.goal, { limit: 6 }).map(function (r) { return r.path; }) : [];
        return memoryText(selectMemories(env.memory.all() || [], opts.goal, files, 4), 1100);
      } catch (_) { return ''; }
    }
    var memoText = null;                       // computed once per run: the memory does not change while it works
    function goalText() {
      if (memoText == null) memoText = memoryBlock();
      return 'Goal: ' + opts.goal + (opts.context ? '\n\nAttached context:\n' + String(opts.context).slice(0, 12000) : '') + (memoText ? '\n\n' + memoText : '');
    }
    function autonomyAllows(a) { return a === 'repair' ? (env.canRepair ? !!env.canRepair() : true) : true; }
    var system = BASE_RULES + (toolset === 'compact' ? SMALL_MODEL_RULES : '');

    function plan() {
      machine.transition('PLANNING', 'start');
      var user = goalText() + '\n\n' + projectSummary(env, reg, opts.goal, [], toolset) + '\n\nLook at what you need (briefly), then call create_plan with 3 to 7 concrete steps that name the files to change and how the result will be verified. Do not edit anything yet.';
      return loop('plan', system + '\nYou are in the PLANNING step: read-only.', user, 'plan').then(function (lr) {
        if (lr.reason === 'aborted') { machine.transition('CANCELLED', 'cancelled'); return finish('cancelled', 'Cancelled by the user.'); }
        if (!run.plan.length) {
          var st = stepsFromText(lr.text);
          if (!st.length) st = ['Read the code that is involved', 'Make the change', 'Run the project\'s tests to verify'];
          run.plan = st.map(function (t, i) { return { id: i + 1, text: t, status: i === 0 ? 'in_progress' : 'pending' }; });
          reg.plan = run.plan; machine.save(); if (hooks.onPlan) hooks.onPlan(run.plan);
        }
        return null;
      });
    }

    // The last few tool failures of this phase, quoted back when the model quits early.
    var recentErrors = [], nudges = 0, lastClaim = '';
    var trackDone = hooks.onToolDone;
    hooks = Object.assign({}, hooks, { onToolDone: function (c, res) {
      if (res && res.ok === false && res.status !== 'blocked') { recentErrors.push(c.name + ': ' + String(res.text).slice(0, 500)); if (recentErrors.length > 3) recentErrors.shift(); }
      if (trackDone) trackDone(c, res);
    } });

    function execute(nudge) {
      reg.reported = null;
      var user = goalText() + '\n\nPlan:\n' + planText(run.plan) + '\n\n' + projectSummary(env, reg, opts.goal + '\n' + planText(run.plan), reg.ws.changes(cp0).map(function (c) { return c.path; }), toolset) +
        '\n\nCarry out the plan with the tools. When the change is made, call report_result. The harness will run the project\'s tests itself afterwards, so you do not need to.' +
        (nudge ? '\n\n' + nudge : '');
      return loop(toolset, system + '\nYou are EXECUTING the plan.', user, nudge ? 'execute (retry ' + nudges + ')' : 'execute').then(function (lr) {
        if (lr.reason === 'aborted') { machine.transition('CANCELLED', 'cancelled'); return finish('cancelled', 'Cancelled by the user.'); }
        if (['budget', 'time', 'repeat', 'max-turns'].indexOf(lr.reason) >= 0) run.note = 'stopped: ' + stopped(lr.reason);
        return afterExec(lr);
      });
    }

    function afterExec(lr) {
      var changes = reg.ws.changes(cp0);
      // The model quit without changing anything and did not say it was blocked:
      // that is usually a failed edit it gave up on. Push back, bounded.
      if (!changes.length && nudges < 2 && !(reg.reported && reg.reported.status === 'blocked') && !overBudget() && !aborted() && !(lr && ['budget', 'time'].indexOf(lr.reason) >= 0)) {
        nudges++;
        return execute('No file has been changed yet, so the goal is NOT met.' +
          (recentErrors.length ? '\nYour last tool failures were:\n' + recentErrors.join('\n') : '') +
          '\nMake the change now: read the file, then use edit_file (copy old_text exactly) or write_file with the COMPLETE new file content. ' +
          'Only if it is truly impossible, call report_result with status "blocked" and say why.');
      }
      // an honest "I am blocked" is a BLOCKED run with the model's reason, whether or not it touched anything
      if (reg.reported && reg.reported.status === 'blocked') { machine.transition('BLOCKED', 'agent reported blocked'); return finish('blocked', reg.reported.summary); }
      if (!changes.length) {
        machine.transition('COMPLETED', 'no changes');
        return finish('no-changes', 'The agent finished without changing any file' + (reg.reported ? ': ' + reg.reported.summary : '.'));
      }
      lastClaim = reg.reported ? reg.reported.summary : '';
      machine.transition('VERIFYING', 'after execution');
      return verify().then(function (v) {
        if (aborted()) { machine.transition('CANCELLED', 'cancelled'); return finish('cancelled', 'Cancelled by the user.'); }
        if (v.ok !== false) return afterVerified(v);
        // Autonomy decides whether failures may be fixed automatically (Build level: no)
        if (!autonomyAllows('repair')) {
          machine.transition('BLOCKED', 'automatic repair is turned off');
          return finish('blocked', 'Verification failed, and automatic repair is turned off at the current autonomy level, so no further edits were made.', { verification: v });
        }
        return repairLoop(v);
      });
    }

    function start() {
      if (opts.resumeFrom && run.plan.length) {      // an interrupted run: keep the plan and what it already did
        reg.plan = run.plan;
        var approvedBefore = mode === 'auto' || (opts.resumeFrom.history || []).some(function (h) { return h.reason === 'plan approved'; });
        if (approvedBefore) { reg.setMode('agent'); reg.setPlanApproved(true); machine.transition('EXECUTING', 'resumed'); return execute(); }
        // the plan was never approved before the interruption: ask now, as at the start
        return approveThenExecute();
      }
      return plan().then(function (done) {
        if (done) return done;
        if (mode === 'plan') { machine.transition('COMPLETED', 'plan only'); return finish('planned', 'Plan ready (nothing was changed).'); }
        if (mode === 'auto') { machine.transition('EXECUTING', 'autonomous: no plan approval'); return execute(); }
        return approveThenExecute();
      });
    }

    function approveThenExecute() {
      machine.transition('WAITING_APPROVAL', 'plan approval');
      var info = { verify: verificationPlan(env).map(function (s) { return s.label; }) };
      return Promise.resolve(hooks.approvePlan ? hooks.approvePlan(run.plan, info) : false).then(function (yes) {
        if (!yes) { machine.transition('CANCELLED', 'plan not approved'); return finish('cancelled', 'The plan was not approved, so nothing was changed.'); }
        reg.setPlanApproved(true);
        machine.transition('EXECUTING', 'plan approved');
        return execute();
      });
    }

    var started;
    try { started = start(); } catch (e) { started = Promise.reject(e); }
    return started.then(function (r) { return r; }, function (e) {
      if (!machine.isTerminal()) machine.transition('FAILED', String((e && e.message) || e));
      var out = finish('failed', 'The agent run failed: ' + String((e && e.message) || e));
      out.error = e; return out;
    });
  }

  /* -------------------------------------------------------------- report */

  function buildReport(run, x) {
    var L = [], head = { verified: 'VERIFIED', unverified: 'COMPLETED — NOT VERIFIED', blocked: 'BLOCKED', failed: 'FAILED', cancelled: 'CANCELLED', planned: 'PLAN ONLY', 'no-changes': 'NO CHANGES' }[x.status] || String(x.status).toUpperCase();
    L.push('**' + head + '** — ' + x.summary);
    if (run.plan && run.plan.length) L.push('', 'Plan:', run.plan.map(function (s) { return '- [' + (s.status === 'done' ? 'x' : ' ') + '] ' + s.text; }).join('\n'));
    if (x.changes && x.changes.length) {
      L.push('', 'Changed files:', x.changes.map(function (c) { return '- ' + c.path + ' (' + c.status + ', +' + c.added + ' −' + c.removed + ')'; }).join('\n'));
      var tests = x.changes.filter(function (c) { return TEST_FILE.test(c.path); });
      if (tests.length) L.push('', 'Note: test files were touched: ' + tests.map(function (c) { return c.path; }).join(', '));
    }
    if (x.reg && x.reg.proposals.size) L.push('', 'Proposed (not applied): ' + Array.from(x.reg.proposals.keys()).join(', '));
    var unbacked = x.claim ? unbackedClaims(x.claim, (x.changes || []).map(function (c) { return c.path; }), x.reg ? x.reg.allPaths() : []) : [];
    if (unbacked.length) L.push('', 'Warning: the agent said it changed ' + unbacked.join(', ') + ', but ' + (unbacked.length === 1 ? 'that file was' : 'those files were') + ' not changed.');
    if (run.verification && run.verification.length) {
      L.push('', 'Verification runs:', run.verification.map(function (v, i) {
        return (i + 1) + '. ' + (v.ok === true ? 'passed' : v.ok === false ? 'FAILED' : 'unverified') + ' — ' + v.steps.map(function (s) { return s.label + ' (exit ' + s.code + (s.pass != null ? ', ' + s.pass + ' pass / ' + s.fail + ' fail' : '') + ')'; }).join('; ');
      }).join('\n'));
    }
    if (run.attempts && run.attempts.length) L.push('', 'Repair attempts:', run.attempts.map(function (a) { return '- #' + a.n + ': ' + (a.changed.join(', ') || 'no file changes') + ' → ' + a.outcome; }).join('\n'));
    L.push('', 'Effort: ' + x.turns + ' model turn(s), ' + (x.reg ? x.reg.budget.toolCalls : 0) + ' tool call(s), ' + Math.round(x.ms / 1000) + 's.');
    if (run.note) L.push('Note: ' + run.note + '.');
    if (x.status === 'unverified') L.push('', 'Nothing proved this works: no passing test or build ran.');
    return { status: x.status, headline: head, text: L.join('\n'), changes: x.changes || [], verification: run.verification, attempts: run.attempts };
  }

  Engine.NativeAgent = {
    MODES: MODES, STATES: STATES, TRANSITIONS: TRANSITIONS, PROFILES: PROFILES, RUN_KEY: RUN_KEY,
    decide: decide, classifyCommand: classifyCommand, validateArgs: validateArgs,
    createRegistry: createRegistry, createRun: createRun, loadRun: loadRun, runTask: runTask, buildReport: buildReport,
    parseTestOutput: parseTestOutput, parseStackFrames: parseStackFrames, toProjectPath: toProjectPath, failureSignature: failureSignature,
    parsePatch: parsePatch, applyHunks: applyHunks, nearestLines: nearestLines, unbackedClaims: unbackedClaims, compactConvo: compactConvo, verificationPlan: verificationPlan, stepsFromText: stepsFromText, simpleDiff: simpleDiff, selectMemories: selectMemories, memoryText: memoryText, remember: remember
  };
})();
