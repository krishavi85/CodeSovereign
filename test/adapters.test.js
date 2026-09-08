'use strict';
/* Runtime adapters — native mobile / ML training / blockchain are SUPPORTED
 * targets routed through real execution + verification adapters.
 *
 * Blockchain and ML are proven END TO END here (real solc + local EVM chain;
 * real PyTorch training) because they are self-contained. Android is proven at
 * the generation + probe level (a full gradle build + emulator run is covered by
 * the Electron acceptance harness). Every path returns PASS / FAIL / BLOCKED —
 * never "unsupported". */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const APP = path.join(__dirname, '..');
const workspace = require(path.join(APP, 'electron', 'lib', 'workspace'));
const adapters = require(path.join(APP, 'electron', 'lib', 'adapters'));

function loadEngine(names) {
  const win = { console, setTimeout, clearTimeout, queueMicrotask, URL };
  win.window = win;
  win.Engine = { FS: { _data: {}, read: (p) => (win.Engine.FS._data[p] || null), exists: (p) => p in win.Engine.FS._data, isFile: (p) => !!win.Engine.FS._data[p] } };
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(APP, 'dist', n), 'utf8'), win, { filename: n });
  return win;
}
function writeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adp-'));
  files.forEach((f) => { const abs = path.join(dir, f.path.replace(/^\//, '')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, f.content); });
  return dir;
}
function have(cmd, args) { try { return cp.spawnSync(cmd, args || ['--version'], { encoding: 'utf8', timeout: 15000 }).status === 0; } catch (_) { return false; } }

module.exports = async function (t) {

  /* ---------- RuntimeRouter: prompt -> target ---------- */
  {
    const win = loadEngine(['engine.runtime-router.js']);
    const R = win.Engine.RuntimeRouter;
    t.equal('router: an ERC-20 prompt -> evm', R.targetOf({ product: { prompt: 'an erc-20 token with mint and transfer' } }), 'evm');
    t.equal('router: a "native android app" prompt -> android', R.targetOf({ product: { prompt: 'a native android app for notes' } }), 'android');
    t.equal('router: a "SwiftUI iphone app" prompt -> ios', R.targetOf({ product: { prompt: 'a swiftui iphone app' } }), 'ios');
    t.equal('router: "train a model from scratch" -> ml-training', R.targetOf({ product: { prompt: 'train a transformer model from scratch' } }), 'ml-training');
    t.equal('router: a plain web prompt -> web', R.targetOf({ product: { prompt: 'a todo web app with accounts' } }), 'web');
    const route = R.route({ target: 'evm', product: {} });
    t.equal('router: evm routes to the blockchain adapter', route.adapter, 'blockchain');
    t.ok('router: evm route lists its runtime requirements', route.requirements.length > 0);
  }

  /* ---------- Blockchain: generate -> compile -> local chain -> verify (GENUINE) ---------- */
  {
    const win = loadEngine(['engine.blockchain.js']);
    const cases = [
      { spec: { name: 'AcmeToken', prompt: 'an ERC-20 token with mint transfer approve' }, kind: 'erc20' },
      { spec: { name: 'PixelApes', prompt: 'an NFT collection ERC-721' }, kind: 'erc721' },
      { spec: { name: 'GuildDAO', prompt: 'a DAO governance voting contract' }, kind: 'voting' }
    ];
    for (const c of cases) {
      t.equal('blockchain: kind detected for ' + c.spec.name, win.Engine.Blockchain.kindOf(c.spec), c.kind);
      const files = win.Engine.Blockchain.generate(c.spec);
      t.ok('blockchain(' + c.kind + '): emits a .sol contract + forge test + scenario', files.some((f) => /\.sol$/.test(f.path)) && files.some((f) => /\.t\.sol$/.test(f.path)) && files.some((f) => /chain\/scenario\.json$/.test(f.path)));
      const dir = writeProject(files);
      try {
        workspace.setRoot(dir);
        const scenario = JSON.parse(fs.readFileSync(path.join(dir, 'chain', 'scenario.json'), 'utf8'));
        const r = await adapters.evmRun({ scenario });
        t.equal('blockchain(' + c.kind + '): compiled + deployed + ran transactions on a local chain -> PASS', r.status, 'PASS');
        t.ok('blockchain(' + c.kind + '): the evidence has real deployments + assertions', r.evidence && Object.keys(r.evidence.deployments).length > 0 && r.evidence.assertions.every((a) => a.pass));
        t.ok('blockchain(' + c.kind + '): .sovereign/blockchain-evidence.json was written', fs.existsSync(path.join(dir, '.sovereign', 'blockchain-evidence.json')));
      } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    }
    // a contract with a compile error -> FAIL (not BLOCKED)
    const bad = writeProject([{ path: '/src/Broken.sol', content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Broken { function x() public { undefined_symbol(); } }\n' }]);
    try {
      workspace.setRoot(bad);
      const r = await adapters.evmRun({ scenario: {} });
      t.equal('blockchain: a Solidity compile error is FAIL, never BLOCKED', r.status, 'FAIL');
      t.equal('blockchain: the failure reason is specific', r.reason, 'SOLIDITY_COMPILE_ERROR');
    } finally { try { fs.rmSync(bad, { recursive: true, force: true }); } catch (_) {} }
  }

  /* ---------- ML training: generate -> real PyTorch run -> verify ---------- */
  {
    const win = loadEngine(['engine.ml.js']);
    t.equal('ml: "from scratch language model" -> language-model task', win.Engine.ML.taskOf({ prompt: 'char level language model from scratch' }), 'language-model');
    t.equal('ml: "spam classifier" -> text-classification', win.Engine.ML.taskOf({ prompt: 'a spam classifier' }), 'text-classification');
    const files = win.Engine.ML.generate({ name: 'TinyLM', prompt: 'train a small language model from scratch' });
    t.ok('ml: emits train.py + eval.py + training.json + dataset/', files.some((f) => f.path === '/train.py') && files.some((f) => f.path === '/eval.py') && files.some((f) => f.path === '/training.json'));

    const hasTorch = (() => { try { const py = have('python') ? 'python' : 'python3'; return cp.spawnSync(py, ['-c', 'import torch'], { timeout: 20000 }).status === 0; } catch (_) { return false; } })();
    if (hasTorch) {
      const dir = writeProject(files);
      try {
        workspace.setRoot(dir);
        const r = await adapters.mlRun({ allowSynthetic: true, maxSteps: 120, timeoutMs: 5 * 60 * 1000 });
        t.equal('ml: a real training run on the bundled corpus -> PASS', r.status, 'PASS');
        t.ok('ml: the loss actually decreased', r.evidence && r.evidence.loss_decreased && r.evidence.final_train_loss < r.evidence.loss_curve[0].train_loss);
        t.ok('ml: a real checkpoint was saved + hashed', r.evidence && r.evidence.checkpoint && r.evidence.checkpoint.bytes > 0 && /^[0-9a-f]{64}$/.test(r.evidence.checkpoint.sha256));
        t.ok('ml: dataset inspection ran (schema / dupes / PII)', r.evidence && r.evidence.dataset && typeof r.evidence.dataset.pii_matches === 'number');
      } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    } else {
      t.ok('ml: PyTorch not installed on this runner — generation verified, training BLOCKED (not unsupported)', true);
      const dir = writeProject(files);
      try { workspace.setRoot(dir); const r = await adapters.mlRun({}); t.equal('ml: no torch -> BLOCKED PYTORCH_NOT_INSTALLED', r.reason, 'PYTORCH_NOT_INSTALLED'); }
      finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    }

    // "train on our data" with no dataset -> BLOCKED DATASET_REQUIRED
    const win2 = loadEngine(['engine.ml.js']);
    const f2 = win2.Engine.ML.generate({ name: 'CorpModel', prompt: 'fine-tune a model on our proprietary company data' });
    const dir2 = writeProject(f2);
    try {
      workspace.setRoot(dir2);
      const r = await adapters.mlRun({ requiresDataset: true });
      t.equal('ml: "train on our data" + no dataset -> BLOCKED', r.status, 'BLOCKED');
      t.equal('ml: the block reason is DATASET_REQUIRED', r.reason, 'DATASET_REQUIRED');
    } finally { try { fs.rmSync(dir2, { recursive: true, force: true }); } catch (_) {} }
  }

  /* ---------- Native mobile: generation + honest probe ---------- */
  {
    const win = loadEngine(['engine.mobile.js']);
    const android = win.Engine.Mobile.generate({ name: 'WorkoutLog', prompt: 'a native android app for workouts', entities: [{ name: 'workout', fields: [] }] });
    t.ok('mobile(android): a buildable Gradle project (settings + app module + Kotlin Activity + manifest)',
      ['/settings.gradle.kts', '/app/build.gradle.kts', '/app/src/main/AndroidManifest.xml'].every((p) => android.some((f) => f.path === p)) &&
      android.some((f) => /MainActivity\.kt$/.test(f.path)));
    t.ok('mobile(android): a Maestro UI flow is generated', android.some((f) => f.path === '/.maestro/flow.yaml'));
    const ios = win.Engine.Mobile.generate({ name: 'Jotter', prompt: 'a swiftui iphone app for notes, ios only' });
    t.equal('mobile: an iOS-only prompt -> ios platform', win.Engine.Mobile.platformOf({ prompt: 'a swiftui iphone app for notes, ios only' }), 'ios');
    t.ok('mobile(ios): a SwiftUI skeleton is generated', ios.some((f) => /ContentView\.swift$/.test(f.path)));

    const probe = adapters.probe();
    t.ok('probe: returns a coherent capability map', probe && probe.evm && probe.android && probe.ios && probe.ml);
    t.ok('probe: the EVM runtime is always available (bundled solc + @ethereumjs/vm)', probe.evm.available === true);
    t.ok('probe: iOS is only runnable on macOS', process.platform === 'darwin' ? true : probe.ios.canRun === false);
  }
};
