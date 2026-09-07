'use strict';
/*
 * observer-preload.js — runs in the MAIN world of the hidden observer window
 * (that window uses contextIsolation:false so this instrumentation actually
 * wraps the page's own console / fetch / XHR / errors). It only records into
 * an in-page buffer and exposes a read-only window.__obs; it sends nothing.
 */
(function () {
  var MAX = 500;
  var buf = { console: [], errors: [], network: [], nav: [], mutations: 0 };
  function push(arr, item) { arr.push(item); if (arr.length > MAX) arr.shift(); }

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      try {
        push(buf.console, {
          level: level, t: Date.now(),
          text: args.map(function (a) {
            try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); }
          }).join(' ').slice(0, 1000)
        });
      } catch (e) { /* ignore */ }
      orig.apply(null, args);
    };
  });

  window.addEventListener('error', function (e) {
    push(buf.errors, { t: Date.now(), message: String((e && (e.message || e.error)) || 'error'), source: e && e.filename, line: e && e.lineno });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    push(buf.errors, { t: Date.now(), message: 'unhandledrejection: ' + String(e && e.reason && e.reason.message || e && e.reason), source: '', line: 0 });
  });

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      var rec = { t: Date.now(), kind: 'fetch', method: method, url: String(url).slice(0, 300), status: 0, ms: 0 };
      push(buf.network, rec);
      var started = Date.now();
      return origFetch.apply(this, arguments).then(function (res) {
        rec.status = res.status; rec.ms = Date.now() - started; return res;
      }, function (err) {
        rec.status = -1; rec.ms = Date.now() - started; rec.error = String(err && err.message || err); throw err;
      });
    };
  }

  var OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    window.XMLHttpRequest = function () {
      var xhr = new OrigXHR();
      var rec;
      var open = xhr.open;
      xhr.open = function (method, url) {
        rec = { t: Date.now(), kind: 'xhr', method: String(method || 'GET'), url: String(url || '').slice(0, 300), status: 0, ms: 0 };
        return open.apply(xhr, arguments);
      };
      var send = xhr.send;
      xhr.send = function () {
        var started = Date.now();
        if (rec) push(buf.network, rec);
        xhr.addEventListener('loadend', function () { if (rec) { rec.status = xhr.status; rec.ms = Date.now() - started; } });
        return send.apply(xhr, arguments);
      };
      return xhr;
    };
  }

  function navRec(kind) { push(buf.nav, { t: Date.now(), kind: kind, url: location.href }); }
  var ps = history.pushState, rs = history.replaceState;
  history.pushState = function () { var r = ps.apply(this, arguments); navRec('pushState'); return r; };
  history.replaceState = function () { var r = rs.apply(this, arguments); navRec('replaceState'); return r; };
  window.addEventListener('popstate', function () { navRec('popstate'); });
  window.addEventListener('hashchange', function () { navRec('hashchange'); });

  // The preload runs at document-start, when <html>/<body> may not exist yet —
  // (re)attach the observer once the document is ready, and again on each SPA
  // navigation, so DOM effects of a control are actually counted.
  var mo = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      buf.mutations += 1 + (r.addedNodes ? r.addedNodes.length : 0) + (r.removedNodes ? r.removedNodes.length : 0);
    }
  });
  function attachMO() {
    var target = document.body || document.documentElement;
    if (!target) return;
    try { mo.disconnect(); } catch (e) { /* ignore */ }
    try { mo.observe(target, { childList: true, subtree: true, attributes: true, characterData: true }); } catch (e) { /* ignore */ }
  }
  attachMO();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachMO);
    window.addEventListener('load', attachMO);
  }

  navRec('load');

  Object.defineProperty(window, '__obs', {
    configurable: false,
    value: {
      read: function () {
        return {
          console: buf.console.slice(), errors: buf.errors.slice(),
          network: buf.network.slice(), nav: buf.nav.slice(), mutations: buf.mutations,
          url: location.href, title: document.title
        };
      },
      reset: function () {
        buf.console.length = 0; buf.errors.length = 0; buf.network.length = 0; buf.nav.length = 0; buf.mutations = 0;
      }
    }
  });
})();
