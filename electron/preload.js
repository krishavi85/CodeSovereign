'use strict';
/*
 * preload.js — the ONLY channel between the renderer and the OS.
 * Exposes a small typed API as `window.desktop`. No Node globals leak through.
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

function subscribe(channel, cb) {
  const listener = (_e, payload) => { try { cb(payload); } catch (err) { console.error(err); } };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,

  info: () => invoke('app:info'),

  app: {
    recents: () => invoke('app:recents'),
    clearRecents: () => invoke('app:clearRecents'),
    setTitle: (t) => invoke('app:setTitle', t),
    onMenu: (cb) => subscribe('menu:action', cb)
  },

  workspace: {
    current: () => invoke('ws:current'),
    pickAndOpen: () => invoke('ws:pickAndOpen'),
    open: (dir) => invoke('ws:open', dir),
    pickParentDir: () => invoke('ws:pickParentDir'),
    createProject: (opts) => invoke('ws:createProject', opts),
    readTree: () => invoke('ws:readTree'),
    reveal: (rel) => invoke('ws:reveal', rel),
    exportZip: () => invoke('ws:exportZip')
  },

  fs: {
    read: (p) => invoke('fs:read', p),
    write: (p, content) => invoke('fs:write', p, content),
    remove: (p) => invoke('fs:remove', p),
    mkdir: (p) => invoke('fs:mkdir', p),
    rename: (from, to) => invoke('fs:rename', from, to)
  },

  proc: {
    shell: (cwd) => invoke('proc:shell', cwd),
    spawnAllowed: (opts) => invoke('proc:spawnAllowed', opts),
    write: (id, data) => invoke('proc:write', id, data),
    kill: (id) => invoke('proc:kill', id),
    killAll: () => invoke('proc:killAll'),
    running: () => invoke('proc:running'),
    run: (opts) => invoke('proc:run', opts),
    onData: (cb) => subscribe('proc:data', cb)
  },

  trust: {
    status: () => invoke('trust:status'),
    grant: () => invoke('trust:grant'),
    revoke: () => invoke('trust:revoke'),
    audit: (limit) => invoke('trust:audit', limit)
  },

  git: {
    available: () => invoke('git:available'),
    exec: (args) => invoke('git:exec', args),
    status: () => invoke('git:status')
  },

  observer: {
    load: (url) => invoke('obs:load', url),
    read: () => invoke('obs:read'),
    crawl: (opts) => invoke('obs:crawl', opts),
    screenshot: () => invoke('obs:screenshot'),
    visualProbe: (opts) => invoke('obs:visualProbe', opts),
    stop: () => invoke('obs:stop')
  },

  creds: {
    available: () => invoke('creds:available'),
    get: (key) => invoke('creds:get', key),
    set: (key, value) => invoke('creds:set', key, value),
    delete: (key) => invoke('creds:delete', key),
    keys: () => invoke('creds:keys')
  },

  dialog: {
    message: (opts) => invoke('dialog:message', opts),
    error: (title, content) => invoke('dialog:error', title, content)
  },

  snapshots: {
    list: () => invoke('snap:list'),
    create: (reason) => invoke('snap:create', reason),
    restore: (id) => invoke('snap:restore', id)
  },

  hardware: {
    probe: () => invoke('hw:probe')
  },

  adapters: {
    probe: () => invoke('adapter:probe'),
    run: (kind, opts) => invoke('adapter:run', { kind, opts })
  },

  ai: {
    discover: () => invoke('ai:discover'),
    request: (opts) => invoke('ai:request', opts),
    omniroute: (action) => invoke('ai:omniroute', action)
  }
});
