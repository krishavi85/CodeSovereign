/* ============================================================
   app.actions.js — GitHub Actions & Webhooks UI
   ------------------------------------------------------------
   Renders at S.screen === 'actions'.

   Features:
     - Pick a target (Pages, Netlify, Vercel, Static, Docker)
     - Configure branch / build cmd / publish dir
     - One-click "Install workflow" → writes .github/workflows/*.yml
       into the current Engine.FS so next GitHub push includes it
     - Manage webhooks: add / remove / trigger (simulated)
     - Recent deliveries list with status

   Exposes:
     window.ActionsUI = { render(), mount() }
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
      return d.toLocaleString();
    } catch (_) { return iso; }
  }

  function render() {
    if (!window.GitHubActions) return '<div style="padding:24px;color:#8b93a7">GitHub Actions engine not loaded.</div>';
    const A = window.GitHubActions;
    const presets = A.presets();
    const hooks = A.listWebhooks();
    const hist = A.deliveries();

    function presetBtn(k, p) {
      return `<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border:1px solid rgba(255,255,255,.10);border-radius:10px;cursor:pointer;background:rgba(255,255,255,.02);transition:all .15s">
        <input type="radio" name="act-target" value="${esc(k)}" ${k==='pages'?'checked':''} style="margin-top:2px">
        <div>
          <div style="font-size:13px;font-weight:600;color:#e6e9f2">${esc(p.label)}</div>
          <div style="font-size:11px;color:#8b93a7;font-family:monospace">.github/workflows/${esc(p.file)}</div>
        </div>
      </label>`;
    }

    function hookItem(h) {
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:9px;margin-bottom:7px;background:rgba(255,255,255,.02)">
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:#e6e9f2;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.url)}</div>
            <div style="font-size:10.5px;color:#8b93a7;margin-top:2px">
              ${(h.events||[]).map(e => '<span style="display:inline-block;padding:1px 6px;background:rgba(34,211,238,.12);color:#22d3ee;border-radius:6px;margin-right:4px">' + esc(e) + '</span>').join('')}
              ${h.lastTriggered ? '• last: ' + fmtTime(h.lastTriggered) : '• never triggered'}
            </div>
          </div>
          <button data-act-trigger="${esc(h.id)}" class="cs-btn cs-btn-ghost" style="font-size:11px;padding:5px 10px">⚡ Test</button>
          <button data-act-remove="${esc(h.id)}" class="cs-btn cs-btn-ghost" style="font-size:11px;padding:5px 10px;color:#ef4444">Remove</button>
        </div>
      `;
    }

    function delivItem(d) {
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px">
          <span style="color:#34d399;font-size:14px">●</span>
          <span style="color:#22d3ee;font-weight:600;min-width:60px">${esc(d.event)}</span>
          <span style="color:#8b93a7;min-width:90px">${fmtTime(d.ts)}</span>
          <span style="color:#c7cddb;flex:1;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.payload && d.payload.ref || '')}</span>
          <span style="color:#34d399">${esc(d.status)}</span>
        </div>
      `;
    }

    return `
      <div style="padding:20px;max-width:1280px;margin:0 auto">
        <h2 style="margin:0 0 18px;font-size:22px;font-weight:700;color:#e6e9f2">⚡ GitHub Actions & Webhooks</h2>

        <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:18px;margin-bottom:18px">
          <!-- Workflow generator -->
          <div class="card" style="padding:18px">
            <h3 style="margin:0 0 12px;font-size:14px;color:#e6e9f2">1. Pick a deploy target</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:14px">
              ${Object.keys(presets).map(k => presetBtn(k, presets[k])).join('')}
            </div>
            <h3 style="margin:14px 0 10px;font-size:14px;color:#e6e9f2">2. Configure</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px">
              <div>
                <label style="display:block;font-size:11px;color:#8b93a7;margin-bottom:4px">Branch</label>
                <input id="act-branch" type="text" value="main" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:13px;color:#e6e9f2">
              </div>
              <div>
                <label style="display:block;font-size:11px;color:#8b93a7;margin-bottom:4px">Publish dir</label>
                <input id="act-dir" type="text" value="./" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:13px;color:#e6e9f2">
              </div>
            </div>
            <label style="display:block;font-size:11px;color:#8b93a7;margin-bottom:4px">Build command (optional)</label>
            <input id="act-build" type="text" placeholder="npm ci && npm run build" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:13px;color:#e6e9f2;margin-bottom:12px">

            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button id="act-preview" class="cs-btn cs-btn-ghost" style="font-size:12px">Preview workflow.yml</button>
              <button id="act-install" class="cs-btn cs-btn-primary" style="font-size:12px">⚙ Install into project</button>
              <button id="act-copy" class="cs-btn cs-btn-ghost" style="font-size:12px">Copy YAML</button>
            </div>

            <pre id="act-preview-out" style="display:none;margin-top:14px;padding:14px;background:#0a0e1a;border:1px solid rgba(255,255,255,.08);border-radius:9px;font:11.5px/1.55 'JetBrains Mono',monospace;color:#c7cddb;max-height:280px;overflow:auto;white-space:pre-wrap;word-break:break-all"></pre>
          </div>

          <!-- Webhooks -->
          <div class="card" style="padding:18px">
            <h3 style="margin:0 0 12px;font-size:14px;color:#e6e9f2">3. Webhook URL (optional)</h3>
            <div style="font-size:12px;color:#8b93a7;margin-bottom:11px;line-height:1.5">
              Register a webhook to receive push events. CodeSovereign simulates the
              delivery here (we can't POST from GitHub back to your browser). For
              production, point the URL at your own server with the format:
              <code style="display:block;margin-top:6px;padding:7px 9px;background:#0a0e1a;border-radius:6px;color:#22d3ee;font-size:11px">${esc(A.receiverUrlTemplate())}</code>
            </div>

            <div style="display:grid;gap:7px;margin-bottom:10px">
              <input id="wh-url" type="text" placeholder="https://your-server.example.com/webhook" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:12.5px;color:#e6e9f2">
              <div style="display:flex;gap:6px">
                <input id="wh-secret" type="text" placeholder="shared secret (optional)" style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:12.5px;color:#e6e9f2">
                <button id="wh-add" class="cs-btn cs-btn-primary" style="font-size:12px">+ Add webhook</button>
              </div>
            </div>

            <h4 style="margin:14px 0 7px;font-size:12px;color:#8b93a7;text-transform:uppercase;letter-spacing:1.2px">Webhooks (${hooks.length})</h4>
            <div id="wh-list">${hooks.length === 0 ? '<div style="color:#8b93a7;font-size:12.5px;padding:8px 0">No webhooks yet.</div>' : hooks.map(hookItem).join('')}</div>
          </div>
        </div>

        <div class="card" style="padding:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <h3 style="margin:0;font-size:14px;color:#e6e9f2">Recent deliveries (${hist.length})</h3>
            <button id="act-clear-hist" class="cs-btn cs-btn-ghost" style="font-size:11px">Clear history</button>
          </div>
          ${hist.length === 0 ? '<div style="color:#8b93a7;font-size:12.5px;padding:8px 0">No deliveries yet. Click ⚡ Test on a webhook above to simulate one.</div>' : hist.slice(0, 25).map(delivItem).join('')}
        </div>
      </div>
    `;
  }

  function mount() {
    if (window._actMounted) return;
    window._actMounted = true;

    function currentTarget() {
      const r = document.querySelector('input[name="act-target"]:checked');
      return r ? r.value : 'pages';
    }
    function currentOpts() {
      return {
        target: currentTarget(),
        branch: (document.getElementById('act-branch')||{}).value || 'main',
        publishDir: (document.getElementById('act-dir')||{}).value || './',
        buildCmd: (document.getElementById('act-build')||{}).value || ''
      };
    }

    document.addEventListener('click', (e) => {
      const t = e.target.closest('#act-preview,#act-install,#act-copy,#wh-add,[data-act-trigger],[data-act-remove],#act-clear-hist');
      if (!t) return;
      const A = window.GitHubActions;
      if (!A) return;
      if (t.id === 'act-preview') {
        const wf = A.generate(currentOpts());
        const out = document.getElementById('act-preview-out');
        if (out) { out.style.display = 'block'; out.textContent = wf.body; }
        return;
      }
      if (t.id === 'act-install') {
        const r = A.install(currentOpts());
        if (r.ok) {
          alert('✓ Workflow installed at ' + r.path + '\n\nNext time you push to GitHub via the GitHub tab, this workflow will be included.');
        } else {
          alert('✗ Install failed: ' + r.error);
        }
        return;
      }
      if (t.id === 'act-copy') {
        const wf = A.generate(currentOpts());
        try { navigator.clipboard.writeText(wf.body); alert('YAML copied to clipboard.'); }
        catch (_) { alert('Could not copy — try Preview first.'); }
        return;
      }
      if (t.id === 'wh-add') {
        const url = (document.getElementById('wh-url')||{}).value || '';
        const secret = (document.getElementById('wh-secret')||{}).value || '';
        if (!url) { alert('Please enter a webhook URL.'); return; }
        try {
          A.addWebhook({ url, secret, events: ['push','pull_request'] });
          const urlEl = document.getElementById('wh-url'); if (urlEl) urlEl.value = '';
          const secEl = document.getElementById('wh-secret'); if (secEl) secEl.value = '';
          rerender();
        } catch (err) { alert('Failed: ' + err.message); }
        return;
      }
      const trig = t.getAttribute('data-act-trigger');
      if (trig) {
        const d = A.trigger(trig, 'push', { ref: 'refs/heads/main', head_commit: { id: 'sim_' + Date.now() } });
        if (d) alert('✓ Simulated delivery recorded.');
        rerender();
        return;
      }
      const rem = t.getAttribute('data-act-remove');
      if (rem) {
        if (!confirm('Remove this webhook?')) return;
        A.removeWebhook(rem);
        rerender();
        return;
      }
      if (t.id === 'act-clear-hist') {
        if (!confirm('Clear all delivery history?')) return;
        A.clearHistory();
        rerender();
        return;
      }
    });
  }

  function rerender() {
    if (window._csRender) window._csRender();
    else if (window.renderAll) window.renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.ActionsUI = { render, mount };
})();
