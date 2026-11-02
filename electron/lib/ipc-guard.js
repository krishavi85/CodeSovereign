'use strict';
/* Main-process authorisation for every IPC channel. The privileged handlers (files, processes, git, network, keychain)
 * must answer only the application's own page: the top frame of dist/index.html. A sub-frame, a page that navigated
 * elsewhere, or any other window that somehow got the preload is refused here, in the main process, not by renderer code. */
const { pathToFileURL } = require('url');

function norm(u) {
  try {
    const x = new URL(String(u));
    if (x.protocol !== 'file:') return null;
    let p = decodeURIComponent(x.pathname);
    if (process.platform === 'win32') p = p.toLowerCase();
    return p;
  } catch (_) { return null; }
}

function makeTrust(rendererFile) {
  const want = norm(pathToFileURL(rendererFile).href);
  return function trusted(event) {
    try {
      const f = event && event.senderFrame;
      if (!f || f.parent) return false; // a destroyed frame, or anything but a top-level frame
      const got = norm(f.url);
      return !!got && got === want;
    } catch (_) { return false; }
  };
}

function install(ipcMain, trusted, onRefuse) {
  const handle = ipcMain.handle.bind(ipcMain);
  const on = ipcMain.on.bind(ipcMain);
  const refuse = (channel, event) => { try { if (onRefuse) onRefuse(channel, event); } catch (_) {} };
  ipcMain.handle = (channel, fn) => handle(channel, function (event, ...args) {
    if (!trusted(event)) { refuse(channel, event); throw new Error('IPC refused: ' + channel + ' is available to the application window only'); }
    return fn.call(this, event, ...args);
  });
  ipcMain.on = (channel, fn) => on(channel, function (event, ...args) {
    if (!trusted(event)) { refuse(channel, event); return; }
    return fn.call(this, event, ...args);
  });
  return () => { ipcMain.handle = handle; ipcMain.on = on; };
}

module.exports = { makeTrust, install, norm };
