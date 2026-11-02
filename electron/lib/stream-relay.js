'use strict';
/* Pushes streamed model chunks to the renderer that asked for them, and stops the upstream request the moment that
 * renderer can no longer receive them (window closed, page reloaded, renderer crashed, app quitting). Electron does not
 * throw when it sends to a disposed frame: it logs "Render frame was disposed…" and carries on, so a long answer keeps
 * pulling bytes and logging an error per chunk. The relay checks first, treats a failed send as the end of the stream,
 * and aborts the request once. */

function create(sender, channel, id, abort) {
  let dead = false;
  const off = [];
  const stop = () => {
    if (dead) return false;
    dead = true;
    while (off.length) { try { off.pop()(); } catch (_) {} }
    try { if (abort) abort(); } catch (_) {}
    return true;
  };
  const alive = () => {
    if (dead) return false;
    try { return !!sender && !sender.isDestroyed() && !(typeof sender.isCrashed === 'function' && sender.isCrashed()); } catch (_) { return false; }
  };
  const on = (ev, fn) => {
    try { if (sender && typeof sender.once === 'function') { sender.once(ev, fn); off.push(() => { if (sender.removeListener) sender.removeListener(ev, fn); }); } } catch (_) {}
  };
  on('destroyed', stop);
  on('render-process-gone', stop);
  // A reload or navigation replaces the page that was listening. Abort only AFTER it has committed ('did-navigate'):
  // aborting while the old page is still alive hands it an "aborted" result, which it treats as a failed model call
  // and closes the run, so nothing is left to resume. (did-navigate does not fire for same-document navigations.)
  on('did-navigate', stop);
  return {
    push(data) {
      if (!alive()) { stop(); return false; }
      try { sender.send(channel, { id, data }); return true; } catch (_) { stop(); return false; }
    },
    stop,
    // the request ended by itself: release the listeners without aborting anything
    done() { dead = true; while (off.length) { try { off.pop()(); } catch (_) {} } },
    get dead() { return dead; }
  };
}

module.exports = { create };
