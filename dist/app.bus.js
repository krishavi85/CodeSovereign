/* =====================================================================
 * app.bus.js
 * Cross-tab message bus + service registry.
 *
 * Provides:
 *   - TabBus.request(target, action, payload) - request/response to a tab
 *   - TabBus.broadcast(event, payload)        - fanout to all tabs
 *   - TabBus.on(event, handler)               - subscribe to a bus event
 *   - TabBus.audit()                          - return the audit log
 *   - TabBus.services()                       - return the service matrix
 *
 * Every call (request/broadcast/response) is recorded into the audit log
 * and into the V4 certificate as evidence.  Tabs register the services
 * they can fulfill via TabBus.register(tabName, serviceMap).
 *
 * The bus also subscribes to engine-extras.js's EventBus so existing
 * events (workflow:transition, repair:complete, etc.) finally reach the UI.
 * ===================================================================== */

(function () {
  'use strict';

  // --------- tab metadata ---------
  const TABS = [
    { id: 'welcome',   label: 'Welcome',   color: '#34d399' },
    { id: 'universal', label: 'Universal', color: '#22d3ee' },
    { id: 'agent',     label: 'Agent',     color: '#a78bfa' },
    { id: 'ide',       label: 'IDE',       color: '#60a5fa' },
    { id: 'factory',   label: 'Factory',   color: '#f59e0b' },
    { id: 'pipelines', label: 'Pipelines', color: '#c084fc' },
    { id: 'recovery',  label: 'Recovery',  color: '#f472b6' },
    { id: 'settings',  label: 'Settings',  color: '#94a3b8' }
  ];

  // --------- internal state ---------
  const _audit = [];           // [{id, at, kind, from, to, action, ok, ms, payload, error}]
  const _subs = {};            // event -> [handler]
  const _services = {};        // tabId -> { actionName: function(payload) }
  const _pending = new Map();  // requestId -> resolve/reject
  const _maxAudit = 200;
  let _seq = 0;
  let _ebBound = false;

  function _now() { return Date.now(); }
  function _nextId() { return 'bus_' + (++_seq) + '_' + Math.random().toString(36).slice(2, 6); }

  function _record(entry) {
    entry.id = entry.id || _nextId();
    entry.at = entry.at || _now();
    _audit.unshift(entry);
    if (_audit.length > _maxAudit) _audit.length = _maxAudit;
    // Mirror to V4 certificate evidence
    if (typeof window !== 'undefined' && window.Engine && window.Engine.V4Certificate) {
      try { window.Engine.V4Certificate.recordEvidence({ kind: 'tabbus', subkind: entry.kind, from: entry.from, to: entry.to, action: entry.action, ok: entry.ok }); } catch(_){}
    }
    return entry;
  }

  // --------- public API ---------

  function register(tabId, serviceMap) {
    if (!tabId || !serviceMap) return { ok: false, reason: 'missing args' };
    _services[tabId] = serviceMap;
    _record({ kind: 'register', from: tabId, action: 'register', ok: true, payload: Object.keys(serviceMap) });
    return { ok: true, tab: tabId, actions: Object.keys(serviceMap) };
  }

  function unregister(tabId) {
    delete _services[tabId];
    _record({ kind: 'unregister', from: tabId, action: 'unregister', ok: true });
    return { ok: true };
  }

  // Send a request to a specific tab.  If the target has a handler, the
  // returned promise resolves with the handler's return value.  If the
  // handler throws, the promise rejects.  If the tab doesn't have the
  // service, the promise rejects with a clear reason.
  async function request(target, action, payload, opts) {
    const o = opts || {};
    const from = o.from || (typeof S !== 'undefined' && S && S.screen) || 'unknown';
    const id = _nextId();
    const started = _now();
    const entry = _record({ kind: 'request', id, from, to: target, action, payload, ok: null });

    const tab = _services[target];
    if (!tab) {
      entry.ok = false;
      entry.error = 'unknown target tab';
      entry.ms = _now() - started;
      _record(Object.assign({}, entry));
      throw new Error('TabBus: unknown target "' + target + '"');
    }
    const fn = tab[action];
    if (typeof fn !== 'function') {
      entry.ok = false;
      entry.error = 'no such action "' + action + '" on tab "' + target + '"';
      entry.ms = _now() - started;
      _record(Object.assign({}, entry));
      throw new Error('TabBus: tab "' + target + '" has no action "' + action + '"');
    }

    let result;
    try {
      result = await fn(payload || {}, { requestId: id, from });
    } catch (e) {
      entry.ok = false;
      entry.error = e && e.message ? e.message : String(e);
      entry.ms = _now() - started;
      _record(Object.assign({}, entry));
      throw e;
    }
    entry.ok = !!(result && result.ok !== false);
    entry.response = result;
    entry.ms = _now() - started;
    _record(Object.assign({}, entry));
    return result;
  }

  // Fire-and-forget broadcast
  function broadcast(event, payload) {
    const from = (typeof S !== 'undefined' && S && S.screen) || 'unknown';
    const entry = _record({ kind: 'broadcast', from, action: event, payload, ok: true });
    (_subs[event] || []).forEach(function (h) {
      try { h(payload, { from, id: entry.id }); } catch (_) {}
    });
    (_subs['*'] || []).forEach(function (h) {
      try { h(event, payload, { from, id: entry.id }); } catch (_) {}
    });
    return { ok: true, listeners: (_subs[event] || []).length };
  }

  function on(event, handler) {
    if (!_subs[event]) _subs[event] = [];
    _subs[event].push(handler);
    return function () { off(event, handler); };
  }

  function off(event, handler) {
    if (!_subs[event]) return;
    _subs[event] = _subs[event].filter(function (h) { return h !== handler; });
  }

  function audit(limit) {
    return _audit.slice(0, limit || 50);
  }

  function clearAudit() {
    _audit.length = 0;
    return { ok: true };
  }

  function services() {
    const out = {};
    TABS.forEach(function (t) {
      out[t.id] = {
        label: t.label,
        color: t.color,
        actions: Object.keys(_services[t.id] || {})
      };
    });
    return out;
  }

  function matrix() {
    // Returns a 2D matrix: rows = requesters, columns = fulfillers
    // cell: true if the requester has called any action on the fulfiller
    // (we infer from audit history).
    const out = {};
    TABS.forEach(function (t) { out[t.id] = {}; TABS.forEach(function (u) { out[t.id][u.id] = 0; }); });
    _audit.forEach(function (e) {
      if (e.kind !== 'request' || !e.from || !e.to) return;
      if (out[e.from] && out[e.from][e.to] != null) out[e.from][e.to] += 1;
    });
    return out;
  }

  function tabs() { return TABS.slice(); }

  // Bridge the existing engine-extras.js EventBus into our handler system,
  // so events that were previously dropped now reach UI subscribers.
  function bindEngineEventBus() {
    if (_ebBound) return;
    if (!window.EngineExtras || !window.EngineExtras.EventBus) return;
    _ebBound = true;
    const EB = window.EngineExtras.EventBus;
    // Replay the most recent events on startup
    try {
      const recent = EB.history ? EB.history(20) : [];
      recent.forEach(function (e) {
        // Don't flood the audit with historical events - just record once
        _record({ kind: 'engine-event-replay', from: 'engine', action: e.event, payload: e.payload, ok: true });
      });
    } catch (_) {}
    // Subscribe to all engine events using the wildcard
    EB.on('*', function (event, payload, meta) {
      // record but don't fan out as a TabBus broadcast (would be recursive)
      _record({ kind: 'engine-event', from: 'engine', action: event, payload, ok: true });
    });
  }

  // Convenience: navigate to a tab and log it
  function navigate(target, opts) {
    const from = (typeof S !== 'undefined' && S && S.screen) || 'unknown';
    const entry = _record({ kind: 'navigate', from, to: target, action: 'navigate', payload: opts, ok: true });
    if (typeof S !== 'undefined' && S) {
      S.screen = target;
      if (typeof renderAll === 'function') {
        try { renderAll(); } catch (_) {}
      }
    }
    // Tell subscribers
    (_subs['tab:navigate'] || []).forEach(function (h) {
      try { h(target, { from, opts: opts || {} }); } catch (_) {}
    });
    return { ok: true, tab: target };
  }

  // --------- expose ---------
  const TabBus = {
    TABS: TABS,
    tabs: tabs,
    register: register,
    unregister: unregister,
    request: request,
    broadcast: broadcast,
    on: on,
    off: off,
    navigate: navigate,
    audit: audit,
    clearAudit: clearAudit,
    services: services,
    matrix: matrix,
    bindEngineEventBus: bindEngineEventBus
  };

  if (typeof window !== 'undefined') {
    window.TabBus = TabBus;
    if (window.Engine) window.Engine.TabBus = TabBus;
  }

  // Try binding to the engine bus as soon as we load
  setTimeout(bindEngineEventBus, 0);

})();
