'use strict';
/* engine.hardware + engine.modelmanager + engine.airouter + engine.cost —
   local-AI stack, in a window shim. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const dist = path.join(__dirname, '..', 'dist');
  const load = (n) => fs.readFileSync(path.join(dist, n), 'utf8');

  // ---- shims ----
  const files = {
    '/package.json': JSON.stringify({
      name: 'demo',
      dependencies: { stripe: '^14', '@supabase/supabase-js': '^2', 'next-auth': '^4', openai: '^4', pg: '^8' }
    })
  };
  const sov = {};
  const FS = {
    _data: Object.keys(files).reduce((m, k) => (m[k] = { type: 'file', content: files[k] }, m), {}),
    read: (p) => (files[p] == null ? null : files[p]),
    isFile: (p) => p in files, exists: (p) => p in files,
    write: (p, c) => { files[p] = String(c); }
  };
  const Sovereign = {
    read: (p) => { const r = sov[p]; return r == null ? null : (/\.json$/.test(p) ? JSON.parse(r) : r); },
    write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }
  };

  const win = { console };
  win.window = win;
  win.Engine = { FS, Sovereign };
  win.navigator = { hardwareConcurrency: 8, deviceMemory: 8, platform: 'Test' };
  win.document = { createElement: () => ({ getContext: () => null }) };
  win.fetch = () => Promise.reject(new Error('no network in test'));
  // minimal Engine.LLM shim so the facade + router have something to talk to
  let llmCfg = { providerId: '', apiKey: '', baseUrl: '', enabled: false, model: '' };
  win.Engine.LLM = {
    providers: [{ id: 'omniroute', keyless: true, baseUrl: 'http://localhost:20128' }],
    getConfig: () => llmCfg, setConfig: (p) => (llmCfg = Object.assign({}, llmCfg, p)),
    providerById: (id) => win.Engine.LLM.providers.find((x) => x.id === id) || null,
    resolveProvider: (c) => win.Engine.LLM.providerById(c.providerId) || { baseUrl: c.baseUrl },
    isConfigured: () => !!(llmCfg.enabled && (llmCfg.apiKey || /omniroute/.test(llmCfg.providerId) || /localhost|127\.0\.0\.1/.test(llmCfg.baseUrl))),
    status: () => ({ configured: win.Engine.LLM.isConfigured(), providerId: llmCfg.providerId, model: llmCfg.model, baseUrl: llmCfg.baseUrl }),
    chat: () => Promise.resolve({ text: '{}', model: 'x', provider: 'x' })
  };

  vm.createContext(win);
  for (const f of ['engine.hardware.js', 'engine.modelmanager.js', 'engine.airouter.js', 'engine.ai.js', 'engine.cost.js']) {
    vm.runInContext(load(f), win, { filename: f });
  }
  const En = win.Engine;

  t.ok('Engine.Hardware present', !!En.Hardware);
  t.ok('Engine.ModelManager present', !!En.ModelManager);
  t.ok('Engine.AIRouter present', !!En.AIRouter);
  t.ok('Engine.AI present', !!En.AI);
  t.ok('Engine.Cost present', !!En.Cost);

  // ---- OmniRoute is a known runtime + LLM provider ----
  t.ok('AIRouter knows the OmniRoute port', En.AIRouter.LOCAL_PORTS.some((p) => p.id === 'omniroute' && /20128/.test(p.url)));
  t.ok('ModelManager catalog + AIRouter still expose OmniRoute as free',
    En.AIRouter.LOCAL_PORTS.find((p) => p.id === 'omniroute').free === true);

  // ---- Engine.AI facade + wiring audit ----
  t.ok('Engine.AI.ready() is false before anything is configured', En.AI.ready() === false);
  const w0 = En.AI.wiring();
  t.ok('wiring audit lists >= 6 consumers', w0.consumers.length >= 6);
  t.ok('wiring audit reports not-connected', w0.connected === false);
  // simulate the analysis engines being present with AI hooks -> all consumers wired
  win.Engine.Agent = { __llmPatched: true };
  win.Engine.Orchestrator = {}; win.Engine.Contract = {}; win.Engine.Recovery = { aiSuggest: () => {} };
  win.Engine.Requirements = { aiAssist: () => {} };
  win.Engine.Universal = { buildStateAsync: () => {} };
  const wAll = En.AI.wiring();
  t.ok('every AI consumer is wired once the engines expose their hooks',
    wAll.wiredCount === wAll.total, wAll.wiredCount + '/' + wAll.total);
  // wire OmniRoute (keyless) and re-check
  En.AIRouter.apply({ runtime: { id: 'omniroute', openaiBase: 'http://localhost:20128', free: true }, model: 'auto' });
  t.ok('applying OmniRoute connects the facade (keyless)', En.AI.ready() === true);
  t.ok('status reports a free source', /free|OmniRoute/i.test(En.AI.status().source) || En.AI.status().free === true);

  // ---- ModelManager.estimate ----
  const e7 = En.ModelManager.estimate(7, 'q4_K_M', 8);
  t.ok('7B q4_K_M weights ~4.2 GB', e7.weightsGB > 3.8 && e7.weightsGB < 4.6);
  t.ok('7B q4_K_M total under 8 GB', e7.totalGB > 4.5 && e7.totalGB < 8);
  const e70 = En.ModelManager.estimate(70, 'q4_K_M', 8);
  t.ok('70B q4_K_M needs 40+ GB', e70.totalGB > 40);

  // ---- canRun ----
  const bigGpu = { effectiveVramGB: 24, ram: { totalGB: 64 } };
  const smallLaptop = { effectiveVramGB: 0, ram: { totalGB: 16 } };
  const tiny = { effectiveVramGB: 0, ram: { totalGB: 8 } };
  const q7 = En.ModelManager.CATALOG.find((m) => m.id === 'qwen2.5-coder:7b');
  const q32 = En.ModelManager.CATALOG.find((m) => m.id === 'qwen2.5-coder:32b');
  t.ok('7B fits a 24 GB GPU on the gpu path', En.ModelManager.canRun(q7, bigGpu).where === 'gpu');
  t.ok('7B fits a 16 GB laptop on the cpu path', En.ModelManager.canRun(q7, smallLaptop).where === 'cpu');
  t.ok('32B does NOT fit an 8 GB machine', En.ModelManager.canRun(q32, tiny).ok === false);
  t.ok('32B fits a 24 GB GPU', En.ModelManager.canRun(q32, bigGpu).ok === true);

  // ---- AIRouter.recommend ----
  const recGpu = En.AIRouter.recommend(bigGpu, { task: 'code' });
  t.ok('recommendation for a 24 GB GPU is a real model that fits', recGpu.fits && !!recGpu.primary);
  t.ok('recommendation prefers a coding model', /coder|codellama|starcoder|deepseek|phi/.test(recGpu.primary));
  const recTiny = En.AIRouter.recommend(tiny, { task: 'code' });
  t.ok('an 8 GB machine still gets a small model that fits', recTiny.fits && recTiny.primary && En.ModelManager.canRun(
    En.ModelManager.CATALOG.find((m) => m.id === recTiny.primary), tiny, recTiny.quant).ok);
  const recCpu = En.AIRouter.recommend({ effectiveVramGB: 0, ram: { totalGB: 32 } }, { task: 'code' });
  const recCpuB = En.ModelManager.CATALOG.find((m) => m.id === recCpu.primary).paramsB;
  t.ok('a CPU-only host is NOT told to run a 32B model', recCpu.backend === 'cpu' && recCpuB <= 14);

  // ---- Cost.classify + analyze ----
  t.ok('stripe is mandatory paid', (En.Cost.classify('stripe') || {}).mandatory === true);
  t.ok('openai is optional paid with a local alternative',
    (() => { const c = En.Cost.classify('openai'); return c && c.tier === 'paid' && c.mandatory === false && c.alt.length > 0; })());
  t.ok('next-auth is free', (En.Cost.classify('next-auth') || {}).tier === 'free');

  const report = En.Cost.analyze({});
  t.ok('cost report analysed the deps', report.totals.analyzed >= 4);
  t.ok('cost report flags stripe as the only mandatory cost',
    report.mandatoryCost.length === 1 && report.mandatoryCost[0].name === 'stripe');
  t.ok('cost report says no full zero-cost path (stripe present)', report.zeroCostPathAvailable === false);
  t.ok('cost report offers a zero-cost alternative for openai',
    report.optionalCost.some((o) => o.name === 'openai' && o.zeroCostAlternative.length > 0));
  t.ok('cost-analysis.json + cost-sovereignty.md written',
    typeof sov['cost-analysis.json'] === 'string' && /Cost sovereignty/.test(sov['cost-sovereignty.md'] || ''));

  // without stripe -> a zero-cost path exists
  files['/package.json'] = JSON.stringify({ name: 'demo2', dependencies: { openai: '^4', 'next-auth': '^4', pg: '^8', resend: '^3' } });
  const r2 = En.Cost.analyze({});
  t.ok('dropping the mandatory-paid dep opens a zero-cost path', r2.zeroCostPathAvailable === true);
};
