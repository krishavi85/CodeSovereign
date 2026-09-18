/* =====================================================================
 * app.packages.js
 * Target platforms + package downloads injected into Welcome / Agent / Factory.
 * No new pages. Continuous prompting copy lives next to the composer.
 * ===================================================================== */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function toast(msg, color) {
    if (window.toast) window.toast(msg, color || '#7c6ff5');
  }
  function rerender() { if (window.renderAll) window.renderAll(); }
  function wrap(name, fn) {
    let tries = 0;
    function tryWrap() {
      const orig = window[name];
      if (typeof orig !== 'function') {
        if (tries++ < 40) { setTimeout(tryWrap, 40); return; }
        return;
      }
      if (orig.__pkgInjected) return;
      window[name] = function () { return fn(orig.apply(this, arguments)); };
      window[name].__pkgInjected = true;
    }
    tryWrap();
  }
  function wrapBind(name, extra) {
    let tries = 0;
    function tryWrap() {
      const orig = window[name];
      if (typeof orig !== 'function') {
        if (tries++ < 40) { setTimeout(tryWrap, 40); return; }
        return;
      }
      if (orig.__pkgBound) return;
      window[name] = function () { orig.apply(this, arguments); extra(); };
      window[name].__pkgBound = true;
    }
    tryWrap();
  }

  function card() {
    const P = window.Engine && Engine.Packages;
    if (!P) return '';
    const st = P.status();
    const S = window.S || {};
    const chips = P.ALL.map(function (k) {
      const on = !!(S.plat && S.plat[k]);
      const n = k === 'windows' || k === 'macos' || k === 'linux' ? st.desktop : st[k];
      return '<button class="btn ' + (on ? 'primary' : 'ghost') + '" data-pkg-action="plat" data-pkg-id="' + k + '" style="padding:4px 10px;font-size:11px">'
        + esc(k) + (n ? (' · ' + n) : '') + '</button>';
    }).join('');
    const dls = ['web', 'windows', 'macos', 'linux', 'android', 'ios'].map(function (k) {
      return '<button class="btn ghost" data-pkg-action="download" data-pkg-id="' + k + '" style="padding:4px 10px;font-size:11px">zip ' + k + '</button>';
    }).join('');
    return '<div class="card" style="padding:16px;margin:16px 0" id="pkgCard">'
      + '<div class="cs-eyebrow">Packages · keep prompting</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">'
      + (S.agentBuilt
        ? 'This is a continuous session — send another prompt to grow the same app. Target chips wrap the UI into real desktop/mobile projects you can zip and build.'
        : 'Describe the app, pick platforms, then Generate. Later prompts keep editing the same product (Cursor-style), not a one-shot.')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' + chips + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + dls
      + '<button class="btn primary" data-pkg-action="zip-all" style="padding:4px 10px;font-size:11px">Download all zips</button>'
      + '<button class="btn ghost" data-pkg-action="sync" style="padding:4px 10px;font-size:11px">Rebuild packages</button>'
      + '</div>'
      + '<div id="pkgOut" style="font-size:11px;font-family:monospace;color:var(--muted);margin-top:8px">'
      + (st.last ? ('last: ' + esc(st.last.name) + ' · ' + (st.last.trees || []).join(', ') + ' · ' + st.last.files + ' files') : 'no packages yet')
      + '</div></div>';
  }

  wrap('renderAgent', function (html) {
    const marker = 'id="agentPromptInput"';
    const i = html.indexOf(marker);
    if (i < 0) return card() + html;
    const box = html.lastIndexOf('<div style="border:1px solid rgba(109,93,252,.4)', i);
    if (box < 0) return card() + html;
    return html.slice(0, box) + card() + html.slice(box);
  });
  wrap('renderFactory', function (html) {
    const last = html.lastIndexOf('</div>');
    if (last < 0) return html + card();
    return html.slice(0, last) + card() + html.slice(last);
  });
  wrap('renderWelcome', function (html) {
    const tryAt = html.indexOf('>Try:</span>');
    if (tryAt < 0) return html + card();
    const insert = html.lastIndexOf('<div style="display:flex;gap:8px;margin-bottom:24px', tryAt);
    if (insert < 0) return html + card();
    return html.slice(0, insert) + card() + html.slice(insert);
  });

  function setOut(text) {
    const el = document.getElementById('pkgOut');
    if (el) el.textContent = text;
  }

  async function handle(action, id) {
    const P = window.Engine && Engine.Packages;
    const S = window.S;
    if (!P) return;
    try {
      if (action === 'plat') {
        if (!S.plat) S.plat = {};
        S.plat[id] = !S.plat[id];
        if (S.agentBuilt) {
          const rec = P.sync();
          toast('Packages: ' + rec.trees.join(', '), '#34d399');
        }
        rerender();
      } else if (action === 'download') {
        const rec = P.sync();
        const r = P.download(id);
        setOut('downloaded ' + r.filename + ' (' + rec.files + ' files)');
        toast('Downloaded ' + r.filename, '#34d399');
      } else if (action === 'zip-all') {
        const r = P.downloadAll();
        setOut('downloaded ' + r.filename);
        toast('Downloaded all packages', '#34d399');
      } else if (action === 'sync') {
        const rec = P.sync();
        setOut(rec.ok ? ('synced ' + rec.trees.join(', ')) : (rec.error || 'sync failed'));
        toast(rec.ok ? 'Packages rebuilt from the current app' : rec.error, rec.ok ? '#34d399' : '#f59e0b');
        rerender();
      }
    } catch (e) {
      toast(String(e && e.message || e), '#ef4444');
    }
  }

  function bindPkg(root) {
    root = root || document.getElementById('main') || document;
    if (!root || !root.addEventListener) return;
    if (root.__pkgRootBound) return;
    root.__pkgRootBound = true;
    root.addEventListener('click', function (ev) {
      const el = ev.target && ev.target.closest && ev.target.closest('[data-pkg-action]');
      if (!el || (typeof root.contains === 'function' && !root.contains(el))) return;
      ev.preventDefault();
      handle(el.getAttribute('data-pkg-action'), el.getAttribute('data-pkg-id'));
    });
  }
  wrapBind('bindWelcome', function () { bindPkg(); });
  wrapBind('bindAgent', function () { bindPkg(); });
  wrapBind('bindFactory', function () { bindPkg(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { bindPkg(); });
  else bindPkg();
})();
