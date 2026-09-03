/* ============================================================
   app.workspaces.js — Workspaces UI
   ------------------------------------------------------------
   Sidebar of workspaces (Personal / Team), member list, invites,
   shared files, activity log. Hooks into window.renderAll and
   renders when S.screen === 'workspaces'.

   Exposes:
     window.WorkspacesUI = { render(), mount() }
   ============================================================ */
(function() {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60) return Math.floor(diff) + 's ago';
      if (diff < 3600) return Math.floor(diff/60) + 'm ago';
      if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
      return d.toLocaleDateString();
    } catch (_) { return iso; }
  }
  function roleBadge(role) {
    const colors = { owner: '#a78bfa', editor: '#22d3ee', viewer: '#94a3b8' };
    return `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;background:${colors[role]||'#94a3b8'}22;color:${colors[role]||'#94a3b8'}">${esc(role||'viewer')}</span>`;
  }
  function avatar(name) {
    const init = (name||'?').slice(0, 2).toUpperCase();
    const colors = ['#6d5dfc','#22d3ee','#f472b6','#fbbf24','#34d399','#ef4444'];
    let h = 0;
    for (let i=0; i<(name||'').length; i++) h = (h*31 + name.charCodeAt(i)) | 0;
    const c = colors[Math.abs(h) % colors.length];
    return `<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${c},#6d5dfc);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex:none">${init}</div>`;
  }

  function render() {
    if (!window.Workspaces) return '<div style="padding:24px;color:#8b93a7">Workspaces engine not loaded.</div>';
    const all = window.Workspaces.list();
    const cur = window.Workspaces.current();

    function wsList() {
      if (!all.length) return '<div style="color:#8b93a7;font-size:13px;padding:12px">No workspaces yet.</div>';
      return all.map(w => {
        const isCur = cur && cur.id === w.id;
        return `
          <div data-ws="${esc(w.id)}" style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;cursor:pointer;background:${isCur?'rgba(34,211,238,.10)':'transparent'};border:1px solid ${isCur?'rgba(34,211,238,.3)':'transparent'};margin-bottom:4px;transition:all .15s">
            ${avatar(w.name)}
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:#e6e9f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.name)}</div>
              <div style="font-size:11px;color:#8b93a7">${(w.members||[]).length} member${(w.members||[]).length===1?'':'s'}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    function membersList() {
      if (!cur) return '';
      return (cur.members || []).map(m => `
        <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)">
          ${avatar(m.name)}
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:#e6e9f2">${esc(m.name)}</div>
            <div style="font-size:10.5px;color:#8b93a7;font-family:monospace">${esc(m.id)}</div>
          </div>
          ${roleBadge(m.role)}
        </div>
      `).join('');
    }

    function invitesList() {
      if (!cur || !cur.invites || !cur.invites.length) return '<div style="color:#8b93a7;font-size:12px;padding:6px 0">No active invites.</div>';
      return cur.invites.map(inv => `
        <div style="display:flex;align-items:center;gap:9px;padding:7px 9px;border:1px dashed rgba(255,255,255,.12);border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,.02)">
          <div style="flex:1;min-width:0">
            <div style="font-size:11.5px;font-family:monospace;color:#22d3ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(inv.token)}</div>
            <div style="font-size:10.5px;color:#8b93a7">${esc(inv.role)} • ${(inv.uses||0)} use${(inv.uses||0)===1?'':'s'} • ${fmtTime(inv.created)}</div>
          </div>
          <button data-copylink="${esc(inv.token)}" class="cs-btn cs-btn-ghost" style="font-size:11px;padding:4px 8px">Copy link</button>
        </div>
      `).join('');
    }

    function filesList() {
      if (!cur) return '';
      const files = window.Workspaces.listFiles(cur.id);
      if (!files.length) return '<div style="color:#8b93a7;font-size:12px;padding:6px 0">No shared files yet. Click "Share current file" to add.</div>';
      return files.map(f => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:#e6e9f2;font-family:monospace">
          <span style="color:#22d3ee">▸</span>
          <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f)}</span>
          <button data-unshare="${esc(f)}" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:11px">remove</button>
        </div>
      `).join('');
    }

    function activityList() {
      if (!cur || !cur.log || !cur.log.length) return '<div style="color:#8b93a7;font-size:12px;padding:6px 0">No activity yet.</div>';
      return cur.log.slice(0, 25).map(e => `
        <div style="display:flex;align-items:flex-start;gap:9px;padding:5px 0;font-size:11.5px">
          <span style="color:#8b93a7;flex:none;min-width:60px">${fmtTime(e.ts)}</span>
          <span style="color:#e6e9f2;flex:none">${esc(e.kind)}</span>
          <span style="color:#22d3ee;flex:1;min-width:0;word-break:break-all">${esc(e.detail||'')}</span>
        </div>
      `).join('');
    }

    return `
      <div style="display:grid;grid-template-columns:260px 1fr;gap:18px;padding:18px;max-width:1280px;margin:0 auto">
        <!-- Left: workspace list + create -->
        <div class="card" style="padding:16px;height:fit-content">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h3 style="margin:0;font-size:14px;color:#e6e9f2;font-weight:600">Workspaces</h3>
            <button id="ws-new" class="cs-btn cs-btn-primary" style="font-size:11px;padding:5px 10px">+ New</button>
          </div>
          <div id="ws-list">${wsList()}</div>
        </div>

        <!-- Right: current workspace details -->
        <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
          ${cur ? `
            <div class="card" style="padding:18px">
              <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
                ${avatar(cur.name)}
                <div style="flex:1;min-width:0">
                  <h2 style="margin:0;font-size:20px;font-weight:700;color:#e6e9f2">${esc(cur.name)}</h2>
                  <div style="font-size:12.5px;color:#8b93a7;margin-top:2px">${esc(cur.desc || 'No description.')}</div>
                </div>
                <button id="ws-delete" class="cs-btn cs-btn-ghost" style="font-size:11px;color:#ef4444">Delete</button>
</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button id="ws-rename" class="cs-btn cs-btn-ghost" style="font-size:12px">Rename</button>
                <button id="ws-desc" class="cs-btn cs-btn-ghost" style="font-size:12px">Edit description</button>
                <button id="ws-invite-editor" class="cs-btn cs-btn-ghost" style="font-size:12px">+ Invite (editor)</button>
                <button id="ws-invite-viewer" class="cs-btn cs-btn-ghost" style="font-size:12px">+ Invite (viewer)</button>
                <button id="ws-sync" class="cs-btn cs-btn-ghost" style="font-size:12px">↻ Sync</button>
                <button id="ws-leave" class="cs-btn cs-btn-ghost" style="font-size:12px">Leave</button>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
              <div class="card" style="padding:16px">
                <h4 style="margin:0 0 10px;font-size:12px;color:#8b93a7;text-transform:uppercase;letter-spacing:1.2px">Members (${(cur.members||[]).length})</h4>
                <div>${membersList()}</div>
              </div>
              <div class="card" style="padding:16px">
                <h4 style="margin:0 0 10px;font-size:12px;color:#8b93a7;text-transform:uppercase;letter-spacing:1.2px">Invites</h4>
                <div>${invitesList()}</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
              <div class="card" style="padding:16px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                  <h4 style="margin:0;font-size:12px;color:#8b93a7;text-transform:uppercase;letter-spacing:1.2px">Shared files (${(window.Workspaces.listFiles(cur.id)).length})</h4>
                  <button id="ws-share-current" class="cs-btn cs-btn-ghost" style="font-size:11px;padding:4px 9px">+ Share current</button>
                </div>
                <div id="ws-files">${filesList()}</div>
              </div>
              <div class="card" style="padding:16px">
                <h4 style="margin:0 0 10px;font-size:12px;color:#8b93a7;text-transform:uppercase;letter-spacing:1.2px">Activity</h4>
                <div id="ws-log" style="max-height:280px;overflow:auto">${activityList()}</div>
              </div>
            </div>

            <div class="card" style="padding:14px;display:flex;align-items:center;gap:10px;background:rgba(34,211,238,.05);border-color:rgba(34,211,238,.2)">
              <span style="font-size:11.5px;color:#22d3ee">ℹ</span>
              <div style="flex:1;font-size:12px;color:#c7cddb">
                Your device id: <code style="color:#22d3ee">${esc(window.Workspaces.getDeviceId())}</code>
                — share this with teammates so they can be added manually.
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function mount() {
    if (window._wsMounted) return;
    window._wsMounted = true;

    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ws],[data-copylink],[data-unshare],#ws-new,#ws-delete,#ws-rename,#ws-desc,#ws-invite-editor,#ws-invite-viewer,#ws-sync,#ws-leave,#ws-share-current');
      if (!t) return;
      const W = window.Workspaces;
      if (!W) return;

      if (t.id === 'ws-new') {
        const name = prompt('Workspace name?', 'My Team');
        if (!name) return;
        W.create({ name });
        rerender();
        return;
      }
      const wsId = t.getAttribute('data-ws');
      if (wsId) {
        W.setCurrent(wsId);
        rerender();
        return;
      }
      if (t.id === 'ws-delete') {
        const cur = W.current();
        if (!cur) return;
        if (!confirm('Delete "' + cur.name + '"? This cannot be undone.')) return;
        W.remove(cur.id);
        rerender();
        return;
      }
      if (t.id === 'ws-rename') {
        const cur = W.current();
        if (!cur) return;
        const name = prompt('New name?', cur.name);
        if (name) { W.update(cur.id, { name }); rerender(); }
        return;
      }
      if (t.id === 'ws-desc') {
        const cur = W.current();
        if (!cur) return;
        const desc = prompt('New description?', cur.desc || '');
        if (desc !== null) { W.update(cur.id, { desc }); rerender(); }
        return;
      }
      if (t.id === 'ws-invite-editor' || t.id === 'ws-invite-viewer') {
        const cur = W.current();
        if (!cur) return;
        const role = t.id === 'ws-invite-editor' ? 'editor' : 'viewer';
        const inv = W.invite(cur.id, role);
        const url = window.location.origin + window.location.pathname + '?join=' + inv.token;
        try { navigator.clipboard.writeText(url); } catch (_) {}
        alert('Invite link copied to clipboard:\n\n' + url);
        rerender();
        return;
      }
      if (t.id === 'ws-sync') {
        W.sync().then(r => alert(r.ok ? 'Synced ' + r.count + ' workspaces' : 'Sync failed: ' + (r.reason || 'offline')));
        return;
      }
      if (t.id === 'ws-leave') {
        const cur = W.current();
        if (!cur) return;
        if (!confirm('Leave "' + cur.name + '"?')) return;
        W.leave(cur.id);
        rerender();
        return;
      }
      if (t.id === 'ws-share-current') {
        const cur = W.current();
        if (!cur) return;
        // share the file currently selected in the IDE, if any
        let path = null;
        if (window.S && window.S.currentFile) path = window.S.currentFile;
        if (!path && window.Engine && window.Engine.FS && window.Engine.FS.list) {
          const list = window.Engine.FS.list();
          if (list.length) path = list[0].path || list[0];
        }
        if (!path) { alert('No file selected. Open a file in the IDE first.'); return; }
        W.addFile(cur.id, path);
        rerender();
        return;
      }
      const link = t.getAttribute('data-copylink');
      if (link) {
        const url = window.location.origin + window.location.pathname + '?join=' + link;
        try { navigator.clipboard.writeText(url); } catch (_) {}
        alert('Invite URL copied:\n\n' + url);
        return;
      }
      const unshare = t.getAttribute('data-unshare');
      if (unshare) {
        const cur = W.current();
        if (cur) { W.removeFile(cur.id, unshare); rerender(); }
        return;
      }
    });

    // handle ?join=… token on load
    try {
      const sp = new URLSearchParams(window.location.search);
      const joinToken = sp.get('join');
      if (joinToken && W) {
        const joined = W.join(joinToken);
        if (joined) {
          try { history.replaceState(null, '', window.location.pathname); } catch (_) {}
          setTimeout(() => alert('Joined workspace: ' + joined.name), 50);
        }
      }
    } catch (_) {}
  }

  function rerender() {
    if (window._csRender) window._csRender();
    else if (window.renderAll) window.renderAll();
  }

  // auto-mount
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.WorkspacesUI = { render, mount };
})();
