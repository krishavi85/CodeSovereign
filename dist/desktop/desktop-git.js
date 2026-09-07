/* =====================================================================
   desktop-git.js — real local Git in the IDE "Git" panel.

   When the open folder is a git repo, replaces the static file list with
   live `git status`, plus stage-all / commit / init. Uses the system git
   through window.desktop.git. No-op in a browser.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.desktop || !window.desktop.isDesktop) return;
  var D = window.desktop;
  var mounted = null;
  var cache = null;
  var loading = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function refresh() {
    if (loading) return;
    loading = true;
    D.git.status().then(function (r) {
      loading = false;
      cache = (r && r.ok) ? r : (r && r.repo === false ? r : null);
      paint();
    }, function () { loading = false; });
  }

  function paint() {
    if (!mounted || !document.body.contains(mounted)) return;
    if (cache == null) { mounted.innerHTML = row('Checking git…'); return; }
    if (cache.repo === false) {
      mounted.innerHTML =
        '<div style="padding:16px;font-size:12.5px;color:#8b93a7">This folder is not a Git repository.' +
        '<div style="margin-top:10px"><button class="btn primary" id="gInit" style="padding:5px 11px;font-size:12px">git init</button></div></div>';
      mounted.querySelector('#gInit').onclick = function () {
        D.git.exec(['init']).then(function () { D.git.exec(['add', '-A']); refresh(); });
      };
      return;
    }
    var files = cache.files || [];
    var list = files.length
      ? files.map(function (f) {
          var code = (f.x + f.y).trim();
          var col = /\?\?/.test(f.x + f.y) ? '#22d3ee' : (/^ ?[MARC]/.test(f.x + f.y) ? '#f59e0b' : '#8b93a7');
          return '<div style="display:flex;align-items:center;gap:9px;padding:5px 14px;font:500 12px \'JetBrains Mono\',monospace;color:#c7cddb">' +
            '<span style="color:' + col + ';min-width:22px">' + esc(code || '·') + '</span>' +
            '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(f.path) + '</span></div>';
        }).join('')
      : '<div style="padding:14px 16px;font-size:12px;color:#34d399">Working tree clean</div>';

    mounted.innerHTML =
      '<div style="display:flex;flex-direction:column;min-height:0;flex:1">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);font-size:11.5px;color:#8b93a7">' +
          '<b style="color:#a9b0ff">' + esc(cache.branch) + '</b>' +
          (cache.ahead ? '<span>↑' + cache.ahead + '</span>' : '') +
          (cache.behind ? '<span>↓' + cache.behind + '</span>' : '') +
          '<span style="flex:1"></span>' +
          '<button class="btn ghost" id="gRefresh" style="padding:3px 8px;font-size:11px">↻</button>' +
        '</div>' +
        '<div style="flex:1;overflow:auto">' + list + '</div>' +
        '<div style="border-top:1px solid rgba(255,255,255,.06);padding:8px 12px;display:flex;gap:8px">' +
          '<input id="gMsg" placeholder="commit message" style="flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:5px 9px;color:#e6e9f2;font:400 12px Inter,sans-serif;outline:none">' +
          '<button class="btn primary" id="gCommit" style="padding:5px 11px;font-size:12px">Stage all + Commit</button>' +
        '</div>' +
      '</div>';
    mounted.style.display = 'flex'; mounted.style.flexDirection = 'column'; mounted.style.flex = '1'; mounted.style.minHeight = '0';

    mounted.querySelector('#gRefresh').onclick = refresh;
    mounted.querySelector('#gCommit').onclick = function () {
      var msg = mounted.querySelector('#gMsg').value.trim();
      if (!msg) { mounted.querySelector('#gMsg').focus(); return; }
      D.git.exec(['add', '-A']).then(function () {
        return D.git.exec(['commit', '-m', msg]);
      }).then(function (r) {
        try { window.toast && window.toast(r && r.ok && r.code === 0 ? 'Committed' : 'Commit: ' + ((r && (r.stderr || r.stdout)) || 'failed'), r && r.code === 0 ? '#34d399' : '#f59e0b'); } catch (_) {}
        refresh();
      });
    };
  }

  function row(t) { return '<div style="padding:14px 16px;font-size:12px;color:#8b93a7">' + esc(t) + '</div>'; }

  function mountIfVisible() {
    if (!window.S || window.S.screen !== 'ide' || window.S.idePanel !== 'git') { mounted = null; return; }
    var tab = document.querySelector('[data-idepanel="git"]');
    if (!tab) return;
    var host = tab.parentElement && tab.parentElement.parentElement;
    if (!host) return;
    var bodyEl = host.lastElementChild;
    if (!bodyEl) return;
    mounted = bodyEl;
    if (!bodyEl.__cstGit) { bodyEl.__cstGit = true; cache = null; refresh(); }
    paint();
  }

  window.CSGit = { mountIfVisible: mountIfVisible, refresh: refresh };

  function wrapBind() {
    if (window.__cstGitWrapped || typeof window.bindIDE !== 'function') return;
    window.__cstGitWrapped = true;
    var orig = window.bindIDE;
    window.bindIDE = function () { var r = orig.apply(this, arguments); try { mountIfVisible(); } catch (_) {} return r; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapBind);
  else wrapBind();
  window.addEventListener('load', function () { wrapBind(); });
})();
