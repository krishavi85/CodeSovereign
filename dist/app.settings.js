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
 *
 * IMPORTANT: cards are never MOVED. Several handlers look their inputs up through the container they were
 * bound to (host.querySelector at click time), so re-parenting a card silently breaks its buttons. Sections
 * are shown and hidden with CSS only; the grid places the navigation in the left column.
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
  function def(id) { return SECTIONS.filter(function (s) { return s.id === id; })[0]; }

  function titleOf(el) {
    var h = el.querySelector('h3, h2, summary');
    return h ? h.textContent.replace(/\s+/g, ' ').trim().toLowerCase() : '';
  }
  function sectionFor(title) {
    var key = Object.keys(MAP).filter(function (k) { return title.indexOf(k) === 0; })[0];
    return key ? MAP[key] : 'advanced';
  }
  function isRemoved(title) { return REMOVE.some(function (r) { return title.indexOf(r) === 0; }); }

  function show(inner, id) {
    S().settingsSection = id;
    Array.prototype.forEach.call(inner.querySelectorAll('[data-set-sec]'), function (el) { el.style.display = el.getAttribute('data-set-sec') === id ? '' : 'none'; });
    Array.prototype.forEach.call(inner.querySelectorAll('[data-set-nav]'), function (b) { b.classList.toggle('active', b.getAttribute('data-set-nav') === id); });
    var d = def(id), head = inner.querySelector('.cs-set-head');
    if (head && d) head.innerHTML = '<h1>' + esc(d.label) + '</h1>' + (d.blurb ? '<p>' + esc(d.blurb) + '</p>' : '');
  }

  // tag one card (in place) with its section, or drop it if it is one of the unwired cards
  function tag(inner, el) {
    if (el.nodeType !== 1 || el.hasAttribute('data-set-sec') || el.classList.contains('cs-set-nav') || el.classList.contains('cs-set-head')) return;
    var cards = el.classList.contains('card') ? [] : Array.prototype.slice.call(el.querySelectorAll(':scope > .card'));
    if (cards.length > 1) { cards.forEach(function (c) { tag(inner, c); }); return; }   // an injector's wrapper holding several cards
    var t = titleOf(el);
    if (!t) { if (el.querySelector && el.querySelector('h1') && el.parentNode) el.parentNode.removeChild(el); return; }   // the old page header
    if (isRemoved(t)) { if (el.parentNode) el.parentNode.removeChild(el); return; }
    var sec = sectionFor(t);
    el.setAttribute('data-set-sec', sec);
    el.style.display = sec === S().settingsSection ? '' : 'none';
    var nav = inner.querySelector('.cs-set-nav');
    if (nav && !nav.querySelector('[data-set-nav="' + sec + '"]')) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.setAttribute('data-set-nav', sec); btn.className = sec === S().settingsSection ? 'active' : ''; btn.textContent = def(sec).label;
      var idx = SECTIONS.indexOf(def(sec)), before = null;
      Array.prototype.forEach.call(nav.children, function (c) { if (!before && SECTIONS.indexOf(def(c.getAttribute('data-set-nav'))) > idx) before = c; });
      nav.insertBefore(btn, before);
    }
  }

  function absorb(inner) {
    Array.prototype.slice.call(inner.children).forEach(function (el) { tag(inner, el); });
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
      var head = document.createElement('div'); head.className = 'cs-set-head';
      inner.insertBefore(head, inner.firstChild);
      inner.insertBefore(nav, inner.firstChild);
      // cards that other modules add after the first paint (local AI status, autonomy, ...) arrive later: catch them too
      try { new MutationObserver(function () { absorb(inner); }).observe(inner, { childList: true }); } catch (_) {}
    }
    absorb(inner);
    show(inner, st.settingsSection);
  }

  // switching section is a visibility change only: no re-render, so nothing in flight is lost
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-set-nav]');
    if (!b) return;
    var inner = b.closest('.cs-set');
    if (inner) show(inner, b.getAttribute('data-set-nav'));
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
