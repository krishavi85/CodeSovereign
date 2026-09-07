'use strict';
/* engine.adapters.js — TechnologyAdapter detection + capability matrix. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEnv(files, host) {
  const FS = {
    _data: Object.keys(files).reduce((m, k) => (m[k] = { type: 'file', content: files[k] }, m), {}),
    read: (p) => (files[p] == null ? null : files[p]),
    exists: (p) => p in files,
    isFile: (p) => p in files
  };
  const win = { console };
  win.window = win;
  win.navigator = { platform: host === 'darwin' ? 'MacIntel' : host === 'linux' ? 'Linux x86_64' : 'Win32' };
  win.Engine = { FS };
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.adapters.js'), 'utf8');
  const ctx = vm.createContext(win);
  vm.runInContext(src, ctx, { filename: 'engine.adapters.js' });
  return win.Engine.Adapters;
}

module.exports = async function (t) {
  // vite web app
  let A = makeEnv({ '/vite.config.ts': 'export default {}', '/package.json': JSON.stringify({ dependencies: { vite: '^5', react: '^18' }, scripts: { build: 'vite build', test: 'vitest' } }) });
  let det = A.detect();
  t.equal('vite project -> web-vite primary', det[0].id, 'web-vite');
  t.ok('web-vite build command uses npm run build', /run build/.test(det[0].commands.build));
  t.ok('web-vite builds locally', det[0].canBuildLocally);

  // electron
  A = makeEnv({ '/package.json': JSON.stringify({ devDependencies: { electron: '^33' }, build: { appId: 'x' }, scripts: {} }) });
  det = A.detect();
  t.ok('electron detected', det.some((d) => d.id === 'electron'));

  // iOS on Windows -> cannot build locally, needs remote
  A = makeEnv({ '/ios/Podfile': 'platform :ios', '/App.xcodeproj/project.pbxproj': '' }, 'win32');
  det = A.detect();
  const ios = det.find((d) => d.id === 'ios');
  t.ok('iOS adapter matched', !!ios);
  t.equal('iOS cannot build locally on Windows', ios.canBuildLocally, false);
  t.equal('iOS remote build target', ios.remoteBuildTarget, 'macos-xcode');

  // iOS on macOS -> can build locally
  A = makeEnv({ '/ios/Podfile': 'platform :ios' }, 'darwin');
  t.equal('iOS builds locally on macOS', A.detect().find((d) => d.id === 'ios').canBuildLocally, true);

  // rust
  A = makeEnv({ '/Cargo.toml': '[package]\nname = "x"' });
  det = A.detect();
  t.equal('cargo project', det[0].id, 'rust-cargo');
  t.deepEqual('cargo commands', [det[0].commands.build, det[0].commands.test], ['cargo build', 'cargo test']);

  // contract shape
  t.ok('remote build contract documents guarantees', A.remoteBuildContract.guarantees.some((g) => /never on exit code 0 alone/.test(g)));

  // diagnose
  const viteA = A.for('web-vite');
  const d = viteA.diagnose('Error: Failed to resolve import "./missing"');
  t.ok('vite diagnoses unresolved import', d.some((x) => /unresolved import/.test(x.hint)));

  // browser run is a dry-run
  const r = await viteA.run('build');
  t.ok('run() in browser is a dry-run', r.dry === true && /would run/.test(r.output));
};
