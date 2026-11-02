'use strict';
/* Real Windows installer lifecycle, run by hand against two built installers:
 *   node scripts/installer-lifecycle.js <old-installer.exe> <new-installer.exe> [workdir]
 * It installs the OLD build silently into a scratch folder, boots it, writes a user-data marker and a project
 * (with project memory), installs the NEW build over it, checks that data and project survived and the version moved,
 * boots the upgraded app, then uninstalls and checks that the install folder is gone while user data and the project
 * are left alone. Per-user install, so no elevation. It touches the real %APPDATA%\CodeSovereign only by adding and
 * then removing one marker file. Windows only. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

if (process.platform !== 'win32') { console.error('Windows only'); process.exit(2); }
const [oldInst, newInst, workArg] = process.argv.slice(2);
if (!oldInst || !newInst) { console.error('usage: node scripts/installer-lifecycle.js <old.exe> <new.exe> [workdir]'); process.exit(2); }
const work = path.resolve(workArg || path.join(os.tmpdir(), 'cs-lifecycle-' + Date.now()));
const installDir = path.join(work, 'app');
const projectDir = path.join(work, 'project');
const userData = path.join(process.env.APPDATA, 'CodeSovereign');
const marker = path.join(userData, 'lifecycle-marker.json');
const exe = path.join(installDir, 'CodeSovereign.exe');
const uninstaller = path.join(installDir, 'Uninstall CodeSovereign.exe');

let pass = 0, fail = 0;
const check = (name, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + name + (extra ? '  - ' + extra : '')); };
const version = () => { try { const asar = require('@electron/asar'); asar.uncacheAll(); return JSON.parse(asar.extractFile(path.join(installDir, 'resources', 'app.asar'), 'package.json').toString('utf8')).version; } catch (e) { return ''; } }; // the exe's file-version resource does not carry the prerelease tag
// NSIS wants /D= last, unquoted, with no trailing backslash
const install = (inst) => spawnSync(inst, ['/S', '/D=' + installDir], { windowsHide: true, timeout: 300000 });
const boot = () => spawnSync(exe, ['--smoke'], { windowsHide: true, timeout: 120000, encoding: 'utf8' });

fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(path.join(projectDir, '.codesovereign', 'project'), { recursive: true });
fs.writeFileSync(path.join(projectDir, 'index.js'), 'console.log("user project");\n');
fs.writeFileSync(path.join(projectDir, '.codesovereign', 'project', 'brain.json'), JSON.stringify({ items: [{ title: 'Task (verified): lifecycle marker' }] }));
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(marker, JSON.stringify({ at: Date.now(), note: 'removed by scripts/installer-lifecycle.js' }));
const projectSnap = () => fs.readFileSync(path.join(projectDir, 'index.js'), 'utf8') + fs.readFileSync(path.join(projectDir, '.codesovereign', 'project', 'brain.json'), 'utf8');
const before = projectSnap();

console.log('work dir: ' + work);
console.log('1. clean install (old build)');
let r = install(oldInst);
check('installer exited 0', r.status === 0, 'status=' + r.status);
check('app installed', fs.existsSync(exe));
check('an uninstaller was installed', fs.existsSync(uninstaller));
const vOld = version();
console.log('   installed version: ' + vOld);
let b = boot();
check('installed old build boots (smoke)', b.status === 0, 'status=' + b.status + ' ' + String(b.stdout || '').split('\n').slice(-3).join(' | ').slice(0, 160));

console.log('2. upgrade in place (new build over old)');
r = install(newInst);
check('new installer exited 0', r.status === 0, 'status=' + r.status);
// the NSIS installer can hand its work to a child process: wait for the new version to appear instead of reading once
const sleep = (ms) => spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds ' + ms]);
let vNew = version();
for (let i = 0; i < 60 && (!vNew || vNew === vOld); i++) { sleep(500); vNew = version(); }
console.log('   upgraded version: ' + vNew);
check('version moved forward', !!vNew && vNew !== vOld);
check('user data marker survived the upgrade', fs.existsSync(marker));
check('user project and project memory untouched by the upgrade', projectSnap() === before);
b = boot();
check('upgraded build boots (smoke)', b.status === 0, 'status=' + b.status);

console.log('3. uninstall');
r = spawnSync(uninstaller, ['/S'], { windowsHide: true, timeout: 300000 });
check('uninstaller exited 0', r.status === 0, 'status=' + r.status);
// the NSIS uninstaller copies itself out and returns early; wait for the folder to go
for (let i = 0; i < 60 && fs.existsSync(exe); i++) spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 500']);
check('application files removed', !fs.existsSync(exe));
const regQuery = () => spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'CodeSovereign'], { encoding: 'utf8' });
// the uninstaller finishes its registry and shortcut cleanup after the folder is gone: poll rather than read once
let reg = regQuery();
for (let i = 0; i < 40 && /CodeSovereign/i.test(reg.stdout || ''); i++) { sleep(500); reg = regQuery(); }
check('no uninstall registry entry left behind', !/CodeSovereign/i.test(reg.stdout || ''), (reg.stdout || '').split('\n').filter((l) => /CodeSovereign/i.test(l)).slice(0, 2).join(' | '));
check('user data marker NOT deleted by uninstall', fs.existsSync(marker));
check('user project and project memory NOT deleted by uninstall', fs.existsSync(projectDir) && projectSnap() === before);

try { fs.unlinkSync(marker); } catch (_) {}
console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
console.log('left in place for inspection: ' + work + ' (project + any install remnants)');
process.exit(fail ? 1 : 0);
