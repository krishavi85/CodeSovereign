'use strict';
/* Desktop/mobile packages + continuous prompting. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const store = {};
  const win = {
    console,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    addEventListener: () => {},
    document: {
      createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }),
      body: { appendChild() {}, remove() {} },
      documentElement: { appendChild() {} },
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: () => null
    },
    Event: function Event() {},
    Blob: function Blob(parts) { this.parts = parts; this.size = (parts || []).reduce((n, p) => n + (p && p.length) || 0, 0); },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    S: {
      plat: { web: true, ios: true, android: true, windows: true, macos: true, linux: true },
      agentBuilt: false, agentRuns: [], agentChat: [], agentPrompt: '', lastPrompt: ''
    }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.llm.js');
  run('engine.loop.js');
  run('engine.packages.js');
  return { win, store };
}

module.exports = async function (t) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  t.ok('index.html loads engine.packages.js', /engine\.packages\.js/.test(html));
  t.ok('index.html loads app.packages.js', /app\.packages\.js/.test(html));
  t.ok('Welcome Generate App stays on the same app when agentBuilt', /if \(!restart && S\.agentBuilt\)/.test(appSrc));
  t.ok('runAgentWith passes selected platforms', /platforms:/.test(appSrc) && /Engine\.Packages\.selected/.test(appSrc));
  t.ok('Welcome copy says keep prompting', /Keep prompting after the first run/.test(appSrc));
  t.ok('default plat enables desktop and mobile', /android: true, windows: true, macos: true, linux: true/.test(appSrc));

  const { win } = load();
  const P = win.Engine.Packages;
  t.ok('Engine.Packages is exposed', P && typeof P.sync === 'function');
  t.ok('selected reads Welcome chips', P.selected().indexOf('android') >= 0 && P.selected().indexOf('windows') >= 0);

  win.Engine.FS.write('/index.html', '<!DOCTYPE html><html><head><title>Harbor Board</title><link rel="stylesheet" href="/styles/app.css"></head><body><h1>Harbor Board</h1><script src="/scripts/app.js"></script></body></html>');
  win.Engine.FS.write('/styles/app.css', 'body{background:#0b1020}');
  win.Engine.FS.write('/scripts/app.js', 'console.log("harbor")');

  const rec = P.sync({ platforms: ['web', 'windows', 'macos', 'linux', 'android', 'ios'] });
  t.ok('sync reports trees', rec.ok && rec.trees.indexOf('desktop') >= 0 && rec.trees.indexOf('android') >= 0 && rec.trees.indexOf('ios') >= 0);
  t.ok('Electron main process is a real BrowserWindow loader', /BrowserWindow/.test(win.Engine.FS.read('/packages/desktop/main.js') || ''));
  t.ok('desktop package.json has win/mac/linux dist scripts', /dist:win/.test(win.Engine.FS.read('/packages/desktop/package.json') || '') && /dist:mac/.test(win.Engine.FS.read('/packages/desktop/package.json') || '') && /dist:linux/.test(win.Engine.FS.read('/packages/desktop/package.json') || ''));
  t.ok('desktop renderer rewrites root-absolute asset paths', /href="styles\/app.css"/.test(win.Engine.FS.read('/packages/desktop/renderer/index.html') || ''));
  t.ok('Android MainActivity loads asset www', /android_asset\/www\/index.html/.test(win.Engine.FS.read('/packages/android/app/src/main/java/app/generated/MainActivity.kt') || ''));
  t.ok('Android gradle assembleDebug is documented', /assembleDebug/.test(win.Engine.FS.read('/packages/android/README.md') || ''));
  t.ok('iOS WKWebView loads bundled www', /WKWebView/.test(win.Engine.FS.read('/packages/ios/App/ContentView.swift') || ''));
  t.ok('iOS XcodeGen project.yml exists', /platform: iOS/.test(win.Engine.FS.read('/packages/ios/project.yml') || ''));

  const zWin = P.zipKind('windows');
  t.ok('windows zip is a real zip', zWin.filename.indexOf('.zip') > 0 && zWin.bytes[0] === 0x50 && zWin.bytes[1] === 0x4b);
  t.ok('android zip is a real zip', P.zipKind('android').bytes[0] === 0x50 && P.zipKind('android').bytes[1] === 0x4b);
  t.ok('ios zip is a real zip', P.zipKind('ios').bytes[0] === 0x50 && P.zipKind('ios').bytes[1] === 0x4b);

  win.S.plat.android = false;
  t.ok('turning a chip off drops that platform', P.selected().indexOf('android') < 0);

  win.S.agentBuilt = true;
  t.ok('add android on a built app is an edit', win.Engine.LLM.classifyIntent('add android packaging').mode === 'edit');
  t.ok('platform block tells the model this is continuous', /CONTINUOUS SESSION/.test(P.platformBlock('make the sidebar purple')));

  const llmSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');
  t.ok('follow-up system prompt is a continuous Cursor-like session', /CONTINUOUS session/.test(llmSrc));
};
