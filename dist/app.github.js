/* ============================================================
   app.github.js — GitHub export panel
   ------------------------------------------------------------
   Renders the "GitHub" tab in CodeSovereign: lets the user
   authenticate with GitHub (PAT or OAuth), list their repos,
   create a new repo, and push the current Engine.FS into it.

   Public:  window.GitHubUI
   ============================================================ */
(function() {
  'use strict';

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function toast(msg, color, ms) {
    if (window.csToast) window.csToast(msg, color || '#7c6ff5', ms || 3500);
    else console.log('[toast]', msg);
  }

  // -------- Auth screen --------
  function renderAuth() {
    const G = window.GitHubExport;
    const auth = G.getAuth();
    return `
<div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
  <div style="display:flex;align-items:center;gap:10px">
    <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#24292f,#0d1117);color:#fff;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.9.1 3.2.7.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .5.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>
    </div>
    <div style="flex:1">
      <div class="cs-h2">GitHub Authentication</div>
      <div class="cs-muted" style="font-size:12px;margin-top:2px">Connect to push generated apps to GitHub.</div>
    </div>
    <div class="cs-muted" style="font-size:12px">${G.isAuthed() ? '<span style="color:#34d399">● connected</span>' : '<span style="color:#f59e0b">● not connected</span>'}</div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <div style="font-weight:700">Option 1 — Personal Access Token</div>
      <div class="cs-muted" style="font-size:12px">Easiest. Create a token at <code>github.com/settings/tokens</code> with <code>repo</code> scope, paste it below. The token is stored only in this browser's localStorage.</div>
      <input id="ghPat" type="password" placeholder="ghp_… or github_pat_…" autocomplete="off"/>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn primary" id="ghPatConnect">Connect with PAT</button>
      </div>
    </div>

    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <div style="font-weight:700">Option 2 — OAuth Web App</div>
      <div class="cs-muted" style="font-size:12px">Register an OAuth app at <code>github.com/settings/applications/new</code>. Set the Authorization callback URL to this page. Paste the client_id below.</div>
      <input id="ghClientId" placeholder="OAuth client_id (e.g. Iv1.abc123…)"/>
      <input id="ghClientSecret" type="password" placeholder="OAuth client_secret (kept local)" autocomplete="off"/>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn primary" id="ghOauthConnect">Authorize on GitHub</button>
      </div>
    </div>
  </div>

  ${auth ? `<div class="cs-muted" style="font-size:11.5px">Auth kind: <b>${esc(auth.kind)}</b> · created ${esc(auth.createdAt)}</div>` : ''}
</div>
    `;
  }

  // -------- Repo create / push form --------
  function renderPushForm() {
    const G = window.GitHubExport;
    if (!G.isAuthed()) {
      return '<div class="card" style="padding:24px;text-align:center;color:#8b93a7">Authenticate above to push to GitHub.</div>';
    }
    const files = G.collectFiles();
    return `
<div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
  <div style="display:flex;align-items:center;gap:10px">
    <div style="width:36px;height:36px;border-radius:9px;background:rgba(124,111,245,.12);color:#a9b0ff;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    </div>
    <div style="flex:1">
      <div class="cs-h2">Push to a new GitHub repository</div>
      <div class="cs-muted" style="font-size:12px;margin-top:2px">${files.count} files in Engine.FS · ${(files.totalBytes/1024).toFixed(1)} KB</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <label style="display:flex;flex-direction:column;gap:4px"><span class="cs-muted" style="font-size:12px">Repository name</span><input id="ghRepoName" placeholder="my-codesov-app" value="my-codesov-app"/></label>
    <label style="display:flex;flex-direction:column;gap:4px"><span class="cs-muted" style="font-size:12px">Visibility</span><select id="ghRepoPrivate"><option value="false">Public</option><option value="true">Private</option></select></label>
  </div>
  <label style="display:flex;flex-direction:column;gap:4px"><span class="cs-muted" style="font-size:12px">Description</span><input id="ghRepoDesc" placeholder="A short description of the project" value="Generated by CodeSovereign"/></label>
  <label style="display:flex;flex-direction:column;gap:4px"><span class="cs-muted" style="font-size:12px">Commit message</span><input id="ghCommitMsg" value="Initial commit from CodeSovereign"/></label>
  <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px">
    <button class="btn ghost" id="ghTestConn">Test connection</button>
    <button class="btn primary" id="ghPush">Push to GitHub</button>
  </div>
  <div id="ghPushStatus" class="cs-muted" style="font-size:12.5px;min-height:18px"></div>
</div>
    `;
  }

  // -------- Recent exports --------
  function renderExports() {
    const G = window.GitHubExport;
    const list = G.listExports();
    if (!list.length) {
      return '<div class="card" style="padding:14px;color:#8b93a7;text-align:center;font-size:12.5px">No exports yet. Push your first repo above.</div>';
    }
    return `
<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:8px">
  <div style="font-weight:700;display:flex;align-items:center;justify-content:space-between">
    <span>Recent exports</span>
    <button class="btn ghost" id="ghClearExports" style="padding:3px 8px;font-size:11.5px">Clear</button>
  </div>
  ${list.slice(0, 8).map(e => `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)">
      <span class="pill" style="background:${e.kind === 'create' ? 'rgba(52,211,153,.16)' : 'rgba(96,165,250,.16)'};color:${e.kind === 'create' ? '#34d399' : '#60a5fa'}">${e.kind === 'create' ? 'create' : 'update'}</span>
      <a href="${esc(e.url)}" target="_blank" rel="noopener" style="flex:1;color:#a9b0ff;font-weight:600;text-decoration:none">${esc(e.repo)}</a>
      <span class="cs-muted" style="font-size:11.5px">${e.fileCount} files · ${(e.totalBytes/1024).toFixed(1)} KB</span>
      <code class="cs-mono cs-muted" style="font-size:10.5px">${esc((e.commit || '').slice(0, 7))}</code>
    </div>
  `).join('')}
</div>
    `;
  }

  function renderScreen() {
    return `
<div class="screen-inner" style="display:flex;flex-direction:column;gap:14px">
  <div class="card" style="padding:14px;display:flex;align-items:center;gap:10px">
    <div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#0d1117,#24292f);color:#fff;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.9.1 3.2.7.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .5.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>
    </div>
    <div style="flex:1">
      <div class="cs-h1">GitHub Export</div>
      <div class="cs-muted" style="margin-top:2px">Push the current project to a new or existing GitHub repository.</div>
    </div>
    <button class="btn ghost" id="ghLogout" style="font-size:12px;padding:6px 10px">Disconnect</button>
  </div>
  ${renderAuth()}
  ${renderPushForm()}
  ${renderExports()}
</div>
    `;
  }

  function bind(root) {
    if (!root) return;

    root.querySelector('#ghPatConnect')?.addEventListener('click', async () => {
      const tok = root.querySelector('#ghPat').value.trim();
      if (!tok) { toast('Paste a token first', '#f59e0b'); return; }
      try {
        window.GitHubExport.setToken(tok);
        const me = await window.GitHubExport.whoami();
        toast('Connected as ' + me.login, '#34d399');
        render();
      } catch (e) {
        toast('Auth failed: ' + e.message, '#ef4444', 6000);
        window.GitHubExport.clearAuth();
      }
    });
    root.querySelector('#ghOauthConnect')?.addEventListener('click', () => {
      const cid = root.querySelector('#ghClientId').value.trim();
      const sec = root.querySelector('#ghClientSecret').value.trim();
      if (!cid) { toast('Paste the OAuth client_id first', '#f59e0b'); return; }
      try {
        window.GitHubExport.setOAuth({ client_id: cid, client_secret: sec || undefined });
        const url = window.GitHubExport.loginUrl();
        location.href = url;
      } catch (e) { toast('OAuth init failed: ' + e.message, '#ef4444', 6000); }
    });
    root.querySelector('#ghLogout')?.addEventListener('click', () => {
      window.GitHubExport.clearAuth();
      toast('Disconnected', '#7c6ff5');
      render();
    });
    root.querySelector('#ghTestConn')?.addEventListener('click', async () => {
      const status = root.querySelector('#ghPushStatus');
      status.textContent = 'Testing…';
      try {
        const me = await window.GitHubExport.whoami();
        status.innerHTML = '<span style="color:#34d399">✓ Authenticated as <b>' + esc(me.login) + '</b> (' + esc(me.name || '') + ')</span>';
      } catch (e) {
        status.innerHTML = '<span style="color:#ef4444">✗ ' + esc(e.message) + '</span>';
      }
    });
    root.querySelector('#ghPush')?.addEventListener('click', async () => {
      const btn = root.querySelector('#ghPush');
      const status = root.querySelector('#ghPushStatus');
      const name = root.querySelector('#ghRepoName').value.trim();
      const isPriv = root.querySelector('#ghRepoPrivate').value === 'true';
      const desc = root.querySelector('#ghRepoDesc').value.trim();
      const msg  = root.querySelector('#ghCommitMsg').value.trim();
      if (!name) { toast('Repository name required', '#f59e0b'); return; }
      if (!/^[A-Za-z0-9._-]+$/.test(name)) { toast('Invalid repo name', '#f59e0b'); return; }
      btn.disabled = true; btn.textContent = 'Pushing…';
      status.textContent = 'Creating repository…';
      try {
        const files = window.GitHubExport.collectFiles();
        status.textContent = 'Uploading ' + files.count + ' files (' + (files.totalBytes/1024).toFixed(1) + ' KB) as blobs…';
        const r = await window.GitHubExport.pushToNewRepo({
          name, isPrivate: isPriv, description: desc, commitMessage: msg
        });
        status.innerHTML = '<span style="color:#34d399">✓ Pushed to <a href="' + esc(r.repo.html_url) + '" target="_blank" rel="noopener" style="color:#a9b0ff;font-weight:600">' + esc(r.repo.full_name) + '</a> · commit <code>' + esc(r.commit.sha.slice(0,7)) + '</code></span>';
        toast('Pushed ' + r.export.fileCount + ' files to ' + r.repo.full_name, '#34d399', 5000);
        render();
      } catch (e) {
        status.innerHTML = '<span style="color:#ef4444">✗ ' + esc(e.message) + '</span>';
        toast('Push failed: ' + e.message, '#ef4444', 6000);
      } finally {
        btn.disabled = false; btn.textContent = 'Push to GitHub';
      }
    });
    root.querySelector('#ghClearExports')?.addEventListener('click', () => {
      window.GitHubExport.clearExports();
      render();
    });
  }

  function render() {
    const main = document.getElementById('main');
    if (!main) return;
    main.innerHTML = renderScreen();
    bind(main);
  }

  // Re-render whenever the screen becomes 'github'
  const _orig = window.renderAll;
  window.renderAll = function() {
    if (_orig) _orig();
    if (S && S.screen === 'github') render();
  };

  window.GitHubUI = { render };
})();
