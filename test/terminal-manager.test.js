'use strict';
/* electron/lib/terminal-manager.js — the real PTY engine behind the
 * integrated terminal. detectShells() only ever probes for existing
 * binaries (where/which + fs.existsSync) — safe and read-only, so it's
 * exercised for real here. create()/write()/kill() spawn an actual shell
 * process; that's inherently ephemeral (a shell that runs one echo and
 * exits) so it's exercised for real too, verified live in this same
 * session against PowerShell, CMD, Git Bash and WSL on Windows — this
 * test covers the same create -> write -> exit contract with whatever
 * default shell the CI/dev machine actually has.
 */
const mgr = require('../electron/lib/terminal-manager.js');
const CR = String.fromCharCode(13);

module.exports = async function (t) {
  t.equal('module exports the expected lifecycle functions',
    ['ptyAvailable', 'detectShells', 'create', 'write', 'resize', 'kill', 'killAll'].every((k) => typeof mgr[k] === 'function'),
    true);

  t.equal('ptyAvailable() reports a boolean', typeof mgr.ptyAvailable(), 'boolean');

  const shells = await mgr.detectShells();
  t.ok('detectShells() returns an array', Array.isArray(shells));
  t.ok('every detected shell has an id/label/shellPath', shells.every((s) => s.id && s.label && s.shellPath));
  t.ok('shell ids are unique', new Set(shells.map((s) => s.id)).size === shells.length);

  if (!mgr.ptyAvailable() || shells.length === 0) {
    // no PTY backend or no shell on this machine - nothing further to
    // exercise safely; the shape checks above already caught a broken build.
    return;
  }

  // Real create -> write -> exit round trip, using whatever the first
  // detected shell is (matches what the UI's "+" button does by default).
  let out = '';
  const exitInfo = await new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => reject(new Error('terminal did not exit within 15s')), 15000);
    mgr.create('test-' + Date.now(), { shellId: shells[0].id, cols: 80, rows: 24 },
      (data) => { out += data; },
      (info) => { clearTimeout(watchdog); resolve(info); }
    ).then((r) => {
      if (!r.ok) { clearTimeout(watchdog); reject(new Error('create failed: ' + r.error)); return; }
      setTimeout(() => mgr.write(r.id, 'echo TERM_MANAGER_TEST_MARKER' + CR), 500);
      setTimeout(() => mgr.write(r.id, 'exit' + CR), 1500);
    });
  });

  t.ok('the real shell process exited cleanly', exitInfo.exitCode === 0 || exitInfo.exitCode === null);
  t.ok('the terminal echoed back the marker we sent it', /TERM_MANAGER_TEST_MARKER/.test(out));
  // Live 2026-10-02: an exited shell kept node-pty's output worker alive, and
  // the whole test run never exited after printing its results.
  // (node-pty flushes output for ~1s before stopping the worker)
  const ports = () => process._getActiveHandles().filter((h) => h && h.constructor && h.constructor.name === 'MessagePort').length;
  for (let i = 0; i < 25 && ports(); i++) await new Promise((r) => setTimeout(r, 200));
  t.equal('a shell that exits on its own leaves no pty worker behind', ports(), 0);
};
