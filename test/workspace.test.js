'use strict';
/* Path-safety, tree walking, and mutation tests for electron/lib/workspace.js */
const os = require('os');
const fs = require('fs');
const path = require('path');
const ws = require('../electron/lib/workspace');

module.exports = async function (t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-ws-'));
  ws.setRoot(tmp);

  await t.throwsAsync('resolveInside blocks ../ escape', async () => ws.resolveInside('../../etc/passwd'));
  await t.throwsAsync('resolveInside blocks /../ escape', async () => ws.resolveInside('/../../x'));
  // regression: Linux does not treat "\" as a separator, so this must be
  // normalized and rejected explicitly (was silently allowed as a filename).
  await t.throwsAsync('resolveInside blocks backslash escape', async () => ws.resolveInside('..\\..\\x'));
  await t.throwsAsync('resolveInside blocks mixed-slash escape', async () => ws.resolveInside('/src/..\\../x'));
  await t.throwsAsync('resolveInside blocks a bare ".." segment', async () => ws.resolveInside('/a/../../b'));
  t.equal('resolveInside collapses "." segments', typeof ws.resolveInside('/./src/./app.js'), 'string');

  await ws.writeFile('/src/app.js', 'console.log(1)');
  await ws.writeFile('/index.html', '<h1>hi</h1>');
  t.equal('roundtrip write/read', await ws.readFile('/src/app.js'), 'console.log(1)');
  t.equal('read of missing file is null', await ws.readFile('/nope.txt'), null);

  const tree = await ws.readTree();
  t.equal('tree lists both files', tree.files.length, 2);
  t.ok('tree paths are virtual', tree.files.every((f) => f.path.startsWith('/')));

  await t.throwsAsync('blocks .git write', async () => ws.writeFile('/.git/config', 'x'));
  await t.throwsAsync('blocks node_modules mkdir', async () => ws.mkdirPath('node_modules'));
  await t.throwsAsync('blocks workspace-root delete', async () => ws.removePath('/'));

  // .sovereign/ project memory must be writable + reloadable (not a protected dir)
  await ws.writeFile('/.sovereign/decision-state.json', '{"health":90}');
  await ws.writeFile('/.sovereign/history/2026-01-01/x.json', '{}');
  t.equal('.sovereign file round-trips', await ws.readFile('/.sovereign/decision-state.json'), '{"health":90}');
  const stree = await ws.readTree();
  t.ok('.sovereign appears in the tree', stree.files.some((f) => f.path === '/.sovereign/decision-state.json'));

  fs.mkdirSync(path.join(tmp, 'node_modules'));
  fs.writeFileSync(path.join(tmp, 'node_modules', 'junk.js'), 'x');
  const tree2 = await ws.readTree();
  t.ok('readTree ignores node_modules', !tree2.files.some((f) => f.path.includes('node_modules')));

  await ws.renamePath('/index.html', '/home.html');
  t.ok('rename moves the file', fs.existsSync(path.join(tmp, 'home.html')) && !fs.existsSync(path.join(tmp, 'index.html')));

  await ws.removePath('/src');
  t.ok('recursive remove', !fs.existsSync(path.join(tmp, 'src')));

  t.deepEqual('sanitizeFolderName', ['My App', '../evil', 'a<b>:c', '   ', 'ok.'].map(ws.sanitizeFolderName),
    ['My-App', 'evil', 'a-b-c', 'project', 'ok']);

  fs.rmSync(tmp, { recursive: true, force: true });
};
