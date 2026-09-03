/* =====================================================================
 * app.plugins.js
 * Plugin & MCP Hub UI for the Recovery screen.
 *
 * Exposes:
 *   - renderRecoveryPluginHub()  - HTML for the Plugin & MCP Hub card
 *   - pluginHubAction(id, action) - dispatch install / uninstall / detect / run
 *   - pluginHubInstallAll()       - mark all external MCPs as installed
 *   - pluginHubReset()            - reset install state and audit
 * ===================================================================== */

function renderRecoveryPluginHub(){
  if (!window.PluginHub) {
    return '<div style="padding:20px;color:var(--muted);text-align:center">PluginHub not loaded - ensure engine.plugins.js is included</div>';
  }
  const PH = window.PluginHub;
  const summary = PH.summary();
  const installed = PH.state().installed || {};
  const recentRuns = (function(){
    const all = [];
    Object.keys(PH.state().runs || {}).forEach(function(id){
      (PH.state().runs[id] || []).forEach(function(r){
        all.push(Object.assign({ id: id }, r));
      });
    });
    all.sort(function(a,b){ return b.at - a.at; });
    return all.slice(0, 10);
  })();

  function card(p, isExternal){
    const det = PH.detect(p);
    const inst = !!installed[p.id];
    const tier = p.tier || (p.sovereign ? 'sovereign' : 'plugin');
    const tierColor = p.sovereign ? '#a78bfa' :
                      tier === 'essential' ? '#22d3ee' :
                      tier === 'essential-fullstack' ? '#34d399' :
                      tier === 'strongly-recommended' ? '#60a5fa' :
                      tier === 'recovery' ? '#f472b6' :
                      tier === 'reference' ? '#c084fc' :
                      tier === 'optional' ? '#94a3b8' : '#94a3b8';
    const caps = (p.capabilities || []).slice(0, 4).map(function(c){
      return '<span style="font-size:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:3px;padding:1px 5px;margin:1px;display:inline-block">' + esc(c) + '</span>';
    }).join('');
    const extra = (p.capabilities || []).length > 4
      ? '<span style="font-size:10px;color:var(--muted);margin-left:2px">+' + ((p.capabilities || []).length - 4) + '</span>'
      : '';
    const installLine = p.install
      ? '<div style="font-family:monospace;font-size:10.5px;background:#0a0e1a;border:1px solid rgba(255,255,255,.08);border-radius:5px;padding:5px 7px;color:#a9b0ff;margin-top:6px;word-break:break-all"><span style="color:#7b859c">$ </span>' + esc(p.install) + '</div>'
      : '';
    const hintLine = p.hint
      ? '<div style="font-size:11px;color:#7b859c;margin-top:4px">' + esc(p.hint) + '</div>'
      : '';
    const linkLine = p.link
      ? '<a href="' + esc(p.link) + '" target="_blank" rel="noopener" style="font-size:11px;color:#60a5fa;text-decoration:none">docs &#8599;</a>'
      : '';
    const statusBadge = inst
      ? '<span style="font-size:10px;background:#34d39922;color:#34d399;border:1px solid #34d39955;padding:2px 6px;border-radius:3px">INSTALLED</span>'
      : '<span style="font-size:10px;background:rgba(255,255,255,.05);color:#94a3b8;border:1px solid rgba(255,255,255,.08);padding:2px 6px;border-radius:3px">AVAILABLE</span>';
    return [
      '<div class="cs-v4card" style="padding:12px;border:1px solid ' + tierColor + '33;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px">',
      '    <div style="font-size:12.5px;font-weight:600;color:' + tierColor + ';flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name) + '</div>',
      '    ' + statusBadge,
      '  </div>',
      '  <div style="font-size:10.5px;color:#7b859c;margin-bottom:4px">' + esc(p.vendor || 'CodeSovereign') + ' &middot; ' + esc(p.category) + ' &middot; ' + esc(tier) + '</div>',
      '  <div style="font-size:11.5px;color:#c7cddb;line-height:1.45;margin-bottom:6px">' + esc(p.description) + '</div>',
      '  <div style="margin-bottom:4px">' + caps + extra + '</div>',
        installLine,
        hintLine,
      '  <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">',
      '    <button class="btn" style="padding:5px 10px;font-size:11.5px" onclick="pluginHubAction(\'' + esc(p.id) + '\',\'detect\')">Detect</button>',
      '    <button class="btn" style="padding:5px 10px;font-size:11.5px" onclick="pluginHubAction(\'' + esc(p.id) + '\',\'run\')">Run</button>',
      inst
        ? '<button class="btn ghost" style="padding:5px 10px;font-size:11.5px" onclick="pluginHubAction(\'' + esc(p.id) + '\',\'uninstall\')">Uninstall</button>'
        : '<button class="btn primary" style="padding:5px 10px;font-size:11.5px" onclick="pluginHubAction(\'' + esc(p.id) + '\',\'install\')">Install</button>',
        linkLine,
      '  </div>',
      '  <div id="plugin-out-' + esc(p.id) + '" style="margin-top:6px;font-size:10.5px;font-family:monospace;color:var(--muted);min-height:14px"></div>',
      '</div>'
    ].join('\r\n');
  }

  const externalCards = PH.externalList().map(function(p){ return card(p, true); }).join('\r\n');
  const sovereignCards = PH.sovereignList().map(function(p){ return card(p, false); }).join('\r\n');

  const audit = recentRuns.length === 0
    ? '<div style="color:var(--muted);font-size:12px">No plugin activity yet. Click Run on any plugin to populate the audit log.</div>'
    : '<table style="width:100%;border-collapse:collapse;font-size:11.5px">' +
        '<thead><tr style="text-align:left;color:#7b859c">' +
        '<th style="padding:6px 4px">Plugin</th><th>When</th><th>Duration</th><th>Result</th><th>Output</th>' +
        '</tr></thead><tbody>' +
        recentRuns.map(function(r){
          return '<tr style="border-top:1px solid rgba(255,255,255,.06)">' +
            '<td style="padding:6px 4px;color:#a9b0ff">' + esc(r.id) + '</td>' +
            '<td style="color:#7b859c">' + esc(fmtTimeAgo(r.at)) + '</td>' +
            '<td style="color:#7b859c">' + (r.durationMs || 0) + 'ms</td>' +
            '<td style="color:' + (r.ok ? '#34d399' : '#ef4444') + '">' + (r.ok ? 'OK' : 'FAIL') + '</td>' +
            '<td style="color:#c7cddb;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.output || '') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';

  return [
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px">',
      '<div class="cs-mini" style="padding:12px;border:1px solid #6ee7b733;border-radius:8px;background:#0f172a">',
        '<div style="font-size:10.5px;color:#6ee7b7;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total Plugins</div>',
        '<div style="font-size:22px;font-weight:700">' + summary.totalPlugins + '</div>',
        '<div style="font-size:10.5px;color:var(--muted)">' + summary.externalCount + ' external + ' + summary.sovereignCount + ' sovereign</div>',
      '</div>',
      '<div class="cs-mini" style="padding:12px;border:1px solid #60a5fa33;border-radius:8px;background:#0f172a">',
        '<div style="font-size:10.5px;color:#60a5fa;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Installed</div>',
        '<div style="font-size:22px;font-weight:700">' + summary.installed + '</div>',
        '<div style="font-size:10.5px;color:var(--muted)">across all categories</div>',
      '</div>',
      '<div class="cs-mini" style="padding:12px;border:1px solid #a78bfa33;border-radius:8px;background:#0f172a">',
        '<div style="font-size:10.5px;color:#a78bfa;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Recent Runs</div>',
        '<div style="font-size:22px;font-weight:700">' + recentRuns.length + '</div>',
        '<div style="font-size:10.5px;color:var(--muted)">last 10 plugin invocations</div>',
      '</div>',
      '<div class="cs-mini" style="padding:12px;border:1px solid #fbbf2433;border-radius:8px;background:#0f172a">',
        '<div style="font-size:10.5px;color:#fbbf24;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">All Free</div>',
        '<div style="font-size:22px;font-weight:700">$0</div>',
        '<div style="font-size:10.5px;color:var(--muted)">external MCPs (free tier)</div>',
      '</div>',
    '</div>',

    '<div style="margin-top:6px">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">',
    '    <h4 style="margin:0;font-size:12.5px;color:#c7cddb">Free External MCP Servers (' + PH.externalList().length + ')</h4>',
    '    <div style="display:flex;gap:6px">',
    '      <button class="btn" style="padding:4px 10px;font-size:11px" onclick="pluginHubInstallAll()">Install All External</button>',
    '      <button class="btn ghost" style="padding:4px 10px;font-size:11px" onclick="pluginHubReset()">Reset State</button>',
    '    </div>',
    '  </div>',
    '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px">',
         externalCards,
    '  </div>',
    '</div>',

    '<div style="margin-top:18px">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">',
    '    <h4 style="margin:0;font-size:12.5px;color:#c7cddb">CodeSovereign Sovereign MCP Suite (' + PH.sovereignList().length + ')</h4>',
    '    <span style="font-size:11px;color:#7b859c">bundled with the engine &middot; free &middot; no install required</span>',
    '  </div>',
    '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px">',
         sovereignCards,
    '  </div>',
    '</div>',

    '<div style="margin-top:18px">',
    '  <h4 style="margin:0 0 8px;font-size:12.5px;color:#c7cddb">Plugin Activity Audit</h4>',
      audit,
    '</div>',

    '<div style="margin-top:18px;padding:12px;border:1px dashed rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.02)">',
    '  <h4 style="margin:0 0 6px;font-size:12.5px;color:#c7cddb">How to install a free MCP</h4>',
    '  <ol style="margin:0;padding-left:18px;color:#c7cddb;font-size:12px;line-height:1.7">',
    '    <li>Click <b>Install</b> on a free MCP card. CodeSovereign records the install intent and shows the exact <code>npx</code> / <code>docker</code> command.</li>',
    '    <li>Run the command in a terminal that has <a href="https://nodejs.org" target="_blank" rel="noopener" style="color:#60a5fa">Node.js</a> (for <code>npx</code>) or <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noopener" style="color:#60a5fa">Docker Desktop</a> installed.</li>',
    '    <li>Add the resulting MCP server to your MCP client (Claude Desktop, Cursor, Continue, etc.) or to a Docker MCP Gateway.</li>',
    '    <li>Click <b>Detect</b> to verify the plugin is reachable and <b>Run</b> to issue a real round-trip through PluginHub.</li>',
    '  </ol>',
    '  <div style="margin-top:6px;font-size:11px;color:#7b859c">All 10 external MCPs are open source. The sovereign suite ships with the engine. See the <code>CodeSovereign_MiniMax_MCP_Plugin_Stack.docx</code> document for the full reference architecture.</div>',
    '</div>'
  ].join('\r\n');
}

async function pluginHubAction(id, action){
  if (!window.PluginHub){ toast('PluginHub not loaded', '#ef4444'); return; }
  const out = document.getElementById('plugin-out-' + id);
  const write = function(s){ if (out) out.textContent = s; };
  try {
    if (action === 'install') {
      const r = window.PluginHub.install(id);
      write('installed command: ' + (r.command || '(bundled)'));
      toast('Plugin installed: ' + id, '#34d399');
    } else if (action === 'uninstall') {
      window.PluginHub.uninstall(id);
      write('uninstalled');
      toast('Plugin removed: ' + id, '#f59e0b');
    } else if (action === 'detect') {
      const p = window.PluginHub.byId(id);
      const d = window.PluginHub.detect(p);
      write('detect -> ' + (d.ok ? 'OK' : 'FAIL') + '  ' + d.reason);
      toast('Detect ' + id + ': ' + (d.ok ? 'OK' : 'FAIL'), d.ok ? '#34d399' : '#ef4444');
    } else if (action === 'run') {
      write('running...');
      const r = await window.PluginHub.run(id);
      write('[' + (r.capability || 'ping') + '] ' + (r.output || ''));
      toast('Run ' + id + ': ' + (r.ok ? 'OK' : 'FAIL'), r.ok ? '#34d399' : '#ef4444');
    }
    if (window.Engine && window.Engine.V4Certificate) {
      try { window.Engine.V4Certificate.recordEvidence({ kind: 'plugin-action', id: id, action: action }); } catch(_){}
    }
    if (typeof renderAll === 'function') {
      try { renderAll(); } catch(_){}
    } else if (typeof S !== 'undefined' && S && S.activeTab === 'recovery') {
      const main = document.getElementById('main');
      if (main) main.innerHTML = renderRecovery();
    }
  } catch (e) {
    write('error: ' + (e.message || e));
    toast('Plugin action failed: ' + e.message, '#ef4444');
  }
}

function pluginHubInstallAll(){
  if (!window.PluginHub) return;
  const ext = window.PluginHub.externalList();
  ext.forEach(function(p){ window.PluginHub.install(p.id); });
  toast('Installed all ' + ext.length + ' external MCPs (recorded)', '#34d399');
  if (window.Engine && window.Engine.V4Certificate) {
    try { window.Engine.V4Certificate.recordEvidence({ kind: 'plugin-install-all', count: ext.length }); } catch(_){}
  }
  if (typeof renderAll === 'function') { try { renderAll(); } catch(_){} }
}

function pluginHubReset(){
  if (!window.PluginHub) return;
  if (!confirm('Reset all plugin install state and audit history?')) return;
  window.PluginHub.reset();
  toast('Plugin hub state reset', '#f59e0b');
  if (typeof renderAll === 'function') { try { renderAll(); } catch(_){} }
}
