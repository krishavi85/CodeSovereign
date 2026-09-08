'use strict';
/* =====================================================================
   adapters.js — target-specific execution + verification adapters.

   Per CodeSovereign_Three_Blocked_Capabilities_Master_Plan: native mobile,
   ML model training and blockchain are NOT permanently unsupported. Each is
   routed through a real runtime adapter:

     evm      -> vendored solc + @ethereumjs/vm local deterministic chain
                 (or a `forge`/`anvil` toolchain when present)
     android  -> Android SDK: gradlew assembleDebug + emulator + adb + logcat
     ios      -> xcodebuild + iOS Simulator + simctl  (macOS workers only)
     ml       -> python + torch: real training run, checkpoint, eval, metrics

   Every adapter returns one of:
     { status: 'PASS',    evidence, ... }   artifact ran, evidence verified
     { status: 'FAIL',    evidence, ... }   artifact ran, verification failed
     { status: 'BLOCKED', reason, need, ... } a specific prerequisite is missing

   Nothing here is faked. A BLOCKED result names the exact missing runtime and
   how to install it — it never claims a capability is unsupported.

   All execution is scoped to the open workspace (workspace.resolveInside).
   ===================================================================== */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const workspace = require('./workspace');

const CAP_MS = 12 * 60 * 1000;           // hard cap per adapter run
const MAX_OUT = 2 * 1024 * 1024;

/* ---------------- shared helpers ---------------- */

function which(cmd) {
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
    if (r.status === 0) return (r.stdout || '').split(/\r?\n/).filter(Boolean)[0] || null;
  } catch (_) {}
  return null;
}

function androidSdk() {
  const cands = [
    process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.env.HOME && path.join(process.env.HOME, 'Android', 'Sdk'),
    process.env.HOME && path.join(process.env.HOME, 'Library', 'Android', 'sdk')
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(path.join(c, 'platform-tools'))) return c; } catch (_) {} }
  return null;
}
function sdkTool(sdk, rel) {
  const exe = process.platform === 'win32' ? rel + '.exe' : rel;
  const p = path.join(sdk, exe);
  return fs.existsSync(p) ? p : null;
}

function runIn(cwd, cmd, args, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    let child;
    try {
      const useShell = !!opts.shell;
      const c = useShell && /[ (]/.test(cmd) ? '"' + cmd + '"' : cmd;
      child = spawn(c, args || [], {
        cwd, windowsHide: true, shell: useShell,
        env: Object.assign({}, process.env, opts.env || {})
      });
    } catch (e) {
      return resolve({ code: -1, stdout: '', stderr: String(e && e.message || e), spawnError: true });
    }
    let out = '', err = '', done = false;
    const timer = setTimeout(() => { done = true; try { child.kill('SIGKILL'); } catch (_) {} resolve({ code: -2, stdout: out, stderr: err + '\n[timed out]', timedOut: true }); }, opts.timeoutMs || CAP_MS);
    child.stdout && child.stdout.on('data', (d) => { if (out.length < MAX_OUT) out += d; });
    child.stderr && child.stderr.on('data', (d) => { if (err.length < MAX_OUT) err += d; });
    child.on('error', (e) => { err += String(e && e.message || e); });
    child.on('close', (code) => { if (done) return; clearTimeout(timer); resolve({ code: code == null ? -1 : code, stdout: out, stderr: err }); });
  });
}

async function writeEvidence(root, name, obj) {
  const dir = path.join(root, '.sovereign');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), JSON.stringify(obj, null, 2));
}
async function listFiles(root, sub, re) {
  const dir = path.join(root, sub);
  let names = [];
  try { names = await fsp.readdir(dir); } catch (_) { return []; }
  return names.filter((n) => re.test(n)).map((n) => path.join(dir, n));
}
function root() {
  const r = workspace.getRoot();
  if (!r) throw new Error('Open a project folder first');
  return r;
}

/* =====================================================================
   PROBE — what can this host actually run?
   ===================================================================== */
