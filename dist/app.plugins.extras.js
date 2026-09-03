/* =====================================================================
 * app.plugins.extras.js
 * Extra Plugin Hub UI (per the MiniMax MCP & Plugin Stack doc):
 *   - Copy install command per plugin
 *   - Generate MCP config (mcp.json) for the user's MCP client
 *   - Run all installed plugins
 *   - Environment probe
 *   - Phase progress (5 phases per doc section 10)
 *   - Capability router (8 agents per doc section 7)
 *
 * Loads after app.plugins.js.  Overrides renderRecoveryPluginHub() to
 * inject the new panels into the card rendered by app.plugins.js.
 * ===================================================================== */
(function () {
  'use strict';

  // ---- helpers ----
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied', '#34d399'); } catch (_) {}
    document.body.removeChild(ta);
  }

  // ---- global handlers ----
  window.pluginHubCopyInstall = function (id) {
    const p = window.PluginHub && window.PluginHub.byId(id);
    if (!p || !p.install) { if (window.toast) window.toast('No install command to copy', '#f59e0b'); return; }
    const text = p.install;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (window.toast) window.toast('Copied: ' + text.slice(0, 60) + (text.length > 60 ? '...' : ''), '#34d399');
      }, function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  };

  window.pluginHubCopyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { if (window.toast) window.toast('Copied', '#34d399'); }, function () { fallbackCopy(text); });
    } else { fallbackCopy(text); }
  };

  window.pluginHubGenerateConfig = function () {
    if (!window.PluginHub) return;
    const cfg = window.PluginHub.generateMcpConfig({ includeSovereign: true });
    const out = document.getElementById('pluginMcpConfigOut');
    if (!out) return;
    const json = JSON.stringify(cfg, null, 2);
    out.style.display = 'block';
    out.innerHTML = [
      '<div style="padding:12px;background:#0a0e1a;border:1px solid #22d3ee44;border-radius:8px">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">',
      '    <strong style="color:#22d3ee;font-size:12.5px">mcp.json (drop into your MCP client)</strong>',
      '    <div style="display:flex;gap:6px">',
      '      <button class="btn" style="padding:4px 10px;font-size:11px" onclick="pluginHubCopyText(document.getElementById(\'pluginMcpConfigJson\').textContent)">Copy JSON</button>',
      '      <button class="btn ghost" style="padding:4px 10px;font-size:11px" onclick="document.getElementById(\'pluginMcpConfigOut\').style.display=\'none\'">Close</button>',
      '    </div>',
      '  </div>',
      '  <pre id="pluginMcpConfigJson" style="margin:0;padding:10px;background:#070a11;border-radius:6px;font-size:11px;color:#c7cddb;overflow:auto;max-height:340px;white-space:pre-wrap;word-break:break-all">' + esc(json) + '</pre>',
      '  <div style="margin-top:8px;font-size:11px;color:#7b859c">',
      '    Save this as <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS), ',
      '    <code>%APPDATA%\\Claude\\claude_desktop_config.json</code> (Windows), or use it in Cursor / Continue. ',
      '    Replace the <code>${TOKEN}</code> placeholders with your real credentials.',
      '  </div>',
      '</div>'
    ].join('\r\n');
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.toast) window.toast('MCP config generated (' + Object.keys(cfg.mcpServers).length + ' servers + ' + (cfg.sovereign ? cfg.sovereign.length : 0) + ' sovereign)', '#34d399');
  };

  window.pluginHubRunAllInstalled = async function () {
    if (!window.PluginHub) return;
    const PH = window.PluginHub;
    const st = PH.state();
    const ids = Object.keys(st.installed || {});
    if (!ids.length) { if (window.toast) window.toast('No plugins installed yet - click Install first', '#f59e0b'); return; }
    if (window.toast) window.toast('Running ' + ids.length + ' installed plugin(s)...', '#22d3ee');
    const results = await PH.runAllInstalled();
    const ok = results.filter(function (r) { return r.ok; }).length;
    const fail = results.length - ok;
    if (window.toast) window.toast('Run-all complete: ' + ok + ' OK, ' + fail + ' failed', fail ? '#f59e0b' : '#34d399');
    if (window.Engine && window.Engine.V4Certificate) {
      try { window.Engine.V4Certificate.recordEvidence({ kind: 'plugin-run-all', total: results.length, ok: ok, fail: fail }); } catch (_) {}
    }
    if (typeof renderAll === 'function') { try { renderAll(); } catch (_) {} }
  };

  window.pluginHubShowProbe = function () {
    const PH = window.PluginHub;
    if (!PH) return;
    const probe = PH.probe ? PH.probe() : {};
    const out = document.getElementById('pluginProbeOut');
    if (!out) return;
    out.style.display = 'block';
    const rows = Object.keys(probe).map(function (k) {
      const v = probe[k];
      return '<tr><td style="padding:5px 10px;font-family:monospace;color:#c7cddb">' + esc(k) + '</td>' +
             '<td style="padding:5px 10px">' +
             (v
               ? '<span style="color:#34d399;font-weight:600">YES</span>'
               : '<span style="color:#94a3b8">no</span>') +
             '</td></tr>';
    }).join('');
    out.innerHTML = [
      '<div style="padding:12px;background:#0a0e1a;border:1px solid #60a5fa44;border-radius:8px">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">',
      '    <strong style="color:#60a5fa;font-size:12.5px">Environment Probe</strong>',
      '    <button class="btn ghost" style="padding:4px 10px;font-size:11px" onclick="document.getElementById(\'pluginProbeOut\').style.display=\'none\'">Close</button>',
      '  </div>',
      '  <table style="width:100%;border-collapse:collapse">' + rows + '</table>',
      '  <div style="margin-top:8px;font-size:11px;color:#7b859c">',
      '    The probe inspects the browser environment to detect whether each plugin required runtime is reachable. ',
      '    Docker / Git / Playwright are typically available on the host machine - not in the browser sandbox.',
      '  </div>',
      '</div>'
    ].join('\r\n');
  };

  // ---- panel renderers ----
  window.pluginHubRenderPhaseProgress = function () {
    if (!window.PluginHub) return '<div style="color:var(--muted);font-size:12px">PluginHub not loaded</div>';
    const phases = window.PluginHub.phaseProgress();
    return phases.map(function (p) {
      const color = p.installed === p.total ? '#34d399' : p.installed > 0 ? '#22d3ee' : '#3a4252';
      return [
        '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">',
        '  <div style="width:22px;height:22px;border-radius:50%;background:' + color + '22;border:1px solid ' + color + ';display:flex;align-items:center;justify-content:center;color:' + color + ';font-size:10.5px;font-weight:700">P' + p.n + '</div>',
        '  <div style="flex:1;min-width:0">',
        '    <div style="font-size:12px;color:#c7cddb">' + esc(p.name) + '</div>',
        '    <div style="font-size:10.5px;color:#7b859c">' + p.installed + ' / ' + p.total + ' installed (' + p.pct + '%)</div>',
        '  </div>',
        '  <div style="width:80px;height:6px;background:rgba(255,255,255,.05);border-radius:3px;overflow:hidden">',
        '    <div style="width:' + p.pct + '%;height:100%;background:' + color + '"></div>',
        '  </div>',
        '</div>'
      ].join('\r\n');
    }).join('');
  };

  window.pluginHubRenderCapabilityRouter = function () {
    if (!window.PluginHub) return '<div style="color:var(--muted);font-size:12px">PluginHub not loaded</div>';
    const agents = window.PluginHub.capabilityRouter();
    return agents.map(function (a) {
      const isOrch = a.name === 'Orchestrator';
      return [
        '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">',
        '  <div style="width:90px;flex:none;font-size:11.5px;color:' + (isOrch ? '#fbbf24' : '#a78bfa') + ';font-weight:600">' + esc(a.name) + '</div>',
        '  <div style="flex:1;display:flex;flex-wrap:wrap;gap:3px">',
          isOrch
            ? '<span style="font-size:10px;background:rgba(251,191,36,.12);color:#fbbf24;padding:2px 6px;border-radius:3px">all capabilities (audit-only)</span>'
            : a.caps.map(function (c) { return '<span style="font-size:10px;background:rgba(167,139,250,.12);color:#c4b5fd;padding:2px 6px;border-radius:3px">' + esc(c) + '</span>'; }).join('') || '<span style="font-size:10.5px;color:#7b859c">(no direct capabilities)</span>',
        '  </div>',
        '</div>'
      ].join('\r\n');
    }).join('');
  };

  // ---- Inject panels into the existing card by wrapping the renderer ----
  // The existing renderRecoveryPluginHub() returns HTML containing a closing
  // </div> for the card.  We append our panels before the final </div>.
  const extras = [
    '<div style="margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:14px">',
    '  <div class="cs-mini" style="padding:14px;border:1px solid #22d3ee33;border-radius:8px;background:#0f172a">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">',
    '      <h4 style="margin:0;font-size:12.5px;color:#22d3ee">Phase Progress (doc section 10)</h4>',
    '      <span style="font-size:10.5px;color:#7b859c">implementation priority</span>',
    '    </div>',
    '    <div id="pluginPhaseProgress">' + window.pluginHubRenderPhaseProgress() + '</div>',
    '  </div>',
    '  <div class="cs-mini" style="padding:14px;border:1px solid #a78bfa33;border-radius:8px;background:#0f172a">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">',
    '      <h4 style="margin:0;font-size:12.5px;color:#a78bfa">Capability Router (doc section 7)</h4>',
    '      <span style="font-size:10.5px;color:#7b859c">least-privilege per agent</span>',
    '    </div>',
    '    <div id="pluginCapabilityRouter">' + window.pluginHubRenderCapabilityRouter() + '</div>',
    '  </div>',
    '</div>',
    '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">',
    '  <button class="btn primary" style="padding:6px 12px;font-size:11.5px" onclick="pluginHubGenerateConfig()">Generate MCP Config</button>',
    '  <button class="btn" style="padding:6px 12px;font-size:11.5px" onclick="pluginHubRunAllInstalled()">Run All Installed</button>',
    '  <button class="btn ghost" style="padding:6px 12px;font-size:11.5px" onclick="pluginHubShowProbe()">Environment Probe</button>',
    '  <span style="font-size:11px;color:#7b859c;margin-left:6px">per the MiniMax MCP &amp; Plugin Stack doc</span>',
    '</div>',
    '<div id="pluginMcpConfigOut" style="display:none;margin-top:10px"></div>',
    '<div id="pluginProbeOut" style="display:none;margin-top:10px"></div>'
  ].join('\r\n');

  // Wrap the existing renderer
  const orig = window.renderRecoveryPluginHub;
  if (typeof orig === 'function') {
    window.renderRecoveryPluginHub = function () {
      const html = orig.apply(this, arguments);
      // Inject before the final closing </div> of the outer card
      const lastClose = html.lastIndexOf('</div>');
      if (lastClose === -1) return html;
      return html.slice(0, lastClose) + extras + html.slice(lastClose);
    };
    console.log('app.plugins.extras.js: wrapped renderRecoveryPluginHub');
  } else {
    console.warn('app.plugins.extras.js: renderRecoveryPluginHub not found yet - will patch later');
  }

  // Also: re-inject Copy buttons + new panels after the renderer is wrapped.
  // We do this by post-processing: wrap each card so a Copy button appears.
  if (typeof orig === 'function') {
    const orig2 = window.renderRecoveryPluginHub;
    window.renderRecoveryPluginHub = function () {
      let html = orig2.apply(this, arguments);
      // Add Copy button to each card after the Run button
      html = html.replace(
        /onclick="pluginHubAction\('([^']+)','run'\)">Run<\/button>/g,
        function (_, id) {
          return 'onclick="pluginHubAction(\'' + id + '\',\'run\')">Run</button>' +
                 '<button class="btn ghost" style="padding:5px 10px;font-size:11.5px" onclick="pluginHubCopyInstall(\'' + id + '\')" title="Copy install command">Copy</button>';
        }
      );
      return html;
    };
  }
})();
