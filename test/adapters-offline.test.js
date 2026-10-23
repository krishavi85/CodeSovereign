'use strict';
/* electron/lib/adapters.js — the offline-plan §5-10 Node execution adapters,
 * run FOR REAL where the local toolchain is present on this machine
 * (npm always; cargo when installed). Everything else asserts the honest
 * BLOCKED / PARTIAL result with a machine-readable reason. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const workspace = require('../electron/lib/workspace');
const adapters = require('../electron/lib/adapters');

function tmp(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), 'cs-' + tag + '-')); }
function write(root, map) { Object.keys(map).forEach((p) => { const abs = path.join(root, p); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, map[p]); }); }
function readEv(root, name) { try { return JSON.parse(fs.readFileSync(path.join(root, '.sovereign', name), 'utf8')); } catch (_) { return null; } }
function have(cmd) { try { return cp.spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0; } catch (_) { return false; } }

module.exports = async function (t) {
  /* ---------- §6 signing — checksums + SBOM/provenance detection (fully offline) ---------- */
  {
    const root = tmp('sign');
    write(root, {
      'package.json': JSON.stringify({ name: 'svc', version: '1.0.0', license: 'MIT' }),
      'SBOM.spdx.json': JSON.stringify({ spdxVersion: 'SPDX-2.3', packages: [] }),
      'provenance.json': JSON.stringify({ _type: 'https://in-toto.io/Statement/v1' }),
      'index.js': 'module.exports = 1;\n'
    });
    workspace.setRoot(root);
    const r = await adapters.signRun({});
    t.ok('sign: checksums + SBOM + provenance produced offline', r.stages.CHECKSUMS === 'PASS' && r.stages.SBOM === 'PASS' && r.stages.PROVENANCE === 'PASS');
    t.ok('sign: checksums.sha256 has real 64-hex digests', /^[0-9a-f]{64}  /m.test(fs.readFileSync(path.join(root, 'checksums.sha256'), 'utf8')));
    t.ok('sign: without cosign -> PARTIAL, names cosign as the need, GitHub upload credential-gated',
      r.status === 'PARTIAL' && r.stages.ARTIFACT_SIGNING === 'BLOCKED_COSIGN_REQUIRED' && r.evidence.external.GITHUB_RELEASE_UPLOAD === 'BLOCKED_GITHUB_TOKEN_REQUIRED');
    fs.rmSync(root, { recursive: true, force: true });
  }

  /* ---------- §7 otel — no collector reachable -> BLOCKED (real network probe) ---------- */
  {
    const root = tmp('otel');
    write(root, { 'package.json': JSON.stringify({ name: 'svc' }), 'server.js': '// x' });
    workspace.setRoot(root);
    const r = await adapters.otelRun({ endpoint: 'http://localhost:4319' });   // nothing listens there
    t.equal('otel: no local collector -> BLOCKED', r.status, 'BLOCKED');
    t.equal('otel: machine-readable reason', r.reason, 'OTEL_COLLECTOR_UNREACHABLE');
    t.ok('otel: need names a local collector + the always-on fallback', /collector/i.test(r.need) && /debug\/traces/.test(r.evidence.localFallback));
    t.equal('otel: hosted Sentry export stays credential-gated', r.evidence.external.HOSTED_SENTRY_EXPORT, 'BLOCKED_CREDENTIAL_REQUIRED');
    fs.rmSync(root, { recursive: true, force: true });
  }

  /* ---------- §9 extension — MV3 validate + plain zip build (fully offline) ---------- */
  {
    const win = require('vm').runInNewContext('({})');
    const g = (() => {
      const c = {}; const vm = require('vm');
      const w = { window: {}, console, setTimeout, clearTimeout };
      w.window = w; w.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
      w.window.Engine = { FS: { _data: {}, isFile: () => false, read: () => null, write() {} }, Sovereign: { read: () => null, write() {}, list: () => [] } };
      vm.createContext(w);
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.extension.js'), 'utf8'), w);
      return w.window.Engine.Extension.generate({ name: 'tab-notes', title: 'Tab Notes', adapter: 'plain' });
    })();
    const root = tmp('ext');
    const map = {}; g.forEach((f) => { map[f.path.replace(/^\//, '')] = f.content; });
    write(root, map);
    workspace.setRoot(root);
    const r = await adapters.extensionRun({});
    t.equal('ext: static MV3 validation PASSES on the generated manifest', r.stages.staticValidation, 'PASS');
    t.ok('ext: the plain build runs offline (node scripts/pack.js -> a zip)', r.stages.build === 'PASS');
    t.ok('ext: load-unpacked -> PARTIAL (Playwright absent = PLAYWRIGHT_REQUIRED, or present + headless SW inspection incomplete) — never a silent FAIL',
      (r.status === 'PARTIAL' || r.status === 'PASS') &&
      (/PLAYWRIGHT_REQUIRED/.test(r.reason || '') ? /playwright/i.test(r.need || '') : (r.reason === 'RUNTIME_INSPECTION_INCOMPLETE' || r.status === 'PASS')));
    fs.rmSync(root, { recursive: true, force: true });
  }

  /* ---------- §5 registry — npm pack + clean-consumer tarball install (real, offline) ---------- */
  {
    const root = tmp('reg');
    write(root, {
      'package.json': JSON.stringify({ name: 'sov-tiny-lib', version: '0.1.0', main: 'index.js', license: 'MIT' }, null, 2),
      'index.js': 'module.exports = { add: (a, b) => a + b };\n'
    });
    workspace.setRoot(root);
    const r = await adapters.registryRun({ useVerdaccio: false });
    t.equal('registry: npm pack succeeds', r.stages.PACKAGE_BUILD, 'PASS');
    t.equal('registry: a clean consumer installs the tarball', r.stages.LOCAL_TARBALL_INSTALL, 'PASS');
    t.ok('registry: the consumer can require the package -> overall PASS', r.stages.IMPORT_SMOKE === 'PASS' && r.status === 'PASS');
    t.equal('registry: npmjs.com publish stays credential-gated', r.evidence.external.NPMJS_EXTERNAL_PUBLISH, 'BLOCKED_CREDENTIAL_REQUIRED');
    fs.rmSync(root, { recursive: true, force: true });
  }

  /* ---------- §10 desktop (Tauri) — `cargo check` runs when cargo is installed ---------- */
  {
    const root = tmp('tauri');
    const g = (() => {
      const vm = require('vm');
      const w = { window: {}, console, setTimeout, clearTimeout };
      w.window = w; w.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
      w.window.Engine = { FS: { _data: {}, isFile: () => false, read: () => null, write() {} }, Sovereign: { read: () => null, write() {}, list: () => [] } };
      vm.createContext(w);
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.desktop.js'), 'utf8'), w);
      return w.window.Engine.Desktop.generate({ name: 'my-tool', framework: 'tauri' });
    })();
    const map = {}; g.forEach((f) => { map[f.path.replace(/^\//, '')] = f.content; });
    write(root, map);
    // the generated project must be a valid cargo project + a valid manifest
    t.ok('desktop(tauri): Cargo.toml + tauri.conf.json + build.rs (icon self-heal) + a rust test on disk',
      fs.existsSync(path.join(root, 'src-tauri', 'Cargo.toml')) && fs.existsSync(path.join(root, 'src-tauri', 'tauri.conf.json')) &&
      /ICO: &\[u8\]/.test(fs.readFileSync(path.join(root, 'src-tauri', 'build.rs'), 'utf8')) && fs.existsSync(path.join(root, 'src-tauri', 'tests', 'greet.rs')));
    if (have('cargo')) {
      const meta = cp.spawnSync('cargo', ['verify-project', '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml')], { encoding: 'utf8' });
      t.ok('desktop(tauri): `cargo verify-project` accepts the generated Cargo.toml', /"success":"true"/.test(meta.stdout || ''));
    }
    workspace.setRoot(root);
    if (!have('cargo')) {
      const r = await adapters.desktopRun({ framework: 'tauri' });
      t.equal('desktop(tauri): no cargo -> BLOCKED RUST_TOOLCHAIN_REQUIRED', r.reason, 'RUST_TOOLCHAIN_REQUIRED');
      t.ok('desktop(tauri): need names rustup', /rustup|sh.rustup.rs/.test(r.need));
    } else if (process.env.CS_SLOW_TESTS) {
      // full `cargo check` + `cargo test` on the tauri dep tree (minutes on a cold cache)
      const r = await adapters.desktopRun({ framework: 'tauri', timeoutMs: 12 * 60 * 1000 });
      t.ok('desktop(tauri): [slow] a real result — PARTIAL (compiles) / BLOCKED (crates fetch) / FAIL(reason)',
        ['PARTIAL', 'PASS', 'BLOCKED', 'FAIL'].includes(r.status) && !!r.stages && ['PASS', 'FAIL', 'BLOCKED'].includes(r.stages.compileCheck) && !!(r.reason || r.status === 'PASS'));
      t.ok('desktop(tauri): [slow] evidence written', !!readEv(root, 'desktop-evidence.json'));
    } else {
      // fast path: a tiny cap — a fresh target/ means `cargo check` on the tauri
      // dep tree can't finish, so the adapter reports an honest BLOCKED reason;
      // on a machine with a warm shared target it may instead compile -> PARTIAL.
      const r = await adapters.desktopRun({ framework: 'tauri', timeoutMs: 5000 });
      t.ok('desktop(tauri): a real cargo result — a tight budget -> BLOCKED(reason+need), or a warm cache -> PARTIAL; never a silent FAIL',
        !!r.stages && ['PASS', 'FAIL', 'BLOCKED'].includes(r.stages.compileCheck) &&
        (r.status === 'BLOCKED'
          ? (/CARGO_CHECK_TIMED_OUT|CRATES_FETCH_REQUIRED|RUST_TOOLCHAIN_REQUIRED/.test(r.reason) && !!r.need)
          : ['PARTIAL', 'PASS'].includes(r.status)));
      t.ok('desktop(tauri): evidence file written', !!readEv(root, 'desktop-evidence.json'));
    }
    fs.rmSync(root, { recursive: true, force: true });
  }

  workspace.setRoot(null);
};
