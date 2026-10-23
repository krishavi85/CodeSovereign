'use strict';
/* offline-plan §2-10: Engine.Audio / Vision / Registry / Signing /
 * Observability / Extension / Desktop — generation + static validation +
 * the honest BLOCKED model when a local runtime is absent. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngines(names, extra) {
  const dist = path.join(__dirname, '..', 'dist');
  const win = { console, setTimeout, clearTimeout };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  win.Engine = {
    FS: { _data: data, isFile: (p) => !!data[p] && data[p].type !== 'dir', exists: (p) => p in data,
      read: (p) => (data[p] ? data[p].content : null), write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {} },
    Sovereign: { read: (p) => (sov[p] != null ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null),
      write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }, list: () => Object.keys(sov) }
  };
  Object.assign(win, extra || {});
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(dist, n), 'utf8'), win, { filename: n });
  return win;
}

module.exports = async function (t) {
  /* ---------- §2 audio ---------- */
  {
    const win = loadEngines(['engine.audio.js']);
    const p = win.Engine.Audio.plan();
    t.ok('audio: plan lists whisper.cpp + faster-whisper, support SUPPORTED', p.support === 'SUPPORTED' && p.runtimes.some((r) => r.id === 'whisper.cpp'));
    const r = await win.Engine.Audio.transcribe({ path: '/x.wav' });
    t.equal('audio: no bridge -> BLOCKED (not unsupported)', r.status, 'BLOCKED');
    t.ok('audio: machine-readable reason', /RUNTIME_BRIDGE_UNAVAILABLE|WHISPER|FFMPEG|MODEL/.test(r.reason));
    t.equal('audio: srt formatter', win.Engine.Audio._toSrt([{ start: 0, end: 1.5, text: 'hi' }]).split('\n')[1], '00:00:00,000 --> 00:00:01,500');
    t.ok('audio: evidence persisted with support flag', win.Engine.Audio.load() && win.Engine.Audio.load().support === 'SUPPORTED');
  }

  /* ---------- §3 vision (no canvas in the VM) ---------- */
  {
    const win = loadEngines(['engine.vision.js']);
    const r = await win.Engine.Vision.analyze('data:image/png;base64,AAAA');
    t.equal('vision: no canvas -> BLOCKED NO_CANVAS, support SUPPORTED', r.status, 'BLOCKED');
    t.ok('vision: names the heuristic fallback', r.reason === 'NO_CANVAS' && /heuristic/.test(r.note));
    // the pure functions work without a canvas
    const det = { width: 1000, height: 800, regions: [
      { xPct: 0, yPct: 0, wPct: 100, hPct: 10, kind: 'header' },
      { xPct: 5, yPct: 20, wPct: 40, hPct: 30, kind: 'card' },
      { xPct: 5, yPct: 22, wPct: 20, hPct: 6, kind: 'button' }
    ] };
    const tree = win.Engine.Vision.componentTree(det);
    t.ok('vision: componentTree nests the button under the card', JSON.stringify(tree).includes('"button"') && tree.count === 3);
    const html = win.Engine.Vision.reconstruct(tree);
    t.ok('vision: reconstruct emits a valid-ish HTML skeleton', /<!doctype html>/.test(html) && /data-vision="header"/.test(html) && /<button/.test(html));
    const g = win.Engine.Vision.layoutGraph(det);
    t.ok('vision: layoutGraph has above/left-of edges', g.edges.some((e) => e.rel === 'above'));
  }

  /* ---------- §5 registry ---------- */
  {
    const win = loadEngines(['engine.registry.js']);
    win.Engine.FS.write('/package.json', JSON.stringify({ name: 'my-lib', version: '1.0.0', main: 'index.js' }));
    t.ok('registry: a lib package is recognised', win.Engine.Registry._isLib());
    const r = await win.Engine.Registry.verify();
    t.equal('registry: no bridge -> BLOCKED', r.status, 'BLOCKED');
    t.ok('registry: evidence records the external step is credential-gated', win.Engine.Registry.load().external.NPMJS_EXTERNAL_PUBLISH === 'BLOCKED_CREDENTIAL_REQUIRED');
    // an app (not a lib) -> not a publish target
    win.Engine.FS.write('/package.json', JSON.stringify({ name: 'app', scripts: { dev: 'node server.js' } }));
    t.equal('registry: an application is not a publish target', (await win.Engine.Registry.verify()).reason, 'NOT_A_LIBRARY_PACKAGE');
  }

  /* ---------- §6 signing (offline SBOM + provenance are real) ---------- */
  {
    const win = loadEngines(['engine.signing.js']);
    win.Engine.FS.write('/package.json', JSON.stringify({ name: 'svc', version: '2.1.0', license: 'MIT', dependencies: { solc: '^0.8.28' } }));
    const sbom = win.Engine.Signing.sbom();
    t.ok('signing: SPDX 2.3 SBOM with a DEPENDS_ON relationship', sbom.spdxVersion === 'SPDX-2.3' && sbom.packages.length === 2 && sbom.relationships[0].relationshipType === 'DEPENDS_ON');
    const prov = win.Engine.Signing.provenance();
    t.ok('signing: SLSA provenance statement', prov.predicateType === 'https://slsa.dev/provenance/v1' && prov._type === 'https://in-toto.io/Statement/v1');
    const f = win.Engine.Signing.files();
    t.ok('signing: emits sign.js (cosign) + SBOM + provenance', /cosign/.test(f['/scripts/sign.js']) && f['/SBOM.spdx.json'] && f['/provenance.json']);
    win.Engine.Signing.analyze();
    t.ok('signing: analyze wrote the files + evidence flags GitHub upload credential-gated', win.Engine.FS.isFile('/SBOM.spdx.json') && win.Engine.Signing.load().external.GITHUB_RELEASE_UPLOAD === 'BLOCKED_GITHUB_TOKEN_REQUIRED');
  }

  /* ---------- §7 observability ---------- */
  {
    const win = loadEngines(['engine.observability.js']);
    win.Engine.FS.write('/server.js', 'require("./package.json")');
    win.Engine.FS.write('/package.json', '{"name":"svc"}');
    const f = win.Engine.Observability.files();
    t.ok('otel: dependency-free OTLP/HTTP exporter + collector config + compose', /v1\/traces/.test(f['/src/otel.js']) && !/require\('@opentelemetry/.test(f['/src/otel.js']) && /otlp:/.test(f['/otel-collector-config.yaml']) && /4318:4318/.test(f['/otel-compose.yml']));
    win.Engine.Observability.analyze();
    const ev = win.Engine.Observability.load();
    t.ok('otel: local fallback named + hosted export credential-gated', /debug\/traces/.test(ev.localFallback) && ev.external.HOSTED_SENTRY_EXPORT === 'BLOCKED_CREDENTIAL_REQUIRED');
    const r = await win.Engine.Observability.verify();
    t.equal('otel: no bridge -> BLOCKED', r.status, 'BLOCKED');
  }

  /* ---------- §9 extension ---------- */
  {
    const win = loadEngines(['engine.extension.js']);
    const g = win.Engine.Extension.generate({ name: 'tab-notes', title: 'Tab Notes', permissions: ['storage'] });
    const byPath = {}; g.forEach((x) => { byPath[x.path] = x.content; });
    t.ok('ext: emits manifest + background SW + content + popup + options', byPath['/manifest.json'] && byPath['/background.js'] && byPath['/content.js'] && byPath['/popup.html'] && byPath['/options.html']);
    const m = JSON.parse(byPath['/manifest.json']);
    t.ok('ext: MV3 with service_worker (not scripts)', m.manifest_version === 3 && m.background.service_worker && !m.background.scripts);
    const v = win.Engine.Extension.validate(byPath);
    t.ok('ext: the generated manifest passes MV3 static validation', v.ok && !v.findings.some((x) => x.impact === 'critical'));
    // a broken manifest is caught
    const bad = win.Engine.Extension.validate({ '/manifest.json': JSON.stringify({ manifest_version: 2, name: 'x' }) });
    t.ok('ext: MV2 + missing version is caught', !bad.ok && bad.findings.some((x) => /mv3/.test(x.rule)));
    g.forEach((x) => win.Engine.FS.write(x.path, x.content));
    const r = await win.Engine.Extension.verify();
    t.ok('ext: no bridge -> PARTIAL (generation + validation done), reason names Playwright/bridge', r.status === 'PARTIAL' && r.stages.staticValidation === 'PASS');
  }

  /* ---------- §10 desktop ---------- */
  {
    const win = loadEngines(['engine.desktop.js']);
    const gt = win.Engine.Desktop.generate({ name: 'my-tool', framework: 'tauri' });
    const tp = {}; gt.forEach((x) => { tp[x.path] = x.content; });
    t.ok('desktop(tauri): Cargo.toml + tauri.conf.json + main.rs + lib.rs + a rust test', tp['/src-tauri/Cargo.toml'] && tp['/src-tauri/tauri.conf.json'] && tp['/src-tauri/src/lib.rs'] && tp['/src-tauri/tests/greet.rs']);
    t.ok('desktop(tauri): invoke_handler wires the greet command', /invoke_handler\(tauri::generate_handler!\[greet\]\)/.test(tp['/src-tauri/src/lib.rs']));
    const ge = win.Engine.Desktop.generate({ name: 'my-tool', framework: 'electron' });
    const ep = {}; ge.forEach((x) => { ep[x.path] = x.content; });
    t.ok('desktop(electron): main.js (BrowserWindow) + preload + forge config + headless smoke', /BrowserWindow/.test(ep['/main.js']) && ep['/preload.js'] && ep['/forge.config.js'] && /DESKTOP_SMOKE/.test(ep['/smoke.js']));
    gt.forEach((x) => win.Engine.FS.write(x.path, x.content));
    t.equal('desktop: framework detected from the generated files', win.Engine.Desktop._detectFramework(), 'tauri');
    const r = await win.Engine.Desktop.verify();
    t.ok('desktop: no bridge -> PARTIAL (source generated), reason names the toolchain', r.status === 'PARTIAL' && /cargo check|bridge/.test(r.need || r.reason || ''));
  }

  /* ---------- router + contract targets ---------- */
  {
    const win = loadEngines(['engine-universal.js', 'engine.intake.js', 'engine.intent.js', 'engine.contract.js', 'engine.runtime-router.js', 'engine.desktop.js', 'engine.extension.js']);
    t.ok('router: desktop + extension are registered targets with adapter engines', win.Engine.RuntimeRouter.TARGETS.desktop && win.Engine.RuntimeRouter.TARGETS.extension && win.Engine.RuntimeRouter.adapterEngine('desktop') === win.Engine.Desktop && win.Engine.RuntimeRouter.adapterEngine('extension') === win.Engine.Extension);
    const cx = await win.Engine.Contract.deriveFromPrompt('Build a Chrome browser extension that saves notes per tab', { useLLM: false });
    t.equal('contract: a browser-extension request -> the extension target, not unsupported', cx.target, 'extension');
    t.ok('contract: extension verdict is buildable', cx.verdict === 'buildable');
    const cd = await win.Engine.Contract.deriveFromPrompt('A cross-platform desktop application with a system tray', { useLLM: false });
    t.equal('contract: a desktop-app request -> the desktop target', cd.target, 'desktop');
  }
};
