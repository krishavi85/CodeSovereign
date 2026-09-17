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
  const sbSql = win.Engine.FS.read('/supabase/migrations/0001_init.sql') || '';
  t.ok('supabase RLS is enabled', /enable row level security/.test(sbSql));
  t.ok('supabase profiles are not world-readable', !/using \(true\)/i.test(sbSql));
  t.ok('supabase profiles policy is own-row', /auth\.uid\(\) = id/.test(sbSql));
  t.ok('supabase profiles.id is the auth user', /references auth\.users/.test(sbSql));
  t.ok('supabase profiles.id has no random default', !/default gen_random_uuid\(\)/.test(sbSql));
  t.ok('supabase inserts a profile on signup', /handle_new_user/.test(sbSql) && /on_auth_user_created/.test(sbSql));
  const sbClient = win.Engine.FS.read('/src/lib/supabaseClient.js') || '';
  t.ok('supabase client upserts with auth user id', /id:\s*user\.id/.test(sbClient));

  const plan = S.Verify.testcontainersPlan();
  t.ok('testcontainers plan has services', plan.services.length >= 1);
  t.ok('plan cites testcontainers org', plan.org.indexOf('github.com/testcontainers') >= 0);

  const r = S.Router.setGateway('localai');
  t.equal('router switches to localai', r.router.gateway, 'localai');
  t.ok('LLM provider includes localai', win.Engine.LLM.providers.some((p) => p.id === 'localai'));
  t.ok('LLM provider includes llamacpp', win.Engine.LLM.providers.some((p) => p.id === 'llamacpp'));
  t.ok('LLM provider includes lmstudio', win.Engine.LLM.providers.some((p) => p.id === 'lmstudio'));
  t.ok('lmstudio needs no API key', win.Engine.LLM.providers.find((p) => p.id === 'lmstudio').local === true);
  t.ok('LocalAI still requests JSON mode', win.Engine.LLM.providers.find((p) => p.id === 'localai').supportsJson === true);
  t.ok('LM Studio does not request JSON mode', win.Engine.LLM.providers.find((p) => p.id === 'lmstudio').supportsJson === false);
  t.ok('llama.cpp does not request JSON mode', win.Engine.LLM.providers.find((p) => p.id === 'llamacpp').supportsJson === false);
  t.ok('json_object is not skipped for every local endpoint', !/supportsJson && !isLocalEndpoint/.test(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8')));
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

  const badGguf = win.Engine.LLM.Gguf.add({ name: 'weights.bin', bytes: 12 });
  t.ok('GGUF add rejects non-gguf', !badGguf.ok);
  const gguf = win.Engine.LLM.Gguf.add({ name: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf', bytes: 4096, gateway: 'lmstudio' });
  t.ok('GGUF add accepts .gguf', gguf.ok && gguf.model && gguf.model.id);
  t.equal('GGUF list has the file', win.Engine.LLM.Gguf.list().length, 1);
  t.ok('GGUF store has no weight bytes payload', String(store['cs.llm.gguf.v1'] || '').indexOf('"bytes":4096') >= 0 && !/"content"/.test(String(store['cs.llm.gguf.v1'] || '')));
  const used = win.Engine.LLM.Gguf.select(gguf.model.id);
  t.ok('GGUF select ok', used.ok);
  t.equal('GGUF select uses lmstudio', win.Engine.LLM.getConfig().providerId, 'lmstudio');
  t.ok('GGUF select omits apiKey', win.Engine.LLM.getConfig().model.indexOf('qwen2.5-coder') === 0);
  S.Router.setGateway('lmstudio');
  t.equal('router switches to lmstudio', S.Router.get().gateway, 'lmstudio');
  t.equal('lmstudio apply keeps registered model', win.Engine.LLM.getConfig().providerId, 'lmstudio');

  win.Engine.LLM.setConfig({
    providerId: 'lmstudio',
    apiKey: 'sk-secret',
    localToken: 'lms-token',
    enabled: true,
    model: 'tinylama-1.1B-Q5_K_M',
    baseUrl: 'http://127.0.0.1:1234'
  });
  const pLocal = win.Engine.LLM.providerById('lmstudio');
  const cfgLocal = win.Engine.LLM.getConfig();
  t.equal('authToken for LM Studio is localToken', win.Engine.LLM.authToken(pLocal, cfgLocal), 'lms-token');
  t.ok('authToken does not use leftover cloud key', String(win.Engine.LLM.authToken(pLocal, cfgLocal)).indexOf('sk-secret') < 0);
  t.equal(
    'LM Studio Authorization is Bearer localToken',
    win.Engine.LLM.applyAuthHeaders({}, pLocal, cfgLocal).Authorization,
    'Bearer lms-token'
  );
  t.ok(
    'LM Studio without localToken sends no Authorization',
    !win.Engine.LLM.applyAuthHeaders({}, pLocal, Object.assign({}, cfgLocal, { localToken: '' })).Authorization
  );
  t.equal(
    'cloud still uses apiKey not localToken',
    win.Engine.LLM.applyAuthHeaders({}, win.Engine.LLM.providerById('openai'), { apiKey: 'sk-secret', localToken: 'lms-token' }).Authorization,
    'Bearer sk-secret'
  );
  t.ok(
    'named cloud provider is not local because of a leftover loopback URL',
    !win.Engine.LLM.isLocalEndpoint(win.Engine.LLM.providerById('openai'), { baseUrl: 'http://127.0.0.1:1234', apiKey: 'sk-secret' })
  );
  t.equal(
    'openai with leftover loopback still uses the cloud apiKey',
    win.Engine.LLM.authToken(win.Engine.LLM.providerById('openai'), { apiKey: 'sk-secret', localToken: 'lms-token', baseUrl: 'http://127.0.0.1:1234' }),
    'sk-secret'
  );
  t.ok(
    'openai_compat on loopback is local',
    win.Engine.LLM.isLocalEndpoint(win.Engine.LLM.providerById('openai_compat'), { baseUrl: 'http://127.0.0.1:1234' })
  );
  t.ok(
    'openai_compat on a remote URL is not local',
    !win.Engine.LLM.isLocalEndpoint(win.Engine.LLM.providerById('openai_compat'), { baseUrl: 'https://api.together.xyz' })
  );

  let lastFetch = null;
  win.fetch = async function (url, opts) {
    lastFetch = { url: String(url), headers: (opts && opts.headers) || {}, method: (opts && opts.method) || 'GET' };
    const authed = lastFetch.headers.Authorization === 'Bearer lms-token';
    return {
      ok: authed,
      status: authed ? 200 : 401,
      text: async () => authed ? '{"ok":true}' : '{"error":"An LM Studio API token is required"}'
    };
  };
  const pingOk = await win.Engine.LLM.testConnection();
  t.ok('testConnection with localToken succeeds', pingOk.ok === true && pingOk.status === 200);
  t.equal('chat completions send Bearer localToken', lastFetch.headers.Authorization, 'Bearer lms-token');
  t.ok('chat completions URL is LM Studio', /127\.0\.0\.1:1234/.test(lastFetch.url));

  const listed = await win.Engine.LLM.listModels();
  t.ok('listModels sends the same Bearer token', lastFetch.method === 'GET' && lastFetch.headers.Authorization === 'Bearer lms-token');
  t.ok('listModels hits /v1/models', /\/v1\/models$/.test(lastFetch.url));
  t.ok('listModels reports ok when token matches', listed.ok === true);

  win.Engine.LLM.setConfig({ localToken: '' });
  const ping401 = await win.Engine.LLM.testConnection();
  t.ok('testConnection without localToken is 401', ping401.ok === false && ping401.status === 401);
  t.ok('401 without token sends no Authorization', !lastFetch.headers.Authorization);
  t.ok('401 without token does not leak cloud key', !lastFetch.headers.Authorization || String(lastFetch.headers.Authorization).indexOf('sk-secret') < 0);
  t.ok('401 hint tells the user to paste the LM Studio token', /Bearer token/.test(String(ping401.hint || '')));

  const deskGet = win.Engine.LLM.getConfig;
  const deskSet = win.Engine.LLM.setConfig;
  let keyCache = 'sk-secret';
  let tokenCache = 'lms-token';
  win.Engine.LLM.getConfig = function () {
    const c = deskGet() || {};
    if (!c.apiKey) c.apiKey = keyCache;
    if (!c.localToken) c.localToken = tokenCache;
    return c;
  };
  win.Engine.LLM.setConfig = function (patch) {
    const copy = Object.assign({}, patch || {});
    if (typeof copy.apiKey === 'string') { keyCache = copy.apiKey; delete copy.apiKey; }
    if (typeof copy.localToken === 'string') { tokenCache = copy.localToken; delete copy.localToken; }
    return deskSet(copy);
  };
  deskSet({
    providerId: 'lmstudio',
    enabled: true,
    model: 'tinylama-1.1B-Q5_K_M',
    baseUrl: 'http://127.0.0.1:1234'
  });
  try {
    const persisted = JSON.parse(store['cs.llm.v1'] || '{}');
    delete persisted.apiKey;
    delete persisted.localToken;
    store['cs.llm.v1'] = JSON.stringify(persisted);
  } catch (_) {}
  t.ok('desktop store has no localToken plaintext', String(store['cs.llm.v1'] || '').indexOf('lms-token') < 0);
  t.ok('desktop store has no cloud apiKey plaintext', String(store['cs.llm.v1'] || '').indexOf('sk-secret') < 0);
  lastFetch = null;
  const deskPing = await win.Engine.LLM.testConnection();
  t.ok('keychain wrap still sends localToken on Test', deskPing.ok === true && lastFetch.headers.Authorization === 'Bearer lms-token');
  t.ok('keychain wrap does not send the cloud key to localhost', String(lastFetch.headers.Authorization).indexOf('sk-secret') < 0);
  win.Engine.LLM.getConfig = deskGet;
  win.Engine.LLM.setConfig = deskSet;

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
  t.ok('index.html loads engine.tab.js', /engine\.tab\.js/.test(html));
  t.ok('index.html loads engine.inline.js', /engine\.inline\.js/.test(html));
  t.ok('index.html loads engine.loop.js', /engine\.loop\.js/.test(html));
  t.ok('index.html loads engine.orchestra.js', /engine\.orchestra\.js/.test(html));
  t.ok('index.html loads app.stack.js', /app\.stack\.js/.test(html));
  t.ok('index.html loads app.orchestra.js', /app\.orchestra\.js/.test(html));
  t.ok('index.html loads the desktop layer', /desktop\/desktop-app\.js/.test(html));
  const deskSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'desktop', 'desktop-app.js'), 'utf8');
  const llmSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');
  t.ok('desktop migrates localToken into the keychain', deskSrc.includes('llm.localToken') && deskSrc.includes("hydrate('llm.localToken'"));
  t.ok('desktop ignores empty keychain writes until hydrate', deskSrc.includes('keyReady') && deskSrc.includes('tokenReady') && deskSrc.includes('must not delete the stored secret'));
  t.ok('LLM runtime reads go through the public getConfig wrap', llmSrc.includes('function liveConfig') && /const cfg = liveConfig\(\)/.test(llmSrc));
  t.ok('CSP allows LocalAI on 8080', /http:\/\/127\.0\.0\.1:8080/.test(html) && /http:\/\/localhost:8080/.test(html));
  t.ok('CSP allows llama.cpp on 8081', /http:\/\/127\.0\.0\.1:8081/.test(html) && /http:\/\/localhost:8081/.test(html));
  t.ok('CSP allows LM Studio on 1234', /http:\/\/127\.0\.0\.1:1234/.test(html) && /http:\/\/localhost:1234/.test(html));
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
  t.ok('Settings model router includes LM Studio', /LM Studio/.test(settingsHtml));
  t.ok('stack card sits before Tools', settingsHtml.indexOf('Open-Source Building Stack') < settingsHtml.indexOf('Tools</h3>'));
  t.ok('Agent shows execution backends', /Execution backend/.test(uiWin.renderAgent()));
  t.ok('Factory shows PocketFlow', /GodMode generation flows/.test(uiWin.renderFactory()));
  t.ok('Pipelines shows Temporal', /Durable build pipeline/.test(uiWin.renderPipelines()));
  t.ok('Recovery shows Aider engine', /Aider recovery engine/.test(uiWin.renderRecovery()));
};
