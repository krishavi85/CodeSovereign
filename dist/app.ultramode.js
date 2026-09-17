/* =====================================================================
   app.ultramode.js  —  the Ultra Mode run surface.

   One screen that drives Engine.UltraMode from a single natural-language
   request and shows ONLY real state + real evidence: the current machine
   state, the derived requirements + assumptions + blocking questions, the
   planned artifacts, the live test/build/observer readings, repair
   attempts, the Definition-of-Done gate, and the final VERIFIED / BLOCKED
   / FAILED result. No simulated progress, timings or agent chatter.

   Injects an "Ultra Mode" rail entry and paints #main; a plain browser still
   works and clearly reports the desktop-only steps as unavailable.
   ===================================================================== */
(function () {
  'use strict';
  function GM() { return window.Engine && window.Engine.UltraMode; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  var poll = null;
  var draft = '';
  var evSel = null;   // selected .sovereign/ artifact in the evidence browser

  var STATE_COLOR = {
    RECEIVED: '#7b859c', ANALYZING: '#22d3ee', NEEDS_INPUT: '#f59e0b', CONTRACT_READY: '#22d3ee',
    PLANNING: '#22d3ee', GENERATING: '#a78bfa', VALIDATING: '#a78bfa', EXECUTING: '#a78bfa',
    OBSERVING: '#a78bfa', REPAIRING: '#f59e0b', REVERIFYING: '#a78bfa',
    VERIFIED: '#34d399', BLOCKED: '#f59e0b', FAILED: '#ef4444', CANCELLED: '#7b859c', NONE: '#7b859c'
  };
  var FLOW = ['ANALYZING', 'CONTRACT_READY', 'PLANNING', 'GENERATING', 'VALIDATING', 'EXECUTING', 'OBSERVING', 'REPAIRING', 'REVERIFYING'];

  function badge(state) {
    var c = STATE_COLOR[state] || '#7b859c';
    return '<span style="font:11px/1 JetBrains Mono,monospace;font-weight:600;color:' + c + ';border:1px solid ' + c + ';border-radius:6px;padding:3px 8px">' + esc(state) + '</span>';
  }

  function stepper(history, state) {
    var seen = {};
    (history || []).forEach(function (h) { seen[h.to] = true; });
    return '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:10px 0">' + FLOW.map(function (s) {
      var on = seen[s], cur = s === state;
      var c = cur ? (STATE_COLOR[s] || '#22d3ee') : on ? '#34d399' : 'var(--line)';
      return '<span style="font:10px JetBrains Mono,monospace;color:' + (on || cur ? c : '#6b7488') + ';border:1px solid ' + c + ';border-radius:5px;padding:2px 6px">' +
        (on && !cur ? '✓ ' : '') + s + '</span>';
    }).join('') + '</div>';
  }

  function evidenceTable(st) {
    var tl = (st.history && []) || [];
    var rows = (window.Engine.UltraMode.load() || {}).evidence;
    var timeline = (rows && rows.timeline) || (st.evidence ? [st.evidence] : []);
    if (!timeline.length) return '';
    return '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">' +
      '<thead><tr style="text-align:left;color:var(--muted)"><th style="padding:4px 6px">reading</th><th>DoD</th><th>criteria</th><th>failing reqs</th><th>assertions</th><th>validator</th></tr></thead><tbody>' +
      timeline.map(function (r) {
        return '<tr style="border-top:1px solid var(--line)"><td style="padding:4px 6px">' + esc(r.label || '?') + '</td>' +
          '<td style="color:' + (r.dodPass ? 'var(--good)' : 'var(--muted)') + '">' + (r.dodPass ? 'PASS' : 'no') + '</td>' +
          '<td>' + (r.dodPassCount != null ? r.dodPassCount + (r.dodCriteria ? '/' + r.dodCriteria : '') : '—') + '</td>' +
          '<td>' + ((r.ledgerFailing || []).length) + '</td>' +
          '<td>' + (r.ledgerAssertions || 0) + '</td>' +
          '<td>' + (r.validatorErrors || 0) + ' err / ' + (r.validatorWarnings || 0) + ' warn</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function dodCard() {
    var dod = null;
    try { dod = window.Engine.DoD && window.Engine.DoD.load && window.Engine.DoD.load(); } catch (_) {}
    if (!dod || !dod.criteria) return '';
    var keys = Object.keys(dod.criteria);
    var passed = keys.filter(function (k) { return dod.criteria[k] === true; }).length;
    var label = dod.PASS ? 'ALL GATES PASS' : (dod.partial ? 'PARTIAL' : passed + '/' + keys.length);
    var lc = dod.PASS ? 'var(--good)' : 'var(--warn,#f59e0b)';
    return '<div class="card" style="padding:14px;margin:8px 0">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<h3 class="cs-h3" style="margin:0">Definition of Done</h3>' +
      '<span style="font:11px/1 JetBrains Mono,monospace;font-weight:700;color:' + lc + '">' + label + '</span></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">' +
      keys.map(function (k) {
        var ok = dod.criteria[k] === true;
        return '<div style="font-size:11.5px;display:flex;gap:7px;align-items:baseline">' +
          '<span style="color:' + (ok ? 'var(--good)' : '#ef4444') + ';font-weight:700">' + (ok ? '✓' : '✗') + '</span>' +
          '<span style="color:' + (ok ? '#c9cede' : 'var(--muted)') + '">' + esc(k.replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); })) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function certCard(st) {
    var md = '';
    try { md = window.Engine.Sovereign && window.Engine.Sovereign.read('release-certificate.md'); } catch (_) {}
    if (!md) return '';
    var open = (st.state === 'VERIFIED' || st.state === 'PARTIAL') ? ' open' : '';
    return '<details class="card" style="padding:14px;margin:8px 0"' + open + '>' +
      '<summary style="cursor:pointer;font-size:13px;font-weight:600">Sovereign Release Certificate</summary>' +
      '<pre style="white-space:pre-wrap;font:11px/1.55 JetBrains Mono,monospace;color:#c9cede;margin:10px 0 0;max-height:320px;overflow:auto">' + esc(md) + '</pre></details>';
  }

  function evidenceStoreCard() {
    var files = [];
    try { files = (window.Engine.Sovereign && window.Engine.Sovereign.list && window.Engine.Sovereign.list()) || []; } catch (_) {}
    if (!files.length) return '';
    if (evSel && files.indexOf(evSel) < 0) evSel = null;
    var body = '';
    if (evSel) {
      var val = '';
      try {
        var v = window.Engine.Sovereign.read(evSel);
        val = (v == null) ? '(empty)' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
      } catch (e) { val = '(unreadable)'; }
      body = '<pre style="white-space:pre-wrap;font:10.5px/1.55 JetBrains Mono,monospace;color:#c9cede;margin:10px 0 0;max-height:360px;overflow:auto;background:var(--bg-2);padding:10px;border-radius:6px">' + esc(val) + '</pre>';
    }
    return '<div class="card" style="padding:14px;margin:8px 0">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<h3 class="cs-h3" style="margin:0">Evidence store</h3>' +
      '<span class="cs-muted" style="font-size:11px">.sovereign/ · ' + files.length + ' artifact' + (files.length === 1 ? '' : 's') + '</span></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px">' +
      files.map(function (f) {
        var on = f === evSel;
        return '<button class="btn gm-ev" data-ev="' + esc(f) + '" style="padding:3px 9px;font:10.5px JetBrains Mono,monospace;' +
          (on ? 'border-color:#22d3ee;color:#22d3ee' : '') + '">' + esc(f) + '</button>';
      }).join('') + '</div>' + body + '</div>';
  }

  function render() {
    var st = GM() ? GM().status() : { state: 'NONE' };
    var running = !st.terminal && st.state !== 'NONE' && st.state !== 'NEEDS_INPUT';

    if (st.state === 'NONE') {
      return '<div class="screen-inner" style="max-width:820px">' +
        '<h1 class="cs-h1" style="margin-bottom:6px">Ultra Mode</h1>' +
        '<p class="cs-muted" style="margin-bottom:16px">One request in — CodeSovereign derives a machine-readable contract, generates a real project, runs it in the right runtime, observes it, and returns <b>SOVEREIGN VERIFIED</b> or an honest blocked/failed result. Targets: <b>web</b> (Node/Python · React/Vue/Svelte · GraphQL · WebSockets · microservices) · <b>native Android</b> (Gradle build + emulator) · <b>native iOS</b> (macOS worker) · <b>EVM smart contracts</b> (solc + local chain) · <b>ML training</b> (real PyTorch run). A target whose runtime is missing on this host ends <b>BLOCKED</b> with the exact prerequisite — never "unsupported".</p>' +
        '<div class="card" style="padding:18px">' +
        '<textarea id="gmPrompt" rows="5" placeholder="Build a secure task-management web app with user accounts, projects, tasks, role-based access, PostgreSQL, background email-reminder jobs, REST APIs, accessibility checks, tests and Docker." style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg-2);color:#e6e9f2;font:13px system-ui;resize:vertical">' + esc(draft) + '</textarea>' +
        '<div style="margin-top:10px;display:flex;gap:10px;align-items:center">' +
        '<button id="gmRun" class="btn primary" style="padding:7px 16px">Run Ultra Mode</button>' +
        '<span class="cs-muted" style="font-size:11.5px">Autonomy: <code>' + esc((window.Engine.Autonomy && window.Engine.Autonomy.get && window.Engine.Autonomy.get()) || 'engineer') + '</code>' +
        (window.desktop && window.desktop.isDesktop ? '' : ' · <b style="color:var(--warn,#f59e0b)">browser mode — generation only, no real execution/observation</b>') + '</span>' +
        '</div></div></div>';
    }

    var run = GM().load() || {};
    var h = [];
    h.push('<div class="screen-inner" style="max-width:900px">');
    h.push('<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">' +
      '<h1 class="cs-h1" style="margin:0">Ultra Mode</h1>' + badge(st.state) +
      (st.product ? '<span class="cs-muted">' + esc(st.product) + (st.verdict ? ' · ' + esc(st.verdict) : '') + '</span>' : '') +
      '<div style="flex:1"></div>' +
      (running ? '<button id="gmCancel" class="btn" style="padding:5px 12px;font-size:12px;border-color:#ef4444;color:#ef4444">Cancel</button>' : '') +
      '<button id="gmExport" class="btn" style="padding:5px 12px;font-size:12px" title="Bundle the delivery archive (docs + evidence) as a .zip">Delivery archive</button>' +
      (st.terminal ? '<button id="gmNew" class="btn" style="padding:5px 12px;font-size:12px">New run</button>' : '') +
      '</div>');
    h.push('<p class="cs-muted" style="font-size:12px;margin:0 0 8px">' + esc(st.prompt) + '</p>');

    // §70 — the terse Ultra Mode command syntax, when the request used it
    var _dsl = (run.contract && run.contract.dsl) || null;
    if (_dsl && _dsl.syntax === 'ultra-command') {
      h.push('<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 8px">' +
        '<span style="font:10px/1 JetBrains Mono,monospace;font-weight:700;color:#22d3ee;border:1px solid #22d3ee;border-radius:5px;padding:2px 6px">BUILD/TARGET/CONSTRAINTS</span>' +
        (_dsl.target ? '<span class="cs-muted" style="font-size:11px">target: <code>' + esc(_dsl.target) + '</code></span>' : '') +
        '<span class="cs-muted" style="font-size:11px">mode: <code>' + esc(_dsl.verifyMode || 'balanced') + '</code></span>' +
        ((_dsl.constraints || []).length ? '<span class="cs-muted" style="font-size:11px">' + _dsl.constraints.length + ' constraint(s)</span>' : '') +
        '</div>');
    }

    // runtime target badge + adapter result
    if (st.target && st.target !== 'web') {
      var tgtColor = '#a78bfa';
      h.push('<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px">' +
        '<span style="font:11px/1 JetBrains Mono,monospace;font-weight:600;color:' + tgtColor + ';border:1px solid ' + tgtColor + ';border-radius:6px;padding:3px 8px">TARGET · ' + esc(st.targetLabel || st.target) + '</span>' +
        (st.targetRuntime ? '<span class="cs-muted" style="font-size:11px">runtime: ' + esc(st.targetRuntime) + '</span>' : '') +
        (st.adapterResult ? '<span style="font-size:11px;font-weight:600;color:' + (st.adapterResult.status === 'PASS' ? '#34d399' : st.adapterResult.status === 'BLOCKED' ? '#f59e0b' : '#ef4444') + '">adapter: ' + esc(st.adapterResult.status) + (st.adapterResult.reason ? ' (' + esc(st.adapterResult.reason) + ')' : '') + '</span>' : '') +
        '</div>');
      if (st.adapterResult && st.adapterResult.status === 'BLOCKED' && (st.plan && st.plan.runtimeRequirements || []).length) {
        h.push('<div class="card" style="padding:12px 14px;margin:0 0 10px;border-color:#f59e0b55">' +
          '<div style="font-size:12px;font-weight:600;margin-bottom:6px">This capability is supported — provide the runtime to finish verifying</div>' +
          '<div style="font-size:11.5px;color:#c9cede">' + esc(st.adapterResult.need || '') + '</div>' +
          '<ul style="margin:6px 0 0;font-size:11.5px;color:#c9cede">' +
          st.plan.runtimeRequirements.map(function (r) { return '<li><b>' + esc(r.tool) + '</b> — <code>' + esc(r.install) + '</code></li>'; }).join('') +
          '</ul></div>');
      }
    }

    if (!(window.desktop && window.desktop.isDesktop)) {
      h.push('<div style="padding:8px 12px;border:1px solid var(--warn,#f59e0b);border-radius:8px;background:rgba(245,158,11,.06);font-size:12px;margin-bottom:10px">Browser mode: the project is generated, but real test/build execution and runtime observation need the desktop app — those steps are reported as <b>unavailable</b>, not faked.</div>');
    }

    h.push(stepper(st.history, st.state));

    // result banner
    if (st.terminal) {
      var rc = STATE_COLOR[st.state];
      h.push('<div style="padding:12px 14px;border:1px solid ' + rc + ';border-radius:9px;background:' + rc + '14;margin:8px 0">' +
        '<b style="color:' + rc + '">' + esc(st.result) + '</b>' + (st.resultReason ? '<div style="font-size:12.5px;margin-top:4px;color:#c9cede">' + esc(st.resultReason) + '</div>' : '') + '</div>');
    }

    // blocking questions
    if (st.state === 'NEEDS_INPUT' && (st.blockingQuestions || []).length) {
      h.push('<div class="card" style="padding:16px;margin:8px 0"><h3 class="cs-h3" style="margin-bottom:8px">A few decisions only you can make</h3>');
      st.blockingQuestions.forEach(function (q) {
        h.push('<div style="margin-bottom:12px" data-q="' + esc(q.id) + '">' +
          '<div style="font-size:13px;font-weight:600">[' + esc(q.kind) + '] ' + esc(q.question) + '</div>' +
          '<div class="cs-muted" style="font-size:11.5px;margin:2px 0 6px">' + esc(q.why) + '</div>' +
          (q.options || []).map(function (o) {
            return '<label style="display:block;font-size:12.5px;margin:2px 0"><input type="radio" name="gmq_' + esc(q.id) + '" value="' + esc(o) + '"> ' + esc(o) + '</label>';
          }).join('') +
          '<input type="text" data-qtext="' + esc(q.id) + '" placeholder="…or type your own answer" style="width:100%;margin-top:4px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2);color:#e6e9f2;font-size:12px">' +
          '</div>');
      });
      h.push('<button id="gmAnswer" class="btn primary" style="padding:6px 14px;font-size:12px">Submit answers &amp; continue</button></div>');
    }

    // assumptions
    if ((st.assumptions || []).length) {
      h.push('<details style="margin:8px 0"><summary style="cursor:pointer;font-size:12.5px;color:var(--muted)">Assumptions made (' + st.assumptions.length + ')</summary><ul style="margin:6px 0 0;font-size:12px;color:#c9cede">' +
        st.assumptions.map(function (a) { return '<li><b>' + esc(a.about) + ':</b> ' + esc(a.decision) + ' — <i>' + esc(a.rationale) + '</i></li>'; }).join('') + '</ul></details>');
    }
    // unsupported / unsafe
    if ((st.unsupported || []).length) {
      h.push('<div style="font-size:12px;margin:6px 0;color:var(--warn,#f59e0b)"><b>Not generated (outside the supported stack):</b><ul style="margin:4px 0">' +
        st.unsupported.map(function (u) { return '<li>' + esc(u.request) + ' — ' + esc(u.reason) + '</li>'; }).join('') + '</ul></div>');
    }
    if ((st.unsafe || []).length) {
      h.push('<div style="font-size:12px;margin:6px 0;color:#ef4444"><b>Refused (unsafe):</b> ' + st.unsafe.map(function (u) { return esc(u.reason); }).join('; ') + '</div>');
    }

    // plan
    if (st.plan && st.plan.steps) {
      h.push('<div class="card" style="padding:14px;margin:8px 0"><h3 class="cs-h3" style="margin-bottom:6px">Build plan</h3>' +
        '<div class="cs-muted" style="font-size:11.5px;margin-bottom:6px">' + esc(JSON.stringify(st.plan.stack)) + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>' +
        st.plan.steps.map(function (s) {
          return '<tr style="border-top:1px solid var(--line)"><td style="padding:4px 6px;font:11px JetBrains Mono,monospace">' + esc(s.id) + '</td>' +
            '<td>' + esc(s.kind) + '</td><td class="cs-muted">' + (s.requirementIds || []).length + ' requirement(s)</td></tr>';
        }).join('') + '</tbody></table></div>');
    }

    // artifacts
    if (st.artifacts && st.artifacts.files) {
      h.push('<div style="font-size:12.5px;margin:8px 0">Generated <b>' + st.artifacts.files + '</b> files' +
        (window.openFile ? ' · <a href="#" id="gmOpenIde">open in editor</a>' : '') + '</div>');
    }

    // repair attempts + degraded
    if (st.repairAttempts != null) {
      h.push('<div style="font-size:12px;color:var(--muted);margin:4px 0">Repair attempts: ' + st.repairAttempts + ' / ' + st.maxRepairAttempts +
        ((st.degraded && st.degraded.reasons && st.degraded.reasons.length) ? ' · degraded: ' + st.degraded.reasons.join(', ') : '') + '</div>');
    }

    // evidence
    var et = evidenceTable(st);
    if (et) h.push('<div class="card" style="padding:14px;margin:8px 0"><h3 class="cs-h3" style="margin-bottom:4px">Evidence</h3>' + et + '</div>');

    h.push(dodCard());
    h.push(certCard(st));
    h.push(evidenceStoreCard());

    h.push('</div>');
    return h.join('');
  }

  function schedulePoll() {
    if (poll) { clearInterval(poll); poll = null; }
    var st = GM() ? GM().status() : { state: 'NONE' };
    if (!st.terminal && st.state !== 'NONE' && st.state !== 'NEEDS_INPUT') {
      poll = setInterval(function () {
        if (window.S && window.S.screen === 'ultra') { try { window.renderAll(); } catch (_) {} }
        else { clearInterval(poll); poll = null; }
      }, 1200);
    }
  }

  function bind() {
    var main = document.getElementById('main');
    if (!main) return;
    var pt = main.querySelector('#gmPrompt');
    if (pt) pt.addEventListener('input', function () { draft = pt.value; });
    var run = main.querySelector('#gmRun');
    if (run) run.onclick = function () {
      var v = (main.querySelector('#gmPrompt') || {}).value || draft;
      if (!v || v.trim().length < 8) { window.toast && window.toast('Describe what to build first', '#f59e0b'); return; }
      run.disabled = true; run.textContent = 'Running…';
      GM().start({ prompt: v.trim(), useLLM: window.Engine.AI && window.Engine.AI.ready && window.Engine.AI.ready() })
        .then(function () { try { window.renderAll(); } catch (_) {} });
      schedulePoll();
      try { window.renderAll(); } catch (_) {}
    };
    var cancel = main.querySelector('#gmCancel');
    if (cancel) cancel.onclick = function () { GM().cancel(); setTimeout(function () { try { window.renderAll(); } catch (_) {} }, 100); };
    var nw = main.querySelector('#gmNew');
    if (nw) nw.onclick = function () { GM().reset().then(function () { draft = ''; try { window.renderAll(); } catch (_) {} }); };
    var ans = main.querySelector('#gmAnswer');
    if (ans) ans.onclick = function () {
      var answers = {};
      main.querySelectorAll('[data-q]').forEach(function (row) {
        var id = row.dataset.q;
        var picked = row.querySelector('input[type=radio]:checked');
        var typed = row.querySelector('[data-qtext]');
        var val = (typed && typed.value.trim()) || (picked && picked.value) || '';
        if (val) answers[id] = val;
      });
      ans.disabled = true; ans.textContent = 'Continuing…';
      GM().answer(answers).then(function () { schedulePoll(); try { window.renderAll(); } catch (_) {} });
      schedulePoll();
    };
    var ide = main.querySelector('#gmOpenIde');
    if (ide) ide.onclick = function (e) { e.preventDefault(); window.S.screen = 'ide'; window.renderAll(); };

    main.querySelectorAll('.gm-ev').forEach(function (b) {
      b.onclick = function () { evSel = (evSel === b.dataset.ev) ? null : b.dataset.ev; try { window.renderAll(); } catch (_) {} };
    });

    var exp = main.querySelector('#gmExport');
    if (exp) exp.onclick = function () {
      var D = window.desktop && window.desktop.workspace;
      if (D && D.exportDelivery) {
        exp.disabled = true; exp.textContent = 'Exporting…';
        D.exportDelivery().then(function (r) {
          exp.disabled = false; exp.textContent = 'Delivery archive';
          if (!r) return;                        // save dialog cancelled
          if (r.ok === false || r.error) { window.toast && window.toast('Export failed: ' + (r.error || 'unknown'), '#ef4444'); return; }
          var d = r.data || r;
          window.toast && window.toast('Delivery archive → ' + (d.path || 'saved') + ' (' + (d.fileCount || '?') + ' files)', '#34d399');
        }).catch(function (e) { exp.disabled = false; exp.textContent = 'Delivery archive'; window.toast && window.toast('Export failed: ' + (e && e.message || e), '#ef4444'); });
      } else if (window.Engine && window.Engine.Delivery && window.Engine.Delivery.write) {
        try {
          var res = window.Engine.Delivery.write();
          var n = (res && res.wrote && res.wrote.length) || 0;
          window.toast && window.toast('Delivery bundle assembled into /delivery (' + n + ' files) — open a folder in the desktop app to save a .zip', '#22d3ee');
          try { window.renderAll(); } catch (_) {}
        } catch (e) { window.toast && window.toast('Delivery assembly failed: ' + (e && e.message || e), '#ef4444'); }
      } else {
        window.toast && window.toast('Delivery export needs the desktop app', '#f59e0b');
      }
    };
  }

  /* ---- inject a rail entry + intercept renderAll ---- */
  function inject() {
    if (!window.renderAll || !window.renderRail) { setTimeout(inject, 60); return; }

    var origRail = window.renderRail;
    window.renderRail = function () {
      var html = origRail.apply(this, arguments);
      if (html.indexOf('data-screen="ultra"') >= 0) return html;
      var btn = '<button data-screen="ultra" title="Ultra Mode" class="' + (window.S && window.S.screen === 'ultra' ? 'active' : '') + '">' +
        '<span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center">⚡</span>' +
        '<span style="font-size:9.5px;font-weight:500">Ultra Mode</span></button>';
      // place it just before the Settings button
      return html.replace('<button data-screen="settings"', btn + '<button data-screen="settings"');
    };

    var origTop = window.renderTopNav;
    if (origTop) {
      window.renderTopNav = function () {
        var html = origTop.apply(this, arguments);
        if (html.indexOf('data-screen="ultra"') >= 0) return html;
        return html.replace(/(<button data-screen="settings")/,
          '<button data-screen="ultra" class="' + (window.S && window.S.screen === 'ultra' ? 'active' : '') + '"><span>⚡</span><span>Ultra Mode</span></button>$1');
      };
    }

    var origAll = window.renderAll;
    window.renderAll = function () {
      var r = origAll.apply(this, arguments);
      try {
        if (window.S && window.S.screen === 'ultra') {
          var main = document.getElementById('main');
          if (main) { main.innerHTML = render(); bind(); schedulePoll(); }
        }
      } catch (e) { console.error('[ultramode-ui]', e); }
      return r;
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
