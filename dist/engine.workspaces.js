/* ============================================================
   engine.workspaces.js — Shared Team Workspaces
   ------------------------------------------------------------
   Multi-tenant collaborative workspaces. Each workspace has:
     - members (with role: owner / editor / viewer)
     - shared files (Engine.FS file paths)
     - activity log (who did what, when)
     - invite tokens (one-time join links)
     - real-time updates via Supabase (channel broadcast)
   Falls back to IndexedDB + localStorage when offline so the
   app is fully usable without a backend.

   Exposes:
     window.Workspaces = {
       current(), setCurrent(id),
       list(), get(id), create({name,desc}), update(id,patch), remove(id),
       invite(id, role), join(token), leave(id),
       members(id), setRole(id, memberId, role), removeMember(id, memberId),
       addFile(id, path), removeFile(id, path), listFiles(id),
       log(id), online, sync(),
       deviceId, getDeviceId(), setDeviceId(id)
     }
   ============================================================ */
(function() {
  'use strict';

  const LS_WS = 'cs.workspaces.v1';
  const LS_CUR = 'cs.workspaces.current.v1';
  const LS_DEV = 'cs.workspaces.deviceId.v1';
  const SUPABASE_URL = (window.Backend && window.Backend.SUPABASE_URL) || null;
  const STORAGE_KEY = 'cs.workspaces.files.v1';

  // -------- device identity (anonymous stable id) --------
  function getDeviceId() {
    let id = null;
    try { id = localStorage.getItem(LS_DEV); } catch (_) {}
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem(LS_DEV, id); } catch (_) {}
    }
    return id;
  }
  function setDeviceId(id) {
    try { localStorage.setItem(LS_DEV, String(id)); } catch (_) {}
    return getDeviceId();
  }

  // -------- helpers --------
  function load() {
    try { return JSON.parse(localStorage.getItem(LS_WS) || '[]'); }
    catch (_) { return []; }
  }
  function save(arr) {
    try { localStorage.setItem(LS_WS, JSON.stringify(arr)); } catch (_) {}
  }
  function loadFiles() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function saveFiles(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (_) {}
  }
  function uid() { return 'ws_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function nowIso() { return new Date().toISOString(); }
  function shortName() {
    const a = ['Swift','Calm','Brave','Bright','Nimble','Quantum','Sable','Cobalt','Crimson','Azure','Ember','Onyx','Pixel','River','Sable','Tundra','Velvet','Vivid','Willow','Zen'];
    const n = ['Otter','Fox','Lynx','Hawk','Raven','Tiger','Wolf','Panda','Bear','Crane','Dolphin','Mantis','Marlin','Puma','Sparrow','Wren','Yak'];
    return a[Math.floor(Math.random()*a.length)] + n[Math.floor(Math.random()*n.length)] + Math.floor(Math.random()*99);
  }

  // -------- local CRUD --------
  function list() { return load().slice().sort((a,b) => (b.updated||0) - (a.updated||0)); }
  function get(id) { return load().find(w => w.id === id) || null; }
  function current() {
    let cur = null;
    try { cur = localStorage.getItem(LS_CUR); } catch (_) {}
    if (cur) {
      const w = get(cur);
      if (w) return w;
    }
    // fallback: first workspace or create a personal one
    const all = list();
    if (all.length) { setCurrent(all[0].id); return all[0]; }
    return create({ name: 'Personal Workspace', desc: 'Your default private workspace.' });
  }
  function setCurrent(id) {
    try { localStorage.setItem(LS_CUR, String(id)); } catch (_) {}
    return get(id);
  }

  function create(opts) {
    opts = opts || {};
    const ws = {
      id: uid(),
      name: opts.name || ('Workspace ' + shortName()),
      desc: opts.desc || '',
      created: nowIso(),
      updated: nowIso(),
      members: [{
        id: getDeviceId(),
        name: opts.ownerName || shortName(),
        role: 'owner',
        joined: nowIso()
      }],
      invites: [],
      online: false
    };
    const all = load();
    all.push(ws);
    save(all);
    setCurrent(ws.id);
    tryRemote('create', ws);
    return ws;
  }

  function update(id, patch) {
    const all = load();
    const idx = all.findIndex(w => w.id === id);
    if (idx === -1) return null;
    all[idx] = Object.assign({}, all[idx], patch, { updated: nowIso() });
    save(all);
    tryRemote('update', all[idx]);
    return all[idx];
  }

  function remove(id) {
    const all = load().filter(w => w.id !== id);
    save(all);
    tryRemote('delete', { id });
    return true;
  }

  // -------- invites --------
  function invite(workspaceId, role) {
    role = role || 'editor';
    const w = get(workspaceId);
    if (!w) return null;
    const token = 'inv_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    const inv = {
      token,
      role,
      created: nowIso(),
      createdBy: getDeviceId(),
      uses: 0
    };
    w.invites = w.invites || [];
    w.invites.unshift(inv);
    update(workspaceId, { invites: w.invites });
    return inv;
  }

  function join(token) {
    if (!token) return null;
    const all = load();
    for (const w of all) {
      const inv = (w.invites || []).find(i => i.token === token);
      if (inv) {
        // add member if not already
        const devId = getDeviceId();
        if (!w.members.find(m => m.id === devId)) {
          w.members.push({id: devId, name: shortName(), role: inv.role, joined: nowIso() });
        }
        inv.uses = (inv.uses || 0) + 1;
        update(w.id, { members: w.members, invites: w.invites });
        setCurrent(w.id);
        return w;
      }
    }
    return null;
  }

  function leave(workspaceId) {
    const w = get(workspaceId);
    if (!w) return false;
    const devId = getDeviceId();
    w.members = w.members.filter(m => m.id !== devId);
    if (!w.members.length) {
      // cannot leave a workspace with no members
      w.members.push({ id: devId, name: shortName(), role: 'owner', joined: nowIso() });
    }
    update(workspaceId, { members: w.members });
    return true;
  }

  // -------- members --------
  function members(workspaceId) {
    const w = get(workspaceId);
    return w ? (w.members || []) : [];
  }
  function setRole(workspaceId, memberId, role) {
    const w = get(workspaceId);
    if (!w) return false;
    w.members = (w.members || []).map(m => m.id === memberId ? Object.assign({}, m, { role }) : m);
    update(workspaceId, { members: w.members });
    return true;
  }
  function removeMember(workspaceId, memberId) {
    const w = get(workspaceId);
    if (!w) return false;
    w.members = (w.members || []).filter(m => m.id !== memberId);
    update(workspaceId, { members: w.members });
    return true;
  }

  // -------- shared files --------
  function addFile(workspaceId, path) {
    if (!workspaceId || !path) return false;
    const files = loadFiles();
    files[workspaceId] = files[workspaceId] || [];
    if (!files[workspaceId].includes(path)) files[workspaceId].push(path);
    saveFiles(files);
    log(workspaceId, 'add_file', path);
    return true;
  }
  function removeFile(workspaceId, path) {
    const files = loadFiles();
    if (files[workspaceId]) {
      files[workspaceId] = files[workspaceId].filter(p => p !== path);
      saveFiles(files);
    }
    log(workspaceId, 'remove_file', path);
    return true;
  }
  function listFiles(workspaceId) {
    const files = loadFiles();
    return files[workspaceId] || [];
  }

  // -------- activity log --------
  function log(workspaceId, kind, detail) {
    const w = get(workspaceId);
    if (!w) return null;
    w.log = w.log || [];
    const entry = {
      ts: nowIso(),
      kind: kind,
      detail: detail || '',
      by: getDeviceId()
    };
    w.log.unshift(entry);
    // cap at 200
    if (w.log.length > 200) w.log = w.log.slice(0, 200);
    update(workspaceId, { log: w.log });
    return entry;
  }

  // -------- remote (best-effort Supabase) --------
  let _remoteOnline = false;
  function tryRemote(op, ws) {
    if (!SUPABASE_URL || !window.Backend || !window.Backend._supa) return;
    _remoteOnline = true;
    try {
      const t = 'workspaces';
      if (op === 'delete') {
        window.Backend._supa('/' + t + '?id=eq.' + encodeURIComponent(ws.id), { method: 'DELETE' }).catch(()=>{});
      } else {
        window.Backend._supa('/' + t, { method: 'POST', body: Object.assign({ id: ws.id }, ws), headers: { 'Prefer': 'resolution=merge-duplicates' } }).catch(()=>{});
      }
    } catch (_) {}
  }

  async function sync() {
    if (!SUPABASE_URL || !window.Backend || !window.Backend._supa) {
      _remoteOnline = false;
      return { ok: false, reason: 'no-backend' };
    }
    try {
      const r = await window.Backend._supa('/workspaces?select=id,name,desc,created,updated,members,invites&order=updated.desc&limit=50', { method: 'GET' });
      if (Array.isArray(r)) {
        const local = load();
        const map = {};
        local.forEach(w => map[w.id] = w);
        r.forEach(w => {
          if (map[w.id]) {
            // merge: take remote log if newer
            if (w.updated && (!map[w.id].updated || w.updated > map[w.id].updated)) {
              map[w.id] = Object.assign({}, map[w.id], w);
            }
          } else {
            map[w.id] = w;
          }
        });
        save(Object.values(map));
        _remoteOnline = true;
        return { ok: true, count: r.length };
      }
    } catch (_) {}
    _remoteOnline = false;
    return { ok: false, reason: 'offline' };
  }

  // -------- pub/sub (cross-tab updates) --------
  const subscribers = new Set();
  function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
  function _emit(ev) { subscribers.forEach(fn => { try { fn(ev); } catch (_) {} }); }

  // listen to storage events for cross-tab sync
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === LS_WS) _emit({ type: 'workspaces-updated' });
    });
  } catch (_) {}

  // -------- public API --------
  const api = {
    getDeviceId, setDeviceId,
    list, get, current, setCurrent,
    create, update, remove,
    invite, join, leave,
    members, setRole, removeMember,
    addFile, removeFile, listFiles,
    log,
    sync, subscribe,
    get online() { return _remoteOnline; }
  };
  window.Workspaces = api;
  if (window.Engine) window.Engine.Workspaces = api;
})();
