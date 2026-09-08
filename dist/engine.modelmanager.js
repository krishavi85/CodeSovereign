/* =====================================================================
   engine.modelmanager.js  —  Engine.ModelManager

   Model lifecycle for local inference (GodMode blueprint §27):
   VRAM/RAM estimation, a curated catalogue of open models, "can this
   host run it?", and real `ollama pull` through the proc bridge.

   window.Engine.ModelManager
     CATALOG                       curated open models with param counts
     QUANTS                        bits-per-weight for common GGUF quants
     estimate(paramsB, quant, ctxK)  -> { weightsGB, kvGB, overheadGB, totalGB }
     canRun(entry, hw, quant)        -> { ok, where:'gpu'|'cpu'|'no', estGB, headroomGB, reason }
     installed()                   -> Promise<[{id,...}]>   (from Engine.AIRouter.discover)
     pull(id, onLog)               -> Promise<{ ok, code }>  (desktop + `ollama`, trusted)
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  // Effective bits per weight for the common GGUF quantisations.
  var QUANTS = {
    'q2_K': 3.35, 'q3_K_M': 3.9, 'q4_0': 4.55, 'q4_K_M': 4.85, 'q5_K_M': 5.7,
    'q6_K': 6.6, 'q8_0': 8.5, 'fp16': 16, 'bf16': 16, 'fp32': 32
  };

  // Curated: open-weight models that are actually useful for app work. `activeB`
  // is set for MoE models (what actually has to be resident for a forward pass
  // is closer to activeB for compute, but the full weights still occupy memory).
  var CATALOG = [
    { id: 'qwen2.5-coder:1.5b', paramsB: 1.5, family: 'qwen2.5-coder', coding: true, note: 'tiny coder — laptops / CPU' },
    { id: 'qwen2.5-coder:3b', paramsB: 3, family: 'qwen2.5-coder', coding: true },
    { id: 'qwen2.5-coder:7b', paramsB: 7, family: 'qwen2.5-coder', coding: true, note: 'best value coder ~8 GB' },
    { id: 'qwen2.5-coder:14b', paramsB: 14, family: 'qwen2.5-coder', coding: true },
    { id: 'qwen2.5-coder:32b', paramsB: 32, family: 'qwen2.5-coder', coding: true, note: 'near-frontier coder, needs 24 GB' },
    { id: 'qwen2.5:7b', paramsB: 7, family: 'qwen2.5', coding: false },
    { id: 'qwen2.5:14b', paramsB: 14, family: 'qwen2.5', coding: false },
    { id: 'qwen2.5:32b', paramsB: 32, family: 'qwen2.5', coding: false },
    { id: 'llama3.2:1b', paramsB: 1.2, family: 'llama3.2', coding: false },
    { id: 'llama3.2:3b', paramsB: 3, family: 'llama3.2', coding: false },
    { id: 'llama3.1:8b', paramsB: 8, family: 'llama3.1', coding: false, note: 'solid generalist' },
    { id: 'llama3.1:70b', paramsB: 70, family: 'llama3.1', coding: false },
    { id: 'deepseek-coder-v2:16b', paramsB: 16, activeB: 2.4, family: 'deepseek-coder-v2', coding: true, note: 'MoE — fast, strong at code' },
    { id: 'codellama:7b', paramsB: 7, family: 'codellama', coding: true },
    { id: 'codellama:13b', paramsB: 13, family: 'codellama', coding: true },
    { id: 'phi3.5', paramsB: 3.8, family: 'phi', coding: true, note: 'small, punches up' },
    { id: 'phi4', paramsB: 14, family: 'phi', coding: true },
    { id: 'gemma2:2b', paramsB: 2.6, family: 'gemma2', coding: false },
    { id: 'gemma2:9b', paramsB: 9, family: 'gemma2', coding: false },
    { id: 'gemma2:27b', paramsB: 27, family: 'gemma2', coding: false },
    { id: 'mistral:7b', paramsB: 7, family: 'mistral', coding: false },
    { id: 'mistral-nemo:12b', paramsB: 12, family: 'mistral', coding: false },
    { id: 'mixtral:8x7b', paramsB: 47, activeB: 13, family: 'mixtral', coding: false, note: 'MoE — 47 GB weights' },
    { id: 'starcoder2:3b', paramsB: 3, family: 'starcoder2', coding: true },
    { id: 'starcoder2:7b', paramsB: 7, family: 'starcoder2', coding: true },
    { id: 'starcoder2:15b', paramsB: 15, family: 'starcoder2', coding: true }
  ];

  function estimate(paramsB, quant, ctxK) {
    var bpw = QUANTS[quant] || QUANTS.q4_K_M;
    ctxK = ctxK || 8;
    var weightsGB = paramsB * bpw / 8;
    // KV cache ~ grows with params and context; fp16 cache.
    var kvGB = Math.max(0.15, paramsB * (ctxK / 4) * 0.03);
    var overheadGB = 1.2;
    var totalGB = Math.round((weightsGB + kvGB + overheadGB) * 10) / 10;
    return {
      weightsGB: Math.round(weightsGB * 10) / 10,
      kvGB: Math.round(kvGB * 10) / 10,
      overheadGB: overheadGB, totalGB: totalGB
    };
  }

  function canRun(entry, hw, quant, ctxK) {
    quant = quant || 'q4_K_M';
    var est = estimate(entry.paramsB, quant, ctxK);
    var vram = (hw && hw.effectiveVramGB) || 0;
    var ram = (hw && hw.ram && hw.ram.totalGB) || 0;
    // GPU path needs the whole thing in VRAM with a little headroom.
    if (vram >= est.totalGB + 0.8) {
      return { ok: true, where: 'gpu', quant: quant, estGB: est.totalGB, headroomGB: Math.round((vram - est.totalGB) * 10) / 10,
        reason: 'fits in ' + vram + ' GB VRAM at ' + quant };
    }
    // CPU path: keep ~30% of RAM for the OS + app.
    var ramBudget = ram * 0.7;
    if (ramBudget >= est.totalGB) {
      return { ok: true, where: 'cpu', quant: quant, estGB: est.totalGB, headroomGB: Math.round((ramBudget - est.totalGB) * 10) / 10,
        reason: 'runs on CPU in ' + ram + ' GB RAM at ' + quant + ' (slower)' };
    }
    // try a smaller quant before giving up
    if (quant !== 'q3_K_M') {
      var lower = canRun(entry, hw, 'q3_K_M', ctxK);
      if (lower.ok) { lower.reason += ' — dropped to q3_K_M to fit'; return lower; }
    }
    return { ok: false, where: 'no', quant: quant, estGB: est.totalGB, headroomGB: Math.round((Math.max(vram, ram * 0.7) - est.totalGB) * 10) / 10,
      reason: 'needs ~' + est.totalGB + ' GB; host has ' + (vram ? vram + ' GB VRAM / ' : '') + ram + ' GB RAM' };
  }

  function installed() {
    if (Engine.AIRouter && Engine.AIRouter.discover) {
      return Engine.AIRouter.discover().then(function (d) {
        var out = [];
        (d.runtimes || []).forEach(function (rt) {
          (rt.models || []).forEach(function (m) { out.push({ id: m.id, runtime: rt.id, params: m.params || null, quant: m.quant || null, sizeBytes: m.sizeBytes || null }); });
        });
        return out;
      });
    }
    return Promise.resolve([]);
  }

  function pull(id, onLog) {
    var D = window.desktop;
    if (!D || !D.isDesktop) return Promise.resolve({ ok: false, error: 'model pull needs the desktop app' });
    if (!/^[\w.:\/-]{1,80}$/.test(String(id || ''))) return Promise.resolve({ ok: false, error: 'bad model id' });
    // Ollama is the one runtime with a stable "pull" CLI.
    if (window.CSExec && window.CSExec.run) {
      return window.CSExec.run('ollama', ['pull', id], { label: 'ollama pull ' + id, timeout: 60 * 60 * 1000 })
        .then(function (r) {
          if (onLog) onLog(r.output || '');
          return { ok: r.code === 0, code: r.code, output: String(r.output || '').slice(-4000) };
        });
    }
    return D.proc.run({ cmd: 'ollama', args: ['pull', id], cwd: '.', timeoutMs: 60 * 60 * 1000 }).then(function (r) {
      var o = r || {};
      return { ok: o.code === 0, code: o.code, output: ((o.stdout || '') + (o.stderr || '')).slice(-4000) };
    });
  }

  Engine.ModelManager = { CATALOG: CATALOG, QUANTS: QUANTS, estimate: estimate, canRun: canRun, installed: installed, pull: pull };
  console.info('[ModelManager] local model lifecycle ready — Engine.ModelManager');
})();
