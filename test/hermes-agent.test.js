'use strict';
/* Hermes Agent (Nous Research) as a real local backend: it is reached through its
 * OpenAI-compatible API server (default http://127.0.0.1:8642). These tests drive
 * Engine.LLM against a fetch stub that answers the way the documented server does
 * (GET /v1/models, POST /v1/chat/completions). They prove OUR side of the protocol;
 * they are not a substitute for running against a live Hermes Agent. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function env(handler) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');
  const requests = [];
  const win = {
    console,
    setTimeout: () => 0, clearTimeout: () => {},
    document: { readyState: 'loading', addEventListener: () => {}, getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {} }) },
    localStorage: { _d: {}, getItem(k) { return this._d[k] != null ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    fetch: (url, init) => {
      requests.push({ url, init });
      return Promise.resolve().then(() => handler(url, init));
    }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'engine.llm.js' });
  return { win, requests };
}
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) });

module.exports = async function (t) {
  // ---- it is a real provider entry, on loopback, with the documented port and model ----
  {
    const { win } = env(() => json(200, {}));
    const p = win.Engine.LLM.providerById('hermesagent');
    t.ok('a hermesagent provider exists on the documented loopback port', !!p && p.baseUrl === 'http://127.0.0.1:8642' && p.chatPath === '/v1/chat/completions' && p.defaultModel === 'hermes-agent');
    t.ok('it is keyless by default (the key is optional) and flagged local', p.keyless === true && p.local === true);
    // Engine.AGENTS lives in engine.js (too heavy to boot here): read the catalog from its source
    const eng = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.js'), 'utf8');
    const block = eng.slice(eng.indexOf('const AGENTS = ['), eng.indexOf('];', eng.indexOf('const AGENTS = [')));
    const ids = (block.match(/\{ id: '(\w+)'/g) || []).map((x) => /'(\w+)'/.exec(x)[1]);
    t.deepEqual('the Agents list has Direct, OpenClaw, the Hermes Agent and the hosted Hermes models, each named for what it is', ids, ['direct', 'openclaw', 'hermesagent', 'hermes']);
    t.ok('the hosted Hermes entry says it is models, not the agent', /id: 'hermes',[^\n]*not the Hermes Agent/.test(block));
  }

  // ---- probe: a real GET /v1/models, never a guess ----
  {
    const e = env((url, init) => json(200, { object: 'list', data: [{ id: 'hermes-agent', object: 'model' }] }));
    const r = await e.win.Engine.LLM.probeHermesAgent();
    t.ok('probe asks GET /v1/models on the default port', e.requests.length === 1 && e.requests[0].url === 'http://127.0.0.1:8642/v1/models' && (e.requests[0].init || {}).method === 'GET');
    t.ok('and reports reachable, ok and the models the server lists', r.reachable === true && r.ok === true && r.status === 200 && r.models.join() === 'hermes-agent' && r.needsKey === false);

    const k = env(() => json(401, { error: { message: 'Invalid API key' } }));
    const rk = await k.win.Engine.LLM.probeHermesAgent();
    t.ok('a 401 means the server is running and needs a key', rk.reachable === true && rk.ok === false && rk.needsKey === true);
    const withKey = await k.win.Engine.LLM.probeHermesAgent({ key: 'sekret' });
    t.ok('the key is sent as a Bearer token', k.requests[1].init.headers.Authorization === 'Bearer sekret' && withKey.status === 401);

    const down = env(() => Promise.reject(new TypeError('fetch failed')));
    const rd = await down.win.Engine.LLM.probeHermesAgent();
    t.ok('nothing listening is reported as not reachable, with the reason', rd.reachable === false && rd.ok === false && /fetch failed/.test(rd.error));

    const custom = env(() => json(200, { data: [] }));
    await custom.win.Engine.LLM.setConfig({ hermesAgentUrl: 'http://127.0.0.1:9999/' });
    await custom.win.Engine.LLM.probeHermesAgent();
    t.equal('a custom URL (other port) is honoured', custom.requests[0].url, 'http://127.0.0.1:9999/v1/models');
  }

  // ---- generation really goes to the Hermes Agent, with its own key, and never to another provider ----
  {
    const e = env((url) => json(200, { choices: [{ message: { content: 'hello from hermes agent' } }] }));
    e.win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai', apiKey: 'sk-openai-DO-NOT-LEAK', executionBackend: 'hermesagent', hermesAgentKey: 'hermes-key' });
    t.ok('with the Hermes Agent selected the LLM counts as configured (no OpenAI key needed)', e.win.Engine.LLM.isConfigured() === true || e.win.Engine.LLM.status().configured === true);
  }
  {
    const e = env((url) => json(200, { choices: [{ message: { content: 'hello from hermes agent' } }] }));
    e.win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai', apiKey: 'sk-openai-DO-NOT-LEAK', executionBackend: 'hermesagent', hermesAgentKey: 'hermes-key' });
    const out = await e.win.Engine.LLM.complete('write hello', null, {}).catch((x) => ({ err: String(x && x.message) }));
    t.ok('a generation call goes to 127.0.0.1:8642 /v1/chat/completions', e.requests.length >= 1 && e.requests[0].url === 'http://127.0.0.1:8642/v1/chat/completions', e.requests.map((r) => r.url).join(','));
    t.ok('it carries the Hermes key and not the OpenAI key', e.requests[0].init.headers.Authorization === 'Bearer hermes-key' && !/DO-NOT-LEAK/.test(JSON.stringify(e.requests[0])));
    t.ok('the model asked for is hermes-agent', JSON.parse(e.requests[0].init.body).model === 'hermes-agent');
    t.ok('the reply comes back as the model answer', out && (out.content === 'hello from hermes agent' || /hello from hermes agent/.test(JSON.stringify(out))));
  }

  // ---- when it is down the error says what to do, and nothing silently goes elsewhere ----
  {
    const e = env((url) => Promise.reject(new TypeError('fetch failed')));
    e.win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai', apiKey: 'sk-x', executionBackend: 'hermesagent' });
    const err = await e.win.Engine.LLM.complete('x', null, {}).then(() => null, (x) => x);
    t.ok('an unreachable Hermes Agent is an error that names the URL and the fix', !!err && /not reachable at http:\/\/127\.0\.0\.1:8642/.test(err.message) && /hermes gateway/.test(err.message));
    t.ok('no request went to any other host', e.requests.every((r) => /127\.0\.0\.1:8642/.test(r.url)));
    const hint = e.win.Engine.LLM._hermesAgentHint(new Error('HTTP 401 Unauthorized'), 'http://127.0.0.1:8642');
    t.ok('a 401 is explained as a key problem', /API key/.test(hint) && /Settings/.test(hint));
  }
};
