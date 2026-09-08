/* =====================================================================
   engine.airouter.js  —  Engine.AIRouter

   Makes local inference a first-class target (GodMode blueprint §28):
   discover the local runtimes, recommend a model for this host + task,
   and wire the winner into Engine.LLM. Falls back to a configured cloud
   provider only when nothing local fits.

   window.Engine.AIRouter
     discover()             -> Promise<{ runtimes:[{id,label,base,openaiBase,models}] }>
     recommend(hw, opts)    -> { primary, quant, backend, estGB, fits, reason, fallbacks[], cloud }
     apply(choice)          -> wires Engine.LLM to a running local endpoint
     route(opts)            -> Promise<plan>  (discover + recommend + apply if possible)
     status()               -> { localRuntimes, activeModel, source }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  function MM() { return Engine.ModelManager; }
  function HW() { return Engine.Hardware; }
  function LLM() { return Engine.LLM; }

  var LOCAL_PORTS = [
    { id: 'omniroute', label: 'OmniRoute (free gateway)', url: 'http://localhost:20128/v1/models', openaiBase: 'http://localhost:20128', kind: 'openai', free: true },
    { id: 'ollama', label: 'Ollama', url: 'http://localhost:11434/api/tags', openaiBase: 'http://localhost:11434', kind: 'ollama' },
    { id: 'lmstudio', label: 'LM Studio', url: 'http://localhost:1234/v1/models', openaiBase: 'http://localhost:1234', kind: 'openai' },
    { id: 'vllm', label: 'vLLM', url: 'http://localhost:8000/v1/models', openaiBase: 'http://localhost:8000', kind: 'openai' },
    { id: 'llamacpp', label: 'llama.cpp', url: 'http://localhost:8080/v1/models', openaiBase: 'http://localhost:8080', kind: 'openai' },
    { id: 'jan', label: 'Jan', url: 'http://localhost:1337/v1/models', openaiBase: 'http://localhost:1337', kind: 'openai' }
  ];

  function discover() {
    var D = window.desktop;
    if (D && D.isDesktop && D.ai && D.ai.discover) {
      return D.ai.discover().then(function (r) {
        if (r && r.ok === false) return { at: Date.now(), runtimes: [], count: 0, note: r.error };
        return r;
      }).catch(function (e) { return { at: Date.now(), runtimes: [], count: 0, note: String(e) }; });
    }
    // browser: best-effort direct probe (CSP may block — that's fine)
    var found = [];
    return Promise.all(LOCAL_PORTS.map(function (p) {
      return fetch(p.url, { method: 'GET' }).then(function (res) { return res.ok ? res.json() : null; })
        .then(function (j) {
          if (!j) return;
          var models = Array.isArray(j.models) ? j.models.map(function (m) { return { id: m.name }; })
            : Array.isArray(j.data) ? j.data.map(function (m) { return { id: m.id }; }) : [];
          found.push({ id: p.id, label: p.label, base: p.url.replace(/\/(api|v1)\/.*$/, ''), openaiBase: p.openaiBase, models: models });
        })
        .catch(function () { /* not running / blocked */ });
    })).then(function () { return { at: Date.now(), runtimes: found, count: found.length }; });
  }

  // Rank the catalogue for this host + task, largest-that-fits wins.
  function recommend(hw, opts) {
    opts = opts || {};
    var mm = MM();
    if (!mm) return { error: 'Engine.ModelManager not loaded' };
    var wantCode = opts.task !== 'chat';
    var ctxK = opts.contextK || 8;

    var ranked = mm.CATALOG
      .map(function (e) {
        var run = mm.canRun(e, hw, opts.quant || 'q4_K_M', ctxK);
        // largest-that-fits, but on the CPU path a smaller model is far more
        // usable — penalise size there so we don't recommend a 32B on CPU.
        var sizePref = run.where === 'gpu' ? e.paramsB : Math.max(0, 16 - Math.abs(e.paramsB - 9));
        var effB = e.activeB || e.paramsB;    // MoE: compute cost tracks active params
        return { entry: e, run: run,
          score: (run.ok ? 1000 : 0) + (wantCode && e.coding ? 250 : 0) + sizePref +
                 (run.where === 'gpu' ? 60 : 0) - (run.where === 'cpu' && effB > 14 ? 40 : 0) };
      })
      .filter(function (x) { return x.run.ok; })
      .sort(function (a, b) { return b.score - a.score; });

    var cloud = null;
    try {
      var cfg = LLM() && LLM().getConfig();
      if (cfg && cfg.apiKey) cloud = { providerId: cfg.providerId, model: cfg.model };
    } catch (_) { /* ignore */ }

    if (!ranked.length) {
      // nothing fits locally — smallest model + the reason, plus cloud fallback
      var smallest = mm.CATALOG.slice().sort(function (a, b) { return a.paramsB - b.paramsB; })[0];
      return {
        primary: null, quant: opts.quant || 'q4_K_M', backend: null, fits: false,
        reason: 'no catalogued model fits this host; smallest is ' + smallest.id + ' (' + mm.canRun(smallest, hw).reason + ')',
        fallbacks: [], cloud: cloud, smallest: smallest.id
      };
    }
    var top = ranked[0];
    return {
      primary: top.entry.id,
      paramsB: top.entry.paramsB,
      quant: top.run.quant,
      backend: top.run.where,               // 'gpu' | 'cpu'
      estGB: top.run.estGB,
      fits: true,
      reason: top.run.reason + (wantCode && top.entry.coding ? ' · coding-tuned' : ''),
      fallbacks: ranked.slice(1, 4).map(function (x) { return { id: x.entry.id, where: x.run.where, estGB: x.run.estGB }; }),
      cloud: cloud
    };
  }

  // Point Engine.LLM at a running local endpoint that serves `model`.
  function apply(choice) {
    var llm = LLM();
    if (!llm || !llm.setConfig) return { ok: false, error: 'Engine.LLM not loaded' };
    if (!choice || !choice.runtime || !choice.model) return { ok: false, error: 'need { runtime, model }' };
    var isOmni = choice.runtime.id === 'omniroute';
    llm.setConfig({
      providerId: isOmni ? 'omniroute' : 'openai_compat',
      baseUrl: choice.runtime.openaiBase || choice.runtime.base,
      model: choice.model,
      apiKey: isOmni ? '' : (choice.runtime.id === 'ollama' ? 'ollama' : (choice.apiKey || 'local')),
      enabled: true
    });
    return { ok: true, using: choice.model, via: choice.runtime.id, baseUrl: choice.runtime.openaiBase, free: !!choice.runtime.free };
  }

  // Install (first run only) + start OmniRoute, then wire it in as `auto` (free, no key).
  function ensureOmniRoute(onStatus) {
    var D = window.desktop;
    if (!(D && D.isDesktop && D.ai && D.ai.omniroute)) {
      return Promise.resolve({ ok: false, error: 'OmniRoute launch needs the desktop app — or run `npx omniroute serve` yourself and click Scan' });
    }
    return D.ai.omniroute('ensure').then(function (r) {
      if (!r || r.ok === false) return r || { ok: false, error: 'omniroute failed' };
      var res = apply({ runtime: { id: 'omniroute', openaiBase: 'http://localhost:20128', free: true }, model: 'auto' });
      return { ok: true, started: !!r.started, base: 'http://localhost:20128', wired: res.ok, using: 'auto' };
    });
  }

  function route(opts) {
    opts = opts || {};
    var hwP = HW() ? HW().probe() : Promise.resolve(null);
    return Promise.all([hwP, discover()]).then(function (res) {
      var hw = res[0], disc = res[1];
      var rec = recommend(hw, opts);
      var plan = { at: Date.now(), hardware: hw && (HW().summary ? HW().summary(hw) : null), discovered: disc, recommendation: rec, action: null };

      // is the recommended model already served by a running runtime?
      var served = null;
      (disc.runtimes || []).forEach(function (rt) {
        (rt.models || []).forEach(function (m) {
          var mid = String(m.id || '').toLowerCase();
          if (rec.primary && (mid === rec.primary.toLowerCase() || mid.split(':')[0] === rec.primary.split(':')[0])) {
            served = { runtime: rt, model: m.id };
          }
        });
      });
      // else — any served model at all we can use right now?
      if (!served && (disc.runtimes || []).length) {
        var rt0 = disc.runtimes.find(function (r) { return (r.models || []).length; });
        if (rt0) served = { runtime: rt0, model: rt0.models[0].id, adhoc: true };
      }

      if (served && opts.apply !== false) {
        var a = apply(served);
        plan.action = a.ok
          ? { kind: 'use-local', model: served.model, runtime: served.runtime.id, adhoc: !!served.adhoc }
          : { kind: 'error', error: a.error };
      } else if (rec.fits && rec.primary) {
        plan.action = { kind: 'suggest-pull', model: rec.primary, hint: 'ollama pull ' + rec.primary, backend: rec.backend };
      } else if (rec.cloud) {
        plan.action = { kind: 'use-cloud', provider: rec.cloud.providerId, model: rec.cloud.model };
      } else {
        plan.action = { kind: 'no-option', reason: rec.reason };
      }
      return plan;
    });
  }

  function status() {
    var out = { localRuntimes: [], activeModel: null, source: 'built-in synthesizer' };
    try {
      var cfg = LLM() && LLM().getConfig();
      if (cfg && cfg.enabled && cfg.apiKey) {
        out.activeModel = cfg.model || cfg.providerId;
        out.source = /localhost|127\.0\.0\.1/.test(cfg.baseUrl || '') ? 'local (' + cfg.baseUrl + ')' : ('cloud (' + cfg.providerId + ')');
      }
    } catch (_) { /* ignore */ }
    return discover().then(function (d) { out.localRuntimes = (d.runtimes || []).map(function (r) { return { id: r.id, models: (r.models || []).length }; }); return out; });
  }

  Engine.AIRouter = { discover: discover, recommend: recommend, apply: apply, route: route, status: status, ensureOmniRoute: ensureOmniRoute, LOCAL_PORTS: LOCAL_PORTS };
  console.info('[AIRouter] local inference router ready — Engine.AIRouter');
})();
