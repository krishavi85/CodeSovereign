/* =====================================================================
 * app.bus_ui.js
 * Cross-Tab Communication audit panel.
 *
 * Rendered as a card inside the Recovery tab.  Shows:
 *   - Service matrix: which tabs can fulfill which actions
 *   - Request matrix: who has called whom (inferred from audit history)
 *   - Audit log: every request, broadcast, navigate, register
 *   - Test buttons: send a cross-tab request and see it resolve
 *
 * Depends on window.TabBus (app.bus.js) and window.S (app.js).
 * ===================================================================== */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function timeAgo(ms) {
    const d = new Date(ms);
    const t = d.toTimeString().slice(0, 8);
    return t;
  }
  function shortenPayload(p) {
    if (p == null) return '';
    try {
      const s = typeof p === 'string' ? p : JSON.stringify(p);
      return s.length > 80 ? s.slice(0, 77) + '...' : s;
    } catch (_) { return '<unserializable>'; }
  }

  // ---- service matrix ----
  function renderServiceMatrix(svcs) {
    const tabs = (window.TabBus && window.TabBus.tabs) ? window.TabBus.tabs() : [];
    const allActions = new Set();
    tabs.forEach(function (t) {
      (svcs[t.id] && svcs[t.id].actions ? svcs[t.id].actions : []).forEach(function (a) { allActions.add(a); });
    });
    const actionList = Array.from(allActions).sort();
    if (!actionList.length) {
      return '<div style="padding:10px 12px;color:#7b859c;font-size:12.5px">No services registered yet.  Click <b>Register Demo Services</b> below to populate the matrix.</div>';
    }
    let html = '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="background:rgba(255,255,255,.04)">';
    html += '<th style="text-align:left;padding:8px 10px;color:#9aa3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.6px">Action \\ Tab</th>';
    tabs.forEach(function (t) {
      html += '<th style="padding:8px 6px;text-align:center;color:' + t.color + ';font-weight:600;font-size:11.5px">' + esc(t.label) + '</th>';
    });
    html += '</tr></thead><tbody>';
    actionList.forEach(function (act, idx) {
      const stripe = idx % 2 ? 'rgba(255,255,255,.015)' : 'transparent';
      html += '<tr style="background:' + stripe + '">';
      html += '<td style="padding:6px 10px;font-family:JetBrains Mono,monospace;color:#c7cddb;border-top:1px solid rgba(255,255,255,.04)">' + esc(act) + '</td>';
      tabs.forEach(function (t) {
        const has = (svcs[t.id] && svcs[t.id].actions || []).indexOf(act) !== -1;
        html += '<td style="padding:6px 6px;text-align:center;border-top:1px solid rgba(255,255,255,.04)">' +
                (has
                  ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + t.color + ';box-shadow:0 0 6px ' + t.color + '"></span>'
                  : '<span style="color:#3a4252">&middot;</span>') +
                '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  // ---- request matrix (who has called whom) ----
  function renderRequestMatrix(matrix) {
    const tabs = (window.TabBus && window.TabBus.tabs) ? window.TabBus.tabs() : [];
    const total = tabs.reduce(function (s, t) {
      return s + tabs.reduce(function (ss, u) { return ss + (matrix[t.id] && matrix[t.id][u.id] || 0); }, 0);
    }, 0);
    if (!total) {
      return '<div style="padding:10px 12px;color:#7b859c;font-size:12.5px">No inter-tab requests have been logged yet.  Trigger a test below.</div>';
    }
    let html = '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="background:rgba(255,255,255,.04)">';
    html += '<th style="text-align:left;padding:8px 10px;color:#9aa3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.6px">From \\ To</th>';
    tabs.forEach(function (t) {
      html += '<th style="padding:8px 6px;text-align:center;color:' + t.color + ';font-weight:600;font-size:11.5px">' + esc(t.label) + '</th>';
    });
    html += '</tr></thead><tbody>';
    tabs.forEach(function (row, i) {
      const stripe = i % 2 ? 'rgba(255,255,255,.015)' : 'transparent';
      html += '<tr style="background:' + stripe + '">';
      html += '<td style="padding:6px 10px;color:' + row.color + ';font-weight:600;border-top:1px solid rgba(255,255,255,.04)">' + esc(row.label) + '</td>';
      tabs.forEach(function (col) {
        const v = matrix[row.id] && matrix[row.id][col.id] || 0;
        const tone = row.id === col.id ? '#3a4252' : (v > 0 ? col.color : '#3a4252');
        const bg = v > 0 ? 'rgba(109,93,252,.12)' : 'transparent';
        html += '<td style="padding:6px 6px;text-align:center;color:' + tone + ';background:' + bg + ';font-weight:' + (v > 0 ? '600' : '400') + ';border-top:1px solid rgba(255,255,255,.04)">' + (v || '-') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  // ---- audit log ----
  function renderAudit(entries) {
    if (!entries || !entries.length) {
      return '<div style="padding:14px;color:#7b859c;font-size:12.5px">Audit log is empty.  Trigger a test to populate.</div>';
    }
    let html = '<div style="max-height:300px;overflow:auto">';
    entries.forEach(function (e) {
      const kindColor = {
        'request': '#60a5fa',
        'broadcast': '#a78bfa',
        'register': '#34d399',
        'navigate': '#22d3ee',
        'unregister': '#f472b6',
        'engine-event': '#94a3b8',
        'engine-event-replay': '#64748b'
      }[e.kind] || '#9aa3b8';
      const okMark = e.ok === false
        ? '<span style="color:#ef4444;font-weight:700">FAIL</span>'
        : (e.ok === null
          ? '<span style="color:#f59e0b">PEND</span>'
          : '<span style="color:#34d399">OK</span>');
      html += '<div style="display:grid;grid-template-columns:78px 110px 1fr 60px 50px;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-size:11.5px;align-items:center">';
      html += '<span style="color:#7b859c;font-family:JetBrains Mono,monospace">' + esc(timeAgo(e.at)) + '</span>';
      html += '<span style="color:' + kindColor + ';font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.4px">' + esc(e.kind) + '</span>';
      html += '<span style="color:#c7cddb;font-family:JetBrains Mono,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">';
      if (e.kind === 'request' || e.kind === 'broadcast' || e.kind === 'navigate' || e.kind === 'register') {
        const from = esc(e.from || '-');
        const arrow = e.to ? ' &rarr; <b style="color:#e6e9f2">' + esc(e.to) + '</b>' : '';
        const act = e.action ? ' <span style="color:#7c6ff5">' + esc(e.action) + '</span>' : '';
        const payload = e.payload !== undefined ? ' <span style="color:#7b859c">' + esc(shortenPayload(e.payload)) + '</span>' : '';
        html += from + arrow + act + payload;
      } else if (e.kind === 'engine-event' || e.kind === 'engine-event-replay') {
        html += '<span style="color:#7c6ff5">' + esc(e.action || '-') + '</span> <span style="color:#7b859c">' + esc(shortenPayload(e.payload)) + '</span>';
      } else {
        html += esc(JSON.stringify(e).slice(0, 120));
      }
      html += '</span>';
      html += '<span>' + okMark + '</span>';
      html += '<span style="color:#7b859c;text-align:right;font-family:JetBrains Mono,monospace">' + (e.ms != null ? e.ms + 'ms' : '') + '</span>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // ---- the main card ----
  function renderCrossTabCard() {
    if (!window.TabBus) {
      return '<div class="card" style="padding:16px"><h2 class="cs-h2" style="margin:0 0 8px">Cross-Tab Communication</h2><p class="cs-muted">TabBus not loaded.</p></div>';
    }
    const svcs = window.TabBus.services();
    const matrix = window.TabBus.matrix();
    const audit = window.TabBus.audit(60);

    // stats
    let reqCount = 0, okCount = 0, errCount = 0, lastKind = '-';
    audit.forEach(function (e) {
      if (e.kind === 'request') {
        reqCount++;
        if (e.ok === true) okCount++;
        if (e.ok === false) errCount++;
      }
    });
    if (audit.length) lastKind = audit[0].kind;

    const tabOpts = (window.TabBus.tabs() || []).map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.label) + '</option>';
    }).join('');

    return ''
      + '<div class="card" style="padding:18px;margin-bottom:14px">'
      +   '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
      +     '<span style="width:8px;height:8px;border-radius:50%;background:#22d3ee;box-shadow:0 0 8px #22d3ee"></span>'
      +     '<h2 class="cs-h2" style="margin:0;flex:1">Cross-Tab Communication</h2>'
      +     '<span class="pill" style="background:rgba(34,211,238,.15);color:#22d3ee">' + audit.length + ' entries</span>'
      +   '</div>'
      +   '<p class="cs-muted" style="margin:0 0 14px">Each tab registers the actions it can fulfill.  Other tabs send <code>TabBus.request(target, action, payload)</code> and get a Promise back.  Every call is recorded in the audit log below and in the V4 certificate as evidence.</p>'
      +   '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">'
      +     statCard('Registered services', Object.keys(svcs).filter(function(k){return (svcs[k].actions||[]).length>0}).length + ' / ' + (window.TabBus.tabs()||[]).length, '#22d3ee')
      +     statCard('Inter-tab requests', reqCount, '#60a5fa')
      +     statCard('Successful', okCount, '#34d399')
      +     statCard('Failed', errCount, errCount > 0 ? '#ef4444' : '#7b859c')
      +   '</div>'
      +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">'
      +     section('Service Matrix &mdash; who can fulfill what', renderServiceMatrix(svcs))
      +     section('Request Matrix &mdash; who has called whom', renderRequestMatrix(matrix))
      +   '</div>'
      +   '<div class="card" style="padding:14px;background:rgba(255,255,255,.02);margin-bottom:14px">'
      +     '<h3 class="cs-h3" style="margin:0 0 10px">Send a cross-tab request</h3>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr 1.4fr auto;gap:8px;align-items:end">'
      +       '<div><label style="display:block;font-size:11px;color:#7b859c;margin-bottom:4px">Target tab</label>'
      +         '<select id="busTarget" style="width:100%;padding:8px;border-radius:6px;background:#0c1120;color:#e6e9f2;border:1px solid rgba(255,255,255,.1)">' + tabOpts + '</select></div>'
      +       '<div><label style="display:block;font-size:11px;color:#7b859c;margin-bottom:4px">Action</label>'
      +         '<input id="busAction" placeholder="e.g. openFile" style="width:100%;padding:8px;border-radius:6px;background:#0c1120;color:#e6e9f2;border:1px solid rgba(255,255,255,.1);font-family:JetBrains Mono,monospace;font-size:12.5px"></div>'
      +       '<div><label style="display:block;font-size:11px;color:#7b859c;margin-bottom:4px">Payload (JSON)</label>'
      +         '<input id="busPayload" placeholder=\'{"path":"src/main.js"}\' value="{}" style="width:100%;padding:8px;border-radius:6px;background:#0c1120;color:#e6e9f2;border:1px solid rgba(255,255,255,.1);font-family:JetBrains Mono,monospace;font-size:12.5px"></div>'
      +       '<div style="display:flex;gap:6px">'
      +         '<button class="btn primary" onclick="busSendRequest()">Send</button>'
      +         '<button class="btn ghost" onclick="busClearAudit()">Clear</button>'
      +       '</div>'
      +     '</div>'
      +     '<div id="busResponse" style="margin-top:10px;padding:10px;background:#0a0e1a;border-radius:8px;font-family:JetBrains Mono,monospace;font-size:12px;color:#c7cddb;display:none;white-space:pre-wrap;overflow:auto;max-height:180px"></div>'
      +   '</div>'
      +   '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">'
      +     '<button class="btn ghost" onclick="busRegisterDemo()">Register Demo Services</button>'
      +     '<button class="btn ghost" onclick="busBroadcastHello()">Broadcast "hello" event</button>'
      +     '<button class="btn ghost" onclick="busRunRoundTrip()">Run a 4-tab round-trip</button>'
      +     '<button class="btn ghost" onclick="busRefresh()">Refresh</button>'
      +   '</div>'
      +   section('Audit Log &mdash; last ' + audit.length + ' events', renderAudit(audit), true)
      + '</div>';
  }

  function statCard(label, val, color) {
    return '<div style="padding:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);border-radius:10px">'
         +   '<div style="font-size:10.5px;color:#7b859c;text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:6px">' + esc(label) + '</div>'
         +   '<div style="font:700 22px Inter,sans-serif;color:' + color + '">' + esc(val) + '</div>'
+ '</div>';
  }
  function section(title, body, open) {
    return '<div class="card" style="padding:14px;background:rgba(255,255,255,.02)">'
         +   '<h3 class="cs-h3" style="margin:0 0 10px">' + title + '</h3>'
         +   body
         + '</div>';
  }

  // ---- global handlers exposed for onclick ----
  window.busSendRequest = function () {
    const target = document.getElementById('busTarget').value;
    const action = document.getElementById('busAction').value.trim();
    const raw = document.getElementById('busPayload').value || '{}';
    let payload = {};
    try { payload = JSON.parse(raw); } catch (e) { payload = { _raw: raw, _parseError: e.message }; }
    const out = document.getElementById('busResponse');
    out.style.display = 'block';
    out.textContent = 'Sending request...';
    window.TabBus.request(target, action, payload).then(function (r) {
      out.textContent = 'OK (' + (r && r.action ? r.action : action) + ')\n' + JSON.stringify(r, null, 2);
      out.style.borderLeft = '3px solid #34d399';
      window.busRefresh();
    }).catch(function (e) {
      out.textContent = 'FAIL: ' + (e && e.message ? e.message : String(e));
      out.style.borderLeft = '3px solid #ef4444';
      window.busRefresh();
    });
  };
  window.busClearAudit = function () {
    if (window.TabBus) window.TabBus.clearAudit();
    window.busRefresh();
  };
  window.busRegisterDemo = function () {
    if (window.TabBus) window.TabBus.broadcast('register:demo', { at: Date.now() });
    window.busRefresh();
  };
  window.busBroadcastHello = function () {
    if (window.TabBus) {
      const r = window.TabBus.broadcast('hello', { msg: 'hi from cross-tab panel', at: Date.now() });
      document.getElementById('busResponse').style.display = 'block';
      document.getElementById('busResponse').textContent = 'Broadcast "hello" -> ' + r.listeners + ' listener(s)';
      document.getElementById('busResponse').style.borderLeft = '3px solid #a78bfa';
    }
    window.busRefresh();
  };
  window.busRunRoundTrip = async function () {
    const out = document.getElementById('busResponse');
    out.style.display = 'block';
    out.textContent = 'Running round-trip...';
    try {
      const r1 = await window.TabBus.request('agent', 'ping', { from: 'recovery' });
      const r2 = await window.TabBus.request('ide', 'openFile', { path: 'src/index.js' });
      const r3 = await window.TabBus.request('recovery', 'runValidatorScan', {});
      const r4 = await window.TabBus.request('factory', 'listPipelines', {});
      out.textContent = 'Round-trip complete:\n'
        + '1. agent.ping         -> ' + JSON.stringify(r1) + '\n'
        + '2. ide.openFile       -> ' + JSON.stringify(r2) + '\n'
        + '3. recovery.scan      -> ' + JSON.stringify(r3) + '\n'
        + '4. factory.listPipes  -> ' + JSON.stringify(r4);
      out.style.borderLeft = '3px solid #34d399';
    } catch (e) {
      out.textContent = 'Round-trip FAILED: ' + e.message + '\n(Tip: click "Register Demo Services" first)';
      out.style.borderLeft = '3px solid #ef4444';
    }
    window.busRefresh();
  };
  window.busRefresh = function () {
    // Re-render the recovery screen if that's where we are
    try {
      if (typeof S !== 'undefined' && S && S.screen === 'recovery' && typeof renderAll === 'function') {
        renderAll();
      }
    } catch (_) {}
  };

  // ---- auto-register demo services so the user can try the round-trip
  // without writing a single line of code ----
  function registerDemoServices() {
    if (!window.TabBus) return;
    // Welcome
    window.TabBus.register('welcome', {
      ping: function (p) { return { ok: true, action: 'ping', echo: p }; },
      getStarted: function () {
        try { if (typeof S !== 'undefined') S.screen = 'universal'; if (typeof renderAll === 'function') renderAll(); } catch (_) {}
        return { ok: true, navigated: 'universal' };
      }
    });
    // Universal
    window.TabBus.register('universal', {
      ping: function (p) { return { ok: true, action: 'ping', echo: p }; },
      listProjects: function () {
        try {
          const list = (window.Engine && window.Engine.Projects && window.Engine.Projects.list) ? window.Engine.Projects.list() : [];
          return { ok: true, count: list.length, projects: list.slice(0, 10).map(function (p) { return p.name || p.id; }) };
        } catch (e) { return { ok: false, error: e.message }; }
      }
    });
    // Agent
    window.TabBus.register('agent', {
      ping: function (p) { return { ok: true, action: 'ping', echo: p, ts: Date.now() }; },
      chat: function (p) {
        try {
          if (typeof S !== 'undefined' && S) { S.screen = 'agent'; if (typeof renderAll === 'function') renderAll(); }
          return { ok: true, navigated: 'agent', prompt: p && p.prompt };
        } catch (e) { return { ok: false, error: e.message }; }
      }
    });
    // IDE
    window.TabBus.register('ide', {
      ping: function (p) { return { ok: true, action: 'ping', echo: p }; },
      openFile: function (p) {
        try {
          if (typeof S !== 'undefined' && S) {
            S.screen = 'ide';
            if (p && p.path) { S.ideFile = p.path; }
            if (typeof renderAll === 'function') renderAll();
          }
          return { ok: true, navigated: 'ide', file: p && p.path };
        } catch (e) { return { ok: false, error: e.message }; }
      }
    });
    // Factory
    window.TabBus.register('factory', {
      ping: function (p) { return { ok: true, action: 'ping', echo: p }; },
      listPipelines: function () {
        try {
          if (window.PipelineBuilder && window.PipelineBuilder.list) {
            const list = window.PipelineBuilder.list();
            return { ok: true, count: list.length, names: list.slice(0, 10).map(function (x) { return x.name || x.id; }) };
          }
          return { ok: true, count: 0, names: [] };
        } catch (e) { return { ok: false, error: e.message }; }
      }
    });
    // Pipelines
    window.TabBus.register('pipelines', {
      ping: function (p) { return { ok: true, action: 'ping', echo: p }; },
      run: function (p) {
        try {
          if (typeof S !== 'undefined' && S) { S.screen = 'pipelines'; if (typeof renderAll === 'function') renderAll(); }
          return { ok: true, navigated: 'pipelines' };
        } catch (e) { return { ok: false, error: e.message }; }
      }
    });
    // Recovery
    window.TabBus.register('recovery', {
      ping: function (p) { return { ok: true, action: 'ping', echo: p }; },
      runValidatorScan: function () {
        try {
          if (window.Engine && window.Engine.Validator && window.Engine.Validator.scan) {
            const r = window.Engine.Validator.scan();
            const issues = r && r.issues ? r.issues : [];
            return { ok: true, issues: issues.length, byClass: countBy(issues, 'faultClass') };
          }
          return { ok: true, issues: 0, note: 'Validator not loaded' };
        } catch (e) { return { ok: false, error: e.message }; }
      }
    });
    // Settings
    window.TabBus.register('settings', {
      ping: function (p) { return { ok: true, action: 'ping', echo: p }; },
      get: function (p) {
        try {
          if (typeof S !== 'undefined' && S) { S.screen = 'settings'; if (typeof renderAll === 'function') renderAll(); }
          return { ok: true, navigated: 'settings' };
        } catch (e) { return { ok: false, error: e.message }; }
      }
    });
  }
  function countBy(arr, key) {
    const out = {};
    (arr || []).forEach(function (x) { const k = x[key] || 'unknown'; out[k] = (out[k] || 0) + 1; });
    return out;
  }

  // ---- the entry point: return HTML for the card ----
  window.renderCrossTabCard = renderCrossTabCard;
  window.busRegisterDemoServices = registerDemoServices;

  // Auto-register on load (deferred so the bus has time to bind to engine)
  setTimeout(function () {
    if (window.TabBus){
      registerDemoServices();
      if (window.TabBus.bindEngineEventBus) window.TabBus.bindEngineEventBus();
    }
  }, 0);

})();