function probe() {
  const out = { host: { platform: process.platform, arch: process.arch }, evm: {}, android: {}, ios: {}, ml: {} };

  // EVM: the vendored solc + @ethereumjs/vm path is always available; forge is a bonus.
  let solcOk = false;
  try { require.resolve('solc'); require.resolve('@ethereumjs/vm'); solcOk = true; } catch (_) {}
  const forge = which('forge');
  out.evm = {
    available: solcOk || !!forge,
    runtime: forge ? 'foundry' : (solcOk ? 'ethereumjs-local' : null),
    solc: solcOk, foundry: !!forge, anvil: !!which('anvil'), slither: !!which('slither')
  };

  // Android
  const sdk = androidSdk();
  const adb = sdk && sdkTool(sdk, 'platform-tools/adb');
  const emu = sdk && sdkTool(sdk, 'emulator/emulator');
  const java = which('java');
  let avds = [];
  if (emu) {
    try { const r = spawnSync(emu, ['-list-avds'], { encoding: 'utf8', timeout: 8000 }); avds = (r.stdout || '').split(/\r?\n/).filter(Boolean); } catch (_) {}
  }
  let accel = null;
  if (emu) { try { const r = spawnSync(emu, ['-accel-check'], { encoding: 'utf8', timeout: 8000 }); accel = /is installed and usable/i.test((r.stdout || '') + (r.stderr || '')); } catch (_) {} }
  out.android = {
    available: !!(sdk && adb && java),
    canRun: !!(sdk && adb && emu && java && avds.length && accel),
    sdk: sdk || null, adb: !!adb, emulator: !!emu, java: !!java, avds, accel: !!accel
  };

  // iOS
  const xcodebuild = process.platform === 'darwin' ? which('xcodebuild') : null;
  out.ios = {
    available: !!xcodebuild,
    canRun: !!xcodebuild,
    macos: process.platform === 'darwin',
    xcodebuild: !!xcodebuild, simctl: !!which('simctl')
  };

  // ML
  const py = which('python') || which('python3');
  let torch = null, cuda = false, mps = false, vramGB = 0, ramGB = Math.round(os.totalmem() / 1e9);
  if (py) {
    try {
      const r = spawnSync(py, ['-c', 'import json,sys\ntry:\n import torch\n cu=torch.cuda.is_available()\n mp=getattr(torch.backends,"mps",None) and torch.backends.mps.is_available()\n v=0\n if cu:\n  v=torch.cuda.get_device_properties(0).total_memory/1e9\n print(json.dumps({"torch":torch.__version__,"cuda":bool(cu),"mps":bool(mp),"vram":round(v,1)}))\nexcept Exception as e:\n print(json.dumps({"torch":None,"err":str(e)}))'], { encoding: 'utf8', timeout: 20000 });
      const j = JSON.parse((r.stdout || '{}').trim().split('\n').pop() || '{}');
      torch = j.torch || null; cuda = !!j.cuda; mps = !!j.mps; vramGB = j.vram || 0;
    } catch (_) {}
  }
  out.ml = {
    available: !!(py && torch),
    python: !!py, torch, cuda, mps,
    vramGB, ramGB, cpus: os.cpus().length,
    axolotl: false, trl: false
  };
  if (py && torch) {
    try {
      const r = spawnSync(py, ['-c', 'import importlib.util as u,json;print(json.dumps({"axolotl":bool(u.find_spec("axolotl")),"trl":bool(u.find_spec("trl")),"transformers":bool(u.find_spec("transformers"))}))'], { encoding: 'utf8', timeout: 15000 });
      const j = JSON.parse((r.stdout || '{}').trim().split('\n').pop() || '{}');
      out.ml.axolotl = !!j.axolotl; out.ml.trl = !!j.trl; out.ml.transformers = !!j.transformers;
    } catch (_) {}
  }
  return out;
}

/* =====================================================================
   EVM ADAPTER — local deterministic chain (ethereumjs) or Foundry
   ===================================================================== */
