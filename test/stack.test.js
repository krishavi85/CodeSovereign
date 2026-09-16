'use strict';
/* Open-source building stack: catalog, router, aider, pocketflow, temporal, memory, backends. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(seed) {
  const distDir = path.join(__dirname, '..', 'dist');
  const store = Object.assign({}, seed || {});
  const win = {
    console,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    addEventListener: () => {},
    document: {
      createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }),
      body: { appendChild() {} },
      readyState: 'complete',
      addEventListener: () => {}
    },
    Event: function Event() {},
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { clipboard: null }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine-extras.js');
  run('engine.marketplace.js');
  run('engine.recovery.js');
  run('engine.llm.js');
  run('engine.stack.js');
  return { win, store };
}

const DOC_LINKS = [
  'https://github.com/cline/cline',
  'https://github.com/Aider-AI/aider',
  'https://github.com/All-Hands-AI/OpenHands',
  'https://github.com/The-Pocket/PocketFlow',
  'https://github.com/temporalio/temporal',
  'https://github.com/mudler/LocalAI',
  'https://github.com/ggerganov/llama.cpp',
  'https://github.com/supabase/supabase',
  'https://github.com/pocketbase/pocketbase',
  'https://github.com/appwrite/appwrite',
  'https://github.com/qdrant/qdrant',
  'https://github.com/weaviate/weaviate',
  'https://github.com/milvus-io/milvus',
  'https://github.com/testcontainers',
  'https://github.com/testcontainers/testcontainers-java',
  'https://github.com/microsoft/playwright',
  'https://github.com/vitest-dev/vitest',
  'https://github.com/jestjs/jest',
  'https://github.com/pytest-dev/pytest',
  'https://github.com/postgres/postgres',
  'https://github.com/sqlite/sqlite',
  'https://github.com/redis/redis',
  'https://github.com/duckdb/duckdb',
  'https://github.com/mongodb/mongo'
];

module.exports = async function (t) {
  const { win, store } = load();
  const S = win.BuildingStack;
  t.ok('BuildingStack is exposed', !!S);

  const cat = S.catalog();
  t.equal('catalog has 24 engines', cat.length, 24);

  const links = S.links();
  DOC_LINKS.forEach((url) => {
    t.ok('catalog includes ' + url, links.indexOf(url) >= 0);
  });
  t.equal('no extra/missing links', links.length, DOC_LINKS.length);

  t.equal('pocketflow has 9 flows', S.PocketFlow.flows.length, 9);
  t.equal('temporal has 19 stages', S.Temporal.stages.length, 19);
  t.equal('memory has 7 domains', S.Memory.domains.length, 7);
  t.equal('aider has 8 ops', S.Aider.ops.length, 8);

  const analyzed = S.Aider.analyzeRepository();
  t.ok('analyzeRepository counts files', analyzed.fileCount > 0);

  const map = S.Aider.generateRepoMap();
  t.ok('generateRepoMap writes REPO_MAP.md', win.Engine.FS.exists('/.codesovereign/REPO_MAP.md'));
  t.ok('repo map lists files', map.files > 0);

  const lint = S.Aider.runLint();
  t.ok('runLint returns issue counts', typeof lint.issues === 'number');

  const tests = S.Aider.runTests();
  t.ok('runTests returns build result', tests && typeof tests.ok === 'boolean');

  const snap = S.Aider.commitCheckpoint('test');
  t.ok('commitCheckpoint captures snapshot', snap.ok && !!snap.snapshotId);

  const flow = S.PocketFlow.run('ScaffoldFlow');
  t.ok('ScaffoldFlow runs', flow.ok === true && flow.flow === 'ScaffoldFlow');

  const started = S.Temporal.start({ test: true });
  t.ok('temporal start has runId', !!started.runId);
  const cp = S.Temporal.checkpoint();
  t.ok('temporal checkpoint advances', cp.ok && cp.run.stage === 1);
  const failed = S.Temporal.fail('boom');
  t.equal('temporal fail status', failed.run.status, 'failed');
  const retried = S.Temporal.retry();
  t.equal('temporal retry running', retried.run.status, 'running');
  const resumed = S.Temporal.resume();
  t.ok('temporal resume from checkpoint', resumed.ok);

  S.Memory.remember('error', 'syntax error in /scripts/app.js', { file: '/scripts/app.js' });
  const hits = S.Memory.search('syntax error');
  t.ok('memory search finds error domain', hits.length > 0 && hits[0].domain === 'error');

  const indexed = S.Memory.indexWorkspace();
  t.ok('indexWorkspace indexes files', indexed.indexed > 0);
  t.equal('default vector engine is qdrant', S.Memory.engine(), 'qdrant');
  S.Memory.setEngine('weaviate');
  t.equal('vector engine switches', S.Memory.engine(), 'weaviate');
  S.Memory.setEngine('qdrant');

  const gen = S.Backends.generate('pocketbase');
  t.ok('pocketbase generator writes files', gen.ok && gen.files.length >= 3);
  t.ok('pocketbase.json exists', win.Engine.FS.exists('/pocketbase.json'));

  const sb = S.Backends.generate('supabase');
  t.ok('supabase generator writes migration', sb.ok && win.Engine.FS.exists('/supabase/migrations/0001_init.sql'));

  const plan = S.Verify.testcontainersPlan();
  t.ok('testcontainers plan has services', plan.services.length >= 1);
  t.ok('plan cites testcontainers org', plan.org.indexOf('github.com/testcontainers') >= 0);

  const r = S.Router.setGateway('localai');
  t.equal('router switches to localai', r.router.gateway, 'localai');
  t.ok('LLM provider includes localai', win.Engine.LLM.providers.some((p) => p.id === 'localai'));
  t.ok('LLM provider includes llamacpp', win.Engine.LLM.providers.some((p) => p.id === 'llamacpp'));
  const cfg = win.Engine.LLM.getConfig();
  t.equal('applyToLLM selected localai', cfg.providerId, 'localai');
  t.ok('localai needs no API key', win.Engine.LLM.providers.find((p) => p.id === 'localai').local === true);

  win.Engine.LLM.setConfig({ providerId: 'openai', apiKey: 'sk-secret', enabled: true, model: 'gpt-4o-mini', baseUrl: '' });
  let lastPatch = null;
  const origSet = win.Engine.LLM.setConfig;
  win.Engine.LLM.setConfig = function (patch) {
    lastPatch = patch;
    return origSet.call(this, patch);
  };
  S.Router.setGateway('localai');
  t.ok('local switch does not pass apiKey', lastPatch && !Object.prototype.hasOwnProperty.call(lastPatch, 'apiKey'));
  t.equal('switching to localai keeps the LLM key in its own store', win.Engine.LLM.getConfig().apiKey, 'sk-secret');
  t.equal('switching to localai sets provider', win.Engine.LLM.getConfig().providerId, 'localai');
  t.ok('router snapshot has no apiKey', S.Router.get().cloudSnapshot && S.Router.get().cloudSnapshot.apiKey == null);
  t.ok('cs.stack.v1 does not contain the cloud key', String(store['cs.stack.v1'] || '').indexOf('sk-secret') < 0);
  t.ok('cs.stack.v1 snapshot omits apiKey field', !/"apiKey"/.test(String(store['cs.stack.v1'] || '')));
  S.Router.setGateway('cloud');
  t.ok('cloud restore does not pass apiKey', lastPatch && !Object.prototype.hasOwnProperty.call(lastPatch, 'apiKey'));
  t.equal('cloud restore providerId', win.Engine.LLM.getConfig().providerId, 'openai');
  t.equal('cloud restore apiKey', win.Engine.LLM.getConfig().apiKey, 'sk-secret');
  S.Router.setGateway('llamacpp');
  t.ok('llamacpp switch does not pass apiKey', lastPatch && !Object.prototype.hasOwnProperty.call(lastPatch, 'apiKey'));
  t.equal('llamacpp keeps the LLM key in its own store', win.Engine.LLM.getConfig().apiKey, 'sk-secret');
  S.reset();
  t.equal('reset gateway is cloud', S.Router.get().gateway, 'cloud');
  t.equal('reset restores cloud provider', win.Engine.LLM.getConfig().providerId, 'openai');
  t.equal('reset restores cloud apiKey', win.Engine.LLM.getConfig().apiKey, 'sk-secret');
  win.Engine.LLM.setConfig = origSet;

  const leaked = load({
    'cs.stack.v1': JSON.stringify({
      router: { gateway: 'localai', cloudSnapshot: { providerId: 'openai', apiKey: 'sk-leaked', model: 'gpt-4o' } }
    })
  });
  t.ok('boot scrubs a leaked snapshot key from storage', String(leaked.store['cs.stack.v1'] || '').indexOf('sk-leaked') < 0);
  t.ok('boot snapshot has no apiKey', !leaked.win.BuildingStack.Router.get().cloudSnapshot || leaked.win.BuildingStack.Router.get().cloudSnapshot.apiKey == null);

  S.Execution.set('aider');
  t.equal('execution backend is aider', S.Execution.current(), 'aider');
  t.ok('cline agents listed', S.Execution.agents.indexOf('RepairAgent') >= 0);

  const M = win.TemplateMarketplace;
  t.ok('marketplace registerDefault exists', typeof M.registerDefault === 'function');
  const tpl = await M.get('stack-cline');
  t.ok('stack-cline is a marketplace engine template', tpl && tpl.category === 'engine');
  t.ok('stack-cline description has github link', /github.com\/cline\/cline/.test(tpl.desc));

  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  t.ok('index.html loads engine.stack.js', /engine\.stack\.js/.test(html));
  t.ok('index.html loads app.stack.js', /app\.stack\.js/.test(html));
  t.ok('CSP allows LocalAI on 8080', /http:\/\/127\.0\.0\.1:8080/.test(html) && /http:\/\/localhost:8080/.test(html));
  t.ok('CSP allows llama.cpp on 8081', /http:\/\/127\.0\.0\.1:8081/.test(html) && /http:\/\/localhost:8081/.test(html));
  t.ok('CSP does not wildcard every loopback port', !/127\.0\.0\.1:\*/.test(html) && !/localhost:\*/.test(html));
  t.ok('CSP does not allow loopback websockets', !/ws:\/\/127\.0\.0\.1/.test(html) && !/ws:\/\/localhost/.test(html));

  const extras = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.stack.js'), 'utf8');
  const mpSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.marketplace.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  t.ok('UI injector does not add nav pages', !/S\.screen\s*=\s*['"]stack['"]/.test(extras));
  t.ok('injects into Settings', /renderSettings/.test(extras));
  t.ok('injects into Agent', /renderAgent/.test(extras));
  t.ok('injects into Factory', /renderFactory/.test(extras));
  t.ok('injects into Pipelines', /renderPipelines/.test(extras));
  t.ok('marketplace banner is composed into Marketplace HTML', /renderStackMarketplaceBanner/.test(mpSrc));
  t.ok('marketplace bind calls bindBuildingStack', /bindBuildingStack/.test(mpSrc));
  t.ok('marketplace toasts fall back to window.toast', /csToast \|\| window\.toast/.test(mpSrc));
  t.ok('marketplace Install is delegated from the screen root', /__mpBound/.test(mpSrc) && /hit\('\.mp-install'\)/.test(mpSrc));
  t.ok('app.js aliases csToast to toast', /window\.csToast\s*=\s*toast/.test(appSrc));
  t.ok('stack UI does not wrap MarketplaceUI.render', !/MarketplaceUI/.test(extras) && !/insertAdjacentHTML/.test(extras));
  t.ok('stack clicks are delegated from the screen root', /__stackRootBound/.test(extras) && /data-stack-action/.test(extras));

  // UI injector: stack card lands on Settings without a new page.
  const uiStore = {};
  const uiWin = {
    console,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(uiStore, k) ? uiStore[k] : null),
      setItem: (k, v) => { uiStore[k] = String(v); },
      removeItem: (k) => { delete uiStore[k]; }
    },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, appendChild() {} }) },
    addEventListener() {},
    setTimeout: (fn, ms) => { if (ms) return; fn(); },
    BuildingStack: S,
    Engine: win.Engine,
    toast() {},
    renderAll() {},
    renderSettings() {
      return '<div class="screen-inner"><div class="card"><h3 class="cs-h3">Integrations</h3></div><div class="card"><h3 class="cs-h3">Tools</h3></div></div>';
    },
    renderAgent() { return '<div><div style="border:1px solid rgba(109,93,252,.4)"><input id="agentPromptInput"></div></div>'; },
    renderFactory() { return '<div class="screen-inner"><div>Recently modified</div></div>'; },
    renderPipelines() { return '<div class="screen-inner"><div>Workflow State Machine</div></div>'; },
    renderRecovery() { return '<div class="screen-inner"><!-- Plugin & MCP Hub --><div>hub</div></div>'; },
    bindSettings() {},
    bindAgent() {},
    bindFactory() {},
    bindPipelines() {},
    bindRecovery() {},
    bindPhase8() {}
  };
  uiWin.window = uiWin;
  vm.createContext(uiWin);
  vm.runInContext(extras, uiWin, { filename: 'app.stack.js' });
  t.ok('renderSettings wrapped by stack injector', uiWin.renderSettings.__stackInjected);
  const settingsHtml = uiWin.renderSettings();
  t.ok('Settings shows Building Stack card', /Open-Source Building Stack/.test(settingsHtml));
  t.ok('Settings lists Cline github link', /github.com\/cline\/cline/.test(settingsHtml));
  t.ok('stack card sits before Tools', settingsHtml.indexOf('Open-Source Building Stack') < settingsHtml.indexOf('Tools</h3>'));
  t.ok('Agent shows execution backends', /Execution backend/.test(uiWin.renderAgent()));
  t.ok('Factory shows PocketFlow', /GodMode generation flows/.test(uiWin.renderFactory()));
  t.ok('Pipelines shows Temporal', /Durable build pipeline/.test(uiWin.renderPipelines()));
  t.ok('Recovery shows Aider engine', /Aider recovery engine/.test(uiWin.renderRecovery()));
};
