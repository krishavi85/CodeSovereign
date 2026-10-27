'use strict';
/* A link inside the project that points outside it must not become a way out of the workspace
 * (an untrusted repository can ship one: `notes -> ~/.ssh`). Directory links are junctions on Windows
 * (no privilege needed) and symlinks elsewhere. */
const os = require('os');
const fs = require('fs');
const path = require('path');
const ws = require('../electron/lib/workspace');

module.exports = async function (t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-link-'));
  const root = path.join(base, 'proj'), outside = path.join(base, 'secret');
  fs.mkdirSync(root); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'id_rsa'), 'TOP-SECRET');
  fs.writeFileSync(path.join(root, 'ok.txt'), 'fine');
  let linked = true;
  try { fs.symlinkSync(outside, path.join(root, 'notes'), 'junction'); } catch (e) { linked = false; }
  ws.setRoot(root);

  if (!linked) { t.ok('(this host cannot create directory links: skipped)', true); return; }

  await t.throwsAsync('reading through a link that leaves the project is refused', async () => ws.readFile('/notes/id_rsa'));
  await t.throwsAsync('writing through it is refused', async () => ws.writeFile('/notes/planted.txt', 'x'));
  t.ok('and nothing was written outside', !fs.existsSync(path.join(outside, 'planted.txt')));
  await t.throwsAsync('resolveInside refuses the link target path', async () => ws.resolveInside('/notes/id_rsa'));
  await t.throwsAsync('a new file under the link is refused too (the parent resolves outside)', async () => ws.resolveInside('/notes/new/deeper.txt'));
  t.equal('an ordinary file in the project still reads', await ws.readFile('/ok.txt'), 'fine');
  await ws.writeFile('/sub/new.txt', 'hello');
  t.equal('and a new file in a new folder still writes', await ws.readFile('/sub/new.txt'), 'hello');
  const tree = await ws.readTree();
  t.ok('the tree does not list anything behind the link', !tree.files.some((f) => /notes|id_rsa/.test(f.path)));
};