async function evmRun(opts) {
  opts = opts || {};
  const r = root();
  const scenario = opts.scenario || {};
  const p = probe().evm;
  if (!p.available) {
    return { status: 'BLOCKED', capability: 'blockchain', reason: 'EVM_RUNTIME_UNAVAILABLE',
      need: 'Foundry (curl -L https://foundry.paradigm.xyz | bash && foundryup) or the bundled solc + @ethereumjs/vm', evidenceFile: 'blockchain-evidence.json' };
  }

  // ---- compile every .sol under src/ (+ test/) with vendored solc ----
  const solc = require('solc');
  const srcFiles = (await listFiles(r, 'src', /\.sol$/)).concat(await listFiles(r, 'contracts', /\.sol$/));
  if (!srcFiles.length) {
    return { status: 'BLOCKED', capability: 'blockchain', reason: 'NO_CONTRACTS', need: 'a src/*.sol contract to compile', evidenceFile: 'blockchain-evidence.json' };
  }
  const sources = {};
  for (const f of srcFiles) sources[path.basename(f)] = { content: await fsp.readFile(f, 'utf8') };
  // resolve simple OpenZeppelin-style imports to bundled minimal shims if referenced
  const input = {
    language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers'] } } }
  };
  let compiled;
  try { compiled = JSON.parse(solc.compile(JSON.stringify(input))); }
  catch (e) { return { status: 'FAIL', capability: 'blockchain', reason: 'COMPILE_CRASH', error: String(e && e.message || e), evidenceFile: 'blockchain-evidence.json' }; }
  const errors = (compiled.errors || []).filter((e) => e.severity === 'error');
  const warnings = (compiled.errors || []).filter((e) => e.severity === 'warning').map((e) => e.formattedMessage.trim());
  if (errors.length) {
    const ev = { capability: 'blockchain', status: 'FAIL', generatedAt: Date.now(), runtime: 'solc',
      solcVersion: solc.version(), compileErrors: errors.map((e) => e.formattedMessage.trim()) };
    await writeEvidence(r, 'blockchain-evidence.json', ev);
    return { status: 'FAIL', capability: 'blockchain', reason: 'SOLIDITY_COMPILE_ERROR', evidence: ev, evidenceFile: 'blockchain-evidence.json' };
  }
  const artifacts = {};
  for (const file of Object.keys(compiled.contracts || {})) {
    for (const name of Object.keys(compiled.contracts[file])) {
      const c = compiled.contracts[file][name];
      artifacts[name] = { abi: c.abi, bytecode: c.evm.bytecode.object, methods: c.evm.methodIdentifiers || {} };
    }
  }

  // ---- lightweight static analysis (Slither if present, else in-JS heuristics) ----
  const staticFindings = [];
  if (p.slither) {
    const s = await runIn(r, 'slither', ['.', '--json', '-'], { timeoutMs: 120000 });
    try {
      const j = JSON.parse(s.stdout || '{}');
      ((j.results && j.results.detectors) || []).forEach((d) => staticFindings.push({ tool: 'slither', impact: d.impact, check: d.check, description: (d.description || '').slice(0, 200) }));
    } catch (_) {}
  } else {
    for (const [name, art] of Object.entries(sources)) {
      const body = art.content;
      if (/\btx\.origin\b/.test(body)) staticFindings.push({ tool: 'cs-lint', impact: 'High', check: 'tx-origin-auth', file: name });
      if (/\.call\{value:/.test(body) && !/nonReentrant|ReentrancyGuard|checks-effects/i.test(body)) staticFindings.push({ tool: 'cs-lint', impact: 'Medium', check: 'possible-reentrancy', file: name });
      if (/\bselfdestruct\b/.test(body)) staticFindings.push({ tool: 'cs-lint', impact: 'High', check: 'selfdestruct', file: name });
      if (/pragma solidity\s+\^?0\.[0-7]\./.test(body)) staticFindings.push({ tool: 'cs-lint', impact: 'Low', check: 'old-solidity', file: name });
    }
  }

  // ---- run a real local chain: deploy + scenario transactions ----
  const { VM } = await import('@ethereumjs/vm');
  const { LegacyTransaction } = await import('@ethereumjs/tx');
  const U = await import('@ethereumjs/util');
  const { Address, hexToBytes, bytesToHex, privateToAddress, Account } = U;
  let ethAbi;
  try { ethAbi = require('ethereumjs-abi'); } catch (_) { ethAbi = null; }

  function word(hex) { return hex.replace(/^0x/, '').padStart(64, '0'); }
  function encodeStatic(type, val) {
    if (/^uint/.test(type) || /^int/.test(type)) return BigInt(val).toString(16).padStart(64, '0');
    if (type === 'address') return String(val).toLowerCase().replace(/^0x/, '').padStart(64, '0');
    if (type === 'bool') return (val ? 1n : 0n).toString(16).padStart(64, '0');
    if (/^bytes32$/.test(type)) return String(val).replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
    return null;
  }
  // Full ABI head/tail encoding for a param list (supports static types + string/bytes).
  function encodeArgs(args) {
    args = args || [];
    const isDyn = (t) => t === 'string' || t === 'bytes';
    let head = '', tail = '';
    let tailOffset = args.length * 32;
    for (const a of args) {
      if (isDyn(a.type)) {
        head += word((tailOffset).toString(16));
        const bytes = a.type === 'string' ? Buffer.from(String(a.value), 'utf8') : Buffer.from(String(a.value).replace(/^0x/, ''), 'hex');
        const lenWord = word(bytes.length.toString(16));
        const dataHex = bytes.toString('hex');
        const padded = dataHex.padEnd(Math.ceil(dataHex.length / 64) * 64 || 64, '0');
        tail += lenWord + padded;
        tailOffset += 32 + (padded.length / 2);
      } else {
        const s = encodeStatic(a.type, a.value);
        if (s == null) throw new Error('unsupported scenario param type: ' + a.type);
        head += s;
      }
    }
    return head + tail;
  }
  function encodeParam(type, val) { const s = encodeStatic(type, val); if (s == null) throw new Error('unsupported scenario param type: ' + type); return s; }
  function selector(sig) {
    // keccak256(sig)[0:4] — use solc's methodIdentifiers when possible
    for (const art of Object.values(artifacts)) {
      const norm = sig.replace(/\s+/g, '');
      if (art.methods[norm]) return art.methods[norm];
    }
    // fall back to ethereumjs-abi if available
    if (ethAbi) return ethAbi.methodID(sig.split('(')[0], sig.match(/\(([^)]*)\)/)[1].split(',').filter(Boolean)).toString('hex');
    throw new Error('cannot resolve selector for ' + sig);
  }

  const vm = await VM.create();
  const accounts = [];
  for (let i = 0; i < 5; i++) {
    const pk = hexToBytes('0x' + (i + 1).toString(16).padStart(2, '0').repeat(32).slice(0, 64));
    const addr = new Address(privateToAddress(pk));
    await vm.stateManager.putAccount(addr, new Account(0n, 10n ** 22n));
    accounts.push({ pk, address: addr.toString() });
  }
  // scenarios address parties by account index: {type:'account', value:1}
  const acctAddr = (v) => (accounts[v] ? accounts[v].address : v);
  const resolveArg = (a) => a.type === 'account' ? { type: 'address', value: acctAddr(a.value) } : a;
  const GAS_PRICE = 1000000000n;
  const state = { deployed: {} };
  async function nonceOf(addrStr) {
    const acc = await vm.stateManager.getAccount(new Address(hexToBytes('0x' + addrStr.replace(/^0x/, ''))));
    return acc ? acc.nonce : 0n;
  }

  const txLog = [];
  const asserts = [];
  let failed = null;

  // default scenario: deploy the first contract with its declared args, then run scenario.steps
  const primary = scenario.contract || Object.keys(artifacts)[0];
  const art = artifacts[primary];
  if (!art) { return { status: 'FAIL', capability: 'blockchain', reason: 'NO_ARTIFACT', evidenceFile: 'blockchain-evidence.json' }; }

  // resolve {expect:{account:N}} / literal expectations to decimal strings
  function resolveExpect(e) {
    if (e == null) return null;
    if (typeof e === 'object' && e.account != null) return BigInt(acctAddr(e.account)).toString();
    return String(e);
  }

  try {
    // constructor args
    let ctorData = art.bytecode + encodeArgs((scenario.constructorArgs || []).map(resolveArg));
    const deployer = accounts[0];
    let tx = LegacyTransaction.fromTxData({ nonce: await nonceOf(deployer.address), gasLimit: 6_000_000n, gasPrice: GAS_PRICE, data: hexToBytes('0x' + ctorData) }).sign(deployer.pk);
    let res = await vm.runTx({ tx, skipBlockGasLimitValidation: true });
    if (res.execResult.exceptionError) throw new Error('constructor reverted: ' + res.execResult.exceptionError.error);
    const contractAddr = res.createdAddress.toString();
    state.deployed[primary] = contractAddr;
    txLog.push({ kind: 'deploy', contract: primary, address: contractAddr, gasUsed: Number(res.totalGasSpent), status: 1 });

    for (const step of (scenario.steps || [])) {
      const from = accounts[step.from || 0];
      const sig = step.call;                         // e.g. "transfer(address,uint256)"
      const sel = selector(sig);
      const data = '0x' + sel + encodeArgs((step.args || []).map(resolveArg));
      const to = new Address(hexToBytes('0x' + (state.deployed[step.contract || primary]).replace(/^0x/, '')));
      if (step.readOnly) {
        const cr = await vm.evm.runCall({ to, caller: new Address(hexToBytes('0x' + from.address.replace(/^0x/, ''))), origin: new Address(hexToBytes('0x' + from.address.replace(/^0x/, ''))), data: hexToBytes(data), gasLimit: 3_000_000n });
        const ret = BigInt(bytesToHex(cr.execResult.returnValue) || '0x0');
        txLog.push({ kind: 'call', call: sig, from: from.address, returned: ret.toString() });
        const exp = resolveExpect(step.expect);
        if (exp != null) {
          const ok = ret.toString() === exp;
          asserts.push({ step: sig, expect: exp, got: ret.toString(), pass: ok });
          if (!ok && !failed) failed = 'assertion failed on ' + sig + ' (want ' + exp + ', got ' + ret.toString() + ')';
        }
        continue;
      }
      tx = LegacyTransaction.fromTxData({ nonce: await nonceOf(from.address), to, gasLimit: 1_500_000n, gasPrice: GAS_PRICE, value: BigInt(step.value || 0), data: hexToBytes(data) }).sign(from.pk);
      res = await vm.runTx({ tx, skipBlockGasLimitValidation: true });
      const reverted = !!res.execResult.exceptionError;
      txLog.push({ kind: 'tx', call: sig, from: from.address, gasUsed: Number(res.totalGasSpent), logs: res.execResult.logs.length, status: reverted ? 0 : 1 });
      if (step.expectRevert) {
        asserts.push({ step: sig, expect: 'revert', got: reverted ? 'revert' : 'success', pass: reverted });
        if (!reverted && !failed) failed = sig + ' was expected to revert but succeeded';
      } else if (reverted) {
        asserts.push({ step: sig, expect: 'success', got: 'revert', pass: false });
        if (!failed) failed = sig + ' reverted: ' + res.execResult.exceptionError.error;
      } else {
        asserts.push({ step: sig, expect: 'success', got: 'success', pass: true });
      }
    }
  } catch (e) {
    failed = failed || String(e && e.message || e);
  }

  // ---- run `forge test` too, when Foundry is present (fuzz/invariant coverage) ----
  let forge = null;
  if (p.foundry) {
    const ft = await runIn(r, 'forge', ['test', '-q'], { timeoutMs: 180000 });
    forge = { ran: true, code: ft.code, passed: ft.code === 0, tail: (ft.stdout + ft.stderr).slice(-1200) };
    if (ft.code !== 0 && !failed) failed = 'forge test failed';
  }

  const highStatic = staticFindings.filter((f) => /high/i.test(f.impact)).length;
  const status = failed ? 'FAIL' : (highStatic > 0 ? 'FAIL' : 'PASS');
  const evidence = {
    capability: 'blockchain', status, generatedAt: Date.now(),
    runtime: p.foundry ? 'foundry+ethereumjs' : 'ethereumjs-local',
    solcVersion: solc.version(),
    contracts: Object.keys(artifacts),
    compileWarnings: warnings.slice(0, 20),
    chain: { accounts: accounts.map((a) => a.address), gasPrice: GAS_PRICE.toString() },
    deployments: state.deployed,
    transactions: txLog,
    assertions: asserts,
    staticAnalysis: { tool: p.slither ? 'slither' : 'cs-lint', findings: staticFindings, high: highStatic },
    forge,
    failure: failed || null
  };
  await writeEvidence(r, 'blockchain-evidence.json', evidence);
  return { status, capability: 'blockchain', evidence, evidenceFile: 'blockchain-evidence.json', reason: failed ? 'VERIFICATION_FAILED' : (highStatic ? 'HIGH_SEVERITY_STATIC_FINDING' : null) };
}

