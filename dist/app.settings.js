/* =====================================================================
 * app.settings.js  —  the Settings screen, organised
 *
 * renderSettings() (app.js) and several injectors (app.ai.extras.js,
 * app.llm.extras.js, app.stack.js, app.runtime.js, app.work.js) each add a
 * card to one long page. After every render this module turns that page into
 * a two-pane layout (sections on the left, one section at a time on the
 * right) and drops the cards whose controls are not connected to anything:
 *
 *   Environment           dev/staging/prod only changed a label
 *   Agent runtime         "run on AWS Lambda / Cloudflare / ..." stored a flag nothing reads
 *   Tools                 six switches nothing reads
 *   Building Stack        a "vector engine" choice backed by a local hash index, not Qdrant/Weaviate/Milvus
 *   Customize · MCP·Modes custom modes never reach a prompt; MCP servers feed no agent
 *
 * The engines behind them are untouched; only the controls that implied
 * behaviour the app does not have are gone from the UI.
 * ===================================================================== */
(function () {
  'use strict';

  var SECTIONS = [
    { id: 'project', label: 'Project', blurb: 'The folder or workspace you are working in.' },
    { id: 'ai', label: 'AI & Models', blurb: 'Which model writes and edits your code, and where it runs.' },
    { id: 'agents', label: 'Agents', blurb: 'How generation is routed, and how much runs without asking.' },
    { id: 'integrations', label: 'Integrations', blurb: 'Storage and optional cloud sync.' },
    { id: 'advanced', label: 'Advanced', blurb: 'Analysis tools.' },
    { id: 'about', label: 'About', blurb: '' }
  ];
  // card title (lower-case) -> section. A card with an unknown title goes to Advanced, never silently lost.
  var MAP = {
    'workspace': 'project', 'artifacts': 'project',
    'ai provider': 'ai', 'local ai': 'ai', 'codesovereign router': 'ai', 'manual endpoint': 'ai', 'ai wiring': 'ai',
    'agents': 'agents', 'autonomy & deployment': 'agents',
    'integrations': 'integrations',
    'cost sovereignty': 'advanced',
    'about': 'about'
  };
  var REMOVE = ['environment', 'agent runtime', 'tools', 'open-source building stack', 'customize · mcp · modes'];

  function S() { return window.S || {}; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function titleOf(el) {
    var h = el.querySelector('h3, h2, summary');
    return h ? h.textContent.replace(/\s+/g, ' ').trim().toLowerCase() : '';
  }

  // the section element for an id, created (with its nav button) the first time something lands in it
  function ensureSection(inner, id) {
    var body = inner.querySelector('.cs-set-body'), nav = inner.querySelector('.cs-set-nav');
    var sec = body.querySelector('[data-set-sec="' + id + '"]');
    if (sec) return sec;
    var def = SECTIONS.filter(function (s) { return s.id === id; })[0], active = S().settingsSection;
    sec = document.createElement('section');
    sec.setAttribute('data-set-sec', id);
    sec.style.display = id === active ? '' : 'none';
    var head = document.createElement('header');
    head.innerHTML = '<h1>' + esc(def.label) + '</h1>' + (def.blurb ? '<p>' + esc(def.blurb) + '</p>' : '');
    sec.appendChild(head);
    // keep SECTIONS order
    var idx = SECTIONS.indexOf(def), before = null;
    Array.prototype.forEach.call(body.children, function (c) { if (!before && SECTIONS.map(function (x) { return x.id; }).indexOf(c.getAttribute('data-set-sec')) > idx) before = c; });
    body.insertBefore(sec, before);
    var btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('data-set-nav', id); btn.className = id === active ? 'active' : ''; btn.textContent = def.label;
    var nb = null;
    Array.prototype.forEach.call(nav.children, function (c) { if (!nb && SECTIONS.map(function (x) { return x.id; }).indexOf(c.getAttribute('data-set-nav')) > idx) nb = c; });
    nav.insertBefore(btn, nb);
    return sec;
  }

  // put one stray node where it belongs (or drop it if it is one of the unwired cards)
  function place(inner, el) {
    if (el.nodeType !== 1 || el.classList.contains('cs-set-nav') || el.classList.contains('cs-set-body')) return;
    // an injector may add one wrapper holding several cards: place each card on its own
    var inside = el.classList.contains('card') ? [] : Array.prototype.slice.call(el.querySelectorAll(':scope > .card'));
    if (inside.length > 1) {
      inside.forEach(function (c) { place(inner, c); });
      if (!el.querySelector('.card') && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    var t = titleOf(el);
    if (!t) { if (el.querySelector && el.querySelector('h1')) el.parentNode.removeChild(el); return; }   // the old page header
    if (REMOVE.some(function (r) { return t.indexOf(r) === 0; })) { el.parentNode.removeChild(el); return; }
    var key = Object.keys(MAP).filter(function (k) { return t.indexOf(k) === 0; })[0];
    ensureSection(inner, key ? MAP[key] : 'advanced').appendChild(el);
  }

  function absorb(inner) {
    Array.prototype.slice.call(inner.children).forEach(function (el) { place(inner, el); });
  }

  function organize() {
    var st = S();
    if (st.screen !== 'settings') return;
    var main = document.getElementById('main');
    var inner = main && main.querySelector('.screen-inner');
    if (!inner) return;
    if (inner.getAttribute('data-organized') !== '1') {
      st.settingsSection = SECTIONS.some(function (s) { return s.id === st.settingsSection; }) ? st.settingsSection : 'project';
      inner.setAttribute('data-organized', '1');
      inner.classList.add('cs-set');
      inner.removeAttribute('style');
      var nav = document.createElement('nav'); nav.className = 'cs-set-nav';
      var body = document.createElement('div'); body.className = 'cs-set-body';
      inner.insertBefore(body, inner.firstChild);
      inner.insertBefore(nav, inner.firstChild);
      // cards that other modules add after the first paint (local AI status, autonomy, ...) arrive later: catch them too
      try {
        var mo = new MutationObserver(function () { absorb(inner); });
        mo.observe(inner, { childList: true });
      } catch (_) {}
    }
    absorb(inner);
  }

  // switching section is a visibility change only: no re-render, so nothing in flight is lost
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-set-nav]');
    if (!b) return;
    var id = b.getAttribute('data-set-nav');
    S().settingsSection = id;
    document.querySelectorAll('[data-set-nav]').forEach(function (x) { x.classList.toggle('active', x === b); });
    document.querySelectorAll('[data-set-sec]').forEach(function (x) { x.style.display = x.getAttribute('data-set-sec') === id ? '' : 'none'; });
    var m = document.getElementById('main'); if (m) m.scrollTop = 0;
  });

  // run after every render
  function install() {
    var orig = window.renderAll;
    if (typeof orig !== 'function') { setTimeout(install, 40); return; }
    if (orig.__settingsOrganized) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { organize(); } catch (e) { try { console.error('settings layout', e); } catch (_) {} }
      return r;
    };
    wrapped.__settingsOrganized = true;
    window.renderAll = wrapped;
    try { renderAll = wrapped; } catch (_) {}
  }
  // after the other wrappers have installed themselves
  setTimeout(install, 400);

  window.CSSettings = { organize: organize, SECTIONS: SECTIONS, REMOVED: REMOVE.slice() };
})();
