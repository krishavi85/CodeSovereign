'use strict';
/* electron/lib/killtree.js — a timeout must end the whole process tree, not
 * just the direct child. On Windows child.kill() left grandchildren running
 * (npm/.cmd shims' node, cargo's rustc), which kept a timed-out `cargo check`
 * compiling and its temp project locked (EPERM on cleanup). */
const { spawn } = require('child_process');
const { killTree } = require('../electron/lib/killtree');

const PARENT = "const {spawn}=require('child_process');" +
  "const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});" +
  "console.log('GRANDCHILD '+g.pid);setInterval(()=>{},1000);";

function alive(pid) { try { process.kill(pid, 0); return true; } catch (_) { return false; } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startTree() {
  return new Promise((resolve, reject) => {
    const parent = spawn(process.execPath, ['-e', PARENT], { windowsHide: true });
    let out = '';
    parent.stdout.on('data', (d) => {
      out += d; const m = /GRANDCHILD (\d+)/.exec(out);
      if (m) resolve({ parent, gpid: Number(m[1]) });
    });
    parent.on('error', reject);
    setTimeout(() => reject(new Error('tree did not start')), 10000);
  });
}

async function waitDead(pid, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (!alive(pid)) return true; await wait(100); }
  return !alive(pid);
}

module.exports = async function (t) {
  const { parent, gpid } = await startTree();
  t.ok('the test tree is running (parent + grandchild)', alive(parent.pid) && alive(gpid));
  killTree(parent);
  t.ok('killTree ends the direct child', await waitDead(parent.pid, 5000));
  t.ok('killTree ends the grandchild too', await waitDead(gpid, 5000));

  if (process.platform === 'win32') {
    // Document why the helper exists: the plain kill leaves the grandchild.
    const tree = await startTree();
    tree.parent.kill('SIGKILL');
    await waitDead(tree.parent.pid, 3000);
    const orphanSurvived = alive(tree.gpid);
    t.ok('(windows) plain child.kill() leaves the grandchild running — the bug killTree fixes', orphanSurvived);
    try { process.kill(tree.gpid); } catch (_) {}
  }

  // A child without a pid (spawn failed / test double) must not throw.
  let killed = false;
  killTree({ pid: undefined, kill() { killed = true; } });
  t.ok('no pid: falls back to child.kill() without throwing', killed);
  killTree(null);
  t.ok('null child is a no-op', true);
};
