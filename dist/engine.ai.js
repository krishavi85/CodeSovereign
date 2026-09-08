/* =====================================================================
   engine.ai.js  —  Engine.AI

   One facade the whole app talks to for language-model work, plus a
   self-audit of every place AI is (or isn't) wired in.

   window.Engine.AI
     ready()               -> bool         (a provider is usable right now)
     status()              -> { connected, provider, model, free, source }
     ensure(opts)          -> Promise<status>  (auto-connect: local model,
                                                then OmniRoute free gateway)
     chat(msgs, opts)      -> Promise<{text,...}>   (raw completion)
     json(msgs, opts)      -> Promise<any>          (parsed JSON reply)
     consumers()           -> [{ id, label, wired, how }]   (the wiring audit)
     wiring()              -> { connected, consumers, wiredCount, total }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  function LLM() { return Engine.LLM; }
  function AR() { return Engine.AIRouter; }

  function ready() {
    try { return !!(LLM() && LLM().isConfigured && LLM().isConfigured()); } catch (_) { return false; }
  }

  function status() {
    var out = { connected: false, provider: null, model: null, free: false, source: 'built-in synthesizer' };
    try {
      var s = LLM() && LLM().status();
      if (s && s.configured) {
        out.connected = true; out.provider = s.providerId; out.model = s.model;
        var local = /localhost|127\.0\.0\.1/.test(s.baseUrl || '');
        out.free = s.providerId === 'omniroute' || (local && s.providerId !== 'openai');
        out.source = s.providerId === 'omniroute' ? 'OmniRoute (free gateway)'
          : local ? ('local (' + s.baseUrl + ')') : ('cloud (' + s.providerId + ')');
      }
    } catch (_) { /* ignore */ }
    return out;
  }

  // Auto-connect to *something*: a local model that fits, else the OmniRoute
  // free gateway (installs + starts it on desktop).
  function ensure(opts) {
    opts = opts || {};
    if (ready()) return Promise.resolve(status());
    var r = AR();
    if (!r) return Promise.resolve(status());
    return r.route({ apply: true, task: opts.task || 'code' }).then(function (plan) {
      if (ready()) return status();
      // nothing local — bring up OmniRoute
      if (r.ensureOmniRoute) {
        return r.ensureOmniRoute(opts.onStatus).then(function () { return status(); });
      }
      return status();
    }).catch(function () { return status(); });
  }

  function chat(msgs, o) {
    if (!ready()) return Promise.reject(new Error('AI not connected — call Engine.AI.ensure() or set a provider in Settings'));
    return LLM().chat(msgs, o || {});
  }
  function json(msgs, o) {
    return chat(msgs, Object.assign({ json: true }, o || {})).then(function (r) {
      var t = r.text || '';
      try { return JSON.parse(t); } catch (_) {}
      var m = t.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
      throw new Error('model did not return JSON');
    });
  }

  /* ---- the wiring audit: is AI connected to everything? ---- */
  function consumers() {
    var E = Engine;
    var list = [
      { id: 'agent', label: 'App generation (Agent / Generate App)',
        wired: !!(E.Agent && E.Agent.__llmPatched),
        how: 'LLM drafts the JSON file plan; deterministic synthesizer is the fallback' },
      { id: 'orchestrator', label: 'Pipeline task generation (Engine.Orchestrator)',
        wired: !!E.Orchestrator,
        how: 'a task with `prompt` -> Engine.LLM.complete; templates otherwise' },
      { id: 'contract', label: 'Requirement enrichment (Engine.Contract)',
        wired: !!(E.Contract),
        how: 'deriveLLM() expands the objective into extra requirements when connected' },
      { id: 'recovery', label: 'AI-assisted repair (Engine.Recovery)',
        wired: !!(E.Recovery && E.Recovery.aiSuggest),
        how: 'when a deterministic patch generator returns no-op, ask the model for a fix' },
      { id: 'requirements', label: 'Requirements intelligence (Engine.Requirements)',
        wired: !!(E.Requirements && E.Requirements.aiAssist),
        how: 'rule-based domain packs + aiAssist() folds in AI archetypes & implied requirements' },
      { id: 'universal', label: 'Prompt normalizer / classifier (Engine.Universal)',
        wired: !!(E.Universal && E.Universal.buildStateAsync),
        how: 'keyword rules + aiNormalize() — an LLM reads the objective when connected' },
      { id: 'router', label: 'Model routing (Engine.AIRouter)',
        wired: !!E.AIRouter,
        how: 'discover local runtimes + OmniRoute, recommend for the host, auto-wire' }
    ];
    return list;
  }
  function wiring() {
    var c = consumers();
    return { connected: ready(), status: status(), consumers: c,
      wiredCount: c.filter(function (x) { return x.wired; }).length, total: c.length };
  }

  Engine.AI = { ready: ready, status: status, ensure: ensure, chat: chat, json: json, consumers: consumers, wiring: wiring };
  console.info('[AI] facade + wiring audit ready — Engine.AI');
})();
