/* =====================================================================
   desktop-fs.js  —  makes Engine.FS disk-backed when running in Electron.

   Strategy: keep Engine.FS 100% synchronous (the whole app assumes that),
   but treat it as a working mirror of a real folder on disk:
     - opening a project bulk-loads every text file into FS._data
     - every write / delete / mkdir is also queued to disk (fire-and-forget,
       strictly ordered) through window.desktop.fs.*
     - localStorage is no longer the source of truth for files
   In a plain browser this file does nothing.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.desktop || !window.desktop.isDesktop) return;
  if (!window.Engine || !window.Engine.FS) { console.error('[desktop-fs] Engine.FS not found'); return; }

  var FS = window.Engine.FS;
  var hasWorkspace = false;

  // Disk was never the browser's job — start clean so stale cs.fs.v1 can't leak in.
  try { localStorage.removeItem('cs.fs.v1'); localStorage.removeItem('cs.proj.v1'); } catch (_) {}
  FS._data = {};

  /* ---------- ordered write-behind queue ---------- */
  var queue = Promise.resolve();
  var pending = 0;
  var lastError = null;

  function enqueue(fn, label) {
    if (!hasWorkspace) return;                 // scratch mode: memory only
    pending++;
    queue = queue.then(fn).then(function () {
      pending--;
    }, function (err) {
      pending--;
      lastError = err;
      console.error('[desktop-fs] ' + label + ' failed:', err);
      try { window.toast && window.toast('Disk write failed: ' + label, '#ef4444'); } catch (_) {}
    });
  }

  function unwrap(res, label) {
    if (res && res.ok === false) throw new Error(res.error || (label + ' failed'));
    return res;
  }

  /* ---------- patch mutating methods ---------- */
  var origMkdir = FS.mkdir.bind(FS);

  FS.write = function (p, content) {
    this._data[p] = { type: 'file', content: String(content), updatedAt: Date.now() };
    var body = String(content);
    enqueue(function () { return window.desktop.fs.write(p, body).then(function (r) { unwrap(r, 'write ' + p); }); }, 'write ' + p);
  };

  FS.remove = function (p) {
    var self = this;
    Object.keys(this._data).forEach(function (k) {
      if (k === p || k.indexOf(p + '/') === 0) delete self._data[k];
    });
    enqueue(function () { return window.desktop.fs.remove(p).then(function (r) { unwrap(r, 'remove ' + p); }); }, 'remove ' + p);
  };

  FS.mkdir = function (p) {
    this._data[p] = { type: 'dir', updatedAt: Date.now() };
    enqueue(function () { return window.desktop.fs.mkdir(p).then(function (r) { unwrap(r, 'mkdir ' + p); }); }, 'mkdir ' + p);
  };

  FS.rename = function (from, to) {
    var self = this;
    Object.keys(this._data).forEach(function (k) {
      if (k === from) { self._data[to] = self._data[k]; delete self._data[k]; }
      else if (k.indexOf(from + '/') === 0) { self._data[to + k.slice(from.length)] = self._data[k]; delete self._data[k]; }
    });
    enqueue(function () { return window.desktop.fs.rename(from, to).then(function (r) { unwrap(r, 'rename'); }); }, 'rename ' + from);
  };

  // clear() must never wipe the real folder — only the in-memory mirror.
  FS.clear = function () { this._data = {}; };
  FS.clearAll = function () { this._data = {}; };

  /* ---------- bulk load from a workspace tree ---------- */
  // tree.files: [{ path:'/x', content:string|null, binary:bool, size:number }]
  FS.__loadFromDisk = function (files) {
    var data = {};
    (files || []).forEach(function (f) {
      if (f.binary || f.content == null) {
        data[f.path] = { type: 'file', content: '', updatedAt: 0, binary: true, size: f.size };
      } else {
        data[f.path] = { type: 'file', content: f.content, updatedAt: Date.now(), size: f.size };
      }
    });
    this._data = data;
    hasWorkspace = true;
  };

  FS.__closeWorkspace = function () { this._data = {}; hasWorkspace = false; };
  FS.__hasWorkspace = function () { return hasWorkspace; };
  FS.__flush = function () { return queue; };
  FS.__pending = function () { return pending; };
  FS.__lastError = function () { return lastError; };

  window.CSDesktopFS = FS;
  console.info('[desktop-fs] Engine.FS is now disk-backed');
})();
