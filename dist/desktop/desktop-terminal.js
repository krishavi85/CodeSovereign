/* =====================================================================
   desktop-terminal.js — a real, integrated terminal inside the IDE
   "Terminal" panel: multiple tabs, each backed by an actual PTY (real
   PowerShell/CMD/Git Bash/WSL, via electron/lib/terminal-manager.js +
   node-pty), rendered with xterm.js — full ANSI color, cursor movement,
   interactive programs (npm/git/docker/ollama/installers), not a
   stripped-down text readout.

   The first tab, "Output", is kept as the plain-text sink other engines
   already push programmatic command output into (desktop-exec.js's build/
   task runs, desktop-app.js's menu-triggered commands) — window.CSTerminal
   .run()/.push()/.clear() behave exactly as before; nothing that already
   depends on them needs to change.

   Survives the app's frequent re-renders by mounting once into the fresh
   DOM node (like the old implementation did) and never re-creating the
   xterm instances or the output <pre> on subsequent renderAll() calls —
   only the tab strip itself is repainted when tabs open/close.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.desktop || !window.desktop.isDesktop) return;
  var D = window.desktop;

  var outputBuffer = [];           // plain-text lines pushed by other engines
  var MAX_LINES = 4000;
  var ptyTabs = [];                // [{ id, label, shellId }]
  var activeTabId = 'output';
  var xterms = {};                 // ptyId -> { term, fitAddon, el }
  var shells = null;               // detected shells, loaded once
  var mountedEl = null;

  var ANSI = /\x1B\[[0-9;?]*[ -\/]*[@-~]|\x1B\][^\x07]*\x07|\x1B[=>]/g;
  function clean(s) { return String(s).replace(ANSI, '').replace(/\r(?!\n)/g, ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---------------- Output tab (unchanged public API) ---------------- */
  function pushOutput(txt) {
    var parts = clean(txt).split('\n');
    if (outputBuffer.length && !/\n$/.test(outputBuffer[outputBuffer.length - 1]) && parts.length) {
      outputBuffer[outputBuffer.length - 1] += parts.shift();
    }
    parts.forEach(function (p) { outputBuffer.push(p); });
    if (outputBuffer.length > MAX_LINES) outputBuffer = outputBuffer.slice(-MAX_LINES);
    paintOutput();
  }

  function paintOutput() {
    if (!mountedEl) return;
    var out = mountedEl.querySelector('.cstx-output');
    if (!out) return;
    out.textContent = outputBuffer.join('\n');
    out.scrollTop = out.scrollHeight;
  }

  function run(cmd, args) {
    pushOutput('\n> ' + cmd + ' ' + (args || []).join(' ') + '\n');
    D.proc.run({ cmd: cmd, args: args || [], cwd: '.' }).then(function (r) {
      if (r && r.ok === false) { pushOutput(r.error + '\n'); return; }
      var res = r || {};
      if (res.stdout) pushOutput(res.stdout);
      if (res.stderr) pushOutput(res.stderr);
      pushOutput('\n[exit ' + (res.code != null ? res.code : '?') + ']\n');
      try { window.CSTerminal._afterRun && window.CSTerminal._afterRun(res); } catch (_) {}
    });
  }

  // Programmatic command runs / menu actions surface in the Output tab, but
  // don't force the panel open here — desktop-exec.js already does that
  // itself around its own run() calls, same as before.

  /* ---------------- PTY tabs (real shells) ---------------- */
  function currentCwd() {
    try { if (window.CSDesktop && CSDesktop.project && CSDesktop.project.root) return CSDesktop.project.root; } catch (_) {}
    return null;
  }

  function loadShells() {
    if (shells) return Promise.resolve(shells);
    if (!D.terminal) { shells = []; return Promise.resolve(shells); }
    return D.terminal.listShells().then(function (r) {
      shells = (r && r.shells) || [];
      renderTabStrip();
      return shells;
    }, function () { shells = []; return shells; });
  }

  function openPtyTab(shellId) {
    if (!D.terminal) { pushOutput('Terminal engine needs the desktop app.\n'); return; }
    var shell = shellId && shells ? shells.find(function (s) { return s.id === shellId; }) : (shells && shells[0]);
    D.terminal.create({ shellId: shell && shell.id, cwd: currentCwd(), cols: 100, rows: 24 }).then(function (r) {
      if (!r || r.ok === false) { window.toast && window.toast('Terminal failed to start: ' + ((r && r.error) || 'unknown'), '#ef4444'); return; }
      var tab = { id: r.id, label: r.shellLabel || 'Shell', shellId: r.shellId };
      ptyTabs.push(tab);
      mountPty(tab.id);
      switchTab(tab.id);
    });
  }

  function mountPty(id) {
    if (!mountedEl) return;
    var body = mountedEl.querySelector('.cstx-body');
    if (!body) return;
    var el = document.createElement('div');
    el.className = 'cstx-pty';
    el.dataset.ptyid = id;
    el.style.cssText = 'position:absolute;inset:4px;display:none';
    body.appendChild(el);
    var term = new window.XtermTerminal({
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: 12.5,
      cursorBlink: true,
      theme: { background: '#05070d', foreground: '#c7cddb', cursor: '#a78bfa', selectionBackground: 'rgba(124,91,214,.35)' }
    });
    var fitAddon = new window.XtermFitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    term.onData(function (data) { D.terminal.sendInput(id, data); });
    xterms[id] = { term: term, fitAddon: fitAddon, el: el };
  }

  function switchTab(id) {
    activeTabId = id;
    var outEl = mountedEl && mountedEl.querySelector('.cstx-output');
    if (outEl) outEl.style.display = (id === 'output') ? 'block' : 'none';
    Object.keys(xterms).forEach(function (k) { xterms[k].el.style.display = (k === id) ? 'block' : 'none'; });
    renderTabStrip();
    setTimeout(function () {
      var x = xterms[id];
      if (x) { try { x.fitAddon.fit(); D.terminal.resize(id, x.term.cols, x.term.rows); } catch (_) {} x.term.focus(); }
    }, 30);
  }

  function closePtyTab(id) {
    try { D.terminal.kill(id); } catch (_) {}
    var x = xterms[id];
    if (x) { try { x.term.dispose(); } catch (_) {} x.el.remove(); delete xterms[id]; }
    ptyTabs = ptyTabs.filter(function (t) { return t.id !== id; });
    if (activeTabId === id) switchTab(ptyTabs.length ? ptyTabs[ptyTabs.length - 1].id : 'output');
    else renderTabStrip();
  }

  function fitActivePty() {
    var x = xterms[activeTabId];
    if (!x) return;
    try { x.fitAddon.fit(); D.terminal.resize(activeTabId, x.term.cols, x.term.rows); } catch (_) {}
  }

  // Wired once: dispatch PTY data/exit to the right xterm instance
  // regardless of which tab is currently visible.
  var handlersWired = false;
  function wireTerminalEvents() {
    if (handlersWired || !D.terminal) return;
    handlersWired = true;
    D.terminal.onData(function (p) {
      var x = xterms[p.id];
      if (x) x.term.write(p.data);
    });
    D.terminal.onExit(function (p) {
      var x = xterms[p.id];
      if (x) x.term.write('\r\n\x1b[90m[process exited' + (p.exitCode != null ? ', code ' + p.exitCode : '') + ']\x1b[0m\r\n');
    });
  }

  /* ---------------- tab strip + toolbar ---------------- */
  function tabStripHtml() {
    var shellOptions = (shells || []).map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>';
    }).join('');
    var tabs = '<span data-tab="output" class="cstx-tabbtn" style="' + tabStyle('output') + '">Output</span>' +
      ptyTabs.map(function (t) {
        return '<span data-tab="' + esc(t.id) + '" class="cstx-tabbtn" style="' + tabStyle(t.id) + '">' + esc(t.label) +
          ' <span data-closetab="' + esc(t.id) + '" style="opacity:.6;margin-left:4px">✕</span></span>';
      }).join('');
    return tabs +
      '<select class="cstx-shellpick" style="margin-left:6px;padding:3px 6px;font-size:11px;background:#0d1220;color:#c7cddb;border:1px solid rgba(255,255,255,.12);border-radius:5px">' + shellOptions + '</select>' +
      '<button class="cstx-newbtn btn ghost" style="padding:2px 8px;font-size:12px;margin-left:4px" title="New terminal">+</button>' +
      '<div style="flex:1"></div>' +
      '<button class="cstx-clearbtn btn ghost" style="padding:2px 8px;font-size:11px" title="Clear Output">Clear</button>';
  }
  function tabStyle(id) {
    var active = activeTabId === id;
    return 'cursor:pointer;padding:3px 9px;border-radius:6px;font:600 11.5px Inter;white-space:nowrap;color:' +
      (active ? '#a9b0ff' : '#8b93a7') + ';background:' + (active ? 'rgba(124,91,214,.14)' : 'transparent');
  }
  function renderTabStrip() {
    if (!mountedEl) return;
    var strip = mountedEl.querySelector('.cstx-tabs');
    if (!strip) return;
    strip.innerHTML = tabStripHtml();
    bindTabStrip(strip);
  }
  function bindTabStrip(strip) {
    strip.querySelectorAll('[data-tab]').forEach(function (el) {
      el.onclick = function (e) {
        if (e.target.hasAttribute('data-closetab')) return; // handled below
        switchTab(el.dataset.tab);
      };
    });
    strip.querySelectorAll('[data-closetab]').forEach(function (el) {
      el.onclick = function (e) { e.stopPropagation(); closePtyTab(el.dataset.closetab); };
    });
    var nb = strip.querySelector('.cstx-newbtn');
    if (nb) nb.onclick = function () {
      var pick = strip.querySelector('.cstx-shellpick');
      openPtyTab(pick && pick.value);
    };
    var cb = strip.querySelector('.cstx-clearbtn');
    if (cb) cb.onclick = function () { outputBuffer = []; paintOutput(); };
  }

  /* ---------------- mount / lifecycle ---------------- */
  function template() {
    return '' +
      '<div class="cstx-wrap" style="flex:1;display:flex;flex-direction:column;min-height:0;background:#05070d">' +
        '<div class="cstx-tabs" style="display:flex;align-items:center;gap:2px;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.07);flex:none;overflow-x:auto"></div>' +
        '<div class="cstx-body" style="flex:1;min-height:0;position:relative">' +
          '<pre class="cstx-output" style="position:absolute;inset:0;margin:0;padding:10px 14px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:400 12px/1.55 \'JetBrains Mono\',monospace;color:#9aa3b8"></pre>' +
        '</div>' +
      '</div>';
  }

  function mountIfVisible() {
    if (!window.S || window.S.screen !== 'ide' || window.S.idePanel !== 'terminal') { mountedEl = null; return; }
    var tab = document.querySelector('[data-idepanel="terminal"]');
    if (!tab) return;
    var host = tab.parentElement && tab.parentElement.parentElement; // 250px panel container
    if (!host) return;
    var bodyEl = host.lastElementChild;                              // the rendered panelBody
    if (!bodyEl) return;
    if (bodyEl.__cstMounted) { mountedEl = bodyEl; renderTabStrip(); paintOutput(); return; }

    if (!window.XtermTerminal || !window.XtermFitAddon) {
      bodyEl.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#7b859c;font-size:12.5px">Terminal UI failed to load (xterm.js missing).</div>';
      return;
    }

    bodyEl.innerHTML = template();
    bodyEl.style.display = 'flex';
    bodyEl.style.flexDirection = 'column';
    bodyEl.style.minHeight = '0';
    bodyEl.style.flex = '1';
    bodyEl.__cstMounted = true;
    mountedEl = bodyEl;

    // renderAll() replaces the panel's DOM on every re-render, so this runs
    // again with a brand-new bodyEl. The open terminals' xterm elements were
    // still attached to the old (detached) node, so an open PowerShell tab
    // vanished after the first re-render — move them into the new body.
    var ptyBody = bodyEl.querySelector('.cstx-body');
    if (ptyBody) Object.keys(xterms).forEach(function (k) { ptyBody.appendChild(xterms[k].el); });

    wireTerminalEvents();
    loadShells().then(function () { renderTabStrip(); });
    paintOutput();
    switchTab(activeTabId);
  }

  window.addEventListener('resize', function () { if (mountedEl) fitActivePty(); });

  window.CSTerminal = { mountIfVisible: mountIfVisible, run: run, push: pushOutput, clear: function () { outputBuffer = []; paintOutput(); } };

  // Re-mount after every IDE bind.
  function wrapBind() {
    if (window.__cstTermWrapped || typeof window.bindIDE !== 'function') return;
    window.__cstTermWrapped = true;
    var orig = window.bindIDE;
    window.bindIDE = function () { var r = orig.apply(this, arguments); try { mountIfVisible(); } catch (_) {} return r; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapBind);
  else wrapBind();
  window.addEventListener('load', function () { wrapBind(); setTimeout(mountIfVisible, 100); });

  // Kill any live PTY sessions when the workspace/project switches, so a
  // stale shell rooted in the old folder doesn't linger unseen.
  window.addEventListener('beforeunload', function () {
    try { Object.keys(xterms).forEach(function (id) { D.terminal && D.terminal.kill(id); }); } catch (_) {}
  });
})();
