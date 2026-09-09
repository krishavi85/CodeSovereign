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
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const REL = path.join(ROOT, 'release');
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

console.log('\n[verify-installer] lifecycle checklist (needs a real Windows session):');
[
  'run the installer → it installs without SmartScreen blocking to a fatal error',
  'launch → About shows v' + meta.version,
  'install the NEXT build over it → it upgrades in place, settings/workspace preserved',
  'uninstall → the install dir + Start-menu shortcut are removed, %APPDATA%\\CodeSovereign is left (user data)',
  'portable .exe → runs with no install, writes its data beside the exe'
].forEach((s) => console.log('   [ ] ' + s));

console.log('\n[verify-installer] ' + (failed ? failed + ' check(s) FAILED' : 'all build-output checks passed'));
process.exit(failed ? 1 : 0);
