/* =====================================================================
   desktop-terminal.js — a real terminal inside the IDE "Terminal" panel.

   Replaces the cosmetic terminal readout with a live shell (or a managed
   command run) whose stdout/stderr stream from the main process. Survives
   the app's frequent re-renders by re-mounting into the fresh DOM node and
   replaying its buffer.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.desktop || !window.desktop.isDesktop) return;
  var D = window.desktop;

  var buffer = [];                 // array of strings
  var MAX = 4000;                  // keep last N lines
  var shellId = null;
  var runId = null;
  var mountedEl = null;
  var starting = false;

  var ANSI = /\x1B\[[0-9;?]*[ -\/]*[@-~]|\x1B\][^\x07]*\x07|\x1B[=>]/g;
  function clean(s) { return String(s).replace(ANSI, '').replace(/\r(?!\n)/g, ''); }

  function push(txt) {
    var parts = clean(txt).split('\n');
    if (buffer.length && !/\n$/.test(buffer[buffer.length - 1]) && parts.length) {
      buffer[buffer.length - 1] += parts.shift();
    }
    parts.forEach(function (p) { buffer.push(p); });
    if (buffer.length > MAX) buffer = buffer.slice(-MAX);
    paint();
  }

  function paint() {
    if (!mountedEl || !document.body.contains(mountedEl)) return;
    var out = mountedEl.querySelector('.cst-out');
    if (!out) return;
    out.textContent = buffer.join('\n');
    out.scrollTop = out.scrollHeight;
  }

  D.proc.onData(function (evt) {
    if (evt.id !== shellId && evt.id !== runId) return;
    if (evt.stream === 'stdout' || evt.stream === 'stderr' || evt.stream === 'error') push(evt.data);
    else if (evt.stream === 'exit') {
      push('\n[process exited with code ' + evt.code + ']\n');
      if (evt.id === runId) runId = null;
      if (evt.id === shellId) shellId = null;
    }
  });

  function ensureShell() {
    if (shellId || starting) return Promise.resolve();
    starting = true;
    return D.proc.shell('.').then(function (r) {
      starting = false;
      if (r && r.ok) { shellId = r.id; push('$ shell ready — ' + (window.CSDesktop && CSDesktop.project ? CSDesktop.project.root : '') + '\n'); }
      else push('Could not start shell: ' + (r && r.error || 'unknown') + '\n');
    }, function (e) { starting = false; push('shell error: ' + e.message + '\n'); });
  }

  function sendLine(line) {
    if (!shellId) { ensureShell().then(function () { if (shellId) D.proc.write(shellId, line + '\r\n'); }); return; }
    D.proc.write(shellId, line + '\r\n');
  }

  function run(cmd, args) {
    push('\n> ' + cmd + ' ' + (args || []).join(' ') + '\n');
    D.proc.run({ cmd: cmd, args: args || [], cwd: '.' }).then(function (r) {
      if (r && r.ok === false) { push(r.error + '\n'); return; }
      var res = r || {};
      if (res.stdout) push(res.stdout);
      if (res.stderr) push(res.stderr);
      push('\n[exit ' + (res.code != null ? res.code : '?') + ']\n');
      try { window.CSTerminal._afterRun && window.CSTerminal._afterRun(res); } catch (_) {}
    });
  }

  function template() {
    return '' +
      '<div class="cst-wrap" style="flex:1;display:flex;flex-direction:column;min-height:0;background:#05070d">' +
        '<pre class="cst-out" style="flex:1;margin:0;padding:10px 14px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:400 12px/1.55 \'JetBrains Mono\',monospace;color:#c7cddb"></pre>' +
        '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid rgba(255,255,255,.07);flex:none">' +
          '<span style="color:#34d399;font:600 12px \'JetBrains Mono\',monospace">$</span>' +
          '<input class="cst-in" placeholder="type a command, Enter to run  ·  Ctrl+C to interrupt" spellcheck="false" ' +
            'style="flex:1;background:transparent;border:0;outline:0;color:#e6e9f2;font:400 12px \'JetBrains Mono\',monospace">' +
          '<button class="cst-clear btn ghost" style="padding:3px 9px;font-size:11px">Clear</button>' +
        '</div>' +
      '</div>';
  }

  function mountIfVisible() {
    if (!window.S || window.S.screen !== 'ide' || window.S.idePanel !== 'terminal') { mountedEl = null; return; }
    var tab = document.querySelector('[data-idepanel="terminal"]');
    if (!tab) return;
    var host = tab.parentElement && tab.parentElement.parentElement;   // 250px panel container
    if (!host) return;
    var bodyEl = host.lastElementChild;                                 // the rendered panelBody
    if (!bodyEl) return;
    if (bodyEl.__cstMounted) { mountedEl = bodyEl; paint(); return; }

    bodyEl.innerHTML = template();
    bodyEl.style.display = 'flex';
    bodyEl.style.flexDirection = 'column';
    bodyEl.style.minHeight = '0';
    bodyEl.style.flex = '1';
    bodyEl.__cstMounted = true;
    mountedEl = bodyEl;

    var input = bodyEl.querySelector('.cst-in');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var v = input.value; input.value = '';
        push('$ ' + v + '\n');
        sendLine(v);
      } else if (e.key === 'c' && e.ctrlKey) {
        if (runId) { D.proc.kill(runId); runId = null; }
        else if (shellId) D.proc.write(shellId, '\x03');
      }
    });
    bodyEl.querySelector('.cst-clear').onclick = function () { buffer = []; paint(); };

    if (!shellId && !starting) ensureShell();
    paint();
    setTimeout(function () { input.focus(); }, 30);
  }

  window.CSTerminal = { mountIfVisible: mountIfVisible, run: run, push: push, clear: function () { buffer = []; paint(); } };

  // Re-mount after every IDE bind.
  function wrapBind() {
    if (window.__cstTermWrapped || typeof window.bindIDE !== 'function') return;
    window.__cstTermWrapped = true;
    var orig = window.bindIDE;
    window.bindIDE = function () { var r = orig.apply(this, arguments); try { mountIfVisible(); } catch (_) {} return r; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapBind);
  else wrapBind();
  // bindIDE may be defined after us; also try once more on load.
  window.addEventListener('load', function () { wrapBind(); setTimeout(mountIfVisible, 100); });
})();
