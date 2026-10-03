'use strict';
/* killtree.js — end a spawned child AND everything it started.
 *
 * On Windows child.kill() terminates only the direct process. For anything
 * launched through an npm .cmd shim (npm, npx, openclaw, …) that is cmd.exe,
 * and the real node process keeps running; for `cargo check` the rustc
 * workers keep compiling and keep the build directory locked. Confirmed on a
 * real run: a timed-out `cargo check` left its temp project undeletable
 * (EPERM) after the adapter had already reported BLOCKED.
 *
 * proc.js has its own killTree for managed processes; this is the same idea
 * for the ad-hoc spawns in adapters/aihost/openclaw-manager/ios. */
const { spawn } = require('child_process');

// Returns a promise that settles once the tree is gone (taskkill has exited),
// so a caller can wait before touching files the tree had open. Callers that
// don't care can ignore it; it never rejects.
function killTree(child, signal) {
  const direct = () => { try { child.kill(signal || 'SIGKILL'); } catch (_) {} };
  if (!child) return Promise.resolve();
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    return new Promise((resolve) => {
      let k;
      try { k = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); }
      catch (_) { direct(); resolve(); return; }
      const cap = setTimeout(resolve, 10000); // never hang a caller on taskkill
      // taskkill itself unavailable: fall back to killing the direct child.
      k.on('error', () => { clearTimeout(cap); direct(); resolve(); });
      k.on('exit', () => { clearTimeout(cap); resolve(); });
    });
  }
  direct();
  return Promise.resolve();
}

module.exports = { killTree };
