'use strict';
/* Guards on the IPC-reachable surface: git args, credential keys, snapshot ids,
   and the workspace symlink defence. */
const os = require('os');
const fs = require('fs');
const path = require('path');
const git = require('../electron/lib/git');
const { KEY_RE } = require('../electron/lib/creds');
const { ID_RE } = require('../electron/lib/snapshots');
const ws = require('../electron/lib/workspace');

module.exports = async function (t) {
  // --- git argument validation ---
  const bad = [
    ['-c', 'core.pager=calc', 'status'],
    ['-c', 'core.sshCommand=calc', 'fetch'],
    ['--exec-path=/tmp', 'status'],
    ['-C', '/etc', 'status'],
    ['daemon'],
    ['gui'],
    ['config', 'alias.x', '!calc'],
    ['config', 'core.fsmonitor', 'calc'],
    'not-an-array'
  ];
  for (const a of bad) t.ok('git rejects ' + JSON.stringify(a), git.validateArgs(a) !== null);

  const good = [
    ['status', '--porcelain=v1'],
    ['add', '-A'],
    ['commit', '-m', 'msg'],
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    ['log', '--oneline', '-n', '5'],
    ['init']
  ];
  for (const a of good) t.equal('git allows ' + JSON.stringify(a), git.validateArgs(a), null);

  // --- credential key names ---
  t.ok('creds key: llm.apiKey ok', KEY_RE.test('llm.apiKey'));
  t.ok('creds key: github.token ok', KEY_RE.test('github.token'));
  t.ok('creds key: path traversal blocked', !KEY_RE.test('../../secret'));
  t.ok('creds key: slashes blocked', !KEY_RE.test('a/b'));
  t.ok('creds key: empty blocked', !KEY_RE.test(''));

  // --- snapshot ids ---
  t.ok('snap id: timestamp ok', ID_RE.test('2026-09-07T12-00-00-000Z'));
  t.ok('snap id: traversal blocked', !ID_RE.test('../../../etc/passwd'));
  t.ok('snap id: arbitrary blocked', !ID_RE.test('anything.json'));

  // --- workspace containment survives 8.3 short paths (regression: CI runner
  //     roots look like C:\Users\RUNNER~1\... while realpath returns the long form) ---
  {
    const deepTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-short-'));
    ws.setRoot(deepTmp);
    await ws.writeFile('/nested/deep/file.txt', 'ok');
    t.equal('write+read under a canonicalized root', await ws.readFile('/nested/deep/file.txt'), 'ok');
    const tree = await ws.readTree();
    t.ok('readTree finds the file under a canonicalized root', tree.files.some((f) => f.path === '/nested/deep/file.txt'));
    fs.rmSync(deepTmp, { recursive: true, force: true });
  }

  // --- workspace symlink defence ---
  if (canSymlink()) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-sym-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-out-'));
    fs.symlinkSync(outside, path.join(tmp, 'escape'), 'dir');
    ws.setRoot(tmp);
    await t.throwsAsync('write through a symlinked dir is blocked', async () => ws.writeFile('/escape/evil.txt', 'x'));
    await t.throwsAsync('delete through a symlinked dir is blocked', async () => ws.removePath('/escape/x'));
    const tree = await ws.readTree();
    t.ok('readTree skips symlinks', !tree.files.some((f) => f.path.startsWith('/escape')));
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  } else {
    t.ok('symlink test skipped (no privilege on this runner)', true);
  }
};

function canSymlink() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-symtest-'));
  try { fs.symlinkSync(d, path.join(d, 'l'), 'dir'); return true; }
  catch { return false; }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}
