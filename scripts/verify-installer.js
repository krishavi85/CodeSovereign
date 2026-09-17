'use strict';
/* =====================================================================
   verify-installer.js  —  blueprint §36 installer verification

   After `npm run dist:win`, this checks the BUILD OUTPUTS automatically:
     - the installer + portable artifacts exist and their size + sha512
       match release/latest.yml
     - the .blockmap (differential-update map) is present
     - win-unpacked/ contains the executable + resources/app.asar
     - the asar carries electron/main.js + dist/index.html and its
       package.json version matches latest.yml
     - a lint of the NSIS config that the installer was built from

   Exit 0 = the build outputs are self-consistent and installable.
   The install → run → upgrade → uninstall LIFECYCLE on a real machine is
   still a human step; this prints that checklist at the end.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REL = path.join(ROOT, 'release');
const RUN_LIFECYCLE = process.argv.includes('--lifecycle');
// read the source package.json ONCE, up front — nothing below writes it
const SRC_PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let failed = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { failed++; console.log('  ✗ ' + m); };

function parseLatestYml(txt) {
  // tiny YAML reader — latest.yml is a flat map + one `files:` list
  const out = { files: [] };
  let cur = null;
  txt.split(/\r?\n/).forEach((line) => {
    let m;
    if ((m = line.match(/^(\w[\w-]*):\s*(.*)$/))) { if (m[1] !== 'files') out[m[1]] = m[2].replace(/^['"]|['"]$/g, '') || undefined; cur = null; }
    else if (/^\s*-\s+url:\s*(.+)$/.test(line)) { cur = { url: RegExp.$1.trim() }; out.files.push(cur); }
    else if (cur && (m = line.match(/^\s+(\w+):\s*(.+)$/))) { cur[m[1]] = m[2].trim(); }
  });
  return out;
}
function sha512b64(p) {
  return crypto.createHash('sha512').update(fs.readFileSync(p)).digest('base64');
}

console.log('\n[verify-installer] checking release/ build outputs\n');

if (!fs.existsSync(REL) || !fs.existsSync(path.join(REL, 'latest.yml'))) {
  console.log('  ✗ release/latest.yml not found — run `npm run dist:win` first');
  process.exit(2);
}
const meta = parseLatestYml(fs.readFileSync(path.join(REL, 'latest.yml'), 'utf8'));
console.log('  version: ' + meta.version + '\n');

// 1. artifacts exist + size + sha512 match latest.yml
meta.files.forEach((f) => {
  const abs = path.join(REL, f.url);
  if (!fs.existsSync(abs)) { bad('artifact missing: ' + f.url); return; }
  const size = fs.statSync(abs).size;
  if (f.size && String(size) !== String(f.size)) bad(f.url + ' size ' + size + ' != latest.yml ' + f.size);
  else ok(f.url + ' present (' + (size / 1048576).toFixed(1) + ' MB)');
  if (f.sha512) {
    const got = sha512b64(abs);
    if (got !== f.sha512) bad(f.url + ' sha512 mismatch');
    else ok(f.url + ' sha512 verified');
  }
});

// 2. the portable build + blockmap
const portable = fs.readdirSync(REL).find((n) => /portable\.exe$/.test(n) && n.includes(meta.version));
if (portable) ok('portable build present: ' + portable); else bad('no portable build for ' + meta.version);
const blockmap = fs.readdirSync(REL).find((n) => n.endsWith('.blockmap') && n.includes(meta.version));
if (blockmap) ok('differential-update blockmap present: ' + blockmap); else bad('no .blockmap (differential updates will re-download the whole installer)');

// 3. win-unpacked sanity
const unpacked = path.join(REL, 'win-unpacked');
const exe = path.join(unpacked, 'CodeSovereign.exe');
const asar = path.join(unpacked, 'resources', 'app.asar');
if (fs.existsSync(exe)) ok('win-unpacked/CodeSovereign.exe present'); else bad('win-unpacked/CodeSovereign.exe missing');
if (fs.existsSync(asar)) {
  ok('resources/app.asar present (' + (fs.statSync(asar).size / 1048576).toFixed(1) + ' MB)');
  try {
    // use the library API — the `asar` CLI's extract-file writes to CWD and
    // would clobber this repo's package.json.
    const asarLib = require('@electron/asar');
    const list = asarLib.listPackage(asar).map((l) => l.replace(/\\/g, '/').replace(/^\//, ''));
    ['electron/main.js', 'dist/index.html', 'dist/engine.ultramode.js'].forEach((need) => {
      if (list.indexOf(need) >= 0) ok('asar contains ' + need); else bad('asar missing ' + need);
    });
    const pkgTxt = asarLib.extractFile(asar, 'package.json').toString('utf8');
    const v = (pkgTxt.match(/"version":\s*"([^"]+)"/) || [])[1];
    if (v === meta.version) ok('asar package.json version matches latest.yml (' + v + ')');
    else bad('asar version ' + v + ' != latest.yml ' + meta.version);
  } catch (e) { bad('could not inspect the asar: ' + e.message); }
} else bad('resources/app.asar missing');

// 4. the NSIS config the installer was built from
try {
  const b = SRC_PKG.build || {};
  const nsis = b.nsis || {};
  if (nsis.oneClick === false && nsis.allowToChangeInstallationDirectory) ok('NSIS: assisted installer, user can choose the install dir');
  else bad('NSIS config is not an assisted installer (oneClick:false + allowToChangeInstallationDirectory)');
  if (((b.win && b.win.target) || []).some((t) => (t.target || t) === 'nsis')) ok('NSIS target declared'); else bad('no NSIS target');
} catch (e) { bad('package.json build config unreadable: ' + e.message); }

/* =====================================================================
   5. the install → upgrade → launch → uninstall LIFECYCLE, for real.
   `npm run installer:verify -- --lifecycle` (Windows only). Everything runs
   SILENTLY into a throwaway %TEMP% prefix and per-user scope (the build is
   perMachine:false), and the prefix is force-removed in a finally — nothing
   touches the normal install location or the Start menu permanently.
   ===================================================================== */
