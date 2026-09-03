/* ============================================================
   BACKEND MODULE — Real persistent storage layer
   Primary: IndexedDB (async, indexed, transactional, large)
   Fallback: localStorage
   Optional: Supabase sync (when configured tables exist)
   ------------------------------------------------------------
   Exposes a single `window.Backend` API so app.js can persist
   projects, files, deploys, scans, and agent runs without
   caring which engine is underneath.
   ============================================================ */
(function() {
  'use strict';

  const SUPABASE_URL = 'https://zobgxrwvyejfqekdumej.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_zQZ4mFPfeDzqHWnabfRgqw_d6ZbRoZ6';
  const DB_NAME = 'codesovereign';
  const DB_VERSION = 1;
  const STORES = ['projects', 'files', 'deploys', 'scans', 'agent_runs', 'meta'];
  const LS_PREFIX = 'cs.idb.'; // fallback key prefix
  const DEVICE_LS_KEY = 'cs.device.id';

  // -------- Device id (per-browser identity) --------
  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_LS_KEY);
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem(DEVICE_LS_KEY, id);
      }
      return id;
    } catch (e) { return 'dev_anon'; }
  }

  // -------- IndexedDB wrapper with localStorage fallback --------
  const _idb = (function() {
    let dbPromise = null;
    function open() {
      if (dbPromise) return dbPromise;
      if (typeof indexedDB === 'undefined') {
        dbPromise = Promise.reject(new Error('no-idb'));
        return dbPromise;
      }
      dbPromise = new Promise(function(resolve, reject) {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function(ev) {
            const db = ev.target.result;
            STORES.forEach(function(name) {
              if (!db.objectStoreNames.contains(name)) {
                const store = db.createObjectStore(name, { keyPath: 'id' });
                if (name === 'projects' || name === 'files' || name === 'deploys' ||
                    name === 'scans' || name === 'agent_runs') {
                  try { store.createIndex('device_id', 'device_id', { unique: false }); } catch (_) {}
                  try { store.createIndex('created_at', 'created_at', { unique: false }); } catch (_) {}
                }
              }
            });
          };
          req.onsuccess = function() { resolve(req.result); };
          req.onerror = function() { reject(req.error || new Error('idb-open-failed')); };
        } catch (e) { reject(e); }
      });
      return dbPromise;
    }

    async function put(storeName, value) {
      const db = await open();
      return new Promise(function(resolve, reject) {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.put(value);
          req.onsuccess = function() { resolve(value); };
          req.onerror = function() { reject(req.error); };
        } catch (e) { reject(e); }
      });
    }

    async function get(storeName, key) {
      const db = await open();
      return new Promise(function(resolve, reject) {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.get(key);
          req.onsuccess = function() { resolve(req.result || null); };
          req.onerror = function() { reject(req.error); };
        } catch (e) { reject(e); }
      });
    }

    async function del(storeName, key) {
      const db = await open();
      return new Promise(function(resolve, reject) {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.delete(key);
          req.onsuccess = function() { resolve(true); };
          req.onerror = function() { reject(req.error); };
        } catch (e) { reject(e); }
      });
    }

    async function getAll(storeName) {
      const db = await open();
      return new Promise(function(resolve, reject) {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onsuccess = function() { resolve(req.result || []); };
          req.onerror = function() { reject(req.error); };
        } catch (e) { reject(e); }
      });
    }

    async function clear(storeName) {
      const db = await open();
      return new Promise(function(resolve, reject) {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.clear();
          req.onsuccess = function() { resolve(true); };
          req.onerror = function() { reject(req.error); };
        } catch (e) { reject(e); }
      });
    }

    return { open: open, put: put, get: get, del: del, getAll: getAll, clear: clear };
  })();

  // localStorage fallback (sync, in-memory mirror)
  const _ls = {
    get(storeName, key) {
      try {
        const raw = localStorage.getItem(LS_PREFIX + storeName + ':' + key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    put(storeName, value) {
      try { localStorage.setItem(LS_PREFIX + storeName + ':' + value.id, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    del(storeName, key) {
      try { localStorage.removeItem(LS_PREFIX + storeName + ':' + key); return true; }
      catch (e) { return false; }
    },
    getAll(storeName) {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(LS_PREFIX + storeName + ':') === 0) {
            try { out.push(JSON.parse(localStorage.getItem(k))); } catch (_) {}
          }
        }
      } catch (_) {}
      return out;
    },
    clear(storeName) {
      try {
        const toDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(LS_PREFIX + storeName + ':') === 0) toDelete.push(k);
        }
        toDelete.forEach(function(k) { localStorage.removeItem(k); });
        return true;
      } catch (e) { return false; }
    }
  };

  // Choose backend: IndexedDB if available, else localStorage
  let _engine = 'pending';
  let _engineReady = (async function() {
    try {
      await _idb.open();
      _engine = 'indexeddb';
    } catch (e) {
      _engine = 'localstorage';
      console.warn('Backend using localStorage (IndexedDB unavailable):', e && e.message);
    }
  })();

  async function _put(store, value) {
    await _engineReady;
    if (_engine === 'indexeddb') return _idb.put(store, value);
    return _ls.put(store, value);
  }
  async function _get(store, key) {
    await _engineReady;
    if (_engine === 'indexeddb') return _idb.get(store, key);
    return _ls.get(store, key);
  }
  async function _del(store, key) {
    await _engineReady;
    if (_engine === 'indexeddb') return _idb.del(store, key);
    return _ls.del(store, key);
  }
  async function _getAll(store) {
    await _engineReady;
    let rows;
    if (_engine === 'indexeddb') rows = await _idb.getAll(store);
    else rows = _ls.getAll(store);
    return (rows || []).filter(function(r) { return r && r.device_id === getDeviceId(); });
  }
  async function _clear(store) {
    await _engineReady;
    if (_engine === 'indexeddb') {
      // only delete for this device — but IDB has no per-device delete easily.
      // Do a per-row delete so other devices on the same origin are not wiped.
      const all = await _idb.getAll(store);
      const did = getDeviceId();
      for (const r of all) {
        if (r && r.device_id === did) await _idb.del(store, r.id);
      }
      return true;
    } else {
      const rows = _ls.getAll(store);
      rows.forEach(function(r) { _ls.del(store, r.id); });
      return true;
    }
  }

  // -------- Supabase optional sync (best-effort) --------
  let _supabase = { online: false, reason: 'not-checked' };
  async function _supa(path, opts) {
    opts = opts || {};
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=minimal'
    };
    const init = { method: opts.method || 'GET', headers: headers };
    if (opts.body) init.body = JSON.stringify(opts.body);
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1' + path, init);
      if (!r.ok) return null;
      const ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') !== -1) return await r.json();
      return await r.text();
    } catch (e) { return null; }
  }

  async function pingSupabase() {
    try {
      const r = await _supa('/projects?select=id&limit=1', { method: 'GET' });
      _supabase.online = !!r; // null when offline or 404
      _supabase.reason = r ? 'ok' : 'no-table-or-offline';
      return _supabase.online;
    } catch (e) {
      _supabase.online = false;
      _supabase.reason = e.message;
      return false;
    }
  }

  // -------- Public API --------

  // Health check — returns backend engine + (best-effort) supabase status
  async function ping() {
    await _engineReady;
    const info = {
      ok: true,
      online: true,
      engine: _engine,
      device_id: getDeviceId(),
      stores: STORES,
      supabase: _supabase
    };
    // Probe supabase in the background; do not block ping
    pingSupabase().then(function(online) { info.supabase.online = online; });
    return info;
  }

  // -------- Projects --------
  async function listProjects() {
    const rows = await _getAll('projects');
    return rows.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
  }

  async function saveProject(meta, files) {
    if (!meta || !meta.id) return { ok: false, error: 'missing-id' };
    const device_id = getDeviceId();
    const row = {
      id: meta.id,
      device_id: device_id,
      name: meta.name || 'Untitled',
      template: meta.template || 'saas-dashboard',
      file_count: meta.fileCount || (files ? Object.keys(files).length : 0),
      files: files || {},
      created_at: new Date(meta.createdAt || Date.now()).toISOString(),
      updated_at: new Date().toISOString()
    };
    await _put('projects', row);
    // best-effort supabase sync
    _supa('/projects?on_conflict=id', {
      method: 'POST',
      body: row,
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    return { ok: true, id: meta.id, engine: _engine };
  }

  async function loadProjectFiles(projectId) {
    const row = await _get('projects', projectId);
    return (row && row.files) ? row.files : null;
  }

  async function deleteProject(projectId) {
    await _del('projects', projectId);
    // also delete related files
    const all = await _getAll('files');
    for (const f of all) {
      if (f.project_id === projectId) await _del('files', f.id);
    }
    return { ok: true };
  }

  // -------- Files --------
  async function saveFile(path, content, projectId) {
    if (!path) return { ok: false, error: 'missing-path' };
    const device_id = getDeviceId();
    // stable id: device + project + path
    const id = (projectId || 'scratch') + '::' + device_id + '::' + path;
    const row = {
      id: id,
      device_id: device_id,
      project_id: projectId || null,
      path: path,
      content: content || '',
      updated_at: new Date().toISOString()
    };
    await _put('files', row);
    return { ok: true, id: id };
  }

  // -------- Deploys --------
  async function saveDeploy(deploy, bundle) {
    if (!deploy) return { ok: false, error: 'missing-deploy' };
    const device_id = getDeviceId();
    const id = 'dep_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const row = {
      id: id,
      device_id: device_id,
      project_id: (bundle && bundle.manifest && bundle.manifest.project && bundle.manifest.project.id) || null,
      project_name: (bundle && bundle.manifest && bundle.manifest.project && bundle.manifest.project.name) || null,
      file_count: deploy.fileCount || (bundle ? Object.keys(bundle.files || {}).length : 0),
      total_bytes: deploy.totalBytes || 0,
      ok: deploy.ok !== false,
      bundle: bundle || null,
      created_at: new Date(deploy.at || Date.now()).toISOString()
    };
    await _put('deploys', row);
    return { ok: true, id: id, engine: _engine };
  }

  async function listDeploys(limit) {
    const rows = await _getAll('deploys');
    const sorted = rows.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }

  // -------- Scans --------
  async function saveScan(scan) {
    if (!scan) return { ok: false, error: 'missing-scan' };
    const device_id = getDeviceId();
    const issues = scan.issues || [];
    const errs = issues.filter(function(i) { return i.severity === 'error'; }).length;
    const warns = issues.filter(function(i) { return i.severity === 'warning'; }).length;
    const id = 'scan_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const row = {
      id: id,
      device_id: device_id,
      score: scan.score,
      file_count: scan.fileCount || 0,
      error_count: errs,
      warning_count: warns,
      issues: issues,
      created_at: new Date(scan.at || Date.now()).toISOString()
    };
    await _put('scans', row);
    return { ok: true, id: id, engine: _engine };
  }

  async function listScans(limit) {
    const rows = await _getAll('scans');
    const sorted = rows.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }

  // -------- Agent runs --------
  async function saveAgentRun(run) {
    if (!run) return { ok: false, error: 'missing-run' };
    const device_id = getDeviceId();
    const id = run.id || ('run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
    const row = {
      id: id,
      device_id: device_id,
      agent: run.agent || 'Sovereign-1.5',
      prompt: run.prompt || '',
      status: run.status || 'completed',
      steps: run.steps || [],
      files_written: run.filesWritten || 0,
      duration_ms: run.durationMs || 0,
      created_at: new Date(run.at || Date.now()).toISOString()
    };
    await _put('agent_runs', row);
    return { ok: true, id: id, engine: _engine };
  }

  async function listAgentRuns(limit) {
    const rows = await _getAll('agent_runs');
    const sorted = rows.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }

  // -------- Utility: clear all backend data for this device --------
  async function clearAll() {
    for (const s of STORES) {
      if (s === 'meta') continue;
      await _clear(s);
    }
    return { ok: true };
  }

  async function stats() {
    await _engineReady;
    const out = { engine: _engine, device_id: getDeviceId(), counts: {} };
    for (const s of STORES) {
      if (s === 'meta') continue;
      out.counts[s] = (await _getAll(s)).length;
    }
    return out;
  }

  // -------- Expose --------
  window.Backend = {
    SUPABASE_URL: SUPABASE_URL,
    deviceId: getDeviceId(),
    get engine() { return _engine; },
    ping: ping,
    stats: stats,
    listProjects: listProjects,
    saveProject: saveProject,
    loadProjectFiles: loadProjectFiles,
    deleteProject: deleteProject,
    saveFile: saveFile,
    saveDeploy: saveDeploy,
    listDeploys: listDeploys,
    saveScan: saveScan,
    listScans: listScans,
    saveAgentRun: saveAgentRun,
    listAgentRuns: listAgentRuns,
    clearAll: clearAll
  };

  // Surface engine choice once ready
  _engineReady.then(function() {
    try {
      console.debug('[Backend] engine=' + _engine + ' device=' + getDeviceId());
    } catch (_) {}
  });
})();