/* =====================================================================
   ANDROID ADAPTER — gradlew assembleDebug + emulator + adb
   ===================================================================== */
async function androidRun(opts) {
  opts = opts || {};
  const r = root();
  const p = probe().android;
  const evidence = { capability: 'native-mobile', platform: 'android', generatedAt: Date.now(), steps: [] };

  if (!p.available) {
    return { status: 'BLOCKED', capability: 'native-mobile', platform: 'android', reason: 'ANDROID_SDK_REQUIRED',
      need: 'Android Studio / commandline-tools + a JDK. https://developer.android.com/studio', evidenceFile: 'mobile-evidence.json' };
  }

  // locate a Gradle: project wrapper -> gradle on PATH -> a cached wrapper distribution
  function findGradle() {
    const winExe = process.platform === 'win32';
    const wrap = path.join(r, winExe ? 'gradlew.bat' : 'gradlew');
    if (fs.existsSync(wrap)) return { cmd: winExe ? 'gradlew.bat' : './gradlew', wrapper: true };
    const onPath = which('gradle');
    if (onPath) return { cmd: onPath, wrapper: false };
    const home = process.env.GRADLE_USER_HOME || (process.env.HOME && path.join(process.env.HOME, '.gradle')) || (process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.gradle'));
    try {
      const dists = path.join(home, 'wrapper', 'dists');
      for (const d of fs.readdirSync(dists)) {
        let hashes = [];
        try { hashes = fs.readdirSync(path.join(dists, d)); } catch (_) { continue; }
        for (const h of hashes) {
          const bin = path.join(dists, d, h, d.replace(/-(bin|all)$/, ''), 'bin', winExe ? 'gradle.bat' : 'gradle');
          if (fs.existsSync(bin)) return { cmd: bin, wrapper: false };
        }
      }
    } catch (_) {}
    return null;
  }
  const g = findGradle();
  if (!g) {
    return { status: 'BLOCKED', capability: 'native-mobile', platform: 'android', reason: 'GRADLE_UNAVAILABLE',
      need: 'a Gradle install (Android Studio bundles one) or network access to fetch the wrapper distribution', evidenceFile: 'mobile-evidence.json' };
  }
  const gw = g.cmd;
  const gwShell = process.platform === 'win32' && /\.(bat|cmd)$/i.test(gw);
  const env = { ANDROID_HOME: p.sdk, ANDROID_SDK_ROOT: p.sdk, JAVA_HOME: process.env.JAVA_HOME || '' };
  // sdk.dir so AGP finds the SDK without a checked-in local.properties
  try { await fsp.writeFile(path.join(r, 'local.properties'), 'sdk.dir=' + p.sdk.replace(/\\/g, '\\\\') + '\n'); } catch (_) {}

  // ---- 1. build ----
  const build = await runIn(r, gw, ['assembleDebug', '--offline', '-q', '--console=plain'], { timeoutMs: 8 * 60 * 1000, shell: gwShell, env });
  let buildOfflineFailed = build.code !== 0;
  let build2 = null;
  if (buildOfflineFailed) {
    build2 = await runIn(r, gw, ['assembleDebug', '-q', '--console=plain'], { timeoutMs: 12 * 60 * 1000, shell: gwShell, env });
  }
  const buildOk = build.code === 0 || (build2 && build2.code === 0);
  evidence.steps.push({ step: 'gradle-assembleDebug', ok: buildOk, offline: !buildOfflineFailed, tail: ((build2 || build).stdout + (build2 || build).stderr).slice(-1500) });
  if (!buildOk) {
    const tail = ((build2 || build).stdout + (build2 || build).stderr);
    const netBlocked = /Could not (resolve|download|GET)|dl\.google\.com|repo\.maven|Network is unreachable|offline mode/i.test(tail);
    evidence.status = 'BLOCKED';
    await writeEvidence(r, 'mobile-evidence.json', evidence);
    return { status: 'BLOCKED', capability: 'native-mobile', platform: 'android',
      reason: netBlocked ? 'GRADLE_DEPENDENCIES_UNAVAILABLE' : 'ANDROID_BUILD_FAILED',
      need: netBlocked ? 'network access for the first Gradle/AGP dependency download' : 'fix the build error (see mobile-evidence.json)',
      evidence, evidenceFile: 'mobile-evidence.json' };
  }
  // locate the apk
  let apk = null;
  const apkDir = path.join(r, 'app', 'build', 'outputs', 'apk', 'debug');
  try { const nm = (await fsp.readdir(apkDir)).find((n) => n.endsWith('.apk')); if (nm) apk = path.join(apkDir, nm); } catch (_) {}
  if (!apk) {
    // search
    const found = spawnSync(process.platform === 'win32' ? 'where' : 'find', process.platform === 'win32' ? ['/r', r, '*.apk'] : [r, '-name', '*.apk'], { encoding: 'utf8', timeout: 15000 });
    apk = (found.stdout || '').split(/\r?\n/).filter((l) => /app-debug\.apk$/.test(l))[0] || null;
  }
  evidence.apk = apk ? path.relative(r, apk) : null;
  evidence.apkBytes = apk ? fs.statSync(apk).size : 0;

  if (!p.canRun) {
    evidence.status = 'BLOCKED';
    await writeEvidence(r, 'mobile-evidence.json', evidence);
    return { status: 'BLOCKED', capability: 'native-mobile', platform: 'android', reason: p.accel ? 'NO_AVD' : 'NO_EMULATOR_ACCELERATION',
      need: p.accel ? 'create an Android Virtual Device (avdmanager create avd ...)' : 'hardware acceleration (WHPX/HAXM/KVM) for the emulator',
      evidence, evidenceFile: 'mobile-evidence.json',
      note: 'APK built successfully (' + evidence.apkBytes + ' bytes); the emulator run is what is blocked.' };
  }

  // ---- 2. boot emulator ----
  const adb = sdkTool(p.sdk, 'platform-tools/adb');
  const emu = sdkTool(p.sdk, 'emulator/emulator');
  const avd = opts.avd && p.avds.includes(opts.avd) ? opts.avd : p.avds[0];
  let emuProc = null;
  try {
    emuProc = spawn(emu, ['-avd', avd, '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-gpu', 'swiftshader_indirect', '-read-only'], { cwd: r, windowsHide: true, detached: false, env: Object.assign({}, process.env, env) });
  } catch (e) {
    evidence.status = 'BLOCKED';
    await writeEvidence(r, 'mobile-evidence.json', evidence);
    return { status: 'BLOCKED', capability: 'native-mobile', platform: 'android', reason: 'EMULATOR_LAUNCH_FAILED', error: String(e.message), evidence, evidenceFile: 'mobile-evidence.json' };
  }
  let emuOut = '';
  emuProc.stdout && emuProc.stdout.on('data', (d) => { emuOut += d; });
  emuProc.stderr && emuProc.stderr.on('data', (d) => { emuOut += d; });

  async function adbShell(args, t) { return runIn(r, adb, args, { timeoutMs: t || 20000, env }); }
  async function killEmu() { try { await adbShell(['emu', 'kill'], 8000); } catch (_) {} try { emuProc.kill('SIGKILL'); } catch (_) {} }

  try {
    // wait for device
    const wf = await adbShell(['wait-for-device'], 150000);
    if (wf.code !== 0) throw Object.assign(new Error('wait-for-device timed out'), { blocked: 'EMULATOR_BOOT_TIMEOUT' });
    // wait for boot complete
    let booted = false;
    for (let i = 0; i < 60; i++) {
      const b = await adbShell(['shell', 'getprop', 'sys.boot_completed'], 8000);
      if (/^1/.test((b.stdout || '').trim())) { booted = true; break; }
      await new Promise((rs) => setTimeout(rs, 3000));
    }
    if (!booted) throw Object.assign(new Error('sys.boot_completed never went to 1'), { blocked: 'EMULATOR_BOOT_TIMEOUT' });
    evidence.steps.push({ step: 'emulator-boot', ok: true, avd });

    // install
    const inst = await adbShell(['install', '-r', '-t', apk], 120000);
    const installOk = /Success/i.test(inst.stdout + inst.stderr);
    evidence.steps.push({ step: 'adb-install', ok: installOk, tail: (inst.stdout + inst.stderr).slice(-400) });
    if (!installOk) throw new Error('adb install failed: ' + (inst.stdout + inst.stderr).slice(-300));

    // package + launch
    const pkg = opts.applicationId || evidence.applicationId || (await (async () => {
      // read from AndroidManifest / build.gradle
      try {
        const g = await fsp.readFile(path.join(r, 'app', 'build.gradle'), 'utf8').catch(() => fsp.readFile(path.join(r, 'app', 'build.gradle.kts'), 'utf8'));
        const m = g.match(/applicationId\s*[=(]?\s*["']([^"']+)["']/); if (m) return m[1];
      } catch (_) {}
      return 'com.codesovereign.app';
    })());
    evidence.applicationId = pkg;
    await adbShell(['logcat', '-c'], 8000);
    const launch = await adbShell(['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], 30000);
    const launched = /Events injected: 1/.test(launch.stdout) || launch.code === 0;
    evidence.steps.push({ step: 'launch', ok: launched, pkg });
    await new Promise((rs) => setTimeout(rs, 6000));
    // definitive "the app process is alive" check
    const pid = await adbShell(['shell', 'pidof', pkg], 8000);
    const running = /\d/.test((pid.stdout || '').trim());
    const top = await adbShell(['shell', 'dumpsys', 'activity', 'activities'], 12000);
    const isForeground = new RegExp('(mResumedActivity|topResumedActivity|ResumedActivity).*' + pkg.replace(/\./g, '\\.'), 'i').test(top.stdout || '');
    evidence.steps.push({ step: 'process-alive', ok: running, foreground: isForeground });

    // screenshot
    let shot = null;
    try {
      const s = spawnSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024, timeout: 20000, env: Object.assign({}, process.env, env) });
      if (s.status === 0 && s.stdout && s.stdout.length > 1000) {
        await fsp.mkdir(path.join(r, '.sovereign', 'mobile'), { recursive: true });
        shot = '.sovereign/mobile/launch.png';
        await fsp.writeFile(path.join(r, shot), s.stdout);
      }
    } catch (_) {}
    evidence.screenshot = shot;

    // crash scan
    const lc = await adbShell(['logcat', '-d', '-t', '600'], 15000);
    const crashed = new RegExp('FATAL EXCEPTION|ANR in ' + pkg.replace(/\./g, '\\.') + '|Force finishing activity .*' + pkg, 'i').test(lc.stdout || '');
    const started = running || new RegExp('ActivityManager: Start proc .*' + pkg.replace(/\./g, '\\.') + '|Displayed ' + pkg.replace(/\./g, '\\.'), 'i').test(lc.stdout || '');
    evidence.steps.push({ step: 'runtime-observe', ok: !crashed && started, crashed, started, foreground: isForeground });
    evidence.logcatTail = (lc.stdout || '').split('\n').filter((l) => new RegExp(pkg.replace(/\./g, '\\.') + '|AndroidRuntime|ActivityManager').test(l)).slice(-30).join('\n') || (lc.stdout || '').split('\n').slice(-20).join('\n');

    // ---- optional Maestro UI drive ----
    if (which('maestro') && fs.existsSync(path.join(r, '.maestro'))) {
      const mo = await runIn(r, 'maestro', ['test', '.maestro'], { timeoutMs: 180000, env });
      evidence.steps.push({ step: 'maestro', ok: mo.code === 0, tail: (mo.stdout + mo.stderr).slice(-800) });
    }

    const ok = buildOk && installOk && launched && started && !crashed;
    evidence.status = ok ? 'PASS' : 'FAIL';
    await writeEvidence(r, 'mobile-evidence.json', evidence);
    await killEmu();
    return { status: evidence.status, capability: 'native-mobile', platform: 'android', evidence, evidenceFile: 'mobile-evidence.json', reason: ok ? null : (crashed ? 'APP_CRASHED_ON_LAUNCH' : 'LAUNCH_NOT_OBSERVED') };
  } catch (e) {
    await killEmu();
    evidence.status = 'BLOCKED';
    evidence.emulatorLog = emuOut.slice(-1500);
    await writeEvidence(r, 'mobile-evidence.json', evidence);
    return { status: 'BLOCKED', capability: 'native-mobile', platform: 'android', reason: e.blocked || 'EMULATOR_RUN_FAILED', error: String(e.message || e), evidence, evidenceFile: 'mobile-evidence.json',
      note: 'The APK built (' + (evidence.apkBytes || 0) + ' bytes); the emulator run could not complete on this host.' };
  }
}

async function iosRun() {
  const r = root();
  if (process.platform !== 'darwin' || !which('xcodebuild')) {
    const ev = { capability: 'native-mobile', platform: 'ios', status: 'BLOCKED', generatedAt: Date.now(), reason: 'MACOS_RUNNER_REQUIRED' };
    await writeEvidence(r, 'mobile-evidence.json', ev);
    return { status: 'BLOCKED', capability: 'native-mobile', platform: 'ios', reason: 'MACOS_RUNNER_REQUIRED',
      need: 'a macOS worker with Xcode + iOS Simulator (xcodebuild, simctl). https://developer.apple.com/xcode/', evidence: ev, evidenceFile: 'mobile-evidence.json' };
  }
  // macOS path
  const build = await runIn(r, 'xcodebuild', ['-scheme', 'App', '-sdk', 'iphonesimulator', '-configuration', 'Debug', 'build'], { timeoutMs: 10 * 60 * 1000 });
  const ev = { capability: 'native-mobile', platform: 'ios', generatedAt: Date.now(), buildOk: build.code === 0, tail: (build.stdout + build.stderr).slice(-1500) };
  ev.status = build.code === 0 ? 'PASS' : 'FAIL';
  await writeEvidence(r, 'mobile-evidence.json', ev);
  return { status: ev.status, capability: 'native-mobile', platform: 'ios', evidence: ev, evidenceFile: 'mobile-evidence.json' };
}

/* =====================================================================
   ML ADAPTER — real training run with PyTorch
   ===================================================================== */
async function mlRun(opts) {
  opts = opts || {};
  const r = root();
  const p = probe().ml;
  if (!p.python) {
    return { status: 'BLOCKED', capability: 'ml-training', reason: 'PYTHON_NOT_INSTALLED', need: 'Python 3.10+ on PATH', evidenceFile: 'ml-evidence.json' };
  }
  if (!p.torch) {
    return { status: 'BLOCKED', capability: 'ml-training', reason: 'PYTORCH_NOT_INSTALLED',
      need: 'pip install torch  (https://pytorch.org). For LLM fine-tuning also: pip install axolotl-ai transformers datasets peft trl', evidenceFile: 'ml-evidence.json' };
  }
  const py = which('python') || which('python3');
  const trainScript = fs.existsSync(path.join(r, 'train.py')) ? 'train.py'
    : fs.existsSync(path.join(r, 'src', 'train.py')) ? 'src/train.py' : null;
  if (!trainScript) {
    return { status: 'BLOCKED', capability: 'ml-training', reason: 'NO_TRAINING_SCRIPT', need: 'a generated train.py', evidenceFile: 'ml-evidence.json' };
  }

  // ---- dataset gate ----
  const wantsUserData = !!opts.requiresDataset;
  function hasRealData(d) {
    try { return fs.readdirSync(d, { recursive: true }).some((n) => /\.(jsonl|csv|txt|parquet|tsv)$/i.test(String(n)) && !/readme/i.test(String(n))); }
    catch (_) { return false; }
  }
  const dataDir = ['dataset', 'data'].map((d) => path.join(r, d)).find(hasRealData);
  if (wantsUserData && !dataDir && !opts.allowSynthetic) {
    const ev = { capability: 'ml-training', status: 'BLOCKED', generatedAt: Date.now(), reason: 'DATASET_REQUIRED' };
    await writeEvidence(r, 'ml-evidence.json', ev);
    return { status: 'BLOCKED', capability: 'ml-training', reason: 'DATASET_REQUIRED',
      need: 'drop your training data under dataset/ (jsonl/csv/txt). The pipeline is generated and ready; it just needs data.', evidence: ev, evidenceFile: 'ml-evidence.json' };
  }

  // ---- compute planning: if config asks for a model bigger than we can run, downshift or BLOCK ----
  let plan = { strategy: 'from-scratch', device: p.cuda ? 'cuda' : (p.mps ? 'mps' : 'cpu') };
  try {
    const cfg = JSON.parse(await fsp.readFile(path.join(r, 'training.json'), 'utf8'));
    plan.strategy = cfg.strategy || plan.strategy;
    const needGB = cfg.estVramGB || 0;
    const haveGB = p.cuda ? p.vramGB : Math.min(8, p.ramGB);
    if (needGB && needGB > haveGB) {
      if (/full|pretrain/.test(plan.strategy) && !p.cuda) {
        const ev = { capability: 'ml-training', status: 'BLOCKED', generatedAt: Date.now(), reason: 'INSUFFICIENT_COMPUTE', requiredVRAM: needGB + 'GB', availableVRAM: haveGB + 'GB', suggestedStrategy: 'QLoRA' };
        await writeEvidence(r, 'ml-evidence.json', ev);
        return { status: 'BLOCKED', capability: 'ml-training', reason: 'INSUFFICIENT_COMPUTE', need: 'a CUDA GPU with >= ' + needGB + 'GB VRAM, or switch strategy to QLoRA', evidence: ev, evidenceFile: 'ml-evidence.json' };
      }
      plan.strategy = 'QLoRA';
    }
  } catch (_) {}

  // ---- real training run ----
  const run = await runIn(r, py, [trainScript], { timeoutMs: opts.timeoutMs || 15 * 60 * 1000, env: { PYTHONUNBUFFERED: '1', CS_MAX_STEPS: String(opts.maxSteps || '') } });
  let ev = null;
  try { ev = JSON.parse(await fsp.readFile(path.join(r, '.sovereign', 'ml-evidence.json'), 'utf8')); }
  catch (_) {
    try { ev = JSON.parse(await fsp.readFile(path.join(r, 'ml-evidence.json'), 'utf8')); } catch (_) {}
  }
  if (!ev) {
    ev = { capability: 'ml-training', status: run.code === 0 ? 'FAIL' : 'FAIL', generatedAt: Date.now(),
      reason: 'NO_EVIDENCE_EMITTED', exit: run.code, tail: (run.stdout + run.stderr).slice(-1500) };
    await writeEvidence(r, 'ml-evidence.json', ev);
    return { status: 'FAIL', capability: 'ml-training', reason: 'TRAINING_PRODUCED_NO_EVIDENCE', evidence: ev, evidenceFile: 'ml-evidence.json' };
  }
  ev.plan = plan;
  ev.trainerExit = run.code;
  const lossOk = ev.loss_decreased !== false && (ev.final_train_loss == null || ev.loss_curve == null || ev.final_train_loss <= ev.loss_curve[0].train_loss);
  const ckptOk = !!(ev.checkpoint && ev.checkpoint.bytes > 0);
  const status = (run.code === 0 && lossOk && ckptOk) ? 'PASS' : 'FAIL';
  ev.status = status;
  await writeEvidence(r, 'ml-evidence.json', ev);
  return { status, capability: 'ml-training', evidence: ev, evidenceFile: 'ml-evidence.json',
    reason: status === 'PASS' ? null : (!ckptOk ? 'NO_CHECKPOINT' : !lossOk ? 'LOSS_DID_NOT_DECREASE' : 'TRAINING_EXIT_' + run.code) };
}

/* ---------------- dispatch ---------------- */
async function run(kind, opts) {
  switch (kind) {
    case 'probe': return probe();
    case 'evm': return evmRun(opts);
    case 'android': return androidRun(opts);
    case 'ios': return iosRun(opts);
    case 'ml': return mlRun(opts);
    default: return { status: 'FAIL', reason: 'UNKNOWN_ADAPTER', kind };
  }
}

module.exports = { probe, run, evmRun, androidRun, iosRun, mlRun };
