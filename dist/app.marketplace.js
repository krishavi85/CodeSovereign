/* ============================================================
   app.marketplace.js — Marketplace browser screen
   ------------------------------------------------------------
   Renders the "Marketplace" tab in CodeSovereign: lets the user
   browse, search, filter, preview, install, and publish
   templates from the TemplateMarketplace engine.

   Public:  window.MarketplaceUI
   ============================================================ */
(function() {
  'use strict';

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function iconFor(category) {
    const map = {
      frontend: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
      fullstack:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
      backend:  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="6" rx="1.5"/><rect x="2" y="15" width="20" height="6" rx="1.5"/><circle cx="6" cy="6" r="0.8"/><circle cx="6" cy="18" r="0.8"/></svg>',
      mobile:   '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
      desktop:  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      tooling:  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1 5 5L9 22l-7-7 10.7-10.7a4 4 0 0 1 5 5z"/></svg>'
    };
    return map[category] || map.frontend;
  }

  function toast(msg, color) {
    if (window.csToast) window.csToast(msg, color || '#7c6ff5');
    else console.log('[toast]', msg);
  }

  async function renderMarketplace(state) {
    const M = window.TemplateMarketplace;
    if (!M) {
      return '<div class="card" style="padding:24px">Marketplace engine not loaded. Check the console.</div>';
    }
    const query = (state && state.q) || '';
    const cat = (state && state.category) || 'all';

    let templates = [];
    let categories = [];
    try {
      [templates, categories] = await Promise.all([M.list({ query, category: cat }), M.categories()]);
    } catch (e) {
      return `<div class="card" style="padding:24px;color:#ef4444">Marketplace error: ${esc(e.message)}</div>`;
    }

    const stats = {
      total: templates.length,
      official: templates.filter(t => t.isOfficial).length,
      community: templates.filter(t => !t.isOfficial).length,
      online: M.online
    };

    return `
<div class="screen-inner" style="display:flex;flex-direction:column;gap:16px">
  <div class="card" style="padding:18px">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="width:42px;height:42px;border-radius:11px;background:linear-gradient(135deg,#22d3ee,#7c6ff5);display:flex;align-items:center;justify-content:center;color:#06121f">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5L12 3l9 6.5V21H3z"/></svg>
      </div>
      <div style="flex:1;min-width:200px">
        <div class="cs-h1">Template Marketplace</div>
        <div class="cs-muted" style="margin-top:4px">Browse ${stats.total} templates &middot; ${stats.official} official &middot; ${stats.community} community &middot; ${stats.online ? '<span style="color:#34d399">online</span>' : '<span style="color:#f59e0b">offline</span>'}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" id="mpSync"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M3 21v-5h5M21 3v5h-5"/></svg> Sync</button>
        <button class="btn primary" id="mpPublish"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Publish current</button>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
      <input id="mpSearch" placeholder="Search templates, tags, descriptions…" value="${esc(query)}" style="flex:1;min-width:220px"/>
      <select id="mpCategory" style="min-width:160px">
        <option value="all" ${cat==='all'?'selected':''}>All categories</option>
        ${categories.map(c => `<option value="${esc(c)}" ${cat===c?'selected':''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px" id="mpGrid">
    ${templates.map(t => `
      <div class="card mp-card" data-id="${esc(t.id)}" style="padding:14px;display:flex;flex-direction:column;gap:8px;cursor:pointer;transition:all .15s">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:9px;background:rgba(124,111,245,.12);color:#a9b0ff;display:flex;align-items:center;justify-content:center;flex:none">
            ${iconFor(t.category)}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px;color:#e6e9f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.label)}</div>
            <div class="cs-muted" style="font-size:11.5px">${esc(t.category)} · v${esc(t.version)}</div>
          </div>
          ${t.isOfficial ? '<span class="pill" style="background:rgba(52,211,153,.16);color:#34d399">official</span>' : ''}
        </div>
        <div class="cs-muted" style="font-size:12.5px;line-height:1.45;min-height:36px">${esc(t.desc)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${(t.tags || []).slice(0, 4).map(tg => `<span class="pill" style="background:rgba(255,255,255,.06);color:#a9b0ff">${esc(tg)}</span>`).join('')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto">
          <div class="cs-muted" style="font-size:11.5px">by ${esc(t.author)} · ${t.downloads || 0} dl</div>
          <button class="btn primary mp-install" data-id="${esc(t.id)}" style="padding:5px 10px;font-size:11.5px">Install</button>
        </div>
      </div>
    `).join('')}
  </div>
  ${templates.length === 0 ? `<div class="card" style="padding:30px;text-align:center;color:#8b93a7">No templates match your filters.</div>` : ''}
</div>
    `;
  }

function bindMarketplace(root) {
    if (!root) return;

    // Debounced search
    let t = null;
    root.querySelector('#mpSearch')?.addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => { S.marketplace = Object.assign({}, S.marketplace, { q: e.target.value }); render(); }, 200);
    });
    root.querySelector('#mpCategory')?.addEventListener('change', e => {
      S.marketplace = Object.assign({}, S.marketplace, { category: e.target.value });
      render();
    });
    root.querySelector('#mpSync')?.addEventListener('click', async () => {
      const btn = root.querySelector('#mpSync');
      btn.disabled = true; btn.textContent = 'Syncing…';
      try {
        const r = await window.TemplateMarketplace.sync();
        toast('Synced ' + r.length + ' templates', '#34d399');
        render();
      } catch (e) { toast('Sync failed: ' + e.message, '#ef4444'); }
      finally { btn.disabled = false; btn.textContent = 'Sync'; }
    });
    root.querySelector('#mpPublish')?.addEventListener('click', async () => {
      const id = prompt('Template id (a-z, 0-9, dash):');
      if (!id) return;
      const label = prompt('Template label:') || id;
      const desc = prompt('Short description:') || '';
      const category = prompt('Category (frontend, fullstack, backend, mobile, desktop, tooling):') || 'custom';
      const r = await window.TemplateMarketplace.publish({ id, label, desc, category });
      if (r.ok) {
        toast('Published "' + id + '" with ' + r.fileCount + ' files', '#34d399');
        render();
      } else {
        toast('Publish failed: ' + r.reason, '#ef4444');
      }
    });

    // Card click -> preview modal
    root.querySelectorAll('.mp-card').forEach(el => {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('.mp-install')) return; // ignore install clicks
        const id = el.dataset.id;
        const t = await window.TemplateMarketplace.get(id);
        if (!t) return;
        showPreview(t);
      });
    });
    // Install button
    root.querySelectorAll('.mp-install').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        btn.disabled = true; btn.textContent = 'Installing…';
        try {
          const r = await window.TemplateMarketplace.install(id);
          if (r.ok) toast('Installed ' + r.count + ' files', '#34d399');
          else toast('Install failed: ' + (r.reason || 'unknown'), '#ef4444');
        } catch (err) { toast('Install error: ' + err.message, '#ef4444'); }
        finally { btn.disabled = false; btn.textContent = 'Install'; }
      });
    });
  }

  function showPreview(t) {
    // Reuse the existing pipeline modal
    const modal = document.getElementById('pipelineModal');
    const grid = document.getElementById('pipelineModalGrid');
    const title = modal && modal.querySelector('div > div > div');
    if (title) title.textContent = t.label;
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;display:flex;flex-direction:column;gap:12px">
          <div class="cs-muted">${esc(t.desc)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(t.tags || []).map(tg => `<span class="pill" style="background:rgba(124,111,245,.16);color:#a9b0ff">${esc(tg)}</span>`).join('')}
          </div>
          <div class="cs-muted" style="font-size:12px">Category: <b>${esc(t.category)}</b> · Author: <b>${esc(t.author)}</b> · Version: <b>${esc(t.version)}</b> · Source: <b>${esc(t.source)}</b></div>
          <div class="cs-muted" style="font-size:12px">Downloads: <b>${t.downloads || 0}</b></div>
          ${t.plan ? `<div style="border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:10px;font-size:12.5px"><pre style="margin:0;color:#c7cddb;white-space:pre-wrap">${esc(JSON.stringify(t.plan, null, 2))}</pre></div>` : ''}
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button class="btn ghost" id="mpClose">Close</button>
            <button class="btn primary" id="mpInstallNow">Install this template</button>
          </div>
        </div>
      `;
      grid.querySelector('#mpClose')?.addEventListener('click', () => modal.style.display = 'none');
      grid.querySelector('#mpInstallNow')?.addEventListener('click', async () => {
        const r = await window.TemplateMarketplace.install(t.id);
        if (r.ok) {
          toast('Installed ' + r.count + ' files', '#34d399');
          modal.style.display = 'none';
        } else {
          toast('Install failed: ' + (r.reason || 'unknown'), '#ef4444');
        }
      });
    }
    if (modal) modal.style.display = 'block';
  }

  function render() {
    const main = document.getElementById('main');
    if (!main) return;
    renderMarketplace(S.marketplace).then(html => {
      main.innerHTML = html;
      bindMarketplace(main);
    });
  }

  // Re-render whenever the screen becomes 'marketplace'
  const _orig = window.renderAll;
  window.renderAll = function() {
    if (_orig) _orig();
    if (S && S.screen === 'marketplace') render();
  };

  window.MarketplaceUI = { render, showPreview };
})();
