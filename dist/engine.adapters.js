/* =====================================================================
   engine.adapters.js  —  the TechnologyAdapter contract + local adapters.

   The Universal Architecture spec: "Sovereign should support every technology,
   but each generated project should use only the technologies it requires",
   behind a uniform adapter interface:

     interface TechnologyAdapter {
       id; category;
       detect()          -> { matched:boolean, signals:[] }
       commands()        -> { install, dev, build, test, lint, package }
       canBuildLocally() -> boolean   (false when a foreign toolchain is required)
       remoteBuildTarget()-> string|null
       run(step)         -> Promise<{code, output}>   (desktop: real; browser: dry)
       diagnose(output)  -> [{ hint, fix }]
     }

     Engine.Adapters.list()        all adapters
     Engine.Adapters.detect()      the ones that match the open workspace, ranked
     Engine.Adapters.for(id)
     Engine.Adapters.remoteBuildContract   the (documented) worker protocol
   ===================================================================== */
(function () {
  'use strict';
  if (!window.Engine) return;
  var Engine = window.Engine;
  var FS = Engine.FS;
  var PLATFORM = (window.desktop && window.desktop.info) ? null : null; // resolved lazily
  function has(p) { try { return FS.exists(p); } catch (e) { return false; } }
  function pkg() { try { return JSON.parse(FS.read('/package.json') || 'null'); } catch (e) { return null; } }
  function dep(name) { var p = pkg() || {}; return !!((p.dependencies && p.dependencies[name]) || (p.devDependencies && p.devDependencies[name])); }
  function script(name) { var p = pkg() || {}; return (p.scripts || {})[name]; }
  function pm() { return has('/pnpm-lock.yaml') ? 'pnpm' : has('/yarn.lock') ? 'yarn' : has('/bun.lockb') ? 'bun' : 'npm'; }
  function nrun(s) { var m = pm(); return m + ' ' + (s === 'install' ? 'install' : s === 'ci' ? 'ci' : s === 'test' ? 'test' : 'run ' + s); }

  // host OS, for canBuildLocally decisions
  var _host = 'win32';
  if (window.desktop && window.desktop.info) {
    window.desktop.info().then(function (i) { _host = i.platform; });
  } else if (typeof navigator !== 'undefined') {
    _host = /Mac/.test(navigator.platform) ? 'darwin' : /Linux/.test(navigator.platform) ? 'linux' : 'win32';
  }

  function mk(def) {
    return {
      id: def.id, category: def.category,
      detect: function () {
        var sig = def.signals().filter(Boolean);
        return { matched: sig.length > 0, signals: sig, score: sig.length };
      },
      commands: def.commands,
      canBuildLocally: function () { return def.canBuildLocally ? def.canBuildLocally(_host) : true; },
      remoteBuildTarget: function () { return def.remoteBuildTarget || null; },
      diagnose: function (out) { return (def.diagnostics || []).filter(function (d) { return d.re.test(out || ''); }).map(function (d) { return { hint: d.hint, fix: d.fix }; }); },
      run: function (step) {
        var cmd = (def.commands() || {})[step];
        if (!cmd) return Promise.resolve({ code: -3, output: 'adapter ' + def.id + ' has no ' + step + ' command', skipped: true });
        if (window.CSExec && window.CSExec.available()) {
          var parts = cmd.split(/\s+/);
          return window.CSExec.run(parts[0], parts.slice(1), { label: def.id + ' ' + step });
        }
        return Promise.resolve({ code: -3, output: '(browser) would run: ' + cmd, dry: true });
      }
    };
  }

  var ADAPTERS = [
    mk({
      id: 'web-vite', category: 'web',
      signals: function () { return [has('/vite.config.js') && 'vite.config.js', has('/vite.config.ts') && 'vite.config.ts', dep('vite') && 'vite dep']; },
      commands: function () { return { install: nrun(has('/package-lock.json') ? 'ci' : 'install'), dev: nrun(script('dev') ? 'dev' : 'dev'), build: nrun('build'), test: script('test') ? nrun('test') : 'npx --yes vitest run', lint: script('lint') ? nrun('lint') : 'npx --yes eslint .', package: nrun('build') }; },
      diagnostics: [
        { re: /Cannot find module|Failed to resolve import/, hint: 'unresolved import', fix: 'check the path / add the dependency and re-install' },
        { re: /EADDRINUSE/, hint: 'dev-server port in use', fix: 'stop the other process or set server.port' }
      ]
    }),
    mk({
      id: 'web-next', category: 'web',
      signals: function () { return [has('/next.config.js') && 'next.config.js', has('/next.config.mjs') && 'next.config.mjs', dep('next') && 'next dep']; },
      commands: function () { return { install: nrun('install'), dev: nrun('dev'), build: nrun('build'), test: script('test') ? nrun('test') : 'echo "no test script"', lint: 'npx --yes next lint', package: nrun('build') }; }
    }),
    mk({
      id: 'node', category: 'backend',
      signals: function () { return [pkg() && !dep('next') && !dep('vite') && !dep('electron') && 'package.json (node service)']; },
      commands: function () { return { install: nrun(has('/package-lock.json') ? 'ci' : 'install'), dev: script('dev') ? nrun('dev') : 'node .', build: script('build') ? nrun('build') : 'echo "no build step"', test: nrun('test'), lint: script('lint') ? nrun('lint') : 'echo "no lint"', package: 'npm pack' }; }
    }),
    mk({
      id: 'electron', category: 'desktop',
      signals: function () { return [dep('electron') && 'electron dep', has('/electron-builder.yml') && 'electron-builder.yml', (pkg() && pkg().build && pkg().build.appId) && 'electron-builder config']; },
      commands: function () { return { install: nrun('install'), dev: script('dev') ? nrun('dev') : 'npx electron .', build: 'npx --yes electron-builder --dir', test: script('test') ? nrun('test') : 'echo "no test"', lint: script('lint') ? nrun('lint') : 'echo "no lint"', package: 'npx --yes electron-builder' }; },
      canBuildLocally: function (host) { return true; },
      remoteBuildTarget: null,
      diagnostics: [{ re: /is not allowed to load local resource|ERR_FILE_NOT_FOUND/, hint: 'renderer path wrong', fix: 'loadFile path should be absolute from main' }]
    }),
    mk({
      id: 'tauri', category: 'desktop',
      signals: function () { return [has('/src-tauri/tauri.conf.json') && 'src-tauri/', dep('@tauri-apps/cli') && '@tauri-apps/cli']; },
      commands: function () { return { install: nrun('install'), dev: 'npx --yes tauri dev', build: 'npx --yes tauri build --debug', test: 'cargo test --manifest-path src-tauri/Cargo.toml', lint: 'cargo clippy --manifest-path src-tauri/Cargo.toml', package: 'npx --yes tauri build' }; },
      canBuildLocally: function (host) { return true; }
    }),
    mk({
      id: 'ios', category: 'mobile',
      signals: function () { return [has('/ios/Podfile') && 'ios/Podfile', has('/Podfile') && 'Podfile', Object.keys(FS._data).some(function (p) { return /\.xcodeproj\//.test(p); }) && '.xcodeproj']; },
      commands: function () { return { install: 'pod install', build: 'xcodebuild -scheme App build', test: 'xcodebuild test -scheme App', package: 'xcodebuild -exportArchive' }; },
      canBuildLocally: function (host) { return host === 'darwin'; },
      remoteBuildTarget: 'macos-xcode'
    }),
    mk({
      id: 'android', category: 'mobile',
      signals: function () { return [has('/android/gradlew') && 'android/gradlew', has('/gradlew') && 'gradlew', has('/android/build.gradle') && 'android/build.gradle']; },
      commands: function () { return { install: './gradlew dependencies', build: './gradlew assembleDebug', test: './gradlew testDebugUnitTest', package: './gradlew bundleRelease' }; },
      canBuildLocally: function () { return true; },  // needs Android SDK — checked at run time
      remoteBuildTarget: 'android-sdk'
    }),
    mk({
      id: 'python', category: 'backend',
      signals: function () { return [has('/pyproject.toml') && 'pyproject.toml', has('/requirements.txt') && 'requirements.txt', has('/setup.py') && 'setup.py']; },
      commands: function () { return { install: has('/pyproject.toml') ? 'pip install -e .' : 'pip install -r requirements.txt', dev: 'python -m app', build: 'python -m build', test: 'python -m pytest -q', lint: 'python -m ruff check .', package: 'python -m build' }; }
    }),
    mk({
      id: 'rust-cargo', category: 'backend',
      signals: function () { return [has('/Cargo.toml') && 'Cargo.toml']; },
      commands: function () { return { install: 'cargo fetch', dev: 'cargo run', build: 'cargo build', test: 'cargo test', lint: 'cargo clippy', package: 'cargo build --release' }; }
    }),
    mk({
      id: 'go', category: 'backend',
      signals: function () { return [has('/go.mod') && 'go.mod']; },
      commands: function () { return { install: 'go mod download', dev: 'go run ./...', build: 'go build ./...', test: 'go test ./...', lint: 'go vet ./...', package: 'go build -o dist/app ./...' }; }
    }),
    mk({
      id: 'static', category: 'web',
      signals: function () { return [has('/index.html') && !pkg() && 'index.html, no package.json']; },
      commands: function () { return { dev: 'npx --yes serve .', build: 'echo "static — nothing to build"', test: 'echo "static — no tests"', package: 'echo "zip the folder"' }; }
    })
  ];

  function list() { return ADAPTERS.slice(); }
  function forId(id) { return ADAPTERS.filter(function (a) { return a.id === id; })[0] || null; }
  function detect() {
    return ADAPTERS.map(function (a) { return { adapter: a, det: a.detect() }; })
      .filter(function (x) { return x.det.matched; })
      .sort(function (x, y) { return y.det.score - x.det.score; })
      .map(function (x) {
        return {
          id: x.adapter.id, category: x.adapter.category, signals: x.det.signals,
          canBuildLocally: x.adapter.canBuildLocally(), remoteBuildTarget: x.adapter.remoteBuildTarget(),
          commands: x.adapter.commands()
        };
      });
  }

  // The contract a future remote build worker must honour (not implemented here).
  var remoteBuildContract = {
    version: 1,
    request: { projectSnapshot: 'encrypted tar of the workspace (minus node_modules/.git)', target: 'ios | android-sdk | macos-xcode | windows-signing', env: 'build-only secrets, encrypted', adapterId: 'string', commands: 'the adapter commands() block' },
    response: { status: 'success | failed', artifacts: '[{ name, sha256, url (short-lived) }]', logs: 'structured, attached to the task', signature: 'artifact attestation' },
    guarantees: ['sandboxed worker', 'pinned toolchain', 'no secret in logs/artifacts', 'artifact integrity check', 'success only after the artifact is validated — never on exit code 0 alone']
  };

  Engine.Adapters = { list: list, detect: detect, for: forId, remoteBuildContract: remoteBuildContract, TechnologyAdapterKeys: ['id', 'category', 'detect', 'commands', 'canBuildLocally', 'remoteBuildTarget', 'run', 'diagnose'] };
  window.Adapters = Engine.Adapters;
  console.info('[Adapters] ' + ADAPTERS.length + ' technology adapters ready — Engine.Adapters');
})();
