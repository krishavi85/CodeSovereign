/* =====================================================================
   desktop-app.js  —  wires the CodeSovereign UI to real desktop capability.

   - native New Project / Open Folder / Open Recent / Save / Export ZIP
   - Engine.Proj is redirected to real folders on disk
   - reopens the last project on launch
   - migrates the LLM API key into the OS keychain (safeStorage)
   No-op in a plain browser.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.desktop || !window.desktop.isDesktop) return;

  var D = window.desktop;
  var Engine = window.Engine;
  var FS = Engine && Engine.FS;

  var CSDesktop = {
    info: null,
    project: null,          // { id, name, template, root, createdAt }
    recents: []
  };
  window.CSDesktop = CSDesktop;

  function toast(m, c) { try { window.toast && window.toast(m, c || '#22d3ee'); } catch (_) {} }
  function rerender() { try { window.renderAll(); } catch (_) {} }

  /* ---------------- Engine.Proj redirection ---------------- */

  var _origCurrent = Engine.Proj.current.bind(Engine.Proj);
  var _origList = Engine.Proj.list.bind(Engine.Proj);

  Engine.Proj.current = function () {
    return CSDesktop.project || (FS.__hasWorkspace && FS.__hasWorkspace() ? CSDesktop.project : _origCurrent());
  };
  Engine.Proj.list = function () {
    // Recents become the "projects" list on the Welcome screen.
    return CSDesktop.recents.map(function (r) {
      return { id: r.path, name: r.name, template: 'folder', createdAt: r.at || 0, updatedAt: r.at || 0,
               fileCount: (CSDesktop.project && CSDesktop.project.root === r.path) ? Object.keys(FS._data).length : 0 };
    });
  };
  Engine.Proj.switchTo = function (id) { openFolder(id); return CSDesktop.project; };
  Engine.Proj.remove = function (id) {
    // Recents are owned by the main process; drop it from the local view and let
    // main prune the entry the next time an open fails.
    CSDesktop.recents = CSDesktop.recents.filter(function (r) { return r.path !== id; });
    rerender();
  };

  /* ---------------- workspace loading ---------------- */

  function applyTree(res) {
    if (!res || res.ok === false) { toast('Open failed: ' + (res && res.error || 'unknown'), '#ef4444'); return false; }
    FS.__loadFromDisk(res.files || []);
    CSDesktop.project = {
      id: res.root, root: res.root, name: res.name,
      template: 'folder', createdAt: Date.now(), updatedAt: Date.now(),
      fileCount: (res.files || []).length
    };
    try { D.app.setTitle(res.name); } catch (_) {}
    var files = Object.keys(FS._data).filter(function (p) { return FS.isFile(p); }).sort();
    window.S.ideFile = files[0] || null;
    if (window.S.ideFile) { window.S.ideBuffer = FS.read(window.S.ideFile) || ''; window.S.ideDirty = false; }
    window.S.screen = 'ide';
    try { window.syncBuildFromFS && window.syncBuildFromFS(); } catch (_) {}
    refreshRecents();
    window.__csTrustChecked = false;       // re-check trust for the newly opened folder
    if (window.csRefreshTrust) window.csRefreshTrust();
    rerender();
    if (res.truncated) toast('Large project — only the first files were loaded into the editor', '#f59e0b');
    return true;
  }

  function openFolder(dir) {
    return D.workspace.open(dir).then(applyTree).catch(function (e) { toast('Open failed: ' + e.message, '#ef4444'); });
  }

  function openFolderPicker() {
    return D.workspace.pickAndOpen().then(function (res) {
      if (res === null) return;                 // cancelled
      applyTree(res);
    });
  }

  /* ---------------- new project ---------------- */

  function templateOptions() {
    var t = (Engine.TEMPLATES && Object.keys(Engine.TEMPLATES)) || ['saas-dashboard'];
    return t;
  }

  function newProjectFlow(opts) {
    opts = opts || {};
    promptNewProject(opts.name || 'my-app', opts.templateId || templateOptions()[0]).then(function (choice) {
      if (!choice) return;
      return D.workspace.pickParentDir().then(function (parentDir) {
        if (parentDir === null) return;         // cancelled
        var tpl = Engine.TEMPLATES[choice.templateId] || Engine.TEMPLATES[templateOptions()[0]];
        var files = tpl().map(function (pair) { return { path: pair[0], content: pair[1] }; });
        toast('Creating project on disk…', '#a78bfa');
        return D.workspace.createProject({ parentDir: parentDir, folderName: choice.name, files: files })
          .then(function (res) {
            if (res.ok === false) { toast('Create failed: ' + res.error, '#ef4444'); return; }
            CSDesktop.project = null;
            applyTree(res);
            toast('Created “' + res.name + '” — ' + (res.files || []).length + ' files on disk', '#34d399');
          });
      });
    });
  }

  /* ---------------- small modal ---------------- */

  function promptNewProject(defName, defTpl) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center';
      var opts = templateOptions().map(function (k) {
        return '<option value="' + k + '"' + (k === defTpl ? ' selected' : '') + '>' + k + '</option>';
      }).join('');
      wrap.innerHTML =
        '<div class="card" style="width:420px;padding:22px;background:#0c1120">' +
          '<h3 style="margin:0 0 14px;font-size:15px;font-weight:700">New Project</h3>' +
          '<label style="display:block;font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Folder name</label>' +
          '<input id="npName" value="' + defName + '" style="width:100%;padding:9px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#0a0e1a;color:#e6e9f2;font:400 13px Inter,sans-serif;margin-bottom:14px">' +
          '<label style="display:block;font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Template</label>' +
          '<select id="npTpl" style="width:100%;padding:9px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#0a0e1a;color:#e6e9f2;font:400 13px Inter,sans-serif;margin-bottom:18px">' + opts + '</select>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end">' +
            '<button class="btn ghost" id="npCancel">Cancel</button>' +
            '<button class="btn primary" id="npOk">Choose folder…</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      var name = wrap.querySelector('#npName');
      name.focus(); name.select();
      function done(v) { wrap.remove(); resolve(v); }
      wrap.querySelector('#npCancel').onclick = function () { done(null); };
      wrap.querySelector('#npOk').onclick = function () {
        var n = name.value.trim(); if (!n) { name.focus(); return; }
        done({ name: n, templateId: wrap.querySelector('#npTpl').value });
      };
      wrap.addEventListener('click', function (e) { if (e.target === wrap) done(null); });
      wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target === name) wrap.querySelector('#npOk').click(); });
    });
  }

  /* ---------------- recents ---------------- */

  function refreshRecents() {
    return D.app.recents().then(function (list) { CSDesktop.recents = list || []; });
  }

  /* ---------------- save ---------------- */

  function saveActive() {
    if (typeof window.saveFile === 'function' && window.S && window.S.ideFile) { window.saveFile(); }
    else toast('Nothing to save', '#f59e0b');
  }
  function saveAll() {
    if (!FS.__hasWorkspace || !FS.__hasWorkspace()) { toast('Open a project folder first', '#f59e0b'); return; }
    var n = 0;
    Object.keys(FS._data).forEach(function (p) { if (FS.isFile(p) && !FS._data[p].binary) { FS.write(p, FS._data[p].content); n++; } });
    FS.__flush().then(function () { toast('Flushed ' + n + ' files to disk', '#34d399'); });
  }

  /* ---------------- credential migration ---------------- */

  function migrateLlmKey() {
    if (!Engine.LLM || !Engine.LLM.getConfig) return;
    var _get = Engine.LLM.getConfig, _set = Engine.LLM.setConfig;
    var cache = null;

    D.creds.get('llm.apiKey').then(function (r) {
      var stored = r && r.value;
      var cfg = _get();
      if (!stored && cfg && cfg.apiKey) {
        // migrate the plaintext key out of localStorage into the keychain
        D.creds.set('llm.apiKey', cfg.apiKey);
        stored = cfg.apiKey;
      }
      cache = stored || '';
      if (stored) {
        _set({ apiKey: stored });
        try {
          var raw = JSON.parse(localStorage.getItem('cs.llm.v1') || '{}');
          delete raw.apiKey; localStorage.setItem('cs.llm.v1', JSON.stringify(raw));
        } catch (_) {}
      }
    });

    Engine.LLM.getConfig = function () {
      var c = _get() || {};
      if (!c.apiKey && cache) c.apiKey = cache;
      return c;
    };
    Engine.LLM.setConfig = function (patch) {
      if (patch && typeof patch.apiKey === 'string') {
        cache = patch.apiKey;
        D.creds.set('llm.apiKey', patch.apiKey);
        var copy = {}; for (var k in patch) copy[k] = patch[k];
        delete copy.apiKey;                 // never persist the key to localStorage
        return _set(copy);
      }
      return _set(patch);
    };
  }

  /* ---------------- desktop banner ---------------- */

  function ensureBanner() {
    var open = FS.__hasWorkspace && FS.__hasWorkspace();
    var el = document.getElementById('csDesktopBanner');
    if (open) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'csDesktopBanner';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:120;display:flex;align-items:center;gap:12px;padding:10px 16px;background:#141a2b;border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.5);font:500 12.5px Inter,sans-serif;color:#e6e9f2';
    el.innerHTML = 'Scratch project — not saved to disk. ' +
      '<button class="btn primary" id="csbNew" style="padding:5px 11px;font-size:12px">New Project</button>' +
      '<button class="btn ghost" id="csbOpen" style="padding:5px 11px;font-size:12px">Open Folder</button>';
    document.body.appendChild(el);
    el.querySelector('#csbNew').onclick = function () { newProjectFlow({}); };
    el.querySelector('#csbOpen').onclick = function () { openFolderPicker(); };
  }

  /* ---------------- menu actions ---------------- */

  function handleMenu(msg) {
    var a = msg && msg.action;
    switch (a) {
      case 'new-project': newProjectFlow({}); break;
      case 'open-folder': openFolderPicker(); break;
      case 'open-recent': openFolder(msg.payload); break;
      case 'clear-recents': D.app.clearRecents().then(refreshRecents).then(rerender); break;
      case 'save': saveActive(); break;
      case 'save-all': saveAll(); break;
      case 'export-zip':
        D.workspace.exportZip().then(function (r) {
          if (r && r.ok) toast('Exported ' + r.fileCount + ' files → ' + r.path, '#34d399');
        });
        break;
      case 'reveal': D.workspace.reveal(window.S && window.S.ideFile); break;
      case 'open-terminal':
        window.S.screen = 'ide'; window.S.idePanel = 'terminal'; rerender();
        break;
      case 'run-command': runCommandPrompt(); break;
      case 'validate':
        window.S.screen = 'recovery'; rerender();
        try { window.runValidatorScan && window.runValidatorScan(); } catch (_) {}
        break;
      case 'snapshot-now':
        D.snapshots.create('manual').then(function (r) {
          toast(r && r.ok ? 'Snapshot saved (' + r.fileCount + ' files)' : 'Snapshot failed', r && r.ok ? '#34d399' : '#ef4444');
        });
        break;
      case 'restore-snapshot': restoreSnapshotPrompt(); break;
      case 'open-settings': window.S.screen = 'settings'; rerender(); break;
      case 'about': aboutDialog(); break;
    }
  }

  function runCommandPrompt() {
    if (!FS.__hasWorkspace || !FS.__hasWorkspace()) { toast('Open a project folder first', '#f59e0b'); return; }
    var cmd = window.prompt('Run in ' + (CSDesktop.project && CSDesktop.project.name) + ':', 'npm install');
    if (!cmd) return;
    var parts = cmd.trim().split(/\s+/);
    window.S.screen = 'ide'; window.S.idePanel = 'terminal'; rerender();
    setTimeout(function () {
      if (window.CSTerminal && window.CSTerminal.run) window.CSTerminal.run(parts[0], parts.slice(1));
    }, 60);
  }

  function restoreSnapshotPrompt() {
    D.snapshots.list().then(function (list) {
      if (!list || !list.length) { toast('No snapshots yet for this project', '#f59e0b'); return; }
      var lines = list.slice(0, 10).map(function (s, i) {
        return (i + 1) + ') ' + new Date(s.at).toLocaleString() + '  (' + s.fileCount + ' files, ' + s.reason + ')';
      }).join('\n');
      var pick = window.prompt('Restore which snapshot?\n\n' + lines + '\n\nEnter a number:', '1');
      var idx = parseInt(pick, 10) - 1;
      if (isNaN(idx) || !list[idx]) return;
      D.snapshots.restore(list[idx].id).then(function (r) {
        if (r && r.ok) {
          Object.keys(r.files).forEach(function (p) { FS._data[p] = { type: 'file', content: r.files[p], updatedAt: Date.now() }; });
          toast('Restored snapshot — ' + Object.keys(r.files).length + ' files', '#34d399');
          rerender();
        } else toast('Restore failed', '#ef4444');
      });
    });
  }

  function aboutDialog() {
    var v = CSDesktop.info || {};
    D.dialog.message({
      type: 'info', title: 'About CodeSovereign',
      message: 'CodeSovereign Desktop ' + (v.app || ''),
      detail: 'Electron ' + (v.electron || '') + '  ·  Chromium ' + (v.chrome || '') + '  ·  Node ' + (v.node || '') +
        '\nCredential encryption: ' + (v.credsEncrypted ? 'on (OS keychain)' : 'unavailable') +
        '\nPlatform: ' + (v.platform || '') + '/' + (v.arch || '')
    });
  }

  /* ---------------- boot ---------------- */

  // Redirect the Welcome-screen entry points.
  var _cpft = window.createProjectFromTemplate;
  window.createProjectFromTemplate = function (name, templateId) { newProjectFlow({ name: name, templateId: templateId }); };
  window.openProject = function (id) { openFolder(id); };

  function boot() {
    D.info().then(function (i) { CSDesktop.info = i; });
    migrateLlmKey();
    D.app.onMenu(handleMenu);

    refreshRecents().then(function () {
      var last = CSDesktop.recents[0];
      if (last && last.path) {
        openFolder(last.path).then(function () { ensureBanner(); });
      } else {
        ensureBanner();
      }
    });

    // Keep the banner in sync after every render.
    var _ra = window.renderAll;
    window.renderAll = function () { var r = _ra.apply(this, arguments); try { ensureBanner(); } catch (_) {} return r; };

    // Flush pending disk writes before the window closes.
    window.addEventListener('beforeunload', function () { try { FS.__flush && FS.__flush(); } catch (_) {} });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
