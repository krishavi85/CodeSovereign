/* =====================================================================
   desktop-exec.js  —  real command execution for the Sovereign engines.

   Turns "verified" into something real: instead of the in-browser
   Verify.build() (which just new Function()s the JS), this runs the
   project's actual `npm test` / `npm run build` / lint / typecheck through
   the Electron proc bridge, streams the output into the IDE terminal, and
   records structured evidence.

   window.CSExec:
     available()            desktop + a real folder open
     detect()               -> { pm, scripts, test, build, lint, typecheck, runtimes }
     run(cmd,args,opts)      -> Promise<{ code, output, ms, timedOut }>   (streamed)
     install() test() build() lint() typecheck()   -> Promise<result>
     checkpoint(label)      -> Promise<token|null>   (git stash if a repo)
     restore(token)         -> Promise<bool>

   No-op in a browser.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.desktop || !window.desktop.isDesktop) return;
  var D = window.desktop;
  var Engine = window.Engine;
  var FS = Engine && Engine.FS;

  var running = null;               // { id, kill }
  var DEFAULT_TIMEOUT = 8 * 60 * 1000;

  function available() {
    return !!(FS && FS.__hasWorkspace && FS.__hasWorkspace());
  }

  function pkg() {
    try {
      var raw = FS.read('/package.json');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function has(path) { try { return FS.exists(path); } catch (_) { return false; } }

  function detect() {
    var p = pkg() || {};
    var scripts = p.scripts || {};
    var pm = has('/pnpm-lock.yaml') ? 'pnpm'
      : has('/yarn.lock') ? 'yarn'
      : has('/bun.lockb') ? 'bun'
      : 'npm';

    function pick() {
      for (var i = 0; i < arguments.length; i++) if (scripts[arguments[i]]) return arguments[i];
      return null;
    }
    var testScript = pick('test', 'tests', 'test:unit', 'test:ci');
    var buildScript = pick('build', 'build:prod', 'compile', 'dist');
    var lintScript = pick('lint', 'lint:js', 'eslint');
    var typeScript = pick('typecheck', 'type-check', 'tsc', 'types');

    var runtimes = [];
    if (has('/Cargo.toml')) runtimes.push('rust');
    if (has('/go.mod')) runtimes.push('go');
    if (has('/pyproject.toml') || has('/requirements.txt')) runtimes.push('python');
    if (p.name) runtimes.push('node');

    return {
      pm: pm,
      scripts: Object.keys(scripts),
      hasPackageJson: !!pkg(),
      test: testScript, build: buildScript, lint: lintScript, typecheck: typeScript,
      hasTsconfig: has('/tsconfig.json'),
      hasEslint: has('/.eslintrc') || has('/.eslintrc.json') || has('/.eslintrc.cjs') || has('/eslint.config.js') || !!(p.devDependencies && p.devDependencies.eslint),
      runtimes: runtimes
    };
  }

  /* ---------- streamed run ---------- */

  var _subbed = false;
  var _listeners = {};
  function ensureSub() {
    if (_subbed) return;
    _subbed = true;
    D.proc.onData(function (evt) {
      var cb = _listeners[evt.id];
      if (cb) cb(evt);
    });
  }

  function run(cmd, args, opts) {
    opts = opts || {};
    ensureSub();
    var label = opts.label || (cmd + ' ' + (args || []).join(' '));
    if (window.CSTerminal) { window.S.idePanel = 'terminal'; try { window.renderAll(); } catch (_) {} window.CSTerminal.push('\n$ ' + label + '\n'); }

    return D.proc.spawnAllowed({ cmd: cmd, args: args || [], cwd: '.' }).then(function (res) {
      if (!res || res.ok === false) {
        // allowlist rejection or no workspace -> fall back to one-shot
        return D.proc.run({ cmd: cmd, args: args || [], cwd: '.' }).then(function (r) {
          var o = r || {};
          if (window.CSTerminal && (o.stdout || o.stderr)) window.CSTerminal.push((o.stdout || '') + (o.stderr || ''));
          return { code: o.code == null ? -1 : o.code, output: (o.stdout || '') + (o.stderr || ''), ms: 0, timedOut: false };
        });
      }
      var id = res.id;
      var out = '';
      var t0 = Date.now();
      return new Promise(function (resolve) {
        var timer = setTimeout(function () {
          try { D.proc.kill(id); } catch (_) {}
          finish(-2, true);
        }, opts.timeout || DEFAULT_TIMEOUT);

        var done = false;
        function finish(code, timedOut) {
          if (done) return; done = true;
          clearTimeout(timer);
          delete _listeners[id];
          running = null;
          resolve({ code: code, output: out, ms: Date.now() - t0, timedOut: !!timedOut });
        }

        running = { id: id, kill: function () { try { D.proc.kill(id); } catch (_) {} } };
        _listeners[id] = function (evt) {
          if (evt.stream === 'stdout' || evt.stream === 'stderr' || evt.stream === 'error') {
            out += evt.data;
            if (window.CSTerminal) window.CSTerminal.push(evt.data);
          } else if (evt.stream === 'exit') {
            finish(evt.code == null ? -1 : evt.code, false);
          }
        };
      });
    });
  }

  function npmRun(script, extra) {
    var d = detect();
    var pm = d.pm;
    var args = (script === 'install') ? [pm === 'npm' ? 'install' : 'install']
      : (script === 'ci') ? ['ci']
      : (script === 'test') ? ['test']
      : ['run', script];
    if (extra) args = args.concat(extra);
    return run(pm, args, { label: pm + ' ' + args.join(' ') });
  }

  function install() { return npmRun(has('/package-lock.json') ? 'ci' : 'install'); }
  function test() {
    var d = detect();
    if (d.test) return npmRun(d.test === 'test' ? 'test' : d.test);
    if (d.runtimes.indexOf('rust') >= 0) return run('cargo', ['test'], { label: 'cargo test' });
    if (d.runtimes.indexOf('go') >= 0) return run('go', ['test', './...'], { label: 'go test ./...' });
    return Promise.resolve({ code: -3, output: 'no test script found', ms: 0, skipped: true });
  }
  function build() {
    var d = detect();
    if (d.build) return npmRun(d.build);
    if (d.runtimes.indexOf('rust') >= 0) return run('cargo', ['build'], { label: 'cargo build' });
    if (d.runtimes.indexOf('go') >= 0) return run('go', ['build', './...'], { label: 'go build ./...' });
    return Promise.resolve({ code: -3, output: 'no build script found', ms: 0, skipped: true });
  }
  function lint() {
    var d = detect();
    if (d.lint) return npmRun(d.lint);
    if (d.hasEslint) return run('npx', ['--yes', 'eslint', '.'], { label: 'eslint .' });
    return Promise.resolve({ code: -3, output: 'no lint config found', ms: 0, skipped: true });
  }
  function typecheck() {
    var d = detect();
    if (d.typecheck) return npmRun(d.typecheck);
    if (d.hasTsconfig) return run('npx', ['--yes', 'tsc', '--noEmit'], { label: 'tsc --noEmit' });
    return Promise.resolve({ code: -3, output: 'no tsconfig found', ms: 0, skipped: true });
  }

  /* ---------- git checkpoint / restore ---------- */

  function checkpoint(label) {
    return D.git.status().then(function (s) {
      if (!s || s.ok === false || !s.repo) return null;
      var msg = 'sovereign checkpoint ' + (label || '') + ' ' + new Date().toISOString();
      return D.git.exec(['stash', 'push', '-u', '-m', msg]).then(function (r) {
        if (r && r.ok && r.code === 0 && !/No local changes/.test(r.stdout || '')) return msg;
        return null;
      });
    });
  }
  function restore(token) {
    if (!token) return Promise.resolve(false);
    return D.git.exec(['stash', 'list']).then(function (r) {
      var line = (r.stdout || '').split('\n').find(function (l) { return l.indexOf(token) >= 0; });
      if (!line) return false;
      var ref = (line.match(/^(stash@\{\d+\})/) || [])[1] || 'stash@{0}';
      return D.git.exec(['stash', 'pop', ref]).then(function (p) { return !!(p && p.code === 0); });
    });
  }

  function stop() { if (running) running.kill(); }

  window.CSExec = {
    available: available, detect: detect, run: run,
    install: install, test: test, build: build, lint: lint, typecheck: typecheck,
    checkpoint: checkpoint, restore: restore, stop: stop
  };
  console.info('[desktop-exec] real command execution ready — window.CSExec');
})();
