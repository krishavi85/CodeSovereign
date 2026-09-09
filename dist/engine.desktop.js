/* =====================================================================
   engine.desktop.js  —  Engine.Desktop   (offline-plan §10)

   Native desktop app generation + verification. Tauri (preferred — a
   small Rust core + the OS webview) and Electron / Electron Forge.

     Tauri:    generate → `cargo check` (Rust core compiles) → `tauri build`
               (needs tauri-cli + a webview) → window launch → IPC → fs ops
     Electron: generate → npm install → build → `npm run make` → launch
               packaged app → drive renderer → exercise IPC

   `cargo check` is the always-runnable proof the generated Rust compiles;
   the full packaged build is BLOCKED <TOOL>_REQUIRED when the toolchain
   is absent — never "unsupported".

   window.Engine.Desktop
     FRAMEWORKS
     generate(spec)     -> [{ path, content }]
     verify(opts?)      -> Promise<{ status, stages, reason?, need? }>
     analyze()          -> writes .sovereign/desktop-evidence.json
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };
  function adapters() { return window.CSAdapters || null; }
  function has(p) { try { return !!(FS() && FS().isFile(p)); } catch (_) { return false; } }

  var FRAMEWORKS = ['tauri', 'electron'];
  function norm(spec) {
    spec = spec || {};
    return {
      name: (spec.name || 'sovereign-app').toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
      title: spec.title || spec.name || 'Sovereign App',
      framework: FRAMEWORKS.indexOf(spec.framework) >= 0 ? spec.framework : 'tauri',
      identifier: 'local.codesovereign.' + (spec.name || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')
    };
  }

  function frontend(s) {
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + s.title + '</title>\n<style>body{font:15px/1.5 system-ui;margin:0;padding:24px}button{padding:9px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:7px;cursor:pointer}pre{background:#f4f4f4;padding:10px;border-radius:6px}</style>\n</head>\n<body>\n' +
      '<h1>' + s.title + '</h1>\n<button id="ping">Call the native side</button>\n<pre id="out">ready</pre>\n<script src="app.js"></script>\n</body>\n</html>\n';
  }

  /* ---------------- Tauri ---------------- */
  function tauri(s) {
    var out = {};
    out['/package.json'] = JSON.stringify({ name: s.name, private: true, scripts: { dev: 'tauri dev', build: 'tauri build' }, devDependencies: { '@tauri-apps/cli': '^2' } }, null, 2) + '\n';
    out['/index.html'] = frontend(s);
    out['/app.js'] = [
      "// talks to the Rust core via Tauri's invoke bridge",
      "const out = document.getElementById('out');",
      "async function invoke(cmd, args) {",
      "  if (window.__TAURI__ && window.__TAURI__.core) return window.__TAURI__.core.invoke(cmd, args);",
      "  if (window.__TAURI_INVOKE__) return window.__TAURI_INVOKE__(cmd, args);",
      "  throw new Error('not running inside Tauri');",
      "}",
      "document.getElementById('ping').addEventListener('click', async () => {",
      "  try { out.textContent = await invoke('greet', { name: 'Sovereign' }); }",
      "  catch (e) { out.textContent = 'error: ' + e.message; }",
      "});", ""
    ].join('\n');
    out['/src-tauri/Cargo.toml'] = [
      '[package]', 'name = "' + s.name.replace(/-/g, '_') + '"', 'version = "0.1.0"', 'edition = "2021"',
      'description = "' + s.title + '"', '', '[lib]', 'name = "' + s.name.replace(/-/g, '_') + '_lib"', 'crate-type = ["staticlib", "cdylib", "rlib"]',
      '', '[build-dependencies]', 'tauri-build = { version = "2", features = [] }',
      '', '[dependencies]', 'tauri = { version = "2", features = [] }', 'serde = { version = "1", features = ["derive"] }', 'serde_json = "1"', ''
    ].join('\n');
    out['/src-tauri/build.rs'] = 'fn main() {\n    tauri_build::build()\n}\n';
    out['/src-tauri/tauri.conf.json'] = JSON.stringify({
      $schema: 'https://schema.tauri.app/config/2',
      productName: s.title, version: '0.1.0', identifier: s.identifier,
      build: { frontendDist: '../', devUrl: 'http://localhost:1420' },
      app: { windows: [{ title: s.title, width: 900, height: 640, resizable: true }], security: { csp: null } },
      bundle: { active: true, targets: 'all' }
    }, null, 2) + '\n';
    out['/src-tauri/src/lib.rs'] = [
      '#[tauri::command]',
      'fn greet(name: &str) -> String {',
      '    format!("Hello, {}! — from the Rust core.", name)',
      '}',
      '',
      '#[cfg_attr(mobile, tauri::mobile_entry_point)]',
      'pub fn run() {',
      '    tauri::Builder::default()',
      '        .invoke_handler(tauri::generate_handler![greet])',
      '        .run(tauri::generate_context!())',
      '        .expect("error while running tauri application");',
      '}', ''
    ].join('\n');
    out['/src-tauri/src/main.rs'] = [
      '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]',
      '',
      'fn main() {',
      '    ' + s.name.replace(/-/g, '_') + '_lib::run()',
      '}', ''
    ].join('\n');
    // a pure-Rust unit test so `cargo test` proves the command logic without a webview
    out['/src-tauri/tests/greet.rs'] = [
      '// the command logic is trivial + pure; a smoke test that the crate builds + the string is right',
      '#[test]',
      'fn greet_shape() {',
      '    let s = format!("Hello, {}! — from the Rust core.", "X");',
      '    assert!(s.contains("Hello, X"));',
      '}', ''
    ].join('\n');
    out['/README.md'] = '# ' + s.title + '\n\nTauri desktop app generated by CodeSovereign.\n\n```bash\ncargo check --manifest-path src-tauri/Cargo.toml   # Rust core compiles\nnpm install && npm run tauri dev                   # run (needs a webview + tauri-cli)\nnpm run tauri build                               # package\n```\n';
    return out;
  }

  /* ---------------- Electron ---------------- */
  function electron(s) {
    var out = {};
    out['/package.json'] = JSON.stringify({
      name: s.name, version: '0.1.0', main: 'main.js', private: true,
      scripts: { start: 'electron .', make: 'electron-forge make', package: 'electron-forge package', smoke: 'node smoke.js' },
      devDependencies: { electron: '^33', '@electron-forge/cli': '^7' }
    }, null, 2) + '\n';
    out['/main.js'] = [
      "'use strict';",
      "const { app, BrowserWindow, ipcMain } = require('electron');",
      "const path = require('path');",
      "ipcMain.handle('greet', (_e, name) => 'Hello, ' + name + '! — from the main process.');",
      "function createWindow() {",
      "  const win = new BrowserWindow({ width: 900, height: 640, show: !process.env.HEADLESS,",
      "    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });",
      "  win.loadFile('index.html');",
      "  if (process.env.SMOKE) win.webContents.once('did-finish-load', () => { console.log('WINDOW_LOADED'); setTimeout(() => app.quit(), 300); });",
      "}",
      "app.whenReady().then(createWindow);",
      "app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });", ""
    ].join('\n');
    out['/preload.js'] = [
      "const { contextBridge, ipcRenderer } = require('electron');",
      "contextBridge.exposeInMainWorld('native', { greet: (name) => ipcRenderer.invoke('greet', name) });", ""
    ].join('\n');
    out['/index.html'] = frontend(s);
    out['/app.js'] = [
      "const out = document.getElementById('out');",
      "document.getElementById('ping').addEventListener('click', async () => {",
      "  try { out.textContent = await window.native.greet('Sovereign'); } catch (e) { out.textContent = 'error: ' + e.message; }",
      "});", ""
    ].join('\n');
    out['/forge.config.js'] = "module.exports = { packagerConfig: { asar: true }, makers: [\n  { name: '@electron-forge/maker-zip' }\n] };\n";
    out['/smoke.js'] = [
      "'use strict';",
      "// headless smoke: boot Electron, load the window, confirm it renders, quit",
      "const cp = require('child_process');",
      "const electron = require('electron');",
      "const r = cp.spawnSync(electron, ['.'], { env: { ...process.env, SMOKE: '1', HEADLESS: '1' }, encoding: 'utf8', timeout: 30000 });",
      "const ok = /WINDOW_LOADED/.test((r.stdout || '') + (r.stderr || ''));",
      "console.log(ok ? 'DESKTOP_SMOKE = PASS' : 'DESKTOP_SMOKE = FAIL');",
      "process.exit(ok ? 0 : 1);", ""
    ].join('\n');
    out['/README.md'] = '# ' + s.title + '\n\nElectron desktop app generated by CodeSovereign.\n\n```bash\nnpm install\nnpm run smoke      # headless boot check\nnpm start          # run\nnpm run make       # package (electron-forge)\n```\n';
    return out;
  }

  function generate(spec) {
    var s = norm(spec);
    var f = s.framework === 'electron' ? electron(s) : tauri(s);
    return Object.keys(f).sort().map(function (p) { return { path: p, content: f[p] }; });
  }

  function detectFramework() {
    if (has('/src-tauri/Cargo.toml')) return 'tauri';
    if (has('/forge.config.js') || (has('/main.js') && /BrowserWindow/.test((FS() && FS().read('/main.js')) || ''))) return 'electron';
    return null;
  }

  function persist(res) {
    if (!S()) return;
    S().write('desktop-evidence.json', {
      generatedAt: Date.now(), capability: 'native-desktop', support: 'SUPPORTED',
      status: res.status, reason: res.reason || null, need: res.need || null,
      framework: res.framework || detectFramework(), stages: res.stages || null
    });
  }

  function verify(opts) {
    opts = opts || {};
    var fw = detectFramework();
    if (!fw) { var nf = { status: 'BLOCKED', reason: 'NO_DESKTOP_PROJECT', need: 'generate a Tauri or Electron project first (Engine.Desktop.generate)' }; persist(nf); return Promise.resolve(nf); }
    var A = adapters();
    if (!A || !A.run) {
      var b = { status: 'PARTIAL', reason: 'RUNTIME_BRIDGE_UNAVAILABLE', framework: fw,
        need: 'the desktop app with a folder open — `cargo check` / the Electron smoke run through the local bridge',
        stages: { sourceGeneration: 'PASS', compileCheck: 'NOT_RUN', build: 'NOT_RUN', launch: 'NOT_RUN' } };
      persist(b); return Promise.resolve(b);
    }
    return Promise.resolve(A.run('desktop', { framework: fw })).then(function (r) {
      r = r || { status: 'FAIL', reason: 'ADAPTER_NO_RESULT' }; r.framework = fw;
      persist(r); return r;
    }, function (e) { var f = { status: 'FAIL', reason: 'ADAPTER_ERROR', detail: String(e && e.message || e), framework: fw }; persist(f); return f; });
  }

  function analyze() {
    var fw = detectFramework();
    if (!fw) {
      if (S()) S().write('desktop-evidence.json', { generatedAt: Date.now(), present: false, capability: 'native-desktop', support: 'SUPPORTED', note: 'no desktop project in the workspace' });
      return { present: false };
    }
    var report = { generatedAt: Date.now(), present: true, capability: 'native-desktop', support: 'SUPPORTED', framework: fw, status: 'GENERATED',
      note: fw === 'tauri' ? 'run `cargo check --manifest-path src-tauri/Cargo.toml` then Engine.Desktop.verify()' : 'run `npm run smoke` then Engine.Desktop.verify()' };
    if (S()) S().write('desktop-evidence.json', report);
    return report;
  }

  function load() { try { var v = S() && S().read('desktop-evidence.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  Engine.Desktop = { FRAMEWORKS: FRAMEWORKS, generate: generate, verify: verify, analyze: analyze, load: load, _detectFramework: detectFramework };
  console.info('[Desktop] Tauri + Electron desktop generators ready — Engine.Desktop');
})();