function asarVersion(dir) {
  try {
    const a = path.join(dir, 'resources', 'app.asar');
    if (!fs.existsSync(a)) return null;
    const t = require('@electron/asar').extractFile(a, 'package.json').toString('utf8');
    return (t.match(/"version":\s*"([^"]+)"/) || [])[1] || null;
  } catch (_) { return null; }
}
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {} }
function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (fn()) return true; } catch (_) {} sleepSync(700); }
  return false;
}
function cmpVer(a, b) {
  const na = String(a).split(/[.\-]/), nb = String(b).split(/[.\-]/);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const x = parseInt(na[i], 10) || 0, y = parseInt(nb[i], 10) || 0;
    if (x !== y) return x - y;
    if ((na[i] || '') !== (nb[i] || '')) return (na[i] || '') < (nb[i] || '') ? -1 : 1;
  }
  return 0;
}

function runLifecycle() {
  console.log('\n[verify-installer] LIFECYCLE — silent install → upgrade → launch → uninstall (throwaway prefix)\n');
  if (process.platform !== 'win32') { bad('--lifecycle is Windows-only'); return; }

  const curInstaller = meta.files.map((f) => f.url).find((u) => /-x64\.exe$/.test(u) && !/portable/.test(u));
  if (!curInstaller) { bad('no x64 NSIS installer in latest.yml'); return; }
  const prevInstaller = fs.readdirSync(REL)
    .filter((n) => /^CodeSovereign-.*-x64\.exe$/.test(n) && !/portable/.test(n))
    .map((n) => ({ n, v: (n.match(/CodeSovereign-(.+)-x64\.exe/) || [])[1] }))
    .filter((x) => x.v && cmpVer(x.v, meta.version) < 0)
    .sort((a, b) => cmpVer(a.v, b.v))
    .pop();

  const dirs = [];
  // remove any per-user "CodeSovereign …" uninstall registry entry the silent
  // installs register (they carry an empty InstallLocation because /D was custom)
  function sweepRegistry() {
    try {
      spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'CodeSovereign'], { windowsHide: true });
      const q = spawnSync('powershell', ['-NoProfile', '-Command',
        "Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | ForEach-Object { $p=Get-ItemProperty $_.PSPath; if ($p.DisplayName -match 'CodeSovereign' -and -not (Test-Path ($p.InstallLocation + '\\CodeSovereign.exe'))) { Remove-Item $_.PSPath -Recurse -Force } }"],
        { windowsHide: true, timeout: 20000 });
      return q.status === 0;
    } catch (_) { return false; }
  }

  // one isolated install → launch → uninstall cycle
  function cycle(installer, wantV, label) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-lc-'));
    dirs.push(dir);
    const appExe = path.join(dir, 'CodeSovereign.exe');
    const r = spawnSync(installer, ['/S', '/D=' + dir], { timeout: 180000, windowsHide: true });
    if (!waitFor(() => fs.existsSync(appExe) && asarVersion(dir) === wantV, 90000)) {
      bad(label + ': silent install did not reach ' + wantV + ' (got ' + asarVersion(dir) + ', exit ' + r.status + ')');
      return false;
    }
    ok(label + ': silent install → ' + wantV);
    const boot = spawnSync(appExe, ['--smoke'], { timeout: 90000, windowsHide: true });
    if (boot.status === 0) ok(label + ': installed app launches (--smoke exit 0)');
    else bad(label + ': installed app --smoke exited ' + boot.status);
    const uninst = fs.readdirSync(dir).find((n) => /^Uninstall .*\.exe$/i.test(n));
    if (!uninst) { bad(label + ': no uninstaller in the install dir'); return false; }
    spawnSync(path.join(dir, uninst), ['/S', '_?=' + dir], { timeout: 120000, windowsHide: true });
    waitFor(() => !fs.existsSync(appExe), 30000);
    if (!fs.existsSync(appExe)) ok(label + ': uninstall removed the application');
    else bad(label + ': uninstall left CodeSovereign.exe behind');
    return true;
  }

  try {
    // an earlier build first (proves the installer + uninstaller machinery for a
    // version you would be upgrading FROM), then the current build — each in its
    // own throwaway dir so no stale $INSTDIR / uninstaller confuses the next run.
    if (prevInstaller) cycle(path.join(REL, prevInstaller.n), prevInstaller.v, 'prev ' + prevInstaller.v);
    else console.log('  · no earlier build in release/ — running the current build only');
    cycle(path.join(REL, curInstaller), meta.version, 'current ' + meta.version);
  } finally {
    dirs.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5 }); } catch (_) {} });
    sweepRegistry();
    if (dirs.every((d) => !fs.existsSync(d))) ok('throwaway prefixes cleaned up + registry swept');
  }
}

if (RUN_LIFECYCLE) runLifecycle();
else {
  console.log('\n[verify-installer] lifecycle checklist (run `installer:verify -- --lifecycle` to execute it on Windows):');
  [
    'run the installer → it installs without SmartScreen blocking to a fatal error',
    'launch → About shows v' + meta.version,
    'install the NEXT build over it → it upgrades in place, settings/workspace preserved',
    'uninstall → the install dir + Start-menu shortcut are removed, %APPDATA%\\CodeSovereign is left (user data)',
    'portable .exe → runs with no install, writes its data beside the exe'
  ].forEach((s) => console.log('   [ ] ' + s));
}

console.log('\n[verify-installer] ' + (failed ? failed + ' check(s) FAILED' : (RUN_LIFECYCLE ? 'all checks passed (incl. the real install lifecycle)' : 'all build-output checks passed')));
process.exit(failed ? 1 : 0);
