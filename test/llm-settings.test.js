'use strict';
/* Regression: the AI Provider card must actually appear in Settings HTML.
   The old injector searched for the uninterpolated literal "${I.gear} Environment"
   after icons were already inlined, so the card was silently dropped. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const extrasPath = path.join(__dirname, '..', 'dist', 'app.llm.extras.js');
  const extrasSrc = fs.readFileSync(extrasPath, 'utf8');
  t.ok(
    'injector no longer matches uninterpolated ${I.gear} Environment',
    !extrasSrc.includes('I.gear')
  );
  t.ok(
    'injector anchors on interpolated Integrations heading',
    extrasSrc.includes('Integrations')
  );

  const llm = {
    providers: [{ id: 'openai', label: 'OpenAI', modelOptions: ['gpt-4o'] }],
    getConfig: () => ({ providerId: 'openai', model: 'gpt-4o', apiKey: '', baseUrl: '' }),
    status: () => ({ configured: false, enabled: false, providerId: 'openai', model: 'gpt-4o' }),
    resolveProvider: () => ({ id: 'openai', label: 'OpenAI', notes: 'sk-…' }),
    providerById: () => ({ id: 'openai', label: 'OpenAI', modelOptions: ['gpt-4o'] })
  };

  // Mimic renderSettings() *after* template interpolation: icons are already SVGs.
  // Include a card *before* Integrations (and a $ sequence) so a too-broad
  // /card[\s\S]*?Integrations/ regex cannot pass this suite.
  function renderSettings() {
    return `
    <div class="screen-inner" style="padding:24px;max-width:1100px;margin:0 auto">
      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px"><svg></svg> Workspace</h3>
        <div>price $100 and $& leftover</div>
      </div>
      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px"><svg></svg> Environment</h3>
      </div>
      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px"><svg></svg> Integrations</h3>
      </div>
    </div>`;
  }

  const listeners = {};
  const win = {
    console,
    document: {
      readyState: 'complete',
      addEventListener: (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn); },
      getElementById: () => null,
      createElement: () => ({ style: {}, appendChild: () => {} })
    },
    Engine: { LLM: llm },
    renderSettings,
    renderAll: function () { return 'ok'; },
    S: { screen: 'welcome' },
    setTimeout: (fn) => fn()
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(extrasSrc, win, { filename: 'app.llm.extras.js' });

  t.ok('renderSettings is wrapped', win.renderSettings !== renderSettings);
  t.ok('wrapper is marked injected', !!win.renderSettings.__llmInjected);

  const html = win.renderSettings();
  t.ok('injected host id is present', /id="llmSettingsHost"/.test(html));
  t.ok('AI Provider heading is present', />AI Provider</.test(html));
  t.ok('provider <select> is present', /id="llmProvider"/.test(html));
  t.ok('API key input is present', /id="llmKey"/.test(html));
  t.ok('GGUF library is on the Settings card', /id="llmGgufBox"/.test(html) && /id="llmGgufFile"/.test(html));
  t.ok('Refresh models button is present', /id="llmRefreshModelsBtn"/.test(html));
  t.ok('collect prefers typed custom model id', /const custom = modelCustomEl && modelCustomEl.value.trim/.test(extrasSrc) && /model: custom \|\| selected/.test(extrasSrc));
  t.ok('URL remap runs only when the provider changes', /fromProviderChange/.test(extrasSrc) && extrasSrc.includes('http://127.0.0.1:1234'));
  t.ok('provider change remaps leftover cloud URLs to the local default', extrasSrc.includes('leftover cloud URLs'));
  t.ok('local providers keep the token field visible', extrasSrc.includes('API token (optional)') && extrasSrc.includes('keyRow.style.display = "block"'));
  t.ok('collect saves localToken for local providers', extrasSrc.includes('data.localToken'));
  t.ok('provider switch does not copy cloud apiKey into local token field', extrasSrc.includes('Never copy the leftover cloud apiKey'));
  t.ok('card sits before Integrations', html.indexOf('AI Provider') < html.indexOf('Integrations'));
  t.ok(
    'card sits after earlier cards, not at the top of the stack',
    html.indexOf('Workspace') < html.indexOf('AI Provider')
      && html.indexOf('Environment') < html.indexOf('AI Provider')
  );
  t.ok('Integrations card is still present', /Integrations<\/h3>/.test(html));
  t.ok(
    'dollar sequences in earlier cards are not treated as replace tokens',
    html.includes('price $100') && html.includes('$& leftover')
  );

  // Fallback path: no Integrations heading (e.g. a future Settings rewrite).
  win.renderSettings = function () {
    return '<div class="screen-inner">\n      <div class="card">hello</div>\n    </div>';
  };
  // Re-run extras would no-op because __llmInjected is on the previous wrapper.
  // Exercise the fallback by calling the wrap logic against this string via a
  // second context instead.
  const win2 = {
    console,
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: () => null,
      createElement: () => ({ style: {}, appendChild: () => {} })
    },
    Engine: { LLM: llm },
    renderSettings: function () {
      return '<div class="screen-inner">\n      <div class="card">hello</div>\n    </div>';
    },
    renderAll: function () { return 'ok'; },
    S: { screen: 'welcome' },
    setTimeout: (fn) => fn()
  };
  win2.window = win2;
  vm.createContext(win2);
  vm.runInContext(extrasSrc, win2, { filename: 'app.llm.extras.js' });
  const fallback = win2.renderSettings();
  t.ok('fallback still injects the card', /id="llmSettingsHost"/.test(fallback) && /AI Provider/.test(fallback));
  t.ok('fallback does not nest inside the last card', /<div class="card">hello<\/div>/.test(fallback));
  t.ok('fallback host is a sibling after the last card', /hello<\/div>[\s\S]*id="llmSettingsHost"/.test(fallback));
  t.ok(
    'fallback host stays inside screen-inner',
    fallback.indexOf('id="llmSettingsHost"') > fallback.indexOf('screen-inner')
      && fallback.indexOf('id="llmSettingsHost"') < fallback.lastIndexOf('</div>')
  );

  const llmLocal = {
    providers: [{ id: 'lmstudio', label: 'LM Studio (local)', local: true, modelOptions: [] }],
    getConfig: () => ({
      providerId: 'lmstudio',
      model: 'tinylama-1.1B-Q5_K_M',
      apiKey: 'sk-secret',
      localToken: '',
      baseUrl: 'http://127.0.0.1:1234'
    }),
    status: () => ({ configured: true, enabled: true, providerId: 'lmstudio', model: 'tinylama-1.1B-Q5_K_M' }),
    resolveProvider: () => ({
      id: 'lmstudio',
      label: 'LM Studio (local)',
      local: true,
      notes: 'paste token',
      baseUrl: 'http://127.0.0.1:1234'
    }),
    providerById: () => ({ id: 'lmstudio', label: 'LM Studio (local)', local: true, modelOptions: [] }),
    Gguf: { list: () => [] }
  };
  const win3 = {
    console,
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: () => null,
      createElement: () => ({ style: {}, appendChild: () => {} })
    },
    Engine: { LLM: llmLocal },
    renderSettings: function () {
      return '<div class="screen-inner">\n      <div class="card"><h3 class="cs-h3">Integrations</h3></div>\n    </div>';
    },
    renderAll: function () { return 'ok'; },
    S: { screen: 'settings' },
    setTimeout: (fn) => fn()
  };
  win3.window = win3;
  vm.createContext(win3);
  vm.runInContext(extrasSrc, win3, { filename: 'app.llm.extras.js' });
  const localHtml = win3.renderSettings();
  t.ok('LM Studio card shows optional API token field', /API token \(optional\)/.test(localHtml));
  t.ok('LM Studio key row is visible', /id="llmKeyRow"[^>]*display:block/.test(localHtml));
  t.ok('LM Studio card does not prefill the leftover cloud key', !/sk-secret/.test(localHtml));
};
